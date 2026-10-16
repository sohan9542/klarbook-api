import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createOwner } from "./helpers.js";

vi.mock("../src/lib/queues.js", () => ({
    enqueueInviteEmail: vi.fn(async () => undefined),
}));

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

async function createStaff(ownerTenantId: string, ownerAuth: Record<string, string>) {
    const { enqueueInviteEmail } = await import("../src/lib/queues.js");
    vi.mocked(enqueueInviteEmail).mockClear();
    await request(app)
        .post(`/api/v1/tenants/${ownerTenantId}/invites`)
        .set(ownerAuth)
        .send({ email: "staff@test.com", role: "STAFF" });
    const token = vi.mocked(enqueueInviteEmail).mock.calls[0][0].token;
    const password = "supersecret123";
    const accepted = await request(app)
        .post("/api/v1/invites/accept")
        .send({ token, name: "Staff", password });
    const login = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "staff@test.com", password });
    return {
        userId: accepted.body.userId as string,
        auth: { Authorization: `Bearer ${login.body.accessToken}` },
        password,
    };
}
describe("GDPR erasure", () => {
    it("anonymizes a staff user and removes access", async () => {
        const owner = await createOwner("owner@test.com");
        const staff = await createStaff(owner.tenantId, owner.auth);
        const res = await request(app).delete("/api/v1/me").set(staff.auth);
        expect(res.status).toBe(204);
        const { prisma } = await import("../src/lib/prisma.js");
        const user = await prisma.user.findUnique({ where: { id: staff.userId } });
        expect(user?.email).toBe(`deleted-${staff.userId}@erased.invalid`);
        expect(user?.name).toBe("Deleted user");
        expect(user?.deletedAt).not.toBeNull();
        const memberships = await prisma.membership.count({ where: { userId: staff.userId } });
        expect(memberships).toBe(0);
        const log = await prisma.auditLog.findFirst({
            where: { action: "user.erased", tenantId: owner.tenantId },
        });
        expect(log).not.toBeNull();
    });
    it("erased user cannot log in again", async () => {
        const owner = await createOwner("owner@test.com");
        const staff = await createStaff(owner.tenantId, owner.auth);
        await request(app).delete("/api/v1/me").set(staff.auth);
        const login = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "staff@test.com", password: staff.password });
        expect(login.status).toBe(401);
    });
    it("blocks an OWNER from erasing with 409", async () => {
        const owner = await createOwner("owner@test.com");
        const res = await request(app).delete("/api/v1/me").set(owner.auth);
        expect(res.status).toBe(409);
    });
});