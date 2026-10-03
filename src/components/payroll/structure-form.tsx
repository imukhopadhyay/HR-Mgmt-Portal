"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { monthlyComponents } from "@/lib/payroll-engine";
import { formatINR } from "@/lib/utils";
import { structureSchema } from "@/lib/validation/payroll";
import { saveStructureAction } from "@/server/actions/payroll";

type Values = z.input<typeof structureSchema>;
export interface ComponentOpt {
  id: string;
  code: string;
  name: string;
  type: "EARNING" | "DEDUCTION";
  calcType: "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_CTC";
  isTaxable: boolean;
}

const unit = (c?: ComponentOpt) => (!c ? "" : c.calcType === "FIXED" ? "₹ / month" : c.calcType === "PERCENT_OF_BASIC" ? "% of basic" : "% of CTC");

export function StructureForm({ employeeId, components, initial }: { employeeId: string; components: ComponentOpt[]; initial?: Values }) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(structureSchema),
    defaultValues: initial ?? {
      employeeId,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      annualCtc: 0,
      pfOptedOut: false,
      notes: "",
      lines: components.filter((c) => ["BASIC", "HRA", "SPECIAL"].includes(c.code)).map((c) => ({ componentId: c.id, value: c.code === "BASIC" ? 40 : c.code === "HRA" ? 50 : 0 })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const { execute, pending } = useAction(saveStructureAction, { form, onSuccess: () => router.refresh() });
  const [ctc, lines] = useWatch({ control: form.control, name: ["annualCtc", "lines"] });
  const preview = useMemo(() => {
    const ls = (lines ?? [])
      .map((l) => ({ l, c: components.find((c) => c.id === l.componentId) }))
      .flatMap(({ l, c }) => (c ? [{ l, c }] : []))
      .map(({ l, c }) => ({ code: c.code, name: c.name, type: c.type, calcType: c.calcType, value: Number(l.value) || 0, isTaxable: c.isTaxable }));
    return monthlyComponents(Number(ctc) || 0, ls);
  }, [ctc, lines, components]);
  const monthlyEarnings = preview.filter((p) => p.type === "EARNING").reduce((s, p) => s + p.amount, 0);
  const e = form.formState.errors;
  const used = new Set((lines ?? []).map((l) => l.componentId));

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Annual CTC (₹)" htmlFor="ss-ctc" required error={e.annualCtc?.message}>
          <Input type="number" min={0} step="1000" {...form.register("annualCtc")} />
        </FormField>
        <FormField label="Effective from" htmlFor="ss-from" required error={e.effectiveFrom?.message}>
          <Input type="date" {...form.register("effectiveFrom")} />
        </FormField>
        <div className="flex items-center gap-2 self-end pb-2">
          <Checkbox id="ss-pf" defaultChecked={!!initial?.pfOptedOut} onCheckedChange={(v) => form.setValue("pfOptedOut", v === true)} />
          <Label htmlFor="ss-pf">Opted out of PF</Label>
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Components</legend>
        {e.lines?.message && <p className="text-destructive text-xs">{e.lines.message}</p>}
        {fields.map((f, i) => {
          const c = components.find((x) => x.id === lines?.[i]?.componentId);
          const amt = preview.find((p) => p.code === c?.code)?.amount ?? 0;
          return (
            <div key={f.id} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2 sm:grid-cols-[1fr_8rem_8rem_auto]">
              <FormField label={i === 0 ? "Component" : ""} htmlFor={`ss-c-${i}`}>
                <NativeSelect {...form.register(`lines.${i}.componentId`)} aria-label={`Component ${i + 1}`}>
                  {components.map((c) => (
                    <option key={c.id} value={c.id} disabled={used.has(c.id) && c.id !== lines?.[i]?.componentId}>
                      {c.name} ({c.type === "EARNING" ? "earning" : "deduction"})
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label={i === 0 ? "Value" : ""} htmlFor={`ss-v-${i}`} hint={unit(c)}>
                <Input type="number" step="0.01" min={0} {...form.register(`lines.${i}.value`)} aria-label={`Value ${i + 1}`} />
              </FormField>
              <div className="text-muted-foreground hidden pb-6 text-right text-sm tabular-nums sm:block">{formatINR(Math.round(amt))}</div>
              <Button type="button" variant="ghost" size="icon" className="mb-5" aria-label={`Remove component ${i + 1}`} onClick={() => remove(i)}>
                <Trash2 />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={used.size >= components.length}
          onClick={() => append({ componentId: components.find((c) => !used.has(c.id))?.id ?? "", value: 0 })}
        >
          <Plus /> Add component
        </Button>
      </fieldset>
      <div className="bg-muted rounded-md px-3 py-2 text-sm" aria-live="polite">
        Monthly CTC {formatINR(Math.round((Number(ctc) || 0) / 12))} · Monthly gross earnings {formatINR(Math.round(monthlyEarnings))}. Statutory deductions (PF, ESI, PT, TDS) are computed during payroll.
      </div>
      <FormField label="Notes" htmlFor="ss-notes" error={e.notes?.message}>
        <Input {...form.register("notes")} />
      </FormField>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save new structure"}
      </Button>
    </form>
  );
}
