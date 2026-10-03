import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { listTickets } from "@/server/services/self-service.service";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterBar } from "@/components/shared/filter-bar";
import { NewTicketDialog, UpdateTicketDialog } from "@/components/self-service/ticket-dialogs";

export const metadata = { title: "HR help desk" };

export default async function HelpDeskPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string }> }) {
  const actor = await requireUser();
  const sp = await searchParams;
  const isAgent = actor.permissions.has("request:manage");
  const scope = isAgent && sp.view === "all" ? "all" : "mine";
  const [tickets, agents] = await Promise.all([
    listTickets(actor, { scope, status: sp.status || undefined }),
    isAgent
      ? db.employee.findMany({ where: { deletedAt: null, status: { not: "EXITED" }, user: { roles: { some: { role: { permissions: { some: { permission: { key: "request:manage" } } } } } } } }, select: { id: true, firstName: true, lastName: true } })
      : [],
  ]);
  return (
    <>
      <PageHeader title="HR help desk" description="Raise questions and requests to HR and track their status." actions={actor.employeeId && <NewTicketDialog />} />
      <div className="flex flex-wrap items-center gap-3">
        {isAgent && (
          <Tabs value={scope}>
            <TabsList>
              <TabsTrigger value="mine" asChild>
                <Link href="/help-desk">My requests</Link>
              </TabsTrigger>
              <TabsTrigger value="all" asChild>
                <Link href="/help-desk?view=all">All requests</Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <FilterBar search={false} filters={[{ name: "status", label: "Status", options: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() })) }]} />
      </div>
      <Card className="py-0">
        {tickets.length === 0 ? (
          <EmptyState icon={LifeBuoy} title="No requests" description="Requests you raise will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                {scope === "all" && <TableHead>Requester</TableHead>}
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Assignee</TableHead>
                <TableHead className="hidden md:table-cell">Raised</TableHead>
                {isAgent && scope === "all" && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="max-w-96 whitespace-normal">
                    <p className="font-medium">{t.subject}</p>
                    <p className="text-muted-foreground text-xs">{t.category}</p>
                    <p className="text-muted-foreground line-clamp-2 text-xs">{t.description}</p>
                    {t.resolution && <p className="mt-1 text-xs"><span className="font-medium">HR:</span> {t.resolution}</p>}
                  </TableCell>
                  {scope === "all" && (
                    <TableCell>
                      {t.requester.firstName} {t.requester.lastName}
                      <div className="text-muted-foreground text-xs">{t.requester.employeeCode}</div>
                    </TableCell>
                  )}
                  <TableCell>
                    <StatusBadge status={t.priority} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatDateTime(t.createdAt)}</TableCell>
                  {isAgent && scope === "all" && (
                    <TableCell>
                      <UpdateTicketDialog ticket={t} agents={agents.map((a) => ({ id: a.id, label: `${a.firstName} ${a.lastName}` }))} />
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
