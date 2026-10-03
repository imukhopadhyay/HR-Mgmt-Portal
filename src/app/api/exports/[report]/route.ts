import { NextResponse } from "next/server";
import type { LeaveStatus } from "@prisma/client";
import { withApi } from "@/lib/api";
import type { Actor } from "@/lib/action";
import { assertPermission } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { dbDateToKey, todayKey } from "@/lib/dates";
import { exportResponse, type Row } from "@/lib/export";
import { toNumber } from "@/lib/utils";
import { employeeListSchema } from "@/lib/validation/employee";
import { exportEmployees } from "@/server/services/employee.service";
import { monthlyReport } from "@/server/services/attendance.service";
import { leaveReport } from "@/server/services/leave.service";
import { extraReports } from "@/server/services/reports.service";

export const dynamic = "force-dynamic";

type Builder = (actor: Actor, q: URLSearchParams) => Promise<{ rows: Row[]; title: string }>;

const REPORTS: Record<string, Builder> = {
  employees: async (actor, q) => {
    const f = employeeListSchema.parse(Object.fromEntries(q));
    return { rows: await exportEmployees(actor, f), title: "Employees" };
  },
  "attendance-monthly": async (actor, q) => {
    const m = /^(\d{4})-(\d{2})$/.exec(q.get("month") ?? "") ?? [
      null,
      todayKey().slice(0, 4),
      todayKey().slice(5, 7),
    ];
    const rows = await monthlyReport(
      actor,
      Number(m[1]),
      Number(m[2]),
      q.get("departmentId") || undefined,
    );
    return {
      title: `Attendance ${m[1]}-${m[2]}`,
      rows: rows.map((r) => ({
        "Employee ID": r.employeeCode,
        Name: r.name,
        Department: r.department,
        "Working days": r.workingDays,
        Present: r.present,
        "Half day": r.halfDay,
        Absent: r.absent,
        "On leave": r.onLeave,
        "Not marked": r.unmarked,
        "Late days": r.lateDays,
        "Hours worked": r.workHours,
        "Overtime hours": r.overtimeHours,
      })),
    };
  },
  leave: async (actor, q) => {
    const year = Number(q.get("year")) || Number(todayKey().slice(0, 4));
    const rows = await leaveReport(actor, {
      year,
      departmentId: q.get("departmentId") || undefined,
      status: (q.get("status") || undefined) as LeaveStatus | undefined,
      leaveTypeId: q.get("leaveTypeId") || undefined,
    });
    return {
      title: `Leave ${year}`,
      rows: rows.map((r) => ({
        "Employee ID": r.employee.employeeCode,
        Name: `${r.employee.firstName} ${r.employee.lastName}`,
        Department: r.employee.department?.name ?? "",
        "Leave type": r.leaveType.name,
        From: dbDateToKey(r.startDate),
        To: dbDateToKey(r.endDate),
        Days: toNumber(r.days),
        Status: r.status,
        "Applied on": r.createdAt.toISOString().slice(0, 10),
      })),
    };
  },
  ...extraReports,
};

export const GET = withApi<{ params: Promise<{ report: string }> }>(
  async (req, actor, { params }) => {
    const { report } = await params;
    const builder = REPORTS[report];
    if (!builder) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
    assertPermission(actor, "report:export");
    const q = new URL(req.url).searchParams;
    const format = ["csv", "xlsx", "pdf"].includes(q.get("format") ?? "")
      ? q.get("format")!
      : "csv";
    const { rows, title } = await builder(actor, q);
    await db.$transaction((tx) =>
      writeAudit(tx, actor, {
        action: "report.export",
        entityType: "Report",
        entityId: report,
        summary: `${title} (${format}, ${rows.length} rows)`,
      }),
    );
    return exportResponse(rows, format, report, title);
  },
);
