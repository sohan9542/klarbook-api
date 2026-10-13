import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { prisma } from "../../lib/prisma.js";

export const tenantsRouter = Router();

// any member can view the agency
tenantsRouter.get("/:tenantId", authenticate, requireRole(), async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.membership!.tenantId },
    select: { id: true, name: true, slug: true, createdAt: true },
  });
  res.json({ tenant, yourRole: req.membership!.role });
});

// only OWNER/ADMIN can see the member list
tenantsRouter.get("/:tenantId/members", authenticate, requireRole("OWNER", "ADMIN"), async (req, res) => {
  const members = await prisma.membership.findMany({
    where: { tenantId: req.membership!.tenantId },
    select: { role: true, createdAt: true, user: { select: { id: true, email: true, name: true } } },
  });
  res.json(members);
});