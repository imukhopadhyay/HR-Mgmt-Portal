"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { CalendarPlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { leaveApplySchema } from "@/lib/validation/leave";
import type { ActionResult } from "@/lib/action";
import { applyLeaveAction, modifyLeaveAction, previewLeaveDaysAction } from "@/server/actions/leave";

export interface LeaveTypeOption {
  id: string;
  name: string;
  code: string;
  available: number;
  allowHalfDay: boolean;
  allowNegativeBalance: boolean;
  minNoticeDays: number;
  documentRequiredAfterDays: number | null;
}

type Values = z.input<typeof leaveApplySchema>;

export function ApplyLeaveDialog({ types, existing }: { types: LeaveTypeOption[]; existing?: Values & { id: string } }) {
  const params = useSearchParams();
  const [open, setOpen] = useState(!existing && params.get("apply") === "1");
  const [days, setDays] = useState<number | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(leaveApplySchema),
    defaultValues: existing ?? { leaveTypeId: types[0]?.id ?? "", startDate: "", endDate: "", halfDay: "", reason: "" },
  });
  const action = async (v: Values): Promise<ActionResult<unknown>> => (existing ? modifyLeaveAction({ ...v, id: existing.id }) : applyLeaveAction(v));
  const { execute, pending } = useAction(action, { form, onSuccess: () => { setOpen(false); if (!existing) form.reset(); } });
  const [typeId, start, end, half] = useWatch({ control: form.control, name: ["leaveTypeId", "startDate", "endDate", "halfDay"] });
  const type = types.find((t) => t.id === typeId);

  useEffect(() => {
    if (!start || !end || end < start) return setDays(null);
    let cancelled = false;
    previewLeaveDaysAction({ startDate: start, endDate: end, halfDay: !!half }).then((r) => {
      if (!cancelled) setDays(r.ok ? r.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [start, end, half]);

  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <Button variant="ghost" size="icon" aria-label="Edit request">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <CalendarPlus /> Apply for leave
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Modify leave request" : "Apply for leave"}</DialogTitle>
          <DialogDescription>Weekly-offs and public holidays are not counted.</DialogDescription>
        </DialogHeader>
        <form id="leave-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField label="Leave type" htmlFor="lv-type" required error={e.leaveTypeId?.message} className="sm:col-span-2">
            <NativeSelect {...form.register("leaveTypeId")}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.allowNegativeBalance ? "no balance limit" : `${t.available} day(s) available`}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="From" htmlFor="lv-start" required error={e.startDate?.message}>
            <Input
              type="date"
              {...form.register("startDate", {
                onChange: (ev) => {
                  if (!form.getValues("endDate") || form.getValues("endDate") < ev.target.value) form.setValue("endDate", ev.target.value);
                },
              })}
            />
          </FormField>
          <FormField label="To" htmlFor="lv-end" required error={e.endDate?.message}>
            <Input type="date" min={start || undefined} {...form.register("endDate")} />
          </FormField>
          {type?.allowHalfDay && start && start === end && (
            <FormField label="Half day" htmlFor="lv-half" error={e.halfDay?.message} className="sm:col-span-2">
              <NativeSelect {...form.register("halfDay")}>
                <option value="">Full day</option>
                <option value="FIRST_HALF">First half</option>
                <option value="SECOND_HALF">Second half</option>
              </NativeSelect>
            </FormField>
          )}
          <FormField label="Reason" htmlFor="lv-reason" required error={e.reason?.message} className="sm:col-span-2">
            <Textarea rows={3} {...form.register("reason")} />
          </FormField>
          <div className="bg-muted rounded-md px-3 py-2 text-sm sm:col-span-2" aria-live="polite">
            {days === null ? "Select dates to see the number of leave days." : <>This request uses <strong>{days}</strong> day(s).</>}
            {type && type.minNoticeDays > 0 && <span className="text-muted-foreground block text-xs">Requires {type.minNoticeDays} day(s) notice.</span>}
            {type?.documentRequiredAfterDays && days !== null && days > type.documentRequiredAfterDays && (
              <span className="block text-xs text-amber-700 dark:text-amber-400">Upload a supporting document (e.g. medical certificate) to your profile.</span>
            )}
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="leave-form" disabled={pending}>
            {pending ? "Submitting…" : existing ? "Resubmit" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
