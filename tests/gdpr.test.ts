import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createOwner } from "./helpers.js";

describe("GDPR export", () => {
  it("returns the user's own data as a download", async () => {
    const owner = await createOwner("owner@test.com");

    const res = await request(app).get("/api/v1/me/export").set(owner.auth);

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.body.user.email).toBe("owner@test.com");
    expect(res.body.user.memberships).toHaveLength(1);
    expect(res.body.user.memberships[0].role).toBe("OWNER");
    expect(res.body.exportedAt).toBeTruthy();
  });

  it("never includes the password hash", async () => {
    const owner = await createOwner("owner@test.com");

    const res = await request(app).get("/api/v1/me/export").set(owner.auth);

    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("argon2");
  });

  it("requires login", async () => {
    const res = await request(app).get("/api/v1/me/export");
    expect(res.status).toBe(401);
  });
});