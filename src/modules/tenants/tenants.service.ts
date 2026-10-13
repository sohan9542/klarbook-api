import type { Role } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import type { AddMemberInput } from "./tenants.schema.js";

export async function addMember(
  tenantId: string,
  actor: { id: string; role: Role },
  input: AddMemberInput,
) {
  if (actor.role === "ADMIN" && input.role === "ADMIN") {
    throw new ForbiddenError("Only an owner can add admins");
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.deletedAt) throw new NotFoundError("No user with that email");

  const existing = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: user.id } },
  });
  if (existing) throw new ConflictError("User is already a member");

  const membership = await prisma.$transaction(async (tx) => {
    const m = await tx.membership.create({
      data: { tenantId, userId: user.id, role: input.role },
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, email: true, name: true } } },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "member.added",
        entity: "Membership",
        entityId: m.id,
        metadata: { email: user.email, role: input.role },
      },
    });
    return m;
  });

  return membership;
}