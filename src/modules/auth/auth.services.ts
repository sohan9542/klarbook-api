import argon2 from "argon2";
import { prisma } from "../../lib/prisma.js";
import { ConflictError } from "../../lib/errors.js";
import type { SignupInput } from "./auth.schema.js";

import { UnauthorizedError } from "../../lib/errors.js";
import { signAccessToken, generateRefreshToken, hashToken, REFRESH_TTL_MS } from "../../lib/tokens.js";
import type { LoginInput } from "./auth.schema.js";


function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function signup(input: SignupInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError("Email already registered");

    const passwordHash = await argon2.hash(input.password);

    const result = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
            data: { name: input.tenantName, slug: `${slugify(input.tenantName)}-${Date.now().toString(36)}` },
        });
        const user = await tx.user.create({
            data: { email: input.email, name: input.name, passwordHash },
        });
        await tx.membership.create({
            data: { tenantId: tenant.id, userId: user.id, role: "OWNER" },
        });
        await tx.auditLog.create({
            data: { tenantId: tenant.id, actorId: user.id, action: "tenant.created", entity: "Tenant", },
        });
        return { tenant, user };
    });

    return {
        tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
        user: { id: result.user.id, email: result.user.email, name: result.user.name },
    };
}


async function issueTokens(userId: string) {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { accessToken: signAccessToken(userId), refreshToken };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  const ok = user && !user.deletedAt && (await argon2.verify(user.passwordHash, input.password));
  if (!ok) throw new UnauthorizedError("Invalid email or password");

  return issueTokens(user.id);
}

export async function refresh(token: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return issueTokens(stored.userId);
}

export async function logout(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}