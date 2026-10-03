import { requirePagePermission } from "@/lib/auth/guard";
import { employeeFormOptions } from "@/server/services/organisation.service";
import { PageHeader } from "@/components/shared/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";

export const metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  await requirePagePermission("employee:create");
  const options = await employeeFormOptions();
  return (
    <>
      <PageHeader title="Add employee" description="Creates the employee record, onboarding checklist, leave balances and (optionally) a portal account." />
      <EmployeeForm options={options} />
    </>
  );
}
