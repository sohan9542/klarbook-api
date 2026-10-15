import { z } from "zod";

export const createInviteSchema = z.object({
  email: z.email(),
  role: z.enum(["ADMIN", "STAFF", "CLIENT"]), // never OWNER
});

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(10).max(128),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;