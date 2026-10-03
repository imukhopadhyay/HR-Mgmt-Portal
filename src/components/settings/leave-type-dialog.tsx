"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { leaveTypeSchema } from "@/lib/validation/leave";
import { saveLeaveTypeAction } from "@/server/actions/leave";

type Values = z.input<typeof leaveTypeSchema>;

const DEFAULTS: Values = {
  code: "",
  name: "",
  color: "#2563eb",
  annualEntitlement: 0,
  accrual: "ANNUAL_UPFRONT",
  carryForwardLimit: 0,
  isPaid: true,
  allowHalfDay: true,
  allowNegativeBalance: false,
  maxConsecutiveDays: "",
  minNoticeDays: 0,
  documentRequiredAfterDays: "",
  approvalLevels: 1,
  isActive: true,
};

export function LeaveTypeDialog({ initial }: { initial?: Values }) {
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(leaveTypeSchema),
    defaultValues: initial ?? DEFAULTS,
  });
  const { execute, pending } = useAction(saveLeaveTypeAction, {
    form,
    onSuccess: () => setOpen(false),
  });
  const e = form.formState.errors;
  const flag = (
    name: "isPaid" | "allowHalfDay" | "allowNegativeBalance" | "isActive",
    label: string,
  ) => (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`lt-${name}`}
        defaultChecked={!!form.getValues(name)}
        onCheckedChange={(v) => form.setValue(name, v === true)}
      />
      <Label htmlFor={`lt-${name}`}>{label}</Label>
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${initial.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> New leave type
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit leave type" : "New leave type"}</DialogTitle>
        </DialogHeader>
        <form
          id="lt-form"
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField label="Code" htmlFor="lt-code" required error={e.code?.message}>
            <Input {...form.register("code")} />
          </FormField>
          <FormField
            label="Name"
            htmlFor="lt-name"
            required
            error={e.name?.message}
            className="sm:col-span-2"
          >
            <Input {...form.register("name")} />
          </FormField>
          <FormField
            label="Annual entitlement (days)"
            htmlFor="lt-ent"
            error={e.annualEntitlement?.message}
          >
            <Input type="number" step="0.5" {...form.register("annualEntitlement")} />
          </FormField>
          <FormField label="Accrual" htmlFor="lt-acc" error={e.accrual?.message}>
            <NativeSelect {...form.register("accrual")}>
              <option value="ANNUAL_UPFRONT">Annual (upfront, pro-rated)</option>
              <option value="MONTHLY">Monthly accrual</option>
              <option value="NONE">None</option>
            </NativeSelect>
          </FormField>
          <FormField
            label="Carry-forward limit"
            htmlFor="lt-cf"
            error={e.carryForwardLimit?.message}
          >
            <Input type="number" step="0.5" {...form.register("carryForwardLimit")} />
          </FormField>
          <FormField
            label="Max consecutive days"
            htmlFor="lt-max"
            error={e.maxConsecutiveDays?.message}
          >
            <Input type="number" {...form.register("maxConsecutiveDays")} />
          </FormField>
          <FormField
            label="Minimum notice (days)"
            htmlFor="lt-notice"
            error={e.minNoticeDays?.message}
          >
            <Input type="number" {...form.register("minNoticeDays")} />
          </FormField>
          <FormField
            label="Document required after (days)"
            htmlFor="lt-doc"
            error={e.documentRequiredAfterDays?.message}
          >
            <Input type="number" {...form.register("documentRequiredAfterDays")} />
          </FormField>
          <FormField
            label="Approval levels"
            htmlFor="lt-levels"
            error={e.approvalLevels?.message}
            hint="1 = manager; 2 = manager then HR"
          >
            <NativeSelect {...form.register("approvalLevels")}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </NativeSelect>
          </FormField>
          <FormField label="Colour" htmlFor="lt-color" error={e.color?.message}>
            <Input type="color" className="h-9 p-1" {...form.register("color")} />
          </FormField>
          <div className="grid gap-2 sm:col-span-3 sm:grid-cols-4">
            {flag("isPaid", "Paid leave")}
            {flag("allowHalfDay", "Allow half days")}
            {flag("allowNegativeBalance", "No balance limit")}
            {flag("isActive", "Active")}
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="lt-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
