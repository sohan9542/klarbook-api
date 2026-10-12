import argon2 from "argon2";
import { prisma } from "../../lib/prisma.js";
import { ConflictError } from "../../lib/errors.js";
import type { SignupInput } from "./auth.schema.js";

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