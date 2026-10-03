import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { dbDateToKey } from "@/lib/dates";
import { employeeFormOptions } from "@/server/services/organisation.service";
import { PageHeader } from "@/components/shared/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";

export const metadata = { title: "Edit employee" };

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("employee:update");
  const { id } = await params;
  const [e, options] = await Promise.all([
    db.employee.findFirst({ where: { id, deletedAt: null } }),
    employeeFormOptions(),
  ]);
  if (!e) notFound();
  const s = (v: string | null) => v ?? "";
  return (
    <>
      <PageHeader title={`Edit ${e.firstName} ${e.lastName}`} description={e.employeeCode} />
      <EmployeeForm
        options={options}
        initial={{
          id: e.id,
          firstName: e.firstName,
          middleName: s(e.middleName),
          lastName: e.lastName,
          workEmail: e.workEmail,
          personalEmail: s(e.personalEmail),
          phone: s(e.phone),
          dateOfBirth: e.dateOfBirth ? dbDateToKey(e.dateOfBirth) : "",
          gender: e.gender,
          addressLine1: s(e.addressLine1),
          addressLine2: s(e.addressLine2),
          city: s(e.city),
          state: s(e.state),
          postalCode: s(e.postalCode),
          country: e.country,
          bio: s(e.bio),
          departmentId: s(e.departmentId),
          designationId: s(e.designationId),
          managerId: s(e.managerId),
          shiftId: s(e.shiftId),
          employmentType: e.employmentType,
          workLocation: s(e.workLocation),
          dateOfJoining: dbDateToKey(e.dateOfJoining),
          probationEndsOn: e.probationEndsOn ? dbDateToKey(e.probationEndsOn) : "",
          status: e.status,
          changeRemarks: "",
        }}
      />
    </>
  );
}
