import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { createProjectSchema, updateProjectSchema, listProjectsQuery } from "./projects.schema.js";
import * as service from "./projects.service.js";

export const projectsRouter = Router({ mergeParams: true });

projectsRouter.use(authenticate, requireRole("OWNER", "ADMIN", "STAFF"));

projectsRouter.get("/", async (req, res) => {
  const query = listProjectsQuery.parse(req.query);
  res.json(await service.listProjects(req.membership!.tenantId, query));
});

projectsRouter.post("/", async (req, res) => {
  const input = createProjectSchema.parse(req.body);
  res.status(201).json(await service.createProject(req.membership!.tenantId, req.user!.id, input));
});

projectsRouter.get("/:projectId", async (req, res) => {
  res.json(await service.getProject(req.membership!.tenantId, String(req.params.projectId)));
});

projectsRouter.patch("/:projectId", async (req, res) => {
  const input = updateProjectSchema.parse(req.body);
  res.json(await service.updateProject(req.membership!.tenantId, req.user!.id, String(req.params.projectId), input));
});

projectsRouter.delete("/:projectId", requireRole("OWNER", "ADMIN"), async (req, res) => {
  await service.deleteProject(req.membership!.tenantId, req.user!.id, String(req.params.projectId));
  res.status(204).end();
});