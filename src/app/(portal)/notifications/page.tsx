import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { MarkAllRead } from "@/components/communication/mark-all-read";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await requireUser();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const pageSize = 25;
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.notification.count({ where: { userId: actor.id } }),
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);
  return (
    <>
      <PageHeader title="Notifications" description={`${unread} unread`} actions={unread > 0 && <MarkAllRead />} />
      <Card className="py-0">
        {items.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" />
        ) : (
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id} className={cn("flex gap-3 p-4", !n.readAt && "bg-primary/5")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-label={n.readAt ? undefined : "Unread"} />
                <div className="min-w-0 flex-1">
                  {n.link ? (
                    <Link href={n.link} className="font-medium hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    <p className="font-medium">{n.title}</p>
                  )}
                  <p className="text-muted-foreground text-sm">{n.body}</p>
                  <p className="text-muted-foreground text-xs">{formatDateTime(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/notifications" params={{}} />
    </>
  );
}
