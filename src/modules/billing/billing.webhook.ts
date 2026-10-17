import type { Request, Response } from "express";
import type Stripe from "stripe";
import { stripe } from "../../lib/stripe.js";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";

export async function stripeWebhook(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    return res.status(400).json({ error: { code: "NO_SIGNATURE", message: "Missing signature" } });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).json({ error: { code: "BAD_SIGNATURE", message: "Invalid signature" } });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      break;
    default:
      logger.debug({ type: event.type }, "unhandled stripe event");
  }

  res.json({ received: true });
}

async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const isActive = sub.status === "active" || sub.status === "trialing";
  const periodEnd = sub.items.data[0]?.current_period_end;

  await prisma.tenant.update({
    where: { stripeCustomerId: customerId },
    data: {
      plan: isActive ? "PRO" : "FREE",
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    },
  });
}