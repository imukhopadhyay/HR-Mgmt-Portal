import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { syncRolesAndPermissions } from "../../src/lib/auth/role-sync";
import { testDatabaseUrl } from "./env";

/** Resets the dedicated test database and syncs RBAC before the integration suite. */
export default async function setup() {
  const url = testDatabaseUrl();
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Refusing to reset non-test database: ${url}`);
  }
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
  });
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await syncRolesAndPermissions(prisma);
  await prisma.$disconnect();
}
