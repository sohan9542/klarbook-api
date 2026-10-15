import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import "./workers/email.worker.js";
const { emailWorker } = await import("./workers/email.worker.js");
const { redis } = await import("./lib/redis.js");
const server = app.listen(env.PORT, () => {
  logger.info(`Server running on http://localhost:${env.PORT}`);
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    await emailWorker.close();
    await redis.quit();
    logger.info("Server and DB closed");
    process.exit(0)
  })

  // if requests don't finish in 10 seconds, force quit
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));


