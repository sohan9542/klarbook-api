import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const emailQueue = new Queue("email", { connection: redis });

export type SendInviteJob = {
  inviteId: string;
  email: string;
  tenantName: string;
  token: string;
};

export async function enqueueInviteEmail(data: SendInviteJob) {
  await emailQueue.add("send-invite", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
}