import Link from "next/link";
import { Briefcase, CalendarPlus } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { formatDateTime } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { listRequisitions, myInterviews, recruitmentAnalytics } from "@/server/services/recruitment.service";
import { employeeFormOptions } from "@/server/services/organisation.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { RequisitionDialog } from "@/components/recruitment/requisition-dialog";
import { FeedbackDialog } from "@/components/recruitment/candidate-dialogs";

export const metadata = { title: "Recruitment" };

const STATUSES = ["DRAFT", "PENDING_APPROVAL", "OPEN", "ON_HOLD", "CLOSED", "CANCELLED"] as const;

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const actor = await requirePagePermission("recruitment:read", "recruitment:request", "interview:feedback");
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const canRequest = actor.permissions.has("recruitment:request") || actor.permissions.has("recruitment:manage");
  const [reqs, interviews, analytics, options] = await Promise.all([
    listRequisitions(actor, { status, q: sp.q }),
    myInterviews(actor),
    actor.permissions.has("recruitment:read") ? recruitmentAnalytics() : null,
    canRequest ? employeeFormOptions() : null,
  ]);
  const upcoming = interviews.filter((i) => i.status === "SCHEDULED");
  return (
    <>
      <PageHeader title="Recruitment" description="Requisitions, applicant pipeline and interviews." actions={canRequest && options && <RequisitionDialog options={options} />} />
      {analytics && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Open requisitions" value={analytics.openRequisitions} />
            <StatCard label="Awaiting approval" value={analytics.pendingApproval} />
            <StatCard label="Avg. days to offer" value={analytics.avgDaysToOffer ?? "—"} />
            <StatCard label="Offer acceptance" value={analytics.offerAcceptance !== null ? `${analytics.offerAcceptance}%` : "—"} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Pipeline by stage</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBarChart layout="vertical" valueLabel="Candidates" height={200} data={analytics.byStage.map((s) => ({ name: humanize(s.name), value: s.value }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Candidates by source</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBarChart layout="vertical" valueLabel="Candidates" height={200} data={analytics.bySource} color="var(--chart-3)" />
            </CardContent>
          </Card>
        </div>
      )}
      {interviews.length > 0 && (
        <Card className="py-0">
          <CardHeader className="pt-5">
            <CardTitle>My interviews {upcoming.length > 0 && `(${upcoming.length} upcoming)`}</CardTitle>
          </CardHeader>
          <Table>
            <TableBody>
              {interviews.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <span className="font-medium">
                      {i.candidate.firstName} {i.candidate.lastName}
                    </span>
                    <div className="text-muted-foreground text-xs">
                      {i.round} · {i.candidate.recruitment.title}
                    </div>
                  </TableCell>
                  <TableCell>{formatDateTime(i.scheduledAt)}</TableCell>
                  <TableCell>
                    <StatusBadge status={i.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <a href={`/api/calendar/interviews/${i.id}`} aria-label="Add to calendar">
                          <CalendarPlus />
                        </a>
                      </Button>
                      <FeedbackDialog interviewId={i.id} label={`${i.candidate.firstName} ${i.candidate.lastName} — ${i.round}`} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <FilterBar searchPlaceholder="Search requisitions" filters={[{ name: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: humanize(s) })) }]} />
      <Card className="py-0">
        {reqs.length === 0 ? (
          <EmptyState icon={Briefcase} title="No requisitions" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requisition</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden md:table-cell">Hiring manager</TableHead>
                <TableHead className="text-right">Openings</TableHead>
                <TableHead className="text-right">Candidates</TableHead>
                <TableHead className="hidden text-right lg:table-cell">In interview / offer</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reqs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/recruitment/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-muted-foreground text-xs">{r.code}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{r.department?.name ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{r.hiringManager ? `${r.hiringManager.firstName} ${r.hiringManager.lastName}` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.openings}</TableCell>
                  <TableCell className="text-right tabular-nums">{r._count.candidates}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">
                    {r.candidates.filter((c) => c.stage === "INTERVIEW").length} / {r.candidates.filter((c) => c.stage === "OFFER").length}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
