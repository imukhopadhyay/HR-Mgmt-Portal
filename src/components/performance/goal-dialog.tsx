"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { goalSchema } from "@/lib/validation/performance";
import { saveGoalAction } from "@/server/actions/performance";

type Values = z.input<typeof goalSchema>;

export function GoalDialog({
  employeeId,
  cycles,
  initial,
  type = "PERFORMANCE",
  label,
}: {
  employeeId: string;
  cycles: { id: string; name: string }[];
  initial?: Values;
  type?: "PERFORMANCE" | "DEVELOPMENT";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(goalSchema),
    defaultValues: initial ?? {
      employeeId,
      type,
      title: "",
      cycleId: type === "PERFORMANCE" ? (cycles[0]?.id ?? "") : "",
      weight: type === "PERFORMANCE" ? 20 : 0,
      progress: 0,
      status: "NOT_STARTED",
    },
  });
  const { execute, pending } = useAction(saveGoalAction, {
    form,
    onSuccess: () => {
      setOpen(false);
      if (!initial) form.reset();
    },
  });
  const e = form.formState.errors;
  const goalType = form.watch("type");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${initial.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus /> {label ?? (type === "DEVELOPMENT" ? "Add development goal" : "Add goal")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {initial
              ? "Update goal"
              : type === "DEVELOPMENT"
                ? "Development plan item"
                : "New goal"}
          </DialogTitle>
        </DialogHeader>
        <form
          id="goal-form"
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField
            label="Title"
            htmlFor="g-title"
            required
            error={e.title?.message}
            className="sm:col-span-3"
          >
            <Input {...form.register("title")} />
          </FormField>
          <FormField
            label="Description"
            htmlFor="g-desc"
            error={e.description?.message}
            className="sm:col-span-3"
          >
            <Textarea rows={2} {...form.register("description")} />
          </FormField>
          {goalType === "PERFORMANCE" && (
            <>
              <FormField label="Cycle" htmlFor="g-cycle" error={e.cycleId?.message}>
                <NativeSelect {...form.register("cycleId")}>
                  <option value="">— None —</option>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="KPI" htmlFor="g-kpi" error={e.kpi?.message}>
                <Input {...form.register("kpi")} />
              </FormField>
              <FormField label="Weight (%)" htmlFor="g-weight" error={e.weight?.message}>
                <Input type="number" min={0} max={100} {...form.register("weight")} />
              </FormField>
              <FormField label="Target" htmlFor="g-target" error={e.targetValue?.message}>
                <Input type="number" step="any" {...form.register("targetValue")} />
              </FormField>
              <FormField label="Current" htmlFor="g-current" error={e.currentValue?.message}>
                <Input type="number" step="any" {...form.register("currentValue")} />
              </FormField>
              <FormField label="Unit" htmlFor="g-unit" error={e.unit?.message}>
                <Input {...form.register("unit")} />
              </FormField>
            </>
          )}
          <FormField label="Progress (%)" htmlFor="g-progress" error={e.progress?.message}>
            <Input type="number" min={0} max={100} {...form.register("progress")} />
          </FormField>
          <FormField label="Status" htmlFor="g-status" error={e.status?.message}>
            <NativeSelect {...form.register("status")}>
              <option value="NOT_STARTED">Not started</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </NativeSelect>
          </FormField>
          <FormField label="Due date" htmlFor="g-due" error={e.dueDate?.message}>
            <Input type="date" {...form.register("dueDate")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="goal-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
