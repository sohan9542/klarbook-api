import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { env } from "../src/config/env.js";
import { createOwner } from "./helpers.js";

// Fake the parts of Stripe that call the internet,
// but keep the REAL webhook signature code.
vi.mock("../src/lib/stripe.js", async () => {
  const { default: Stripe } = await import("stripe");
  const real = new Stripe("sk_test_fake");
  return {
    stripe: {
      customers: {
        create: vi.fn(async () => ({ id: "cus_test_123" })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: "cs_test_1",
            url: "https://checkout.stripe.com/c/pay/cs_test_1",
          })),
        },
      },
      webhooks: real.webhooks,
    },
  };
});

// Build a webhook request exactly like Stripe would send it
async function sendWebhook(event: object) {
  const { stripe } = await import("../src/lib/stripe.js");
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET,
  });
  return request(app)
    .post("/api/v1/billing/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(payload);
}

function subscriptionEvent(type: string, status: string) {
  return {
    id: "evt_test_1",
    object: "event",
    type,
    data: {
      object: {
        id: "sub_test_1",
        object: "subscription",
        customer: "cus_test_123",
        status,
        items: { data: [{ current_period_end: 1893456000 }] },
      },
    },
  };
}

describe("Billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("OWNER starts checkout, customer is created once and reused", async () => {
    const owner = await createOwner("owner@test.com");
    const { stripe } = await import("../src/lib/stripe.js");

    const first = await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/billing/checkout`)
      .set(owner.auth);

    expect(first.status).toBe(201);
    expect(first.body.url).toContain("checkout.stripe.com");

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.stripeCustomerId).toBe("cus_test_123");

    const second = await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/billing/checkout`)
      .set(owner.auth);

    expect(second.status).toBe(201);
    expect(stripe.customers.create).toHaveBeenCalledOnce();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(2);
  });

  it("returns 409 when tenant is already PRO", async () => {
    const owner = await createOwner("owner@test.com");
    await prisma.tenant.update({ where: { id: owner.tenantId }, data: { plan: "PRO" } });

    const res = await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/billing/checkout`)
      .set(owner.auth);

    expect(res.status).toBe(409);
  });

  it("rejects webhook without signature", async () => {
    const res = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(subscriptionEvent("customer.subscription.created", "active")));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_SIGNATURE");
  });

  it("rejects webhook with a fake signature", async () => {
    const res = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=123,v1=fake")
      .send(JSON.stringify(subscriptionEvent("customer.subscription.created", "active")));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_SIGNATURE");
  });

  it("subscription created upgrades tenant to PRO, deleted downgrades to FREE", async () => {
    const owner = await createOwner("owner@test.com");
    await prisma.tenant.update({
      where: { id: owner.tenantId },
      data: { stripeCustomerId: "cus_test_123" },
    });

    const created = await sendWebhook(subscriptionEvent("customer.subscription.created", "active"));
    expect(created.status).toBe(200);

    let tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.plan).toBe("PRO");
    expect(tenant.stripeSubscriptionId).toBe("sub_test_1");
    expect(tenant.subscriptionStatus).toBe("active");
    expect(tenant.currentPeriodEnd).toEqual(new Date(1893456000 * 1000));

    const deleted = await sendWebhook(subscriptionEvent("customer.subscription.deleted", "canceled"));
    expect(deleted.status).toBe(200);

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.plan).toBe("FREE");
    expect(tenant.subscriptionStatus).toBe("canceled");
  });
});