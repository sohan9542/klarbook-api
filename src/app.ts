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
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { documentsRouter } from "./modules/document/documents.routes.js";
import { invitesRouter, acceptInviteRouter } from "./modules/invites/invites.routes.js";
import { gdprRouter } from "./modules/gdpr/gdpr.routes.js";
import { authLimiter, apiLimiter } from "./middleware/rate-limit.js";
import { billingRouter } from "./modules/billing/billing.routes.js";
import { stripeWebhook } from "./modules/billing/billing.webhook.js";
export const app = express();

app.use(helmet());
app.use(cors());
app.use(pinoHttp({ logger }));

app.post(
  "/api/v1/billing/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: 'up', uptime: process.uptime() })
  } catch {
    res.status(503).json({ status: "error", db: "down" })
  }
});

app.set("trust proxy", 1);
app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1/auth/signup", authLimiter);
app.use("/api/v1", apiLimiter);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/tenants", tenantsRouter);
app.use("/api/v1/tenants/:tenantId/clients", clientsRouter);
app.use("/api/v1/tenants/:tenantId/projects", projectsRouter);
app.use("/api/v1/tenants/:tenantId/projects/:projectId/documents", documentsRouter);
app.use("/api/v1/tenants/:tenantId/invites", invitesRouter);
app.use("/api/v1/invites", acceptInviteRouter);
app.use("/api/v1/me", gdprRouter);
app.use("/api/v1/tenants/:tenantId/billing", billingRouter);

app.use(notFound);
app.use(errorHandler);


