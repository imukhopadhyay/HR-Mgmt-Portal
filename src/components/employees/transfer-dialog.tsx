"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { transferSchema } from "@/lib/validation/organisation";
import { transferEmployeeAction } from "@/server/actions/employees";
import type { EmployeeFormOptions } from "./employee-form";

export function TransferDialog({
  employeeId,
  current,
  options,
}: {
  employeeId: string;
  current: { departmentId?: string; designationId?: string; managerId?: string };
  options: EmployeeFormOptions;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: { employeeId, ...current, effectiveDate: new Date().toISOString().slice(0, 10) },
  });
  const { execute, pending } = useAction(transferEmployeeAction, { form, onSuccess: () => setOpen(false) });
  const e = form.formState.errors;
  const sel = (name: "departmentId" | "designationId" | "managerId", label: string, opts: { id: string; label: string }[]) => (
    <FormField label={label} htmlFor={`t-${name}`} error={e[name]?.message}>
      <NativeSelect {...form.register(name)}>
        <option value="">— None —</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowRightLeft /> Transfer / promote
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer, promotion or reporting change</DialogTitle>
          <DialogDescription>Changes are recorded in employment history with the effective date.</DialogDescription>
        </DialogHeader>
        <form id="transfer-form" className="grid gap-4" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          {sel("departmentId", "Department", options.departments)}
          {sel("designationId", "Designation", options.designations)}
          {sel("managerId", "Reporting manager", options.managers.filter((m) => m.id !== employeeId))}
          <FormField label="Effective date" htmlFor="t-effectiveDate" required error={e.effectiveDate?.message}>
            <Input type="date" {...form.register("effectiveDate")} />
          </FormField>
          <FormField label="Remarks" htmlFor="t-remarks" error={e.remarks?.message}>
            <Input {...form.register("remarks")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="transfer-form" disabled={pending}>
            {pending ? "Saving…" : "Apply change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
