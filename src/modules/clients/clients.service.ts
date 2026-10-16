import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import type { CreateClientInput, UpdateClientInput } from "./clients.schema.js";
import { withTenant } from "../../lib/tenant-db.js";

const publicFields = {
  id: true, name: true, email: true, company: true, createdAt: true, updatedAt: true,
} as const;

export async function createClient(tenantId: string, actorId: string, input: CreateClientInput) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({ data: { ...input, tenantId }, select: publicFields });
    await tx.auditLog.create({
      data: { tenantId, actorId, action: "client.created", entity: "Client", entityId: client.id },
    });
    return client;
  });
}

export async function listClients(tenantId: string, limit: number, cursor?: string) {
  const items = await withTenant(tenantId, (tx) =>
    tx.client.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: publicFields,
    }),
  );

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  return { data, nextCursor: hasMore ? data[data.length - 1]!.id : null };
}

export async function getClient(tenantId: string, id: string) {
  const client = await prisma.client.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: publicFields,
  });
  if (!client) throw new NotFoundError("Client not found");
  return client;
}

export async function updateClient(tenantId: string, actorId: string, id: string, input: UpdateClientInput) {
  await getClient(tenantId, id); // 404 if not in this tenant
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.update({ where: { id }, data: input, select: publicFields });
    await tx.auditLog.create({
      data: { tenantId, actorId, action: "client.updated", entity: "Client", entityId: id, metadata: input },
    });
    return client;
  });
}

export async function deleteClient(tenantId: string, actorId: string, id: string) {
  await getClient(tenantId, id);
  await prisma.$transaction([
    prisma.client.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.auditLog.create({
      data: { tenantId, actorId, action: "client.deleted", entity: "Client", entityId: id },
    }),
  ]);
}