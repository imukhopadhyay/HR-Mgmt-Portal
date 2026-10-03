/**
 * Synthetic development seed. All names, emails (reserved `.test` TLD), phone
 * numbers and identifiers are fictional. Never load real employee data here.
 *
 *   npm run db:seed            # idempotent-ish: refuses to run twice unless SEED_FORCE=1 after a reset
 *
 * Demo password for every seeded account: SEED_PASSWORD (default "Passw0rd!2026").
 */
import { PrismaClient, Prisma, type EmploymentType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { syncDerivedRoles, syncRolesAndPermissions } from "../src/lib/auth/role-sync";
import { DEFAULT_STATUTORY_CONFIG, DEFAULT_RETENTION_POLICY } from "../src/lib/settings-defaults";
import { ONBOARDING_TEMPLATE } from "../src/lib/checklists";
import { computeAttendanceMetrics } from "../src/lib/attendance-rules";

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? "Passw0rd!2026";
const TZ_OFFSET_MIN = 330; // Asia/Kolkata

// Deterministic PRNG so seeds are reproducible.
let state = 20261003;
function rand() {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

function day(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}
function keyOf(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(key: string, n: number) {
  const d = day(key);
  d.setUTCDate(d.getUTCDate() + n);
  return keyOf(d);
}
/** Local IST wall time → UTC instant. */
function ist(key: string, hh: number, mm: number) {
  return new Date(day(key).getTime() + (hh * 60 + mm - TZ_OFFSET_MIN) * 60000);
}
function todayIST() {
  return keyOf(new Date(Date.now() + TZ_OFFSET_MIN * 60000));
}

const FIRST = [
  "Aditya",
  "Kavya",
  "Rohan",
  "Isha",
  "Siddharth",
  "Meera",
  "Karan",
  "Diya",
  "Nikhil",
  "Pooja",
  "Varun",
  "Sneha",
  "Amit",
  "Ritika",
  "Manish",
  "Tanvi",
  "Harsh",
  "Aisha",
  "Yash",
  "Nandini",
  "Kunal",
  "Shreya",
  "Dev",
  "Lavanya",
  "Gaurav",
  "Pallavi",
  "Raghav",
  "Simran",
  "Tarun",
  "Zoya",
  "Abhishek",
  "Bhavna",
  "Chirag",
  "Divya",
  "Eshan",
  "Farah",
];
const LAST = [
  "Nair",
  "Reddy",
  "Bose",
  "Malhotra",
  "Joshi",
  "Pillai",
  "Chopra",
  "Desai",
  "Banerjee",
  "Kulkarni",
  "Menon",
  "Saxena",
  "Agarwal",
  "Bhatt",
  "Chatterjee",
  "Das",
  "Fernandes",
  "Ghosh",
  "Hegde",
  "Jain",
  "Khanna",
  "Mishra",
  "Patil",
  "Rao",
  "Shetty",
  "Sinha",
  "Thakur",
  "Venkatesh",
];
const CITIES: [string, string][] = [
  ["Bengaluru", "Karnataka"],
  ["Mumbai", "Maharashtra"],
  ["Pune", "Maharashtra"],
  ["Hyderabad", "Telangana"],
  ["Chennai", "Tamil Nadu"],
  ["Gurugram", "Haryana"],
];

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0 && process.env.SEED_FORCE !== "1") {
    console.log(
      `Database already has ${existing} users — skipping seed. Run "npm run db:reset" to start fresh.`,
    );
    return;
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await syncRolesAndPermissions(prisma);
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.key, r.id]));

  // ── Settings ──
  await prisma.setting.upsert({
    where: { key: "payroll.statutory" },
    update: {},
    create: {
      key: "payroll.statutory",
      value: DEFAULT_STATUTORY_CONFIG as unknown as Prisma.InputJsonValue,
      description:
        "Indian statutory deduction rules (PF, ESI, PT, TDS). Must be validated by HR & Finance.",
    },
  });
  await prisma.setting.upsert({
    where: { key: "privacy.retention" },
    update: {},
    create: {
      key: "privacy.retention",
      value: DEFAULT_RETENTION_POLICY as unknown as Prisma.InputJsonValue,
      description: "Data retention periods",
    },
  });

  // ── Shifts ──
  const general = await prisma.shift.create({
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
  const support = await prisma.shift.create({
    data: {
      name: "Support (07:00–16:00)",
      startTime: "07:00",
      endTime: "16:00",
      graceMinutes: 10,
      fullDayMinutes: 450,
      halfDayMinutes: 240,
      weeklyOffs: [0],
    },
  });

  // ── Holidays (synthetic calendar based on common Indian public holidays) ──
  const holidays: [string, string, "PUBLIC" | "OPTIONAL"][] = [
    ["2026-01-26", "Republic Day", "PUBLIC"],
    ["2026-03-04", "Holi", "PUBLIC"],
    ["2026-04-03", "Good Friday", "OPTIONAL"],
    ["2026-05-01", "Labour Day", "PUBLIC"],
    ["2026-08-15", "Independence Day", "PUBLIC"],
    ["2026-09-14", "Ganesh Chaturthi", "OPTIONAL"],
    ["2026-10-02", "Gandhi Jayanti", "PUBLIC"],
    ["2026-10-20", "Dussehra", "PUBLIC"],
    ["2026-11-09", "Diwali (Day after)", "PUBLIC"],
    ["2026-12-25", "Christmas", "PUBLIC"],
    ["2027-01-26", "Republic Day", "PUBLIC"],
  ];
  await prisma.holiday.createMany({
    data: holidays.map(([d, name, type]) => ({ date: day(d), name, type })),
  });

  // ── Leave types ──
  const leaveTypes = await Promise.all([
    prisma.leaveType.create({
      data: {
        code: "AL",
        name: "Annual Leave",
        annualEntitlement: 12,
        carryForwardLimit: 6,
        color: "#2563eb",
        minNoticeDays: 3,
        approvalLevels: 1,
        description: "Planned vacation leave.",
      },
    }),
    prisma.leaveType.create({
      data: {
        code: "CL",
        name: "Casual Leave",
        annualEntitlement: 8,
        color: "#0d9488",
        maxConsecutiveDays: 3,
        approvalLevels: 1,
        description: "Short personal leave.",
      },
    }),
    prisma.leaveType.create({
      data: {
        code: "SL",
        name: "Sick Leave",
        annualEntitlement: 10,
        color: "#dc2626",
        documentRequiredAfterDays: 2,
        approvalLevels: 1,
        description: "Illness or medical appointments.",
      },
    }),
    prisma.leaveType.create({
      data: {
        code: "EL",
        name: "Earned Leave",
        annualEntitlement: 15,
        accrual: "MONTHLY",
        carryForwardLimit: 30,
        color: "#7c3aed",
        minNoticeDays: 7,
        approvalLevels: 2,
        description: "Accrues monthly; requires manager and HR approval.",
      },
    }),
    prisma.leaveType.create({
      data: {
        code: "LWP",
        name: "Unpaid Leave",
        annualEntitlement: 0,
        accrual: "NONE",
        isPaid: false,
        allowNegativeBalance: true,
        color: "#64748b",
        approvalLevels: 2,
        description: "Leave without pay; deducted in payroll.",
      },
    }),
  ]);

  // ── Departments & designations ──
  const deptDefs = [
    ["EXEC", "Executive Office"],
    ["HR", "Human Resources"],
    ["ENG", "Engineering"],
    ["PRD", "Product & Design"],
    ["SAL", "Sales"],
    ["FIN", "Finance"],
    ["OPS", "Operations"],
  ] as const;
  const depts: Record<string, string> = {};
  for (const [code, name] of deptDefs)
    depts[code] = (
      await prisma.department.create({ data: { code, name, costCenter: `CC-${code}` } })
    ).id;
  await prisma.department.update({ where: { id: depts.ENG }, data: { parentId: depts.EXEC } });

  const desigDefs: [string, number, string | null][] = [
    ["Chief Executive Officer", 10, "EXEC"],
    ["HR Director", 8, "HR"],
    ["HR Manager", 6, "HR"],
    ["HR Executive", 3, "HR"],
    ["VP Engineering", 9, "ENG"],
    ["Engineering Manager", 7, "ENG"],
    ["Senior Software Engineer", 5, "ENG"],
    ["Software Engineer", 3, "ENG"],
    ["QA Engineer", 3, "ENG"],
    ["Product Manager", 6, "PRD"],
    ["UX Designer", 4, "PRD"],
    ["Sales Manager", 6, "SAL"],
    ["Account Executive", 3, "SAL"],
    ["Finance Manager", 6, "FIN"],
    ["Accountant", 3, "FIN"],
    ["Operations Manager", 6, "OPS"],
    ["Operations Associate", 2, "OPS"],
  ];
  const desig: Record<string, string> = {};
  for (const [title, level, d] of desigDefs) {
    desig[title] = (
      await prisma.designation.create({
        data: { title, level, grade: `L${level}`, departmentId: d ? depts[d] : null },
      })
    ).id;
  }

  // ── Salary components ──
  const comp = {
    BASIC: await prisma.salaryComponent.create({
      data: {
        code: "BASIC",
        name: "Basic Salary",
        type: "EARNING",
        calcType: "PERCENT_OF_CTC",
        sortOrder: 1,
      },
    }),
    HRA: await prisma.salaryComponent.create({
      data: {
        code: "HRA",
        name: "House Rent Allowance",
        type: "EARNING",
        calcType: "PERCENT_OF_BASIC",
        sortOrder: 2,
      },
    }),
    SPECIAL: await prisma.salaryComponent.create({
      data: {
        code: "SPECIAL",
        name: "Special Allowance",
        type: "EARNING",
        calcType: "FIXED",
        sortOrder: 3,
      },
    }),
    CONV: await prisma.salaryComponent.create({
      data: {
        code: "CONV",
        name: "Conveyance Allowance",
        type: "EARNING",
        calcType: "FIXED",
        sortOrder: 4,
      },
    }),
  };
  await prisma.salaryComponent.create({
    data: {
      code: "LOAN",
      name: "Salary Advance Recovery",
      type: "DEDUCTION",
      calcType: "FIXED",
      isTaxable: false,
      sortOrder: 20,
    },
  });

  // ── Employees ──
  type Def = {
    first: string;
    last: string;
    email: string;
    dept: string;
    title: string;
    manager?: string;
    roles: string[];
    type?: EmploymentType;
    joined: string;
    ctc: number;
  };
  const core: Def[] = [
    {
      first: "Vikram",
      last: "Rao",
      email: "admin@acme.test",
      dept: "EXEC",
      title: "Chief Executive Officer",
      roles: ["SUPER_ADMIN", "EMPLOYEE"],
      joined: "2019-04-01",
      ctc: 6000000,
    },
    {
      first: "Priya",
      last: "Sharma",
      email: "hradmin@acme.test",
      dept: "HR",
      title: "HR Director",
      manager: "admin@acme.test",
      roles: ["HR_ADMIN", "EMPLOYEE"],
      joined: "2019-07-15",
      ctc: 3200000,
    },
    {
      first: "Neha",
      last: "Kapoor",
      email: "hrmanager@acme.test",
      dept: "HR",
      title: "HR Manager",
      manager: "hradmin@acme.test",
      roles: ["HR_MANAGER", "EMPLOYEE"],
      joined: "2020-02-10",
      ctc: 1800000,
    },
    {
      first: "Arjun",
      last: "Iyer",
      email: "enghead@acme.test",
      dept: "ENG",
      title: "VP Engineering",
      manager: "admin@acme.test",
      roles: ["EMPLOYEE"],
      joined: "2019-09-01",
      ctc: 4800000,
    },
    {
      first: "Rahul",
      last: "Verma",
      email: "manager@acme.test",
      dept: "ENG",
      title: "Engineering Manager",
      manager: "enghead@acme.test",
      roles: ["EMPLOYEE"],
      joined: "2020-06-01",
      ctc: 3000000,
    },
    {
      first: "Ananya",
      last: "Gupta",
      email: "employee@acme.test",
      dept: "ENG",
      title: "Software Engineer",
      manager: "manager@acme.test",
      roles: ["EMPLOYEE"],
      joined: "2023-01-16",
      ctc: 1200000,
    },
    {
      first: "Sanjay",
      last: "Krishnan",
      email: "sanjay.krishnan@acme.test",
      dept: "FIN",
      title: "Finance Manager",
      manager: "admin@acme.test",
      roles: ["EMPLOYEE"],
      joined: "2020-11-02",
      ctc: 2200000,
    },
    {
      first: "Meenakshi",
      last: "Iyer",
      email: "meenakshi.iyer@acme.test",
      dept: "PRD",
      title: "Product Manager",
      manager: "admin@acme.test",
      roles: ["EMPLOYEE"],
      joined: "2021-03-08",
      ctc: 2600000,
    },
    {
      first: "Farhan",
      last: "Qureshi",
      email: "farhan.qureshi@acme.test",
      dept: "SAL",
      title: "Sales Manager",
      manager: "admin@acme.test",
      roles: ["EMPLOYEE"],
      joined: "2021-01-11",
      ctc: 2000000,
    },
    {
      first: "Lakshmi",
      last: "Narayan",
      email: "lakshmi.narayan@acme.test",
      dept: "OPS",
      title: "Operations Manager",
      manager: "admin@acme.test",
      roles: ["EMPLOYEE"],
      joined: "2020-08-17",
      ctc: 1700000,
    },
  ];
  const teamTitles: Record<string, [string, string][]> = {
    ENG: [
      ["Senior Software Engineer", "manager@acme.test"],
      ["Software Engineer", "manager@acme.test"],
      ["QA Engineer", "manager@acme.test"],
      ["Senior Software Engineer", "enghead@acme.test"],
    ],
    HR: [["HR Executive", "hrmanager@acme.test"]],
    PRD: [["UX Designer", "meenakshi.iyer@acme.test"]],
    SAL: [["Account Executive", "farhan.qureshi@acme.test"]],
    FIN: [["Accountant", "sanjay.krishnan@acme.test"]],
    OPS: [["Operations Associate", "lakshmi.narayan@acme.test"]],
  };
  const extra: Def[] = [];
  const usedEmails = new Set(core.map((c) => c.email));
  const counts: Record<string, number> = { ENG: 14, HR: 2, PRD: 3, SAL: 6, FIN: 2, OPS: 5 };
  for (const [dept, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) {
      let first: string, last: string, email: string;
      do {
        first = pick(FIRST);
        last = pick(LAST);
        email = `${first}.${last}@acme.test`.toLowerCase();
      } while (usedEmails.has(email));
      usedEmails.add(email);
      const [title, manager] = pick(teamTitles[dept]);
      const year = int(2021, 2026);
      const month = year === 2026 ? int(1, 8) : int(1, 12);
      const level = desigDefs.find((d) => d[0] === title)![1];
      extra.push({
        first,
        last,
        email,
        dept,
        title,
        manager,
        roles: ["EMPLOYEE"],
        type:
          dept === "OPS" && i === 0
            ? "CONTRACT"
            : dept === "ENG" && i === n - 1
              ? "INTERN"
              : "FULL_TIME",
        joined: `${year}-${String(month).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
        ctc: Math.round((300000 + level * 180000 + int(0, 200000)) / 1000) * 1000,
      });
    }
  }

  const all = [...core, ...extra];
  const empIdByEmail: Record<string, string> = {};
  let seq = 0;
  const year = Number(todayIST().slice(0, 4));
  for (const d of all) {
    seq++;
    const [city, st] = pick(CITIES);
    const user = await prisma.user.create({
      data: {
        email: d.email,
        passwordHash,
        roles: { create: d.roles.map((r) => ({ roleId: roles[r] })) },
      },
    });
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `EMP-${String(seq).padStart(5, "0")}`,
        userId: user.id,
        firstName: d.first,
        lastName: d.last,
        workEmail: d.email,
        personalEmail: `${d.first}.${d.last}.personal@example.test`.toLowerCase(),
        phone: `+91 9${int(100000000, 999999999)}`,
        dateOfBirth: day(
          `${int(1975, 2001)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
        ),
        gender: pick(["MALE", "FEMALE", "UNDISCLOSED"] as const),
        addressLine1: `${int(1, 300)}, ${pick(["MG Road", "Residency Road", "Park Street", "Link Road", "Ring Road"])}`,
        city,
        state: st,
        postalCode: String(int(400001, 600099)),
        departmentId: depts[d.dept],
        designationId: desig[d.title],
        managerId: d.manager ? empIdByEmail[d.manager] : null,
        shiftId: d.dept === "OPS" ? support.id : general.id,
        employmentType: d.type ?? "FULL_TIME",
        status: d.joined > addDays(todayIST(), -30) ? "ONBOARDING" : "ACTIVE",
        workLocation: city,
        dateOfJoining: day(d.joined),
        probationEndsOn: day(addDays(d.joined, 180)),
        emergencyContacts: {
          create: [
            {
              name: `${pick(FIRST)} ${d.last}`,
              relationship: pick(["Spouse", "Parent", "Sibling"]),
              phone: `+91 9${int(100000000, 999999999)}`,
              isPrimary: true,
            },
          ],
        },
        financialInfo: {
          create: {
            panNumber: `ABCDE${int(1000, 9999)}F`,
            uanNumber: String(int(100000000000, 999999999999)),
            bankName: "Example Bank",
            bankAccountNumber: String(int(10000000000, 99999999999)),
            bankIfsc: "EXMP0001234",
          },
        },
        history: {
          create: {
            changeType: "JOINED",
            effectiveDate: day(d.joined),
            details: { department: d.dept, designation: d.title },
          },
        },
      },
    });
    empIdByEmail[d.email] = emp.id;
    if (d.manager) {
      await prisma.reportingRelationship.create({
        data: { employeeId: emp.id, managerId: empIdByEmail[d.manager], startDate: day(d.joined) },
      });
    }
    // Leave balances for the current year.
    for (const lt of leaveTypes) {
      const ent = Number(lt.annualEntitlement);
      await prisma.leaveBalance.create({
        data: {
          employeeId: emp.id,
          leaveTypeId: lt.id,
          year,
          entitled: lt.accrual === "MONTHLY" ? Math.round((ent / 12) * 9 * 2) / 2 : ent,
          carriedForward: lt.code === "EL" ? int(0, 8) : 0,
        },
      });
    }
    // Salary structure.
    const basicPct = 40;
    const monthly = d.ctc / 12;
    const basic = (monthly * basicPct) / 100;
    const hra = basic * 0.5;
    const conv = 1600;
    const employerPf = Math.min(basic, 15000) * 0.12;
    const special = Math.max(0, Math.round(monthly - basic - hra - conv - employerPf));
    await prisma.salaryStructure.create({
      data: {
        employeeId: emp.id,
        effectiveFrom: day(d.joined),
        annualCtc: d.ctc,
        lines: {
          create: [
            { componentId: comp.BASIC.id, value: basicPct },
            { componentId: comp.HRA.id, value: 50 },
            { componentId: comp.SPECIAL.id, value: special },
            { componentId: comp.CONV.id, value: conv },
          ],
        },
      },
    });
    if (emp.status === "ONBOARDING") {
      await prisma.checklistItem.createMany({
        data: ONBOARDING_TEMPLATE.map((t, i) => ({
          employeeId: emp.id,
          type: "ONBOARDING" as const,
          title: t.title,
          category: t.category,
          owner: t.owner,
          sortOrder: i,
          dueDate: day(addDays(d.joined, t.dueInDays)),
          completedAt: i < 3 ? new Date() : null,
        })),
      });
    }
  }
  await prisma.counter.upsert({
    where: { key: "employee" },
    update: { value: seq },
    create: { key: "employee", value: seq },
  });

  // Department heads.
  const heads: Record<string, string> = {
    EXEC: "admin@acme.test",
    HR: "hradmin@acme.test",
    ENG: "enghead@acme.test",
    PRD: "meenakshi.iyer@acme.test",
    SAL: "farhan.qureshi@acme.test",
    FIN: "sanjay.krishnan@acme.test",
    OPS: "lakshmi.narayan@acme.test",
  };
  for (const [code, email] of Object.entries(heads))
    await prisma.department.update({
      where: { id: depts[code] },
      data: { headId: empIdByEmail[email] },
    });
  await prisma.$transaction((tx) => syncDerivedRoles(tx, Object.values(empIdByEmail)));

  // ── Attendance: last 30 days for everyone ──
  const today = todayIST();
  const holidaySet = new Set(holidays.map((h) => h[0]));
  const employees = await prisma.employee.findMany({ include: { shift: true } });
  const rows: Prisma.AttendanceCreateManyInput[] = [];
  for (const e of employees) {
    for (let i = 30; i >= 1; i--) {
      const k = addDays(today, -i);
      if (k < keyOf(e.dateOfJoining)) continue;
      const wd = day(k).getUTCDay();
      if (e.shift!.weeklyOffs.includes(wd) || holidaySet.has(k)) continue;
      const r = rand();
      if (r < 0.04) {
        rows.push({
          employeeId: e.id,
          date: day(k),
          status: "ABSENT",
          source: "SYSTEM",
          shiftId: e.shiftId,
        });
        continue;
      }
      const [sh, sm] = e.shift!.startTime.split(":").map(Number);
      const late = r < 0.18 ? int(16, 55) : int(-20, 10);
      const inAt = ist(k, sh, sm + late);
      const worked = rand() < 0.05 ? int(250, 420) : int(460, 560);
      const outAt = new Date(inAt.getTime() + worked * 60000);
      const m = computeAttendanceMetrics(k, inAt, outAt, e.shift!, "Asia/Kolkata");
      rows.push({
        employeeId: e.id,
        date: day(k),
        shiftId: e.shiftId,
        checkInAt: inAt,
        checkOutAt: outAt,
        ...m,
        source: "WEB",
      });
    }
  }
  await prisma.attendance.createMany({ data: rows });

  // ── Leave requests ──
  const lt = Object.fromEntries(leaveTypes.map((t) => [t.code, t]));
  const ananya = empIdByEmail["employee@acme.test"];
  const rahul = empIdByEmail["manager@acme.test"];
  const neha = empIdByEmail["hrmanager@acme.test"];
  const reqs = [
    {
      emp: ananya,
      type: "CL",
      start: addDays(today, 7),
      end: addDays(today, 8),
      status: "PENDING" as const,
      reason: "Family function out of town.",
    },
    {
      emp: ananya,
      type: "SL",
      start: addDays(today, -20),
      end: addDays(today, -20),
      status: "APPROVED" as const,
      reason: "Fever.",
    },
    {
      emp: extraEmail(extra, "ENG", 0, empIdByEmail),
      type: "AL",
      start: addDays(today, 14),
      end: addDays(today, 18),
      status: "PENDING" as const,
      reason: "Vacation with family.",
    },
    {
      emp: extraEmail(extra, "ENG", 1, empIdByEmail),
      type: "EL",
      start: addDays(today, 21),
      end: addDays(today, 25),
      status: "PENDING" as const,
      reason: "Travel abroad.",
    },
    {
      emp: extraEmail(extra, "SAL", 0, empIdByEmail),
      type: "CL",
      start: addDays(today, -3),
      end: addDays(today, -3),
      status: "REJECTED" as const,
      reason: "Personal work.",
    },
  ];
  for (const r of reqs) {
    const days = countWorkingDays(r.start, r.end, holidaySet);
    const t = lt[r.type];
    const req = await prisma.leaveRequest.create({
      data: {
        employeeId: r.emp,
        leaveTypeId: t.id,
        startDate: day(r.start),
        endDate: day(r.end),
        days,
        reason: r.reason,
        status: r.status,
        requiredLevels: t.approvalLevels,
        decidedAt: r.status === "PENDING" ? null : new Date(),
      },
    });
    const field = r.status === "APPROVED" ? "used" : r.status === "PENDING" ? "pending" : null;
    if (field)
      await prisma.leaveBalance.update({
        where: { employeeId_leaveTypeId_year: { employeeId: r.emp, leaveTypeId: t.id, year } },
        data: { [field]: { increment: days } },
      });
    if (r.status !== "PENDING") {
      await prisma.leaveApproval.create({
        data: {
          leaveRequestId: req.id,
          level: 1,
          approverId: r.emp === ananya ? rahul : neha,
          action: r.status === "APPROVED" ? "APPROVED" : "REJECTED",
          comment: r.status === "REJECTED" ? "Critical client demo that day." : "Get well soon.",
        },
      });
    }
  }

  // ── Announcements ──
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "hradmin@acme.test" } });
  await prisma.announcement.createMany({
    data: [
      {
        title: "Diwali celebrations on 6 November",
        body: "Join us in the cafeteria at 4 PM for festivities, sweets and the rangoli competition. Teams are encouraged to participate!",
        priority: "NORMAL",
        authorId: adminUser.id,
      },
      {
        title: "Updated leave policy effective 1 October",
        body: "Earned Leave now accrues monthly and requires both manager and HR approval. Please review the policy in the HR help desk.",
        priority: "HIGH",
        authorId: adminUser.id,
      },
      {
        title: "Engineering all-hands",
        body: "Quarterly engineering all-hands on Friday at 11 AM in the main auditorium.",
        priority: "LOW",
        authorId: adminUser.id,
        departmentId: depts.ENG,
      },
    ],
  });

  // ── Recruitment ──
  const req1 = await prisma.recruitment.create({
    data: {
      code: "REQ-00001",
      title: "Senior Backend Engineer",
      departmentId: depts.ENG,
      designationId: desig["Senior Software Engineer"],
      hiringManagerId: rahul,
      openings: 2,
      description: "Build and scale our core HR platform services in TypeScript and PostgreSQL.",
      minExperience: 4,
      maxExperience: 8,
      budgetMin: 2000000,
      budgetMax: 3200000,
      status: "OPEN",
      requestedById: adminUser.id,
      approvedById: adminUser.id,
      approvedAt: new Date(),
      targetDate: day(addDays(today, 45)),
    },
  });
  const req2 = await prisma.recruitment.create({
    data: {
      code: "REQ-00002",
      title: "Account Executive",
      departmentId: depts.SAL,
      designationId: desig["Account Executive"],
      hiringManagerId: empIdByEmail["farhan.qureshi@acme.test"],
      openings: 1,
      description: "Own the full sales cycle for mid-market customers in South India.",
      minExperience: 2,
      status: "PENDING_APPROVAL",
      requestedById: adminUser.id,
    },
  });
  await prisma.counter.create({ data: { key: "requisition", value: 2 } });
  const stages = ["APPLIED", "SCREENING", "INTERVIEW", "INTERVIEW", "OFFER", "REJECTED"] as const;
  for (let i = 0; i < stages.length; i++) {
    const c = await prisma.candidate.create({
      data: {
        recruitmentId: req1.id,
        firstName: pick(FIRST),
        lastName: pick(LAST),
        email: `candidate${i + 1}@example.test`,
        phone: `+91 8${int(100000000, 999999999)}`,
        source: pick(["LinkedIn", "Referral", "Careers page", "Agency"]),
        currentCompany: pick(["Globex", "Initech", "Umbrella Labs", "Hooli"]),
        experienceYears: int(4, 9),
        expectedCtc: int(22, 34) * 100000,
        stage: stages[i],
      },
    });
    if (stages[i] === "INTERVIEW") {
      await prisma.interview.create({
        data: {
          candidateId: c.id,
          round: "Technical round 1",
          scheduledAt: ist(addDays(today, i), 15, 0),
          interviewerId: rahul,
          mode: "VIDEO",
          location: "Video call",
        },
      });
    }
  }
  void req2;

  // ── Performance ──
  const cycle = await prisma.performanceCycle.create({
    data: {
      name: `H2 FY${year % 100}-${(year + 1) % 100}`,
      startDate: day(`${year}-10-01`),
      endDate: day(`${year + 1}-03-31`),
      selfReviewDue: day(`${year + 1}-03-15`),
      managerReviewDue: day(`${year + 1}-03-31`),
      status: "ACTIVE",
    },
  });
  const reviewables = await prisma.employee.findMany({
    where: { managerId: { not: null } },
    select: { id: true, managerId: true },
  });
  await prisma.performanceReview.createMany({
    data: reviewables.map((e) => ({
      cycleId: cycle.id,
      employeeId: e.id,
      reviewerId: e.managerId,
    })),
  });
  await prisma.goal.createMany({
    data: [
      {
        employeeId: ananya,
        cycleId: cycle.id,
        title: "Ship leave-approval API v2",
        kpi: "Features delivered",
        targetValue: 4,
        currentValue: 1,
        unit: "features",
        weight: 40,
        progress: 25,
        status: "IN_PROGRESS",
      },
      {
        employeeId: ananya,
        cycleId: cycle.id,
        title: "Reduce p95 dashboard latency",
        kpi: "p95 latency",
        targetValue: 300,
        currentValue: 520,
        unit: "ms",
        weight: 30,
        progress: 10,
        status: "IN_PROGRESS",
      },
      {
        employeeId: ananya,
        type: "DEVELOPMENT",
        title: "Complete AWS Solutions Architect certification",
        weight: 0,
        progress: 0,
        status: "NOT_STARTED",
        dueDate: day(`${year + 1}-02-28`),
      },
    ],
  });

  // ── Training ──
  const t1 = await prisma.training.create({
    data: {
      title: "Secure Coding Fundamentals",
      category: "Technical",
      trainer: "Internal – Security Guild",
      mode: "VIRTUAL",
      startDate: day(addDays(today, 10)),
      endDate: day(addDays(today, 11)),
      capacity: 30,
      providesCertification: true,
      skill: "Secure coding",
      description: "OWASP Top 10, threat modelling and secure code review.",
    },
  });
  const t2 = await prisma.training.create({
    data: {
      title: "POSH Awareness",
      category: "Compliance",
      trainer: "External – Example Compliance LLP",
      mode: "CLASSROOM",
      location: "Bengaluru – Training Room 2",
      startDate: day(addDays(today, -15)),
      endDate: day(addDays(today, -15)),
      status: "COMPLETED",
      description: "Prevention of Sexual Harassment at the workplace (mandatory).",
    },
  });
  await prisma.trainingEnrollment.createMany({
    data: [ananya, rahul].map((employeeId) => ({ trainingId: t1.id, employeeId })),
  });
  await prisma.trainingEnrollment.createMany({
    data: Object.values(empIdByEmail)
      .slice(0, 12)
      .map((employeeId, i) => ({
        trainingId: t2.id,
        employeeId,
        status: i % 5 === 0 ? ("NO_SHOW" as const) : ("COMPLETED" as const),
        attendancePercent: i % 5 === 0 ? 0 : 100,
        feedbackRating: i % 5 === 0 ? null : int(3, 5),
        completedAt: i % 5 === 0 ? null : new Date(),
      })),
  });

  // ── Self-service ──
  await prisma.supportTicket.create({
    data: {
      requesterId: ananya,
      category: "Payroll",
      subject: "Form 16 for last financial year",
      description: "Could you please share my Form 16 for FY 2025-26?",
      priority: "MEDIUM",
    },
  });

  // ── Notifications ──
  const rahulUser = await prisma.user.findUniqueOrThrow({ where: { email: "manager@acme.test" } });
  await prisma.notification.create({
    data: {
      userId: rahulUser.id,
      type: "leave.submitted",
      title: "Leave request awaiting approval",
      body: "Ananya Gupta applied for Casual Leave.",
      link: "/approvals",
    },
  });

  // ── Payroll: last two months, processed and approved through the real service layer ──
  const { processRun, createRun, approveRun } =
    await import("../src/server/services/payroll.service");
  const { buildSessionUser, sessionUserInclude } = await import("../src/lib/auth/session-user");
  const asActor = async (email: string) => ({
    ...buildSessionUser(
      await prisma.user.findUniqueOrThrow({ where: { email }, include: sessionUserInclude }),
    ),
    ipAddress: "seed",
    userAgent: "seed",
  });
  const hr = await asActor("hradmin@acme.test");
  const ceo = await asActor("admin@acme.test");
  for (const back of [2, 1]) {
    const d = new Date(
      Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1),
    );
    const run = await createRun(hr, d.getUTCFullYear(), d.getUTCMonth() + 1);
    await processRun(hr, run.id);
    await approveRun(ceo, run.id);
    if (back === 2)
      await prisma.payrollRun.update({
        where: { id: run.id },
        data: { status: "PAID", paidAt: new Date() },
      });
  }

  console.log(
    `Seeded ${all.length} employees. Demo accounts (password: ${process.env.SEED_PASSWORD ? "$SEED_PASSWORD" : PASSWORD}):`,
  );
  for (const c of core.slice(0, 6)) console.log(`  ${c.email.padEnd(24)} ${c.title}`);
}

function extraEmail(
  extra: { email: string; dept: string }[],
  dept: string,
  idx: number,
  map: Record<string, string>,
) {
  return map[extra.filter((e) => e.dept === dept)[idx].email];
}

function countWorkingDays(start: string, end: string, holidays: Set<string>) {
  let n = 0;
  for (let k = start; k <= end; k = addDays(k, 1)) {
    const wd = day(k).getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays.has(k)) n++;
  }
  return n;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
