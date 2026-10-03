import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guard";
import { formatDateTime } from "@/lib/dates";
import { pendingVerifications } from "@/server/services/document.service";
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
import { EmptyState } from "@/components/shared/empty-state";
import { humanize } from "@/lib/utils";

export const metadata = { title: "Document verification" };

export default async function DocumentsPage() {
  const actor = await requirePagePermission("document:manage");
  const docs = (await pendingVerifications(actor)).filter((d) => d.employeeId !== actor.employeeId);
  return (
    <>
      <PageHeader
        title="Document verification"
        description="Employee-uploaded documents awaiting HR verification. Open the profile to download, verify or reject."
      />
      <Card className="py-0">
        {docs.length === 0 ? (
          <EmptyState icon={FileCheck2} title="Nothing to verify" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Uploaded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link
                      href={`/employees/${d.employee!.id}?tab=documents`}
                      className="font-medium hover:underline"
                    >
                      {d.employee!.firstName} {d.employee!.lastName}
                    </Link>
                    <div className="text-muted-foreground text-xs">{d.employee!.employeeCode}</div>
                  </TableCell>
                  <TableCell className="max-w-64 truncate">{d.name}</TableCell>
                  <TableCell>{humanize(d.category)}</TableCell>
                  <TableCell>{formatDateTime(d.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
