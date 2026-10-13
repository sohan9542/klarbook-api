import type { RequestHandler } from "express";
import type { Role } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../lib/errors.js";

export function requireRole(...allowed: Role[]): RequestHandler {
    return async (req, _res, next) => {
        if (!req.user) throw new UnauthorizedError();

        const tenantId = req.params.tenantId;
        if (typeof tenantId !== "string") throw new NotFoundError("Tenant not found");

        const membership = await prisma.membership.findUnique({
            where: { tenantId_userId: { tenantId, userId: req.user.id } },
            select: { tenantId: true, role: true },
        });

        if (!membership) throw new NotFoundError("Tenant not found");
        if (allowed.length && !allowed.includes(membership.role)) {
            throw new ForbiddenError("Insufficient role");
        }

        req.membership = membership;
        next();
    };
}