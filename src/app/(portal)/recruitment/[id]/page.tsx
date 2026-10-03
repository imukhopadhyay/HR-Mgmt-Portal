import Link from "next/link";
import { CalendarPlus, FileDown, X } from "lucide-react";
import { pageError, requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { dbDateToKey, formatDateKey, formatDateTime } from "@/lib/dates";
import { formatINR, humanize, toNumber } from "@/lib/utils";
import { requisitionDetail } from "@/server/services/recruitment.service";
import { employeeFormOptions } from "@/server/services/organisation.service";
import { cancelInterviewAction, setRequisitionStatusAction } from "@/server/actions/recruitment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { RequisitionDialog } from "@/components/recruitment/requisition-dialog";
import { CandidateDialog, FeedbackDialog, HireDialog, MoveStageDialog, OfferDialog, ScheduleInterviewDialog } from "@/components/recruitment/candidate-dialogs";
import { DocumentList } from "@/components/employees/document-list";

export const metadata = { title: "Requisition" };

const STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED", "WITHDRAWN"] as const;

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  const { id } = await params;
  const { requisition: r, fullAccess } = await requisitionDetail(actor, id).catch(pageError);
  const canManage = actor.permissions.has("recruitment:manage");
  const options = canManage || r.requestedById === actor.id ? await employeeFormOptions() : null;
  const interviewers = canManage ? (await db.employee.findMany({ where: { deletedAt: null, status: { not: "EXITED" } }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: "asc" } })).map((e) => ({ id: e.id, label: `${e.firstName} ${e.lastName}` })) : [];
  const candidates = fullAccess ? r.candidates : r.candidates.filter((c) => c.interviews.some((i) => i.interviewerId === actor.employeeId));
  const statusBtn = (status: "OPEN" | "ON_HOLD" | "CLOSED" | "CANCELLED" | "PENDING_APPROVAL", label: string, destructive = false) => (
    <ConfirmAction trigger={<Button variant={destructive ? "ghost" : "outline"} className={destructive ? "text-destructive" : undefined}>{label}</Button>} title={`${label}?`} destructive={destructive} confirmLabel={label} action={setRequisitionStatusAction.bind(null, r.id, status)} />
  );
  return (
    <>
      <PageHeader
        title={r.title}
        description={`${r.code} · ${r.department?.name ?? "No department"} · ${humanize(r.employmentType)} · ${r.openings} opening(s)`}
        actions={
          <>
            <StatusBadge status={r.status} />
            {options && ["DRAFT", "PENDING_APPROVAL"].includes(r.status) && (
              <RequisitionDialog
                options={options}
                initial={{
                  id: r.id,
                  title: r.title,
                  departmentId: r.departmentId ?? "",
                  designationId: r.designationId ?? "",
                  hiringManagerId: r.hiringManagerId ?? "",
                  openings: r.openings,
                  employmentType: r.employmentType,
                  location: r.location ?? "",
                  description: r.description,
                  minExperience: r.minExperience ?? "",
                  maxExperience: r.maxExperience ?? "",
                  budgetMin: r.budgetMin ? toNumber(r.budgetMin) : "",
                  budgetMax: r.budgetMax ? toNumber(r.budgetMax) : "",
                  targetDate: r.targetDate ? dbDateToKey(r.targetDate) : "",
                  submit: false,
                }}
              />
            )}
            {canManage && r.status === "DRAFT" && statusBtn("PENDING_APPROVAL", "Submit for approval")}
            {canManage && r.status === "PENDING_APPROVAL" && r.requestedById !== actor.id && statusBtn("OPEN", "Approve & open")}
            {canManage && r.status === "OPEN" && statusBtn("ON_HOLD", "Put on hold")}
            {canManage && r.status === "ON_HOLD" && statusBtn("OPEN", "Reopen")}
            {canManage && ["OPEN", "ON_HOLD"].includes(r.status) && statusBtn("CLOSED", "Close")}
            {canManage && !["CLOSED", "CANCELLED"].includes(r.status) && statusBtn("CANCELLED", "Cancel requisition", true)}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Job description</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-line">{r.description}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              {[
                ["Designation", r.designation?.title],
                ["Hiring manager", r.hiringManager ? `${r.hiringManager.firstName} ${r.hiringManager.lastName}` : null],
                ["Location", r.location],
                ["Experience", r.minExperience !== null || r.maxExperience !== null ? `${r.minExperience ?? 0}–${r.maxExperience ?? "any"} years` : null],
                ["Budget (CTC)", fullAccess && (r.budgetMin || r.budgetMax) ? `${formatINR(r.budgetMin)} – ${formatINR(r.budgetMax)}` : null],
                ["Target date", r.targetDate ? formatDateKey(dbDateToKey(r.targetDate)) : null],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Candidates ({candidates.length})</CardTitle>
          {canManage && ["OPEN", "ON_HOLD"].includes(r.status) && <CandidateDialog recruitmentId={r.id} />}
        </CardHeader>
        <CardContent>
          {fullAccess && (
            <ol className="mb-4 flex flex-wrap gap-2" aria-label="Pipeline summary">
              {STAGES.map((s) => (
                <li key={s}>
                  <Badge variant="outline">
                    {humanize(s)}: {r.candidates.filter((c) => c.stage === s).length}
                  </Badge>
                </li>
              ))}
            </ol>
          )}
          {candidates.length === 0 ? (
            <EmptyState title="No candidates yet" />
          ) : (
            <ul className="grid gap-4">
              {candidates.map((c) => (
                <li key={c.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {c.firstName} {c.lastName}
                        </span>
                        <StatusBadge status={c.stage} />
                        {c.hiredEmployeeId && (
                          <Link href={`/employees/${c.hiredEmployeeId}`} className="text-primary text-xs hover:underline">
                            View employee
                          </Link>
                        )}
                      </div>
                      {fullAccess && (
                        <p className="text-muted-foreground text-xs">
                          {c.email}
                          {c.phone && ` · ${c.phone}`} · {c.source ?? "Unknown source"}
                          {c.currentCompany && ` · ${c.currentCompany}`}
                          {c.experienceYears !== null && ` · ${toNumber(c.experienceYears)} yrs`}
                          {c.expectedCtc !== null && ` · expects ${formatINR(c.expectedCtc)}`}
                        </p>
                      )}
                      {c.offerLetter && fullAccess && (
                        <p className="mt-1 text-xs">
                          Offer: {formatINR(c.offeredCtc)} · joining {c.joiningDate ? formatDateKey(dbDateToKey(c.joiningDate)) : "—"}{" "}
                          <a className="text-primary inline-flex items-center gap-1 hover:underline" href={`/api/offers/${c.id}`}>
                            <FileDown className="size-3" /> Offer letter
                          </a>
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap items-center gap-1">
                        {!["HIRED", "WITHDRAWN"].includes(c.stage) && <MoveStageDialog candidateId={c.id} stage={c.stage} />}
                        {["APPLIED", "SCREENING", "INTERVIEW"].includes(c.stage) && <ScheduleInterviewDialog candidateId={c.id} interviewers={interviewers} />}
                        {["INTERVIEW", "OFFER"].includes(c.stage) && <OfferDialog candidateId={c.id} expected={c.expectedCtc ? toNumber(c.expectedCtc) : undefined} />}
                        {c.stage === "OFFER" && actor.permissions.has("employee:create") && <HireDialog candidateId={c.id} name={`${c.firstName} ${c.lastName}`} />}
                        {c.stage !== "HIRED" && (
                          <CandidateDialog
                            recruitmentId={r.id}
                            initial={{ id: c.id, recruitmentId: r.id, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone ?? "", source: c.source ?? "", currentCompany: c.currentCompany ?? "", experienceYears: c.experienceYears ? toNumber(c.experienceYears) : "", expectedCtc: c.expectedCtc ? toNumber(c.expectedCtc) : "", notes: c.notes ?? "" }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  {c.interviews.length > 0 && (
                    <ul className="mt-3 grid gap-2 border-t pt-3">
                      {c.interviews.map((i) => (
                        <li key={i.id} className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:justify-between">
                          <div>
                            <span className="font-medium">{i.round}</span> · {formatDateTime(i.scheduledAt)} · {humanize(i.mode)} with {i.interviewer.firstName} {i.interviewer.lastName} <StatusBadge status={i.status} />
                            {i.recommendation && (
                              <div className="text-muted-foreground text-xs">
                                {humanize(i.recommendation)} · {i.rating}/5 — {i.feedback}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {i.status === "SCHEDULED" && (i.interviewerId === actor.employeeId || canManage) && (
                              <Button variant="ghost" size="icon" asChild>
                                <a href={`/api/calendar/interviews/${i.id}`} aria-label="Add to calendar">
                                  <CalendarPlus />
                                </a>
                              </Button>
                            )}
                            {(i.interviewerId === actor.employeeId || canManage) && i.status !== "CANCELLED" && <FeedbackDialog interviewId={i.id} label={`${c.firstName} ${c.lastName} — ${i.round}`} />}
                            {canManage && i.status === "SCHEDULED" && (
                              <ConfirmAction
                                trigger={
                                  <Button variant="ghost" size="icon" aria-label="Cancel interview">
                                    <X />
                                  </Button>
                                }
                                title="Cancel interview?"
                                destructive
                                confirmLabel="Cancel interview"
                                action={cancelInterviewAction.bind(null, i.id)}
                              />
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {fullAccess && (
                    <details className="mt-3 border-t pt-3">
                      <summary className="cursor-pointer text-sm font-medium">Documents ({c.documents.length})</summary>
                      <div className="mt-2">
                        <DocumentList
                          ownerField="candidateId"
                          ownerId={c.id}
                          canUpload={canManage && c.stage !== "HIRED"}
                          canVerify={false}
                          docs={c.documents.map((d) => ({ id: d.id, name: d.name, category: d.category, sizeBytes: d.sizeBytes, verificationStatus: d.verificationStatus, isConfidential: false, createdAt: d.createdAt.toISOString(), canDelete: canManage }))}
                        />
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
