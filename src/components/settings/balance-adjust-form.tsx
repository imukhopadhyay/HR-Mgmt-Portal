"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { useAction } from "@/hooks/use-action";
import { balanceAdjustSchema } from "@/lib/validation/leave";
import { adjustBalanceAction, yearEndRolloverAction } from "@/server/actions/leave";

type Opt = { id: string; label: string };

export function BalanceAdjustForm({
  employees,
  types,
  year,
}: {
  employees: Opt[];
  types: Opt[];
  year: number;
}) {
  const form = useForm<z.input<typeof balanceAdjustSchema>>({
    resolver: zodResolver(balanceAdjustSchema),
    defaultValues: { employeeId: "", leaveTypeId: types[0]?.id ?? "", year, delta: 1, reason: "" },
  });
  const { execute, pending } = useAction(adjustBalanceAction, {
    form,
    onSuccess: () => form.reset({ ...form.getValues(), reason: "" }),
  });
  const e = form.formState.errors;
  return (
    <div className="grid gap-6">
      <form
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={form.handleSubmit((v) => execute(v))}
        noValidate
      >
        <FormField
          label="Employee"
          htmlFor="ba-emp"
          required
          error={e.employeeId?.message}
          className="lg:col-span-2"
        >
          <NativeSelect {...form.register("employeeId")}>
            <option value="">Select…</option>
            {employees.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Leave type" htmlFor="ba-type" required error={e.leaveTypeId?.message}>
          <NativeSelect {...form.register("leaveTypeId")}>
            {types.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Year" htmlFor="ba-year" error={e.year?.message}>
          <Input type="number" {...form.register("year")} />
        </FormField>
        <FormField label="Days (+/−)" htmlFor="ba-delta" error={e.delta?.message}>
          <Input type="number" step="0.5" {...form.register("delta")} />
        </FormField>
        <FormField
          label="Reason"
          htmlFor="ba-reason"
          required
          error={e.reason?.message}
          className="sm:col-span-2 lg:col-span-4"
        >
          <Input {...form.register("reason")} />
        </FormField>
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Apply adjustment"}
          </Button>
        </div>
      </form>
      <div className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">
            Year-end rollover {year - 1} → {year}
          </p>
          <p className="text-muted-foreground text-sm">
            Carries unused balances forward, capped by each type&apos;s carry-forward limit. Can
            only run once per year.
          </p>
        </div>
        <ConfirmAction
          trigger={<Button variant="outline">Run rollover</Button>}
          title={`Run year-end rollover for ${year - 1}?`}
          description="This sets carried-forward days on next year's balances and cannot be repeated."
          confirmLabel="Run rollover"
          action={yearEndRolloverAction.bind(null, year - 1)}
        />
      </div>
    </div>
  );
}
