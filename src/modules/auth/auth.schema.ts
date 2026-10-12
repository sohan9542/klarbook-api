import z from "zod";

export const signupSchema = z.object({
    tenantName: z.string().trim().min(2).max(100),
    email: z.email().toLowerCase(),
    password: z.string().min(12).max(128),
    name: z.string().trim().min(1).max(100)
});

export type SignupInput = z.infer<typeof signupSchema>