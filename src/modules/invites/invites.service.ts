import crypto from "node:crypto";
import argon2 from "argon2";
import { prisma } from "../../lib/prisma.js";
import { hashToken } from "../../lib/tokens.js";
import { ConflictError, ForbiddenError, NotFoundError, AppError } from "../../lib/errors.js";
import { enqueueInviteEmail } from "../../lib/queues.js";
import type { CreateInviteInput, AcceptInviteInput } from "./invites.schema.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createInvite(
  tenantId: string,
  actorId: string,
  actorRole: "OWNER" | "ADMIN" | "STAFF" | "CLIENT",
  input: CreateInviteInput,
) {
  if (actorRole === "ADMIN" && input.role === "ADMIN") {
    throw new ForbiddenError("ADMIN cannot invite another ADMIN");
  }

  const email = input.email.toLowerCase();

  const existingMember = await prisma.membership.findFirst({
    where: { tenantId, user: { email } },
  });
  
  if (existingMember) throw new ConflictError("User is already a member");

  const pending = await prisma.invite.findFirst({
    where: { tenantId, email, status: "PENDING", expiresAt: { gt: new Date() } },
  });
  if (pending) throw new ConflictError("Invite already pending for this email");

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  const tenant = await prisma.tenant.findFirstOrThrow({
    where: { id: tenantId },
    select: { name: true },
  });

  const invite = await prisma.$transaction(async (tx) => {
    const row = await tx.invite.create({
      data: {
        tenantId,
        email,
        role: input.role,
        tokenHash,
        invitedBy: actorId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: "invite.created",
        entity: "Invite",
        entityId: row.id,
        metadata: { email, role: input.role },
      },
    });
    return row;
  });

  await enqueueInviteEmail({
    inviteId: invite.id,
    email,
    tenantName: tenant.name,
    token: rawToken, // only place the raw token lives after create
  });

  return invite;
}

export async function acceptInvite(input: AcceptInviteInput) {
  const tokenHash = hashToken(input.token);
  const invite = await prisma.invite.findFirst({
    where: { tokenHash, status: "PENDING" },
  });
  if (!invite) throw new NotFoundError("Invite not found");
  if (invite.expiresAt < new Date()) {
    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    throw new AppError(410, "INVITE_EXPIRED", "Invite has expired");
  }

  const passwordHash = await argon2.hash(input.password);

  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      user = await tx.user.create({
        data: {
          email: invite.email,
          name: input.name,
          passwordHash,
        },
      });
    }

    const already = await tx.membership.findFirst({
      where: { tenantId: invite.tenantId, userId: user.id },
    });
    if (already) throw new ConflictError("Already a member");

    await tx.membership.create({
      data: { tenantId: invite.tenantId, userId: user.id, role: invite.role },
    });
    await tx.invite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        tenantId: invite.tenantId,
        actorId: user.id,
        action: "invite.accepted",
        entity: "Invite",
        entityId: invite.id,
      },
    });

    return { tenantId: invite.tenantId, userId: user.id, role: invite.role };
  });
}