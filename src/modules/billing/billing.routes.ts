import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as service from "./billing.service.js";

export const billingRouter = Router({ mergeParams: true });

billingRouter.post(
  "/checkout",
  authenticate,
  requireRole("OWNER"),
  async (req, res) => {
    const result = await service.createCheckoutSession(
      req.membership!.tenantId,
      req.user!.id,
    );
    res.status(201).json(result);
  },
);