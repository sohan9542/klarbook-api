import { prisma } from "../../lib/prisma.js";
import { ConflictError } from "../../lib/errors.js";


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

export async function eraseUser(userId: string) {
  const ownerships = await prisma.membership.count({
    where: { userId, role: "OWNER" },
  });
  if (ownerships > 0) {
    throw new ConflictError("Transfer or delete your agency before erasing your account");
  }

  await prisma.$transaction(async (tx) => {
    const memberships = await tx.membership.findMany({
      where: { userId },
      select: { tenantId: true },
    });

    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.membership.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@erased.invalid`,
        name: "Deleted user",
        passwordHash: "ERASED",
        deletedAt: new Date(),
      },
    });

    for (const m of memberships) {
      await tx.auditLog.create({
        data: {
          tenantId: m.tenantId,
          actorId: userId,
          action: "user.erased",
          entity: "User",
          entityId: userId,
        },
      });
    }
  });
}