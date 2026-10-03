import { Megaphone, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { activeAnnouncements } from "@/server/services/dashboard.service";
import { deleteAnnouncementAction } from "@/server/actions/announcements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { AnnouncementDialog } from "@/components/communication/announcement-dialog";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const actor = await requireUser();
  const canManage = actor.permissions.has("announcement:manage");
  const [items, departments] = await Promise.all([activeAnnouncements(actor, 100), canManage ? db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : []]);
  return (
    <>
      <PageHeader title="Announcements" description="Company-wide and department news." actions={canManage && <AnnouncementDialog departments={departments} />} />
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Megaphone} title="No announcements" />
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((a) => (
            <Card key={a.id}>
              <CardContent className="grid gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{a.title}</h2>
                    {a.priority !== "NORMAL" && <StatusBadge status={a.priority} />}
                    <Badge variant="outline">{a.department?.name ?? "All staff"}</Badge>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <AnnouncementDialog
                        departments={departments}
                        initial={{ id: a.id, title: a.title, body: a.body, priority: a.priority, departmentId: a.departmentId ?? "", expiresAt: a.expiresAt ? a.expiresAt.toISOString().slice(0, 10) : "", notify: false }}
                      />
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Delete announcement">
                            <Trash2 />
                          </Button>
                        }
                        title="Delete announcement?"
                        destructive
                        confirmLabel="Delete"
                        action={deleteAnnouncementAction.bind(null, a.id)}
                      />
                    </div>
                  )}
                </div>
                <p className="text-sm whitespace-pre-line">{a.body}</p>
                <p className="text-muted-foreground text-xs">
                  {a.author.employee ? `${a.author.employee.firstName} ${a.author.employee.lastName} · ` : ""}
                  {formatDateTime(a.publishedAt)}
                  {a.expiresAt && ` · until ${formatDateTime(a.expiresAt)}`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
