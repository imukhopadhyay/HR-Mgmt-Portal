import Link from "next/link";
import { pageError, requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { dbDateToKey, formatDateKey } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { trainingDetail } from "@/server/services/training.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { CompletionDialog, EnrollDialog, TrainingDialog } from "@/components/training/training-dialogs";

export const metadata = { title: "Training programme" };

export default async function TrainingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  const { id } = await params;
  const t = await trainingDetail(id).catch(pageError);
  const canManage = actor.permissions.has("training:manage");
  const employees = canManage
    ? await db.employee.findMany({ where: { deletedAt: null, status: { not: "EXITED" }, trainingEnrollments: { none: { trainingId: id, status: { not: "CANCELLED" } } } }, select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } }, orderBy: { firstName: "asc" } })
    : [];
  const visible = canManage ? t.enrollments : t.enrollments.filter((e) => e.employeeId === actor.employeeId);
  return (
    <>
      <PageHeader
        title={t.title}
        description={`${t.category} · ${humanize(t.mode)} · ${formatDateKey(dbDateToKey(t.startDate))} – ${formatDateKey(dbDateToKey(t.endDate))}${t.trainer ? ` · ${t.trainer}` : ""}`}
        actions={
          <>
            <StatusBadge status={t.status} />
            {canManage && (
              <TrainingDialog
                initial={{ id: t.id, title: t.title, description: t.description ?? "", category: t.category, trainer: t.trainer ?? "", mode: t.mode, location: t.location ?? "", startDate: dbDateToKey(t.startDate), endDate: dbDateToKey(t.endDate), capacity: t.capacity ?? "", providesCertification: t.providesCertification, skill: t.skill ?? "", status: t.status }}
              />
            )}
            {canManage && !["COMPLETED", "CANCELLED"].includes(t.status) && <EnrollDialog trainingId={t.id} employees={employees.map((e) => ({ id: e.id, label: `${e.firstName} ${e.lastName}`, dept: e.department?.name ?? "—" }))} />}
          </>
        }
      />
      {t.description && (
        <Card>
          <CardContent className="text-sm whitespace-pre-line">{t.description}</CardContent>
        </Card>
      )}
      <Card className="py-0">
        <CardHeader className="pt-5">
          <CardTitle>Participants ({t.enrollments.filter((e) => e.status !== "CANCELLED").length}{t.capacity ? ` / ${t.capacity}` : ""})</CardTitle>
        </CardHeader>
        {visible.length === 0 ? (
          <EmptyState title="No participants" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/employees/${e.employee.id}`} className="font-medium hover:underline">
                      {e.employee.firstName} {e.employee.lastName}
                    </Link>
                    <div className="text-muted-foreground text-xs">{e.employee.department?.name}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{e.attendancePercent !== null ? `${e.attendancePercent}%` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.score ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.feedbackRating ? `${e.feedbackRating}/5` : "—"}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <CompletionDialog name={`${e.employee.firstName} ${e.employee.lastName}`} initial={{ enrollmentId: e.id, status: e.status, attendancePercent: e.attendancePercent ?? "", score: e.score ?? "" }} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
