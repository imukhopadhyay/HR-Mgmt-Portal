import { requireUser } from "@/lib/auth/guard";
import { EmptyState } from "@/components/shared/empty-state";
import { ProfileView } from "@/components/employees/profile-view";

export const metadata = { title: "My profile" };

export default async function MyProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requireUser();
  if (!actor.employeeId)
    return (
      <EmptyState
        title="No employee profile"
        description="Your account is not linked to an employee record."
      />
    );
  return <ProfileView actor={actor} employeeId={actor.employeeId} tab={(await searchParams).tab} />;
}
