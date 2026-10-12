import { Router } from "express";
import { signupSchema } from "./auth.schema.js";
import { signup } from "./auth.services.js";

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const input = signupSchema.parse(req.body);
  const result = await signup(input);
  res.status(201).json(result);
});