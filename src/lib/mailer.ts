import { logger } from "./logger.js";

/** In production you’d call Resend/SES here. Dev just logs. */
export async function sendInviteEmail(opts: {
  to: string;
  tenantName: string;
  token: string;
}) {
  const acceptUrl = `http://localhost:4000/accept-invite?token=${opts.token}`;
  logger.info(
    { to: opts.to, tenantName: opts.tenantName, acceptUrl },
    "invite email (dev)",
  );
}