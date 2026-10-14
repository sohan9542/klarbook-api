import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { tenantsRouter } from "./modules/tenants/tenants.routes.js";
import { clientsRouter } from "./modules/clients/clients.routes.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: 'up', uptime: process.uptime() })
  } catch {
    res.status(503).json({ status: "error", db: "down" })
  }
});


app.use("/api/v1/auth", authRouter);
app.use("/api/v1/tenants", tenantsRouter);
app.use("/api/v1/tenants/:tenantId/clients", clientsRouter);


app.use(notFound);
app.use(errorHandler);


