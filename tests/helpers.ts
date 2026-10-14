import request from "supertest";
import { app } from "../src/app.js";

export async function createOwner(email: string, tenantName = "Agency") {
  const password = "supersecret123";
  const signup = await request(app)
    .post("/api/v1/auth/signup")
    .send({ tenantName, email, password, name: email });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });

  return {
    tenantId: signup.body.tenant.id as string,
    userId: signup.body.user.id as string,
    auth: { Authorization: `Bearer ${login.body.accessToken}` },
  };
}

export async function createUser(email: string) {
  // a user who has their own agency, but no access to ours yet
  return createOwner(email, `${email} agency`);
}