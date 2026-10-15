import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError, AppError } from "../../lib/errors.js";
import { presignUpload, presignDownload, objectSize } from "../../lib/storage.js";
import type { RequestUploadInput } from "./documents.schema.js";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

async function assertProject(tenantId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!project) throw new NotFoundError("Project not found");
}

export async function requestUpload(
  tenantId: string, userId: string, projectId: string, input: RequestUploadInput,
) {
  await assertProject(tenantId, projectId);

  const storageKey = `${tenantId}/${projectId}/${crypto.randomUUID()}`;
  const doc = await prisma.document.create({
    data: {
      tenantId, projectId, uploadedBy: userId,
      filename: input.filename, contentType: input.contentType, storageKey,
    },
    select: { id: true },
  });

  const uploadUrl = await presignUpload(storageKey, input.contentType);
  return { documentId: doc.id, uploadUrl, expiresIn: 300 };
}

export async function confirmUpload(tenantId: string, userId: string, projectId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, tenantId, projectId, status: "PENDING", deletedAt: null },
  });
  if (!doc) throw new NotFoundError("Document not found");

  let size: number;
  try {
    size = await objectSize(doc.storageKey);
  } catch {
    throw new AppError(400, "UPLOAD_MISSING", "File was not uploaded");
  }
  if (size > MAX_BYTES) throw new AppError(400, "FILE_TOO_LARGE", "Max 25 MB");

  return prisma.$transaction(async (tx) => {
    const ready = await tx.document.update({
      where: { id: doc.id },
      data: { status: "READY", size },
      select: { id: true, filename: true, contentType: true, size: true, createdAt: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId, actorId: userId, action: "document.uploaded", entity: "Document",
        entityId: doc.id, metadata: { filename: doc.filename, size },
      },
    });
    return ready;
  });
}

export async function listDocuments(tenantId: string, projectId: string) {
  await assertProject(tenantId, projectId);
  return prisma.document.findMany({
    where: { tenantId, projectId, status: "READY", deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, contentType: true, size: true, createdAt: true },
  });
}

export async function getDownloadUrl(tenantId: string, userId: string, projectId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, tenantId, projectId, status: "READY", deletedAt: null },
  });
  if (!doc) throw new NotFoundError("Document not found");

  await prisma.auditLog.create({
    data: { tenantId, actorId: userId, action: "document.downloaded", entity: "Document", entityId: doc.id },
  });
  return { downloadUrl: await presignDownload(doc.storageKey, doc.filename), expiresIn: 300 };
}