import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { createClientSchema, updateClientSchema, listQuerySchema } from "./clients.schema.js";
import * as service from "./clients.service.js";

export const clientsRouter = Router({ mergeParams: true });

clientsRouter.use(authenticate, requireRole("OWNER", "ADMIN", "STAFF"));

clientsRouter.get("/", async (req, res) => {
  const { limit, cursor } = listQuerySchema.parse(req.query);
  res.json(await service.listClients(req.membership!.tenantId, limit, cursor));
});

clientsRouter.post("/", async (req, res) => {
  const input = createClientSchema.parse(req.body);
  res.status(201).json(await service.createClient(req.membership!.tenantId, req.user!.id, input));
});

clientsRouter.get("/:clientId", async (req, res) => {
  res.json(await service.getClient(req.membership!.tenantId, String(req.params.clientId)));
});

clientsRouter.patch("/:clientId", async (req, res) => {
  const input = updateClientSchema.parse(req.body);
  res.json(await service.updateClient(req.membership!.tenantId, req.user!.id, String(req.params.clientId), input));
});

clientsRouter.delete("/:clientId", requireRole("OWNER", "ADMIN"), async (req, res) => {
  await service.deleteClient(req.membership!.tenantId, req.user!.id, String(req.params.clientId));
  res.status(204).end();
});