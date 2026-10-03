import Link from "next/link";
import { Award, GraduationCap, X } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { dbDateToKey, formatDateKey, todayKey } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { listTrainings, myLearning, trainingReport } from "@/server/services/training.service";
import { cancelEnrollmentAction, deleteSkillAction, selfEnrollAction } from "@/server/actions/training";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { SkillForm, TrainingDialog, TrainingFeedbackDialog } from "@/components/training/training-dialogs";

export const metadata = { title: "Learning" };

export default async function TrainingPage() {
  const actor = await requireUser();
  const canManage = actor.permissions.has("training:manage");
  const [trainings, mine, report] = await Promise.all([listTrainings(), actor.employeeId ? myLearning(actor.employeeId) : null, canManage ? trainingReport() : null]);
  const today = todayKey();
  const catalog = trainings.filter((t) => t.status !== "CANCELLED" && dbDateToKey(t.endDate) >= today);
  return (
    <>
      <PageHeader title="Learning & development" description="Training calendar, enrolments, certifications and skills." actions={canManage && <TrainingDialog />} />
      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Training calendar</TabsTrigger>
          {mine && <TabsTrigger value="mine">My learning</TabsTrigger>}
          {report && <TabsTrigger value="report">Effectiveness</TabsTrigger>}
        </TabsList>
        <TabsContent value="catalog">
          {catalog.length === 0 ? (
            <Card>
              <EmptyState icon={GraduationCap} title="No upcoming programmes" />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {catalog.map((t) => {
                const active = t.enrollments.filter((e) => e.status !== "CANCELLED");
                const enrolled = !!actor.employeeId && active.some((e) => e.employeeId === actor.employeeId);
                const full = !!t.capacity && active.length >= t.capacity;
                return (
                  <Card key={t.id} className="gap-3">
                    <CardHeader>
                      <CardTitle className="flex items-start justify-between gap-2">
                        <Link href={`/training/${t.id}`} className="hover:underline">
                          {t.title}
                        </Link>
                        <StatusBadge status={t.status} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2 text-sm">
                      <p className="text-muted-foreground line-clamp-2">{t.description}</p>
                      <p>
                        {formatDateKey(dbDateToKey(t.startDate))}
                        {t.endDate.getTime() !== t.startDate.getTime() && ` – ${formatDateKey(dbDateToKey(t.endDate))}`} · {humanize(t.mode)}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{t.category}</Badge>
                        {t.providesCertification && (
                          <Badge variant="info">
                            <Award /> Certificate
                          </Badge>
                        )}
                        {t.capacity && <Badge variant="secondary">{Math.max(0, t.capacity - active.length)} seats left</Badge>}
                      </div>
                      {actor.employeeId &&
                        t.status === "PLANNED" &&
                        (enrolled ? (
                          <Badge variant="success" className="mt-1">
                            Enrolled
                          </Badge>
                        ) : (
                          <ConfirmAction trigger={<Button size="sm" className="mt-1 justify-self-start" disabled={full}>{full ? "Full" : "Enrol"}</Button>} title={`Enrol in ${t.title}?`} confirmLabel="Enrol" action={selfEnrollAction.bind(null, t.id)} />
                        ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        {mine && (
          <TabsContent value="mine" className="grid gap-6">
            <Card className="py-0">
              <CardHeader className="pt-5">
                <CardTitle>My programmes</CardTitle>
              </CardHeader>
              {mine.enrollments.length === 0 ? (
                <EmptyState title="Not enrolled in any programme" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Programme</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Certificate</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mine.enrollments.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.training.title}</TableCell>
                        <TableCell>{formatDateKey(dbDateToKey(e.training.startDate))}</TableCell>
                        <TableCell>
                          <StatusBadge status={e.status} />
                        </TableCell>
                        <TableCell>{e.certificateIssuedAt ? formatDateKey(e.certificateIssuedAt) : "—"}</TableCell>
                        <TableCell className="text-right">
                          {["ATTENDED", "COMPLETED"].includes(e.status) && !e.feedbackRating && <TrainingFeedbackDialog enrollmentId={e.id} title={e.training.title} />}
                          {e.feedbackRating && <span className="text-muted-foreground text-xs">Rated {e.feedbackRating}/5</span>}
                          {e.status === "ENROLLED" && (
                            <ConfirmAction trigger={<Button variant="ghost" size="icon" aria-label="Cancel enrolment"><X /></Button>} title="Cancel enrolment?" confirmLabel="Cancel enrolment" action={cancelEnrollmentAction.bind(null, e.id)} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Skills & certifications</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ul className="flex flex-wrap gap-2">
                  {mine.skills.length === 0 && <li className="text-muted-foreground text-sm">No skills recorded yet.</li>}
                  {mine.skills.map((s) => (
                    <li key={s.id} className="flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm">
                      {s.name} · L{s.level}
                      {s.certifiedAt && <Award className="text-primary size-3.5" aria-label="Certified" />}
                      {!(s.source?.startsWith("TRAINING:") && s.certifiedAt) && (
                        <ConfirmAction trigger={<Button variant="ghost" size="icon" className="size-6" aria-label={`Remove ${s.name}`}><X /></Button>} title={`Remove ${s.name}?`} confirmLabel="Remove" action={deleteSkillAction.bind(null, s.id)} />
                      )}
                    </li>
                  ))}
                </ul>
                <SkillForm />
              </CardContent>
            </Card>
          </TabsContent>
        )}
        {report && (
          <TabsContent value="report">
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Programme</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead className="text-right">Enrolled</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">No-show</TableHead>
                    <TableHead className="text-right">Completion</TableHead>
                    <TableHead className="text-right">Avg rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/training/${r.id}`} className="font-medium hover:underline">
                          {r.title}
                        </Link>
                        <div className="text-muted-foreground text-xs">{r.category}</div>
                      </TableCell>
                      <TableCell>{formatDateKey(dbDateToKey(r.startDate))}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.enrolled}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.completed}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.noShow}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.completionRate !== null ? `${r.completionRate}%` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.avgRating ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
