import { requirePagePermission } from "@/lib/auth/guard";
import { formatDateTime } from "@/lib/dates";
import { listAudit } from "@/server/services/user-admin.service";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { VerifyChain } from "@/components/admin/verify-chain";

export const metadata = { title: "Audit trail" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePagePermission("audit:read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, entityTypes } = await listAudit(actor, {
    action: sp.q,
    entityType: sp.entityType,
    from: sp.from,
    to: sp.to,
    page,
    pageSize: 50,
  });
  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Append-only, hash-chained log of administrative and security events. Records cannot be edited or deleted."
        actions={<VerifyChain />}
      />
      <FilterBar
        searchPlaceholder="Filter by action (e.g. leave.approve)"
        filters={[
          {
            name: "entityType",
            label: "Entity",
            options: entityTypes.map((e) => ({ value: e, label: e })),
          },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
        ]}
      />
      <Card className="py-0">
        {rows.length === 0 ? (
          <EmptyState title="No audit entries match" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="hidden xl:table-cell">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {r.seq.toString()}
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell className="text-xs">{r.actor?.email ?? "system"}</TableCell>
                  <TableCell>
                    <code className="text-xs">{r.action}</code>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.entityType}
                    {r.entityId && (
                      <div className="text-muted-foreground max-w-32 truncate">{r.entityId}</div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md text-xs whitespace-normal">
                    {r.summary}
                    {(r.before || r.after) && (
                      <details>
                        <summary className="text-muted-foreground cursor-pointer">Changes</summary>
                        <pre className="bg-muted mt-1 max-h-48 overflow-auto rounded p-2 text-[11px]">
                          {JSON.stringify({ before: r.before, after: r.after }, null, 2)}
                        </pre>
                      </details>
                    )}
                    <div
                      className="text-muted-foreground truncate font-mono text-[10px]"
                      title={r.hash}
                    >
                      {r.hash.slice(0, 16)}…
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs xl:table-cell">
                    {r.ipAddress}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Pagination page={page} pageSize={50} total={total} basePath="/admin/audit" params={sp} />
    </>
  );
}
