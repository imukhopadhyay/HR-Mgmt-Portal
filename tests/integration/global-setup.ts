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
  if (!/test/i.test(base.pathname)) throw new Error(`Refusing to run integration tests against non-test database ${base.pathname}`);
  const schema = `it_${Date.now().toString(36)}_${process.pid}`;
  base.searchParams.set("schema", schema);
  const url = base.toString();
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url } });
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await syncRolesAndPermissions(prisma);
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
