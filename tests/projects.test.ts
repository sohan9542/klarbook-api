import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createOwner, createUser } from "./helpers.js";

const url = (tenantId: string) => `/api/v1/tenants/${tenantId}/projects`;

async function createClient(tenantId: string, auth: Record<string, string>, name = "ACME") {
  const res = await request(app).post(`/api/v1/tenants/${tenantId}/clients`).set(auth).send({ name });
  return res.body.id as string;
}

describe("Projects", () => {
  it("creates a project for own client", async () => {
    const owner = await createOwner("owner@test.com");
    const clientId = await createClient(owner.tenantId, owner.auth);

    const res = await request(app).post(url(owner.tenantId)).set(owner.auth)
      .send({ clientId, name: "Website redesign", dueDate: "2026-12-01" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PLANNED");
    expect(res.body.client.id).toBe(clientId);
  });

  it("rejects another tenant's client (nested isolation)", async () => {
    const owner = await createOwner("owner@test.com");
    const stranger = await createUser("stranger@test.com");
    const foreignClientId = await createClient(owner.tenantId, owner.auth);

    const res = await request(app).post(url(stranger.tenantId)).set(stranger.auth)
      .send({ clientId: foreignClientId, name: "Sneaky" });

    expect(res.status).toBe(404);
  });

  it("filters by status", async () => {
    const owner = await createOwner("owner@test.com");
    const clientId = await createClient(owner.tenantId, owner.auth);
    await request(app).post(url(owner.tenantId)).set(owner.auth).send({ clientId, name: "A", status: "ACTIVE" });
    await request(app).post(url(owner.tenantId)).set(owner.auth).send({ clientId, name: "B" });

    const res = await request(app).get(`${url(owner.tenantId)}?status=ACTIVE`).set(owner.auth);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("A");
  });

  it("rejects an invalid status with 400", async () => {
    const owner = await createOwner("owner@test.com");
    const clientId = await createClient(owner.tenantId, owner.auth);

    const res = await request(app).post(url(owner.tenantId)).set(owner.auth)
      .send({ clientId, name: "X", status: "FINISHED" });

    expect(res.status).toBe(400);
  });

  it("logs status changes in the audit log", async () => {
    const owner = await createOwner("owner@test.com");
    const clientId = await createClient(owner.tenantId, owner.auth);
    const created = await request(app).post(url(owner.tenantId)).set(owner.auth).send({ clientId, name: "P" });

    const res = await request(app).patch(`${url(owner.tenantId)}/${created.body.id}`).set(owner.auth)
      .send({ status: "ACTIVE" });

    expect(res.body.status).toBe("ACTIVE");
    const { prisma } = await import("../src/lib/prisma.js");
    const log = await prisma.auditLog.findFirst({ where: { action: "project.status_changed" } });
    expect(log).not.toBeNull();
  });
});