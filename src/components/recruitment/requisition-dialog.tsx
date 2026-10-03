"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { humanize } from "@/lib/utils";
import { requisitionSchema } from "@/lib/validation/recruitment";
import { saveRequisitionAction } from "@/server/actions/recruitment";
import type { EmployeeFormOptions } from "@/components/employees/employee-form";

type Values = z.input<typeof requisitionSchema>;

export function RequisitionDialog({
  options,
  initial,
}: {
  options: EmployeeFormOptions;
  initial?: Values;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(requisitionSchema),
    defaultValues: initial ?? {
      title: "",
      openings: 1,
      employmentType: "FULL_TIME",
      description: "",
      submit: true,
    },
  });
  const { execute, pending } = useAction(saveRequisitionAction, {
    form,
    onSuccess: (r) => {
      setOpen(false);
      if (!initial) router.push(`/recruitment/${r.id}`);
    },
  });
  const e = form.formState.errors;
  const sel = (
    name: "departmentId" | "designationId" | "hiringManagerId",
    label: string,
    opts: { id: string; label: string }[],
  ) => (
    <FormField label={label} htmlFor={`rq-${name}`} error={e[name]?.message}>
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
  const submit = (asDraft: boolean) =>
    form.handleSubmit((v) => execute({ ...v, submit: !asDraft }))();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="outline">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <Plus /> New requisition
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit requisition" : "New job requisition"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(ev) => ev.preventDefault()}
          noValidate
        >
          <FormField
            label="Job title"
            htmlFor="rq-title"
            required
            error={e.title?.message}
            className="sm:col-span-2"
          >
            <Input {...form.register("title")} />
          </FormField>
          <FormField label="Openings" htmlFor="rq-open" error={e.openings?.message}>
            <Input type="number" min={1} {...form.register("openings")} />
          </FormField>
          {sel("departmentId", "Department", options.departments)}
          {sel("designationId", "Designation", options.designations)}
          {sel("hiringManagerId", "Hiring manager", options.managers)}
          <FormField label="Employment type" htmlFor="rq-type" error={e.employmentType?.message}>
            <NativeSelect {...form.register("employmentType")}>
              {["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"].map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Location" htmlFor="rq-loc" error={e.location?.message}>
            <Input {...form.register("location")} />
          </FormField>
          <FormField label="Target date" htmlFor="rq-target" error={e.targetDate?.message}>
            <Input type="date" {...form.register("targetDate")} />
          </FormField>
          <FormField
            label="Min experience (yrs)"
            htmlFor="rq-minx"
            error={e.minExperience?.message}
          >
            <Input type="number" min={0} {...form.register("minExperience")} />
          </FormField>
          <FormField
            label="Max experience (yrs)"
            htmlFor="rq-maxx"
            error={e.maxExperience?.message}
          >
            <Input type="number" min={0} {...form.register("maxExperience")} />
          </FormField>
          <div />
          <FormField label="Budget min (₹ CTC)" htmlFor="rq-bmin" error={e.budgetMin?.message}>
            <Input type="number" min={0} step="10000" {...form.register("budgetMin")} />
          </FormField>
          <FormField label="Budget max (₹ CTC)" htmlFor="rq-bmax" error={e.budgetMax?.message}>
            <Input type="number" min={0} step="10000" {...form.register("budgetMax")} />
          </FormField>
          <div />
          <FormField
            label="Job description"
            htmlFor="rq-desc"
            required
            error={e.description?.message}
            className="sm:col-span-3"
          >
            <Textarea rows={6} {...form.register("description")} />
          </FormField>
        </form>
        <DialogFooter>
          {!initial && (
            <Button variant="outline" disabled={pending} onClick={() => submit(true)}>
              Save draft
            </Button>
          )}
          <Button disabled={pending} onClick={() => submit(false)}>
            {pending ? "Saving…" : initial ? "Save" : "Submit for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
