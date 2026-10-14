import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createOwner, createUser } from "./helpers.js";

describe("Tenant access (RBAC)", () => {
  it("lets the owner view their tenant", async () => {
    const owner = await createOwner("owner@test.com");

    const res = await request(app).get(`/api/v1/tenants/${owner.tenantId}`).set(owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.yourRole).toBe("OWNER");
  });

  it("returns 401 without a token", async () => {
    const owner = await createOwner("owner@test.com");

    const res = await request(app).get(`/api/v1/tenants/${owner.tenantId}`);

    expect(res.status).toBe(401);
  });

  it("hides other tenants with 404 (tenant isolation)", async () => {
    const owner = await createOwner("owner@test.com");
    const stranger = await createUser("stranger@test.com");

    const res = await request(app).get(`/api/v1/tenants/${owner.tenantId}`).set(stranger.auth);

    expect(res.status).toBe(404);
  });
});

describe("POST /tenants/:tenantId/members", () => {
  it("owner can add a STAFF member", async () => {
    const owner = await createOwner("owner@test.com");
    await createUser("staff@test.com");

    const res = await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/members`)
      .set(owner.auth)
      .send({ email: "staff@test.com", role: "STAFF" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("STAFF");
  });

  it("rejects adding the same member twice with 409", async () => {
    const owner = await createOwner("owner@test.com");
    await createUser("staff@test.com");
    const add = () =>
      request(app)
        .post(`/api/v1/tenants/${owner.tenantId}/members`)
        .set(owner.auth)
        .send({ email: "staff@test.com", role: "STAFF" });

    await add();
    const res = await add();

    expect(res.status).toBe(409);
  });

  it("rejects assigning OWNER with 400", async () => {
    const owner = await createOwner("owner@test.com");
    await createUser("x@test.com");

    const res = await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/members`)
      .set(owner.auth)
      .send({ email: "x@test.com", role: "OWNER" });

    expect(res.status).toBe(400);
  });

  it("STAFF cannot view the member list (403)", async () => {
    const owner = await createOwner("owner@test.com");
    const staff = await createUser("staff@test.com");
    await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/members`)
      .set(owner.auth)
      .send({ email: "staff@test.com", role: "STAFF" });

    const res = await request(app).get(`/api/v1/tenants/${owner.tenantId}/members`).set(staff.auth);

    expect(res.status).toBe(403);
  });

  it("ADMIN cannot add another ADMIN (privilege escalation)", async () => {
    const owner = await createOwner("owner@test.com");
    const admin = await createUser("admin@test.com");
    await createUser("other@test.com");
    await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/members`)
      .set(owner.auth)
      .send({ email: "admin@test.com", role: "ADMIN" });

    const res = await request(app)
      .post(`/api/v1/tenants/${owner.tenantId}/members`)
      .set(admin.auth)
      .send({ email: "other@test.com", role: "ADMIN" });

    expect(res.status).toBe(403);
  });
});