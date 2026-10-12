import z from "zod";

export const signupSchema = z.object({
    tenantName: z.string().trim().min(2).max(100),
    email: z.email().toLowerCase(),
    password: z.string().min(12).max(128),
    name: z.string().trim().min(1).max(100)
});

export type SignupInput = z.infer<typeof signupSchema>


export const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1).max(128),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export type LoginInput = z.infer<typeof loginSchema>;