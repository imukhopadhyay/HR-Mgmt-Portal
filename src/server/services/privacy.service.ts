import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertEmployee, assertPermission } from "@/lib/auth/rbac";
import { deleteObject } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { getRetentionPolicy } from "./settings.service";

/** Personal data export (right of access) for the signed-in employee. */
export async function exportMyData(actor: Actor) {
  const employeeId = assertEmployee(actor);
  const [
    employee,
    attendance,
    leave,
    payslips,
    documents,
    goals,
    reviews,
    training,
    tickets,
    skills,
  ] = await Promise.all([
    db.employee.findUnique({
      where: { id: employeeId },
      include: {
        emergencyContacts: true,
        financialInfo: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
        history: true,
        checklistItems: true,
      },
    }),
    db.attendance.findMany({ where: { employeeId }, orderBy: { date: "desc" }, take: 1000 }),
    db.leaveRequest.findMany({
      where: { employeeId },
      include: { leaveType: { select: { name: true } }, approvals: true },
    }),
    db.payrollRecord.findMany({
      where: { employeeId, payrollRun: { status: { in: ["APPROVED", "PAID"] } } },
      include: { payrollRun: { select: { year: true, month: true } } },
    }),
    db.document.findMany({
      where: { employeeId, deletedAt: null },
      select: { id: true, name: true, category: true, createdAt: true, verificationStatus: true },
    }),
    db.goal.findMany({ where: { employeeId, deletedAt: null } }),
    db.performanceReview.findMany({
      where: { employeeId },
      include: { cycle: { select: { name: true } } },
    }),
    db.trainingEnrollment.findMany({
      where: { employeeId },
      include: { training: { select: { title: true } } },
    }),
    db.supportTicket.findMany({ where: { requesterId: employeeId } }),
    db.employeeSkill.findMany({ where: { employeeId } }),
  ]);
  await db.$transaction((tx) =>
    writeAudit(tx, actor, {
      action: "privacy.data_export",
      entityType: "Employee",
      entityId: employeeId,
    }),
  );
  return {
    generatedAt: new Date().toISOString(),
    employee,
    attendance,
    leave,
    payslips,
    documents,
    goals,
    reviews,
    training,
    tickets,
    skills,
  };
}

export interface RetentionResult {
  dryRun: boolean;
  employeesToAnonymize: string[];
  candidatesToPurge: number;
  notificationsToDelete: number;
  sessionsToDelete: number;
  tokensToDelete: number;
  rateBucketsToDelete: number;
}

/**
 * Apply the retention policy. Dry-run reports what would change. Audit logs
 * are never deleted (append-only). Anonymisation keeps payroll/attendance
 * records for statutory retention but removes personal identifiers.
 */
export async function runRetention(actor: Actor | null, dryRun: boolean): Promise<RetentionResult> {
  if (actor) assertPermission(actor, "settings:manage");
  const policy = await getRetentionPolicy();
  const now = Date.now();
  const exitCutoff = new Date(now - policy.exitedEmployeeYears * 365.25 * 86400_000);
  const candCutoff = new Date(now - policy.rejectedCandidateMonths * 30.44 * 86400_000);
  const notifCutoff = new Date(now - policy.notificationDays * 86400_000);
  const tokenCutoff = new Date(now - policy.securityTokenDays * 86400_000);

  const employees = await db.employee.findMany({
    where: { status: "EXITED", anonymizedAt: null, exitDate: { lt: exitCutoff } },
    select: { id: true, employeeCode: true, userId: true },
  });
  const candWhere = {
    stage: { in: ["REJECTED" as const, "WITHDRAWN" as const] },
    updatedAt: { lt: candCutoff },
  };
  const [
    candidatesToPurge,
    notificationsToDelete,
    sessionsToDelete,
    tokensToDelete,
    rateBucketsToDelete,
  ] = await Promise.all([
    db.candidate.count({ where: candWhere }),
    db.notification.count({ where: { readAt: { not: null }, createdAt: { lt: notifCutoff } } }),
    db.session.count({ where: { expiresAt: { lt: new Date() } } }),
    db.passwordResetToken.count({ where: { createdAt: { lt: tokenCutoff } } }),
    db.rateLimitBucket.count({ where: { windowStart: { lt: tokenCutoff } } }),
  ]);
  const result: RetentionResult = {
    dryRun,
    employeesToAnonymize: employees.map((e) => e.employeeCode),
    candidatesToPurge,
    notificationsToDelete,
    sessionsToDelete,
    tokensToDelete,
    rateBucketsToDelete,
  };
  if (dryRun) return result;

  const orphanKeys: string[] = [];
  for (const e of employees) {
    await db.$transaction(async (tx) => {
      const docs = await tx.document.findMany({
        where: { employeeId: e.id },
        select: { storageKey: true },
      });
      orphanKeys.push(...docs.map((d) => d.storageKey));
      const emp = await tx.employee.findUniqueOrThrow({
        where: { id: e.id },
        select: { photoKey: true },
      });
      if (emp.photoKey) orphanKeys.push(emp.photoKey);
      await tx.document.deleteMany({ where: { employeeId: e.id } });
      await tx.emergencyContact.deleteMany({ where: { employeeId: e.id } });
      await tx.employeeFinancialInfo.deleteMany({ where: { employeeId: e.id } });
      await tx.profileUpdateRequest.deleteMany({ where: { employeeId: e.id } });
      await tx.employee.update({
        where: { id: e.id },
        data: {
          firstName: "Former",
          middleName: null,
          lastName: `Employee ${e.employeeCode}`,
          workEmail: `anon-${e.employeeCode.toLowerCase()}@redacted.invalid`,
          personalEmail: null,
          phone: null,
          dateOfBirth: null,
          addressLine1: null,
          addressLine2: null,
          city: null,
          state: null,
          postalCode: null,
          photoKey: null,
          bio: null,
          exitReason: null,
          anonymizedAt: new Date(),
        },
      });
      if (e.userId) {
        await tx.session.deleteMany({ where: { userId: e.userId } });
        await tx.user.update({
          where: { id: e.userId },
          data: {
            email: `anon-${e.employeeCode.toLowerCase()}@redacted.invalid`,
            isActive: false,
            passwordHash: "!disabled",
          },
        });
      }
      await writeAudit(tx, actor, {
        action: "privacy.anonymize",
        entityType: "Employee",
        entityId: e.id,
        summary: `Anonymised ${e.employeeCode} per retention policy`,
      });
    });
  }
  const purgeCandidates = await db.candidate.findMany({
    where: candWhere,
    select: { id: true, documents: { select: { storageKey: true } } },
  });
  for (const c of purgeCandidates) orphanKeys.push(...c.documents.map((d) => d.storageKey));
  await db.$transaction(async (tx) => {
    await tx.candidate.deleteMany({ where: { id: { in: purgeCandidates.map((c) => c.id) } } });
    await tx.notification.deleteMany({
      where: { readAt: { not: null }, createdAt: { lt: notifCutoff } },
    });
    await tx.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await tx.passwordResetToken.deleteMany({ where: { createdAt: { lt: tokenCutoff } } });
    await tx.rateLimitBucket.deleteMany({ where: { windowStart: { lt: tokenCutoff } } });
    await writeAudit(tx, actor, {
      action: "privacy.retention_run",
      entityType: "Setting",
      entityId: "privacy.retention",
      after: result,
    });
  });
  for (const k of orphanKeys)
    await deleteObject(k).catch((err) => logger.warn("retention.delete_object_failed", { err }));
  return result;
}
