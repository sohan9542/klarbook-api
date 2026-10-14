import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

const signupBody = {
  tenantName: "Test Agency",
  email: "owner@test.com",
  password: "supersecret123",
  name: "Owner",
};

describe("POST /api/v1/auth/signup", () => {
  it("creates a tenant and owner", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send(signupBody);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("owner@test.com");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects a duplicate email with 409", async () => {
    await request(app).post("/api/v1/auth/signup").send(signupBody);
    const res = await request(app).post("/api/v1/auth/signup").send(signupBody);

    expect(res.status).toBe(409);
  });

  it("rejects a short password with 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ ...signupBody, password: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.password).toBeDefined();
  });
});

describe("POST /api/v1/auth/login", () => {
  it("returns tokens for valid credentials", async () => {
    await request(app).post("/api/v1/auth/signup").send(signupBody);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: signupBody.email, password: signupBody.password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf("string");
    expect(res.body.refreshToken).toBeTypeOf("string");
  });

  it("returns 401 for a wrong password", async () => {
    await request(app).post("/api/v1/auth/signup").send(signupBody);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: signupBody.email, password: "wrongpassword1" });

    expect(res.status).toBe(401);
  });
});