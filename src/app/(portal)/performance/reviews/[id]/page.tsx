import { pageError, requireUser } from "@/lib/auth/guard";
import { dbDateToKey, formatDateKey } from "@/lib/dates";
import { reviewDetail } from "@/server/services/performance.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ManagerReviewForm, SelfReviewForm } from "@/components/performance/review-forms";

export const metadata = { title: "Performance review" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  const { id } = await params;
  const { review: r, goals, isSelf, isReviewer } = await reviewDetail(actor, id).catch(pageError);
  const canManagerReview =
    (isReviewer || actor.permissions.has("performance:manage")) &&
    !isSelf &&
    r.status === "MANAGER_REVIEW" &&
    r.cycle.status === "ACTIVE";
  const showManagerSection = r.status === "COMPLETED" || !isSelf;
  return (
    <>
      <PageHeader
        title={`${r.cycle.name} — ${r.employee.firstName} ${r.employee.lastName}`}
        description={`Self review due ${formatDateKey(dbDateToKey(r.cycle.selfReviewDue))} · manager review due ${formatDateKey(dbDateToKey(r.cycle.managerReviewDue))}`}
        actions={<StatusBadge status={r.status} />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Goals in this period</CardTitle>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <p className="text-muted-foreground text-sm">No goals recorded.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {goals.map((g) => (
                <li key={g.id} className="rounded-md border p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{g.title}</span>
                    <StatusBadge status={g.status} />
                  </div>
                  <Progress
                    value={g.progress}
                    className="mt-2"
                    aria-label={`${g.title} ${g.progress}%`}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Self-assessment</CardTitle>
            <CardDescription>
              {r.selfSubmittedAt
                ? `Submitted ${formatDateKey(r.selfSubmittedAt)}`
                : "Not submitted"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSelf && r.status === "SELF_REVIEW" && r.cycle.status === "ACTIVE" ? (
              <SelfReviewForm id={r.id} />
            ) : r.selfSubmittedAt ? (
              <div className="grid gap-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Rating:</span> {r.selfRating}/5
                </p>
                <p className="whitespace-pre-line">{r.selfComments}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Waiting for the employee.</p>
            )}
          </CardContent>
        </Card>
        {showManagerSection && (
          <Card>
            <CardHeader>
              <CardTitle>Manager review</CardTitle>
              <CardDescription>
                {r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : "HR"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canManagerReview ? (
                <ManagerReviewForm id={r.id} />
              ) : r.status === "COMPLETED" ? (
                <div className="grid gap-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Manager rating:</span> {r.managerRating}
                    /5 · <span className="text-muted-foreground">Final:</span>{" "}
                    <strong>{r.finalRating}/5</strong>
                  </p>
                  <p className="whitespace-pre-line">{r.managerComments}</p>
                  {r.strengths && (
                    <p>
                      <span className="font-medium">Strengths:</span> {r.strengths}
                    </p>
                  )}
                  {r.improvements && (
                    <p>
                      <span className="font-medium">To improve:</span> {r.improvements}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {r.status === "SELF_REVIEW"
                    ? "Available after the self-assessment is submitted."
                    : "Pending."}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
