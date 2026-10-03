import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import type { TestProject } from "vitest/node";
import { syncRolesAndPermissions } from "../../src/lib/auth/role-sync";
import { testDatabaseUrl } from "./env";

/**
 * Creates an isolated, uniquely named schema for this test run, applies the
 * real migrations into it, and drops only that schema afterwards. Never
 * touches the dev/production schema.
 */
export default async function setup(project: TestProject) {
  const base = new URL(testDatabaseUrl());
  if (!/test/i.test(base.pathname))
    throw new Error(`Refusing to run integration tests against non-test database ${base.pathname}`);
  const schema = `it_${Date.now().toString(36)}_${process.pid}`;
  base.searchParams.set("schema", schema);
  const url = base.toString();
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
  });
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await syncRolesAndPermissions(prisma);
  // Shared base data, created once (test files run in parallel).
  await prisma.shift.create({
    data: {
      name: "General",
      startTime: "09:30",
      endTime: "18:30",
      graceMinutes: 15,
      fullDayMinutes: 450,
      halfDayMinutes: 240,
      weeklyOffs: [0, 6],
      isDefault: true,
    },
  });
  await prisma.leaveType.createMany({
    data: [
      { code: "CL", name: "Casual Leave", annualEntitlement: 12, approvalLevels: 1 },
      { code: "EL", name: "Earned Leave", annualEntitlement: 15, approvalLevels: 2 },
      {
        code: "LWP",
        name: "Unpaid Leave",
        annualEntitlement: 0,
        accrual: "NONE",
        isPaid: false,
        allowNegativeBalance: true,
        approvalLevels: 1,
      },
    ],
  });
  await prisma.$disconnect();
  project.provide("dbUrl", url);

  return async () => {
    const admin = new PrismaClient({ datasources: { db: { url } } });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}
