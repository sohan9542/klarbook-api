import type { RequestHandler } from "express";
import { verifyAccessToken } from "../lib/tokens.js";
import { UnauthorizedError } from "../lib/errors.js";

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing access token");
  }

  const token = header.slice(7); // remove "Bearer "
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub };
    next();
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
};