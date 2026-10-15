import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createOwner } from "./helpers.js";

// Don’t hit Redis in tests — fake the enqueue
vi.mock("../src/lib/queues.js", () => ({
  enqueueInviteEmail: vi.fn(async () => undefined),
}));

describe("Invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("OWNER creates an invite and enqueues email", async () => {
    const owner = await createOwner("owner@test.com");
    const { enqueueInviteEmail } = await import("../src/lib/queues.js");

    const res = await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/invites`)
      .set(owner.auth)
      .send({ email: "newhire@test.com", role: "STAFF" });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("newhire@test.com");
    expect(res.body.role).toBe("STAFF");
    expect(enqueueInviteEmail).toHaveBeenCalledOnce();
    expect(enqueueInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "newhire@test.com",
        tenantName: expect.any(String),
        token: expect.any(String),
        inviteId: res.body.id,
      }),
    );
  });

  it("rejects inviting OWNER role with 400", async () => {
    const owner = await createOwner("owner@test.com");

    const res = await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/invites`)
      .set(owner.auth)
      .send({ email: "x@test.com", role: "OWNER" });

    expect(res.status).toBe(400);
  });

  it("rejects duplicate pending invite with 409", async () => {
    const owner = await createOwner("owner@test.com");
    await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/invites`)
      .set(owner.auth)
      .send({ email: "dup@test.com", role: "STAFF" });

    const res = await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/invites`)
      .set(owner.auth)
      .send({ email: "dup@test.com", role: "STAFF" });

    expect(res.status).toBe(409);
  });

  it("accepts invite with raw token and creates membership", async () => {
    const owner = await createOwner("owner@test.com");
    const { enqueueInviteEmail } = await import("../src/lib/queues.js");

    const created = await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/invites`)
      .set(owner.auth)
      .send({ email: "joiner@test.com", role: "STAFF" });

    const token = vi.mocked(enqueueInviteEmail).mock.calls[0][0].token;

    const res = await request(app)
      .post("/api/v1/invites/accept")
      .send({
        token,
        name: "Joiner",
        password: "supersecret123",
      });

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(owner.tenantId);
    expect(res.body.role).toBe("STAFF");

    const { prisma } = await import("../src/lib/prisma.js");
    const membership = await prisma.membership.findFirst({
      where: { tenantId: owner.tenantId, userId: res.body.userId },
    });
    expect(membership).not.toBeNull();
  });

  it("rejects a bad token with 404", async () => {
    const res = await request(app)
      .post("/api/v1/invites/accept")
      .send({
        token: "this-token-is-totally-fake-000",
        name: "X",
        password: "supersecret123",
      });

    expect(res.status).toBe(404);
  });
});