import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { createInviteSchema, acceptInviteSchema } from "./invites.schema.js";
import * as service from "./invites.service.js";

export const invitesRouter = Router({ mergeParams: true });
export const acceptInviteRouter = Router();

invitesRouter.post(
  "/",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  async (req, res) => {
    const input = createInviteSchema.parse(req.body);
    const invite = await service.createInvite(
      req.membership!.tenantId,
      req.user!.id,
      req.membership!.role,
      input,
    );
    res.status(201).json(invite);
  },
);

acceptInviteRouter.post("/accept", async (req, res) => {
  const input = acceptInviteSchema.parse(req.body);
  res.json(await service.acceptInvite(input));
});