import { Router } from "express";
import { signupSchema } from "./auth.schema.js";
import { signup } from "./auth.services.js";
import { loginSchema, refreshSchema } from "./auth.schema.js";
import { login, refresh, logout } from "./auth.services.js";

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const input = signupSchema.parse(req.body);
  const result = await signup(input);
  res.status(201).json(result);
});


authRouter.post("/login", async (req, res) => {
  res.json(await login(loginSchema.parse(req.body)));
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  res.json(await refresh(refreshToken));
});

authRouter.post("/logout", async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  await logout(refreshToken);
  res.status(204).end();
});