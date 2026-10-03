import { requirePagePermission } from "@/lib/auth/guard";
import { orgTree } from "@/server/services/organisation.service";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { OrgChart } from "@/components/organisation/org-chart";

export const metadata = { title: "Org chart" };

export default async function OrgChartPage() {
  await requirePagePermission("directory:read");
  const roots = await orgTree();
  return (
    <>
      <PageHeader title="Organisation chart" description="Reporting hierarchy of current employees. Expand or collapse teams." />
      <Card>
        <CardContent className="overflow-x-auto">
          <OrgChart roots={roots} />
        </CardContent>
      </Card>
    </>
  );
}
