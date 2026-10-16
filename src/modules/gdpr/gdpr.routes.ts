import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import * as service from "./gdpr.service.js";

export const gdprRouter = Router();

gdprRouter.get("/export", authenticate, async (req, res) => {
  const data = await service.exportUserData(req.user!.id);
  res.setHeader("Content-Disposition", 'attachment; filename="klarbook-export.json"');
  res.json(data);
});