"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { humanize } from "@/lib/utils";
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  employeeCreateSchema,
  employeeUpdateSchema,
} from "@/lib/validation/employee";
import { createEmployeeAction, updateEmployeeAction } from "@/server/actions/employees";
import type { ActionResult } from "@/lib/action";

type Option = { id: string; label: string };
export interface EmployeeFormOptions {
  departments: Option[];
  designations: Option[];
  managers: Option[];
  shifts: Option[];
}

type CreateValues = z.input<typeof employeeCreateSchema>;
type UpdateValues = z.input<typeof employeeUpdateSchema>;

export function EmployeeForm({
  options,
  initial,
}: {
  options: EmployeeFormOptions;
  initial?: UpdateValues;
}) {
  const router = useRouter();
  const isEdit = !!initial;
  const form = useForm<CreateValues & Partial<UpdateValues>>({
    resolver: zodResolver((isEdit ? employeeUpdateSchema : employeeCreateSchema) as never),
    defaultValues: initial ?? {
      firstName: "",
      lastName: "",
      workEmail: "",
      gender: "UNDISCLOSED",
      employmentType: "FULL_TIME",
      country: "India",
      dateOfJoining: new Date().toISOString().slice(0, 10),
      createAccount: true,
    },
  });
  const action = (isEdit ? updateEmployeeAction : createEmployeeAction) as (
    input: unknown,
  ) => Promise<ActionResult<unknown>>;
  const { execute, pending } = useAction(action, {
    form,
    onSuccess: (data) => {
      const id = isEdit ? initial!.id : (data as { id: string }).id;
      router.push(`/employees/${id}`);
    },
  });
  const e = form.formState.errors;
  const r = form.register;
  const managerOptions = options.managers.filter((m) => m.id !== initial?.id);

  return (
    <form onSubmit={form.handleSubmit((v) => execute(v))} className="grid gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>
            Personal information is visible only to the employee and HR.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="First name" htmlFor="firstName" required error={e.firstName?.message}>
            <Input autoComplete="off" {...r("firstName")} />
          </FormField>
          <FormField label="Middle name" htmlFor="middleName" error={e.middleName?.message}>
            <Input autoComplete="off" {...r("middleName")} />
          </FormField>
          <FormField label="Last name" htmlFor="lastName" required error={e.lastName?.message}>
            <Input autoComplete="off" {...r("lastName")} />
          </FormField>
          <FormField label="Date of birth" htmlFor="dateOfBirth" error={e.dateOfBirth?.message}>
            <Input type="date" {...r("dateOfBirth")} />
          </FormField>
          <FormField label="Gender" htmlFor="gender" error={e.gender?.message}>
            <NativeSelect {...r("gender")}>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {humanize(g)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            label="Personal email"
            htmlFor="personalEmail"
            error={e.personalEmail?.message}
          >
            <Input type="email" {...r("personalEmail")} />
          </FormField>
          <FormField
            label="Phone"
            htmlFor="phone"
            error={e.phone?.message}
            hint="Include country code, e.g. +91 98765 43210"
          >
            <Input type="tel" {...r("phone")} />
          </FormField>
          <FormField
            label="Address line 1"
            htmlFor="addressLine1"
            error={e.addressLine1?.message}
            className="sm:col-span-2"
          >
            <Input {...r("addressLine1")} />
          </FormField>
          <FormField label="Address line 2" htmlFor="addressLine2" error={e.addressLine2?.message}>
            <Input {...r("addressLine2")} />
          </FormField>
          <FormField label="City" htmlFor="city" error={e.city?.message}>
            <Input {...r("city")} />
          </FormField>
          <FormField label="State" htmlFor="state" error={e.state?.message}>
            <Input {...r("state")} />
          </FormField>
          <FormField label="Postal code" htmlFor="postalCode" error={e.postalCode?.message}>
            <Input {...r("postalCode")} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
          <CardDescription>The employee ID is generated automatically.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Work email" htmlFor="workEmail" required error={e.workEmail?.message}>
            <Input type="email" autoComplete="off" {...r("workEmail")} />
          </FormField>
          <FormField label="Department" htmlFor="departmentId" error={e.departmentId?.message}>
            <NativeSelect {...r("departmentId")}>
              <option value="">— None —</option>
              {options.departments.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Designation" htmlFor="designationId" error={e.designationId?.message}>
            <NativeSelect {...r("designationId")}>
              <option value="">— None —</option>
              {options.designations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Reporting manager" htmlFor="managerId" error={e.managerId?.message}>
            <NativeSelect {...r("managerId")}>
              <option value="">— None —</option>
              {managerOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            label="Employment type"
            htmlFor="employmentType"
            error={e.employmentType?.message}
          >
            <NativeSelect {...r("employmentType")}>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            label="Shift"
            htmlFor="shiftId"
            error={e.shiftId?.message}
            hint="Defaults to the organisation's default shift"
          >
            <NativeSelect {...r("shiftId")}>
              <option value="">— Default —</option>
              {options.shifts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            label="Date of joining"
            htmlFor="dateOfJoining"
            required
            error={e.dateOfJoining?.message}
          >
            <Input type="date" {...r("dateOfJoining")} />
          </FormField>
          <FormField
            label="Probation ends"
            htmlFor="probationEndsOn"
            error={e.probationEndsOn?.message}
            hint="Defaults to 6 months after joining"
          >
            <Input type="date" {...r("probationEndsOn")} />
          </FormField>
          <FormField label="Work location" htmlFor="workLocation" error={e.workLocation?.message}>
            <Input {...r("workLocation")} />
          </FormField>
          {isEdit && (
            <>
              <FormField label="Status" htmlFor="status" error={e.status?.message}>
                <NativeSelect {...r("status")}>
                  {EMPLOYEE_STATUSES.filter(
                    (s) => s !== "EXITED" || initial?.status === "EXITED",
                  ).map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField
                label="Change remarks"
                htmlFor="changeRemarks"
                error={e.changeRemarks?.message}
                hint="Recorded in employment history"
                className="sm:col-span-2"
              >
                <Input {...r("changeRemarks")} />
              </FormField>
            </>
          )}
          <FormField
            label="Short bio"
            htmlFor="bio"
            error={e.bio?.message}
            className="sm:col-span-2 lg:col-span-3"
          >
            <Textarea rows={3} {...r("bio")} />
          </FormField>
          {!isEdit && (
            <div className="flex items-start gap-2 sm:col-span-2 lg:col-span-3">
              <Checkbox
                id="createAccount"
                defaultChecked
                onCheckedChange={(v) => form.setValue("createAccount", v === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="createAccount">Create portal account</Label>
                <p className="text-muted-foreground text-xs">
                  An invitation to set a password is emailed to the work address.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create employee"}
        </Button>
      </div>
    </form>
  );
}
