import type { Role } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
      membership?: { tenantId: string; role: Role };
    }
  }
}