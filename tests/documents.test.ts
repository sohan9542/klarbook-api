import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createOwner } from "./helpers.js";

// Fake the S3 helpers. Real uploads never happen.
vi.mock("../src/lib/storage.js", () => ({
  presignUpload: vi.fn(async () => "https://fake-s3/upload"),
  objectSize: vi.fn(async () => 1024),
  // 1024 bytes = under the 25 MB limit
  presignDownload: vi.fn(async () => "https://fake-s3/download"),
}));

const docsUrl = (tenantId: string, projectId: string) =>
  `/api/v1/tenants/${tenantId}/projects/${projectId}/documents`;

async function seedProject() {
  const owner = await createOwner("owner@test.com");
  const client = await request(app)
    .post(`/api/v1/tenants/${owner.tenantId}/clients`)
    .set(owner.auth)
    .send({ name: "ACME" });
  const project = await request(app)
    .post(`/api/v1/tenants/${owner.tenantId}/projects`)
    .set(owner.auth)
    .send({ clientId: client.body.id, name: "Website" });
  return { owner, projectId: project.body.id as string };
}

describe("Documents", () => {
  beforeEach(() => {
    vi.clearAllMocks(); // reset call counts between tests
  });

  it("returns a presigned upload URL and creates a PENDING document", async () => {
    const { owner, projectId } = await seedProject();

    const res = await request(app)
      .post(`${docsUrl(owner.tenantId, projectId)}/upload-url`)
      .set(owner.auth)
      .send({ filename: "brief.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(res.body.uploadUrl).toBe("https://fake-s3/upload");
    expect(res.body.documentId).toBeTruthy();
    expect(res.body.expiresIn).toBe(300);
  });

  it("rejects a forbidden content type with 400", async () => {
    const { owner, projectId } = await seedProject();

    const res = await request(app)
      .post(`${docsUrl(owner.tenantId, projectId)}/upload-url`)
      .set(owner.auth)
      .send({ filename: "virus.exe", contentType: "application/x-msdownload" });

    expect(res.status).toBe(400);
  });

  it("confirms upload, sets READY, and writes an audit log", async () => {
    const { owner, projectId } = await seedProject();
    const created = await request(app)
      .post(`${docsUrl(owner.tenantId, projectId)}/upload-url`)
      .set(owner.auth)
      .send({ filename: "brief.pdf", contentType: "application/pdf" });

    const res = await request(app)
      .post(`${docsUrl(owner.tenantId, projectId)}/${created.body.documentId}/confirm`)
      .set(owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.size).toBe(1024);

    const list = await request(app)
      .get(docsUrl(owner.tenantId, projectId))
      .set(owner.auth);
    expect(list.body).toHaveLength(1);

    const { prisma } = await import("../src/lib/prisma.js");
    const log = await prisma.auditLog.findFirst({
      where: { action: "document.uploaded" },
    });
    expect(log).not.toBeNull();
  });

  it("returns a download URL for a READY document", async () => {
    const { owner, projectId } = await seedProject();
    const created = await request(app)
      .post(`${docsUrl(owner.tenantId, projectId)}/upload-url`)
      .set(owner.auth)
      .send({ filename: "brief.pdf", contentType: "application/pdf" });
    await request(app)
      .post(`${docsUrl(owner.tenantId, projectId)}/${created.body.documentId}/confirm`)
      .set(owner.auth);

    const res = await request(app)
      .get(`${docsUrl(owner.tenantId, projectId)}/${created.body.documentId}/download-url`)
      .set(owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.downloadUrl).toBe("https://fake-s3/download");
  });

  it("fails confirm when the file was never uploaded", async () => {
    const { objectSize } = await import("../src/lib/storage.js");
    vi.mocked(objectSize).mockRejectedValueOnce(new Error("NoSuchKey"));

    const { owner, projectId } = await seedProject();
    const created = await request(app)
      .post(`${docsUrl(owner.tenantId, projectId)}/upload-url`)
      .set(owner.auth)
      .send({ filename: "brief.pdf", contentType: "application/pdf" });

    const res = await request(app)
      .post(`${docsUrl(owner.tenantId, projectId)}/${created.body.documentId}/confirm`)
      .set(owner.auth);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UPLOAD_MISSING");
  });
});