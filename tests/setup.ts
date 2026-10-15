import { beforeEach, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma.js";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
`TRUNCATE "AuditLog", "RefreshToken", "Project", "Client", "Membership", "User", "Tenant" RESTART IDENTITY CASCADE`

  );
});

afterAll(async () => {
  await prisma.$disconnect();
});