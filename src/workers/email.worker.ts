import { Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { sendInviteEmail } from "../lib/mailer.js";
import { logger } from "../lib/logger.js";
import type { SendInviteJob } from "../lib/queues.js";

export const emailWorker = new Worker(
  "email", // MUST match Queue("email")
  async (job) => {
    if (job.name === "send-invite") {
      const data = job.data as SendInviteJob;
      await sendInviteEmail({
        to: data.email,
        tenantName: data.tenantName,
        token: data.token,
      });
    }
  },
  { connection: redis },
);

emailWorker.on("completed", (job) => {
  logger.info({ jobId: job.id, name: job.name }, "email job completed");
});

emailWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "email job failed");
});