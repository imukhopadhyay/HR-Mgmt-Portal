import Link from "next/link";
import { Target, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { dbDateToKey, formatDateKey } from "@/lib/dates";
import { toNumber } from "@/lib/utils";
import { goalsFor, myReviews, reviewsToGive } from "@/server/services/performance.service";
import { deleteGoalAction } from "@/server/actions/performance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { GoalDialog } from "@/components/performance/goal-dialog";

export const metadata = { title: "Goals & reviews" };

export default async function PerformancePage() {
  const actor = await requireUser();
  if (!actor.employeeId) return <EmptyState title="No employee profile" />;
  const [goals, reviews, toGive, cycles] = await Promise.all([
    goalsFor(actor, actor.employeeId),
    myReviews(actor.employeeId),
    reviewsToGive(actor),
    db.performanceCycle.findMany({
      where: { status: { in: ["ACTIVE", "DRAFT"] } },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    }),
  ]);
  const perf = goals.filter((g) => g.type === "PERFORMANCE");
  const dev = goals.filter((g) => g.type === "DEVELOPMENT");
  const goalRows = (list: typeof goals) =>
    list.length === 0 ? (
      <EmptyState icon={Target} title="Nothing here yet" />
    ) : (
      <ul className="grid gap-3">
        {list.map((g) => (
          <li key={g.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{g.title}</p>
                <p className="text-muted-foreground text-xs">
                  {[
                    g.cycle?.name,
                    g.kpi && `KPI: ${g.kpi}`,
                    g.targetValue !== null &&
                      `${toNumber(g.currentValue)} / ${toNumber(g.targetValue)} ${g.unit ?? ""}`,
                    g.weight ? `weight ${g.weight}%` : null,
                    g.dueDate && `due ${formatDateKey(dbDateToKey(g.dueDate))}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <StatusBadge status={g.status} />
                <GoalDialog
                  employeeId={g.employeeId}
                  cycles={cycles}
                  initial={{
                    id: g.id,
                    employeeId: g.employeeId,
                    cycleId: g.cycleId ?? "",
                    type: g.type,
                    title: g.title,
                    description: g.description ?? "",
                    kpi: g.kpi ?? "",
                    targetValue: g.targetValue !== null ? toNumber(g.targetValue) : "",
                    currentValue: g.currentValue !== null ? toNumber(g.currentValue) : "",
                    unit: g.unit ?? "",
                    weight: g.weight,
                    progress: g.progress,
                    status: g.status,
                    dueDate: g.dueDate ? dbDateToKey(g.dueDate) : "",
                  }}
                />
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="icon" aria-label={`Remove ${g.title}`}>
                      <Trash2 />
                    </Button>
                  }
                  title="Remove goal?"
                  destructive
                  confirmLabel="Remove"
                  action={deleteGoalAction.bind(null, g.id)}
                />
              </div>
            </div>
            <Progress
              value={g.progress}
              className="mt-2"
              aria-label={`${g.title} progress ${g.progress}%`}
            />
          </li>
        ))}
      </ul>
    );
  return (
    <>
      <PageHeader
        title="Goals & reviews"
        description="Track objectives, development plans and performance reviews."
      />
      {toGive.length > 0 && (
        <Card className="py-0">
          <CardHeader className="pt-5">
            <CardTitle>Reviews for my team</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {toGive.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.employee.firstName} {r.employee.lastName}
                    <div className="text-muted-foreground text-xs">
                      {r.employee.designation?.title}
                    </div>
                  </TableCell>
                  <TableCell>{r.cycle.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={r.status === "MANAGER_REVIEW" ? "default" : "outline"}
                      asChild
                    >
                      <Link href={`/performance/reviews/${r.id}`}>
                        {r.status === "MANAGER_REVIEW" ? "Review now" : "Open"}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My goals</CardTitle>
            <GoalDialog employeeId={actor.employeeId} cycles={cycles} />
          </CardHeader>
          <CardContent>{goalRows(perf)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Development plan</CardTitle>
            <GoalDialog employeeId={actor.employeeId} cycles={cycles} type="DEVELOPMENT" />
          </CardHeader>
          <CardContent>{goalRows(dev)}</CardContent>
        </Card>
      </div>
      <Card className="py-0">
        <CardHeader className="pt-5">
          <CardTitle>My reviews</CardTitle>
        </CardHeader>
        {reviews.length === 0 ? (
          <EmptyState title="No reviews yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cycle</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Final rating</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.cycle.name}</TableCell>
                  <TableCell>
                    {r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : "HR"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>{r.finalRating ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={
                        r.status === "SELF_REVIEW" && r.cycle.status === "ACTIVE"
                          ? "default"
                          : "outline"
                      }
                      asChild
                    >
                      <Link href={`/performance/reviews/${r.id}`}>
                        {r.status === "SELF_REVIEW" && r.cycle.status === "ACTIVE"
                          ? "Start self-assessment"
                          : "View"}
                      </Link>
                    </Button>
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
