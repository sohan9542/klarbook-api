import { prisma } from "../../lib/prisma.js";
import { stripe } from "../../lib/stripe.js";
import { env } from "../../config/env.js";
import { ConflictError } from "../../lib/errors.js";

export async function createCheckoutSession(tenantId: string, userId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { id: true, name: true, plan: true, stripeCustomerId: true },
  });

  if (tenant.plan === "PRO") {
    throw new ConflictError("Tenant is already on PRO");
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });

  let customerId = tenant.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: tenant.name,
      metadata: { tenantId: tenant.id },
    });
    customerId = customer.id;
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${env.APP_URL}/billing/success`,
    cancel_url: `${env.APP_URL}/billing/cancel`,
    metadata: { tenantId: tenant.id },
    subscription_data: { metadata: { tenantId: tenant.id } },
  });

  return { url: session.url };
}