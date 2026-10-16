import { prisma } from "../../lib/prisma.js";

export async function exportUserData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      memberships: {
        select: {
          role: true,
          createdAt: true,
          tenant: { select: { id: true, name: true } },
        },
      },
    },
  });

  const auditLogs = await prisma.auditLog.findMany({
    where: { actorId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      action: true,
      entity: true,
      entityId: true,
      createdAt: true,
      tenantId: true,
    },
  });

  return {
    exportedAt: new Date().toISOString(),
    user,
    auditLogs,
  };
}