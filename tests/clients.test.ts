import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createOwner, createUser } from "./helpers.js";

const base = (tenantId: string) => `/api/v1/tenants/${tenantId}/clients`;

describe("Clients", () => {
  it("creates and lists clients", async () => {
    const owner = await createOwner("owner@test.com");

    await request(app).post(base(owner.tenantId)).set(owner.auth).send({ name: "ACME GmbH" });
    const res = await request(app).get(base(owner.tenantId)).set(owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("ACME GmbH");
  });

  it("does not leak clients across tenants", async () => {
    const owner = await createOwner("owner@test.com");
    const stranger = await createUser("stranger@test.com");
    const created = await request(app).post(base(owner.tenantId)).set(owner.auth).send({ name: "Secret" });

    // stranger uses THEIR OWN tenant path but OUR client id
    const res = await request(app)
      .get(`${base(stranger.tenantId)}/${created.body.id}`)
      .set(stranger.auth);

    expect(res.status).toBe(404);
  });

  it("soft-deletes a client", async () => {
    const owner = await createOwner("owner@test.com");
    const created = await request(app).post(base(owner.tenantId)).set(owner.auth).send({ name: "Temp" });

    const del = await request(app).delete(`${base(owner.tenantId)}/${created.body.id}`).set(owner.auth);
    const list = await request(app).get(base(owner.tenantId)).set(owner.auth);

    expect(del.status).toBe(204);
    expect(list.body.data).toHaveLength(0);
  });

  it("paginates with a cursor", async () => {
    const owner = await createOwner("owner@test.com");
    for (const name of ["A", "B", "C"]) {
      await request(app).post(base(owner.tenantId)).set(owner.auth).send({ name });
    }

    const page1 = await request(app).get(`${base(owner.tenantId)}?limit=2`).set(owner.auth);
    const page2 = await request(app)
      .get(`${base(owner.tenantId)}?limit=2&cursor=${page1.body.nextCursor}`)
      .set(owner.auth);

    expect(page1.body.data).toHaveLength(2);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();
  });
});