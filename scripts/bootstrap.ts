/**
 * Production/staging first-run bootstrap (idempotent). Does NOT create demo data.
 *  - syncs roles & permissions
 *  - creates default settings, salary components, leave types and a default shift if absent
 *  - creates the first Super Admin (user + employee) and emails a set-password link
 *
 *   ADMIN_EMAIL=it.admin@company.in ADMIN_FIRST_NAME=Asha ADMIN_LAST_NAME=Rao \
 *     npx tsx --conditions=react-server scripts/bootstrap.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { syncRolesAndPermissions } from "../src/lib/auth/role-sync";
import { DEFAULT_RETENTION_POLICY, DEFAULT_STATUTORY_CONFIG } from "../src/lib/settings-defaults";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("ADMIN_EMAIL is required");
  await syncRolesAndPermissions(prisma);
  console.log("✓ roles & permissions synced");

  for (const [key, value, description] of [
    [
      "payroll.statutory",
      DEFAULT_STATUTORY_CONFIG,
      "Indian statutory deduction rules — REVIEW BEFORE USE",
    ],
    ["privacy.retention", DEFAULT_RETENTION_POLICY, "Data retention periods — REVIEW BEFORE USE"],
  ] as const) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as unknown as Prisma.InputJsonValue, description },
    });
  }
  const components = [
    {
      code: "BASIC",
      name: "Basic Salary",
      type: "EARNING",
      calcType: "PERCENT_OF_CTC",
      sortOrder: 1,
    },
    {
      code: "HRA",
      name: "House Rent Allowance",
      type: "EARNING",
      calcType: "PERCENT_OF_BASIC",
      sortOrder: 2,
    },
    {
      code: "SPECIAL",
      name: "Special Allowance",
      type: "EARNING",
      calcType: "FIXED",
      sortOrder: 3,
    },
  ] as const;
  for (const c of components)
    await prisma.salaryComponent.upsert({ where: { code: c.code }, update: {}, create: c });
  if (!(await prisma.shift.count())) {
    await prisma.shift.create({
      data: {
        name: "General (09:30–18:30)",
        startTime: "09:30",
        endTime: "18:30",
        graceMinutes: 15,
        fullDayMinutes: 450,
        halfDayMinutes: 240,
        weeklyOffs: [0, 6],
        isDefault: true,
      },
    });
  }
  if (!(await prisma.leaveType.count())) {
    await prisma.leaveType.createMany({
      data: [
        {
          code: "CL",
          name: "Casual Leave",
          annualEntitlement: 8,
          approvalLevels: 1,
          color: "#0d9488",
        },
        {
          code: "SL",
          name: "Sick Leave",
          annualEntitlement: 10,
          approvalLevels: 1,
          color: "#dc2626",
        },
        {
          code: "EL",
          name: "Earned Leave",
          annualEntitlement: 15,
          accrual: "MONTHLY",
          carryForwardLimit: 30,
          approvalLevels: 2,
          color: "#7c3aed",
        },
        {
          code: "LWP",
          name: "Unpaid Leave",
          annualEntitlement: 0,
          accrual: "NONE",
          isPaid: false,
          allowNegativeBalance: true,
          approvalLevels: 2,
          color: "#64748b",
        },
      ],
    });
  }
  console.log("✓ defaults present (review them in HR configuration)");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• user ${email} already exists — nothing to do`);
    return;
  }
  const { hashPassword, generateToken } = await import("../src/lib/auth/crypto");
  const roles = await prisma.role.findMany({ where: { key: { in: ["SUPER_ADMIN", "EMPLOYEE"] } } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(generateToken() + generateToken()),
      mustChangePassword: true,
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
  });
  const n = await prisma.counter.upsert({
    where: { key: "employee" },
    update: { value: { increment: 1 } },
    create: { key: "employee", value: 1 },
  });
  await prisma.employee.create({
    data: {
      employeeCode: `EMP-${String(n.value).padStart(5, "0")}`,
      userId: user.id,
      firstName: process.env.ADMIN_FIRST_NAME ?? "System",
      lastName: process.env.ADMIN_LAST_NAME ?? "Administrator",
      workEmail: email,
      dateOfJoining: new Date(new Date().toISOString().slice(0, 10)),
      status: "ACTIVE",
    },
  });
  const { sendAccountInvite } = await import("../src/server/services/auth.service");
  await sendAccountInvite(user.id, process.env.ADMIN_FIRST_NAME ?? "Administrator");
  console.log(`✓ Super Admin ${email} created; a set-password link was emailed (valid 72h)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
