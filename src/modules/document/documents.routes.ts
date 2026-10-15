import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { requestUploadSchema } from "./documents.schema.js";
import * as service from "./documents.service.js";

export const documentsRouter = Router({ mergeParams: true });

documentsRouter.use(authenticate, requireRole("OWNER", "ADMIN", "STAFF"));

const ids = (p: Record<string, unknown>) => ({
  projectId: String(p.projectId),
  documentId: String(p.documentId),
});

documentsRouter.post("/upload-url", async (req, res) => {
  const input = requestUploadSchema.parse(req.body);
  const { projectId } = ids(req.params);
  res.status(201).json(await service.requestUpload(req.membership!.tenantId, req.user!.id, projectId, input));
});

documentsRouter.post("/:documentId/confirm", async (req, res) => {
  const { projectId, documentId } = ids(req.params);
  res.json(await service.confirmUpload(req.membership!.tenantId, req.user!.id, projectId, documentId));
});

documentsRouter.get("/", async (req, res) => {
  res.json(await service.listDocuments(req.membership!.tenantId, ids(req.params).projectId));
});

documentsRouter.get("/:documentId/download-url", async (req, res) => {
  const { projectId, documentId } = ids(req.params);
  res.json(await service.getDownloadUrl(req.membership!.tenantId, req.user!.id, projectId, documentId));
});