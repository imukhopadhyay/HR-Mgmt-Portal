import Link from "next/link";
import { Briefcase, Building2, CalendarDays, Mail, MapPin, Pencil, Phone, UserRound } from "lucide-react";
import type { Actor } from "@/lib/action";
import { db } from "@/lib/db";
import { dbDateToKey, formatDateKey } from "@/lib/dates";
import { fullName, humanize } from "@/lib/utils";
import { employeeHistory, getEmployeeProfile } from "@/server/services/employee.service";
import { listEmployeeDocuments } from "@/server/services/document.service";
import { employeeFormOptions } from "@/server/services/organisation.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { completeOffboardingAction, archiveEmployeeAction } from "@/server/actions/employees";
import { TransferDialog } from "./transfer-dialog";
import { OffboardDialog } from "./offboard-dialog";
import { EmergencyContacts } from "./emergency-contacts";
import { DocumentList } from "./document-list";
import { Checklist } from "./checklist";
import { FinancialForm } from "./financial-form";
import { PhotoUpload } from "./photo-upload";
import { ProfileUpdateRequestDialog } from "@/components/self-service/profile-update-dialog";

function Item({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="text-sm break-words">{value || "—"}</dd>
      </div>
    </div>
  );
}

export async function ProfileView({ actor, employeeId, tab }: { actor: Actor; employeeId: string; tab?: string }) {
  const { employee: e, access } = await getEmployeeProfile(actor, employeeId);
  const name = fullName(e);
  if (!access.full) {
    // Directory-level view.
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <EmployeeAvatar id={e.id} name={name} hasPhoto={!!e.photoKey} className="size-16 text-lg" />
          <div className="grid gap-1">
            <h1 className="text-xl font-semibold">{name}</h1>
            <p className="text-muted-foreground text-sm">
              {e.designation?.title ?? "—"} · {e.department?.name ?? "—"}
            </p>
            <dl className="mt-2 grid gap-3 sm:grid-cols-3">
              <Item icon={Mail} label="Work email" value={<a href={`mailto:${e.workEmail}`}>{e.workEmail}</a>} />
              <Item icon={MapPin} label="Location" value={e.workLocation} />
              <Item icon={UserRound} label="Manager" value={e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : null} />
            </dl>
          </div>
        </CardContent>
      </Card>
    );
  }

  const [history, docs, checklists, options] = await Promise.all([
    employeeHistory(actor, e.id),
    listEmployeeDocuments(actor, e.id),
    db.checklistItem.findMany({ where: { employeeId: e.id }, orderBy: { sortOrder: "asc" } }),
    access.canEdit ? employeeFormOptions() : null,
  ]);
  const canManageDocs = actor.permissions.has("document:manage") && !access.isSelf;
  const onboarding = checklists.filter((c) => c.type === "ONBOARDING");
  const offboarding = checklists.filter((c) => c.type === "OFFBOARDING");
  const isManagerOfEmp = !access.isSelf && !access.canEdit;
  const toRow = (c: (typeof checklists)[number]) => ({
    id: c.id,
    title: c.title,
    category: c.category,
    owner: c.owner,
    dueDate: c.dueDate?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    canToggle: access.canEdit || (c.owner === "EMPLOYEE" && access.isSelf) || (c.owner === "MANAGER" && isManagerOfEmp),
  });

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-1">
              <EmployeeAvatar id={e.id} name={name} hasPhoto={!!e.photoKey} className="size-16 text-lg" />
              {(access.isSelf || access.canEdit) && <PhotoUpload employeeId={e.id} />}
            </div>
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold">{name}</h1>
                <StatusBadge status={e.status} />
              </div>
              <p className="text-muted-foreground text-sm">
                {e.employeeCode} · {e.designation?.title ?? "No designation"} · {e.department?.name ?? "No department"}
              </p>
              <div className="flex flex-wrap gap-1">
                {e.user?.roles.map((r) => (
                  <Badge key={r.role.key} variant="outline">
                    {r.role.name}
                  </Badge>
                ))}
                {e.user && !e.user.isActive && <Badge variant="destructive">Account disabled</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {access.isSelf && !access.canEdit && <ProfileUpdateRequestDialog employee={{ phone: e.phone, personalEmail: e.personalEmail, addressLine1: e.addressLine1, addressLine2: e.addressLine2, city: e.city, state: e.state, postalCode: e.postalCode }} />}
            {access.canEdit && (
              <Button asChild variant="outline">
                <Link href={`/employees/${e.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            {access.canEdit && options && e.status !== "EXITED" && (
              <TransferDialog employeeId={e.id} current={{ departmentId: e.departmentId ?? undefined, designationId: e.designationId ?? undefined, managerId: e.managerId ?? undefined }} options={options} />
            )}
            {access.canOffboard && !access.isSelf && (e.status === "ACTIVE" || e.status === "ONBOARDING" || e.status === "SUSPENDED") && <OffboardDialog employeeId={e.id} />}
            {access.canOffboard && !access.isSelf && e.status === "ON_NOTICE" && (
              <ConfirmAction
                trigger={<Button variant="destructive">Complete exit</Button>}
                title="Complete exit?"
                description="This disables the portal account, revokes sessions, reassigns direct reports to the next manager and cancels future leave."
                destructive
                confirmLabel="Complete exit"
                action={completeOffboardingAction.bind(null, e.id)}
              />
            )}
            {access.canOffboard && !access.isSelf && e.status !== "EXITED" && (
              <ConfirmAction
                trigger={<Button variant="ghost" className="text-destructive">Archive</Button>}
                title="Archive this record?"
                description="Use only for records created in error. The employee is hidden from all lists and their account disabled."
                destructive
                withComment
                commentRequired
                commentLabel="Reason"
                confirmLabel="Archive"
                action={archiveEmployeeAction.bind(null, e.id)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={tab ?? "overview"}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {access.personal && <TabsTrigger value="contacts">Emergency contacts</TabsTrigger>}
          <TabsTrigger value="documents">Documents</TabsTrigger>
          {(onboarding.length > 0 || offboarding.length > 0) && <TabsTrigger value="checklists">Checklists</TabsTrigger>}
          <TabsTrigger value="history">History</TabsTrigger>
          {access.financial && <TabsTrigger value="statutory">Statutory & bank</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Employment</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Item icon={Building2} label="Department" value={e.department ? <Link className="hover:underline" href={`/departments/${e.department.id}`}>{e.department.name}</Link> : null} />
                <Item icon={Briefcase} label="Designation" value={e.designation ? `${e.designation.title} (Level ${e.designation.level})` : null} />
                <Item icon={UserRound} label="Reporting manager" value={e.manager ? <Link className="hover:underline" href={`/employees/${e.manager.id}`}>{`${e.manager.firstName} ${e.manager.lastName}`}</Link> : null} />
                <Item label="Employment type" value={humanize(e.employmentType)} />
                <Item icon={CalendarDays} label="Date of joining" value={formatDateKey(e.dateOfJoining)} />
                <Item label="Probation ends" value={e.probationEndsOn ? formatDateKey(e.probationEndsOn) : null} />
                <Item icon={MapPin} label="Work location" value={e.workLocation} />
                <Item label="Shift" value={e.shift?.name} />
                {e.exitDate && <Item label="Last working day" value={formatDateKey(e.exitDate)} />}
                {e.exitReason && access.canEdit && <Item label="Exit reason" value={e.exitReason} />}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <Item icon={Mail} label="Work email" value={e.workEmail} />
                <Item icon={Phone} label="Phone" value={e.phone} />
                {access.personal && (
                  <>
                    <Item label="Personal email" value={e.personalEmail} />
                    <Item label="Date of birth" value={e.dateOfBirth ? formatDateKey(e.dateOfBirth) : null} />
                    <Item label="Gender" value={humanize(e.gender)} />
                    <Item icon={MapPin} label="Address" value={[e.addressLine1, e.addressLine2, e.city, e.state, e.postalCode].filter(Boolean).join(", ")} />
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
          {e.directReports.length > 0 && (
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Direct reports ({e.directReports.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {e.directReports.map((r) => (
                    <li key={r.id}>
                      <Link href={`/employees/${r.id}`} className="hover:bg-muted flex items-center gap-2 rounded-md p-2">
                        <EmployeeAvatar id={r.id} name={`${r.firstName} ${r.lastName}`} />
                        <div>
                          <div className="text-sm font-medium">
                            {r.firstName} {r.lastName}
                          </div>
                          <div className="text-muted-foreground text-xs">{r.designation?.title}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {e.bio && (
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-line">{e.bio}</CardContent>
            </Card>
          )}
        </TabsContent>

        {access.personal && (
          <TabsContent value="contacts">
            <Card>
              <CardContent>
                <EmergencyContacts employeeId={e.id} contacts={e.emergencyContacts ?? []} canEdit={access.isSelf || access.canEdit} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="documents">
          <Card>
            <CardContent>
              <DocumentList
                ownerField="employeeId"
                ownerId={e.id}
                canUpload={access.isSelf || canManageDocs}
                canVerify={canManageDocs}
                docs={docs.map((d) => ({
                  id: d.id,
                  name: d.name,
                  category: d.category,
                  sizeBytes: d.sizeBytes,
                  verificationStatus: d.verificationStatus,
                  isConfidential: d.isConfidential,
                  createdAt: d.createdAt.toISOString(),
                  canDelete: canManageDocs || (access.isSelf && d.uploadedById === actor.id && d.verificationStatus !== "VERIFIED"),
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklists">
          <Card>
            <CardContent className="grid gap-8 lg:grid-cols-2">
              {onboarding.length > 0 && <Checklist title="Onboarding" items={onboarding.map(toRow)} />}
              {offboarding.length > 0 && <Checklist title="Offboarding" items={offboarding.map(toRow)} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent>
              <ol className="relative grid gap-5 border-l pl-6">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="bg-primary absolute top-1.5 -left-[29px] size-2.5 rounded-full" aria-hidden />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{humanize(h.changeType)}</Badge>
                      <span className="text-muted-foreground text-xs">{formatDateKey(dbDateToKey(h.effectiveDate))}</span>
                    </div>
                    <p className="mt-1 text-sm">{h.describe}</p>
                    {h.remarks && <p className="text-muted-foreground text-xs">{h.remarks}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {access.financial && (
          <TabsContent value="statutory">
            <Card>
              <CardHeader>
                <CardTitle>Statutory & bank details</CardTitle>
              </CardHeader>
              <CardContent>
                <FinancialForm
                  readOnly={!(actor.permissions.has("employee:sensitive:read") && actor.permissions.has("employee:update"))}
                  initial={{
                    employeeId: e.id,
                    panNumber: e.financialInfo?.panNumber ?? "",
                    uanNumber: e.financialInfo?.uanNumber ?? "",
                    esiNumber: e.financialInfo?.esiNumber ?? "",
                    bankName: e.financialInfo?.bankName ?? "",
                    bankAccountNumber: e.financialInfo?.bankAccountNumber ?? "",
                    bankIfsc: e.financialInfo?.bankIfsc ?? "",
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
