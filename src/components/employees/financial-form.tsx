"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { financialInfoSchema } from "@/lib/validation/employee";
import { updateFinancialInfoAction } from "@/server/actions/employees";

type Values = z.input<typeof financialInfoSchema>;

export function FinancialForm({ initial, readOnly }: { initial: Values; readOnly: boolean }) {
  const form = useForm<Values>({ resolver: zodResolver(financialInfoSchema), defaultValues: initial });
  const { execute, pending } = useAction(updateFinancialInfoAction, { form });
  const e = form.formState.errors;
  const fields: [keyof Values, string][] = [
    ["panNumber", "PAN"],
    ["uanNumber", "UAN (EPF)"],
    ["esiNumber", "ESI number"],
    ["bankName", "Bank name"],
    ["bankAccountNumber", "Account number"],
    ["bankIfsc", "IFSC"],
  ];
  return (
    <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
      {fields.map(([name, label]) => (
        <FormField key={name} label={label} htmlFor={`fin-${name}`} error={e[name]?.message}>
          <Input autoComplete="off" readOnly={readOnly} {...form.register(name)} />
        </FormField>
      ))}
      {!readOnly && (
        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save details"}
          </Button>
        </div>
      )}
    </form>
  );
}
