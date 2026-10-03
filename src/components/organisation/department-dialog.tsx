"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { departmentSchema, designationSchema } from "@/lib/validation/organisation";
import { saveDepartmentAction, saveDesignationAction } from "@/server/actions/organisation";

type Opt = { id: string; label: string };

export function DepartmentDialog({ initial, departments, employees }: { initial?: z.input<typeof departmentSchema>; departments: Opt[]; employees: Opt[] }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof departmentSchema>>({ resolver: zodResolver(departmentSchema), defaultValues: initial ?? { code: "", name: "" } });
  const { execute, pending } = useAction(saveDepartmentAction, { form, onSuccess: () => setOpen(false) });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="outline" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <Plus /> New department
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit department" : "New department"}</DialogTitle>
        </DialogHeader>
        <form id="dept-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField label="Code" htmlFor="d-code" required error={e.code?.message}>
            <Input {...form.register("code")} />
          </FormField>
          <FormField label="Name" htmlFor="d-name" required error={e.name?.message}>
            <Input {...form.register("name")} />
          </FormField>
          <FormField label="Parent department" htmlFor="d-parent" error={e.parentId?.message}>
            <NativeSelect {...form.register("parentId")}>
              <option value="">— None —</option>
              {departments.filter((d) => d.id !== initial?.id).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Department head" htmlFor="d-head" error={e.headId?.message}>
            <NativeSelect {...form.register("headId")}>
              <option value="">— None —</option>
              {employees.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Cost centre" htmlFor="d-cc" error={e.costCenter?.message}>
            <Input {...form.register("costCenter")} />
          </FormField>
          <FormField label="Description" htmlFor="d-desc" error={e.description?.message} className="sm:col-span-2">
            <Textarea rows={3} {...form.register("description")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="dept-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DesignationDialog({ initial, departments }: { initial?: z.input<typeof designationSchema>; departments: Opt[] }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof designationSchema>>({ resolver: zodResolver(designationSchema), defaultValues: initial ?? { title: "", level: 1 } });
  const { execute, pending } = useAction(saveDesignationAction, { form, onSuccess: () => setOpen(false) });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${initial.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus /> New designation
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit designation" : "New designation"}</DialogTitle>
        </DialogHeader>
        <form id="desig-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField label="Title" htmlFor="g-title" required error={e.title?.message} className="sm:col-span-2">
            <Input {...form.register("title")} />
          </FormField>
          <FormField label="Job level (1–10)" htmlFor="g-level" required error={e.level?.message}>
            <Input type="number" min={1} max={10} {...form.register("level")} />
          </FormField>
          <FormField label="Grade" htmlFor="g-grade" error={e.grade?.message}>
            <Input {...form.register("grade")} />
          </FormField>
          <FormField label="Department" htmlFor="g-dept" error={e.departmentId?.message} className="sm:col-span-2">
            <NativeSelect {...form.register("departmentId")}>
              <option value="">— Any —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="desig-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
