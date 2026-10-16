import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createOwner, createUser } from "./helpers.js";
import { withTenant } from "../src/lib/tenant-db.js";

describe("Row-level security", () => {
  it("hides other tenants' clients even without a tenantId filter", async () => {
    const a = await createOwner("a@test.com");
    const b = await createUser("b@test.com");

    await request(app).post(`/api/v1/tenants/${a.tenantId}/clients`).set(a.auth).send({ name: "A-client" });
    await request(app).post(`/api/v1/tenants/${b.tenantId}/clients`).set(b.auth).send({ name: "B-client" });

    // Deliberately NO tenantId in where — simulating a forgotten filter
    const seenByA = await withTenant(a.tenantId, (tx) => tx.client.findMany());

    expect(seenByA).toHaveLength(1);
    expect(seenByA[0]!.name).toBe("A-client");
  });

  it("returns nothing when no tenant is set", async () => {
    const a = await createOwner("a@test.com");
    await request(app).post(`/api/v1/tenants/${a.tenantId}/clients`).set(a.auth).send({ name: "A-client" });

    const { prisma } = await import("../src/lib/prisma.js");
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE klarbook_app`;
      return tx.client.findMany();
    });

    expect(rows).toHaveLength(0);
  });
});