import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().toLowerCase().optional(),
  company: z.string().trim().max(200).optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;