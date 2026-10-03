import { requireUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shared/page-header";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  await requireUser();
  const { required } = await searchParams;
  return (
    <div className="max-w-lg space-y-6">
      <PageHeader
        title="Change password"
        description={
          required
            ? "You must set a new password before continuing."
            : "Changing your password signs you out of other devices."
        }
      />
      <ChangePasswordForm />
    </div>
  );
}
