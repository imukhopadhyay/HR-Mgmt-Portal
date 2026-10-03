import { requireUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shared/page-header";

export default async function DashboardPage() {
  const user = await requireUser();
  return <PageHeader title={`Welcome, ${user.name}`} description="Dashboard" />;
}
