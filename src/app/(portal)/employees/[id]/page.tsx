import { requireUser } from "@/lib/auth/guard";
import { ProfileView } from "@/components/employees/profile-view";

export const metadata = { title: "Employee" };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireUser();
  const { id } = await params;
  const { tab } = await searchParams;
  return <ProfileView actor={actor} employeeId={id} tab={tab} />;
}
