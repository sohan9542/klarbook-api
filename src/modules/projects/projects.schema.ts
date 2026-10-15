import { z } from "zod";

const status = z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "DONE"]);

export const createProjectSchema = z.object({
  clientId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  status: status.optional(),
  dueDate: z.coerce.date().optional(),
});

export const updateProjectSchema = createProjectSchema.omit({ clientId: true }).partial();

export const listProjectsQuery = z.object({
  status: status.optional(),
  clientId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;