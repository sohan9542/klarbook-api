import { z } from "zod";

export const addMemberSchema = z.object({
  email: z.email().toLowerCase(),
  role: z.enum(["ADMIN", "STAFF", "CLIENT"]),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;