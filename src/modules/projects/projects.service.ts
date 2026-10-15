import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import type { ProjectStatus } from "../../generated/prisma/client.js";
import type { CreateProjectInput, UpdateProjectInput } from "./projects.schema.js";

const publicFields = {
  id: true, name: true, description: true, status: true, dueDate: true,
  createdAt: true, updatedAt: true,
  client: { select: { id: true, name: true } },
} as const;

export async function createProject(tenantId: string, actorId: string, input: CreateProjectInput) {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!client) throw new NotFoundError("Client not found");

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { ...input, tenantId },
      select: publicFields,
    });
    await tx.auditLog.create({
      data: { tenantId, actorId, action: "project.created", entity: "Project", entityId: project.id },
    });
    return project;
  });
}

export async function listProjects(
  tenantId: string,
  filters: { status?: ProjectStatus; clientId?: string; limit: number; cursor?: string },
) {
  const { status, clientId, limit, cursor } = filters;
  const items = await prisma.project.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(status && { status }),
      ...(clientId && { clientId }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: publicFields,
  });

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  return { data, nextCursor: hasMore ? data[data.length - 1]!.id : null };
}

export async function getProject(tenantId: string, id: string) {
  const project = await prisma.project.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: publicFields,
  });
  if (!project) throw new NotFoundError("Project not found");
  return project;
}

export async function updateProject(tenantId: string, actorId: string, id: string, input: UpdateProjectInput) {
  const before = await getProject(tenantId, id);

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.update({ where: { id }, data: input, select: publicFields });
    await tx.auditLog.create({
      data: {
        tenantId, actorId, entity: "Project", entityId: id,
        action: input.status && input.status !== before.status ? "project.status_changed" : "project.updated",
        metadata: { changes: input, previousStatus: before.status },
      },
    });
    return project;
  });
}

export async function deleteProject(tenantId: string, actorId: string, id: string) {
  await getProject(tenantId, id);
  await prisma.$transaction([
    prisma.project.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.auditLog.create({
      data: { tenantId, actorId, action: "project.deleted", entity: "Project", entityId: id },
    }),
  ]);
}