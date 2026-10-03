"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Pencil, Plus, Star, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { humanize } from "@/lib/utils";
import { completionSchema, skillSchema, trainingFeedbackSchema, trainingSchema } from "@/lib/validation/training";
import { enrollEmployeesAction, recordCompletionAction, saveSkillAction, saveTrainingAction, trainingFeedbackAction } from "@/server/actions/training";

type TValues = z.input<typeof trainingSchema>;

export function TrainingDialog({ initial }: { initial?: TValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<TValues>({ resolver: zodResolver(trainingSchema), defaultValues: initial ?? { title: "", category: "", mode: "VIRTUAL", startDate: "", endDate: "", providesCertification: false, status: "PLANNED" } });
  const { execute, pending } = useAction(saveTrainingAction, { form, onSuccess: (r) => { setOpen(false); if (!initial) router.push(`/training/${r.id}`); } });
  const e = form.formState.errors;
  const t = (n: keyof TValues, l: string, type = "text", required = false, cls = "") => (
    <FormField label={l} htmlFor={`tr-${n}`} required={required} error={e[n]?.message} className={cls}>
      <Input type={type} {...form.register(n)} />
    </FormField>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="outline">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <Plus /> New programme
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit programme" : "New training programme"}</DialogTitle>
        </DialogHeader>
        <form id="tr-form" className="grid gap-4 sm:grid-cols-3" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          {t("title", "Title", "text", true, "sm:col-span-2")}
          {t("category", "Category", "text", true)}
          {t("trainer", "Trainer / provider")}
          <FormField label="Mode" htmlFor="tr-mode">
            <NativeSelect {...form.register("mode")}>
              <option value="VIRTUAL">Virtual</option>
              <option value="CLASSROOM">Classroom</option>
              <option value="SELF_PACED">Self-paced</option>
            </NativeSelect>
          </FormField>
          {t("location", "Location / link")}
          {t("startDate", "Start date", "date", true)}
          {t("endDate", "End date", "date", true)}
          {t("capacity", "Capacity", "number")}
          {t("skill", "Skill recorded on completion")}
          <FormField label="Status" htmlFor="tr-status">
            <NativeSelect {...form.register("status")}>
              {["PLANNED", "ONGOING", "COMPLETED", "CANCELLED"].map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className="flex items-center gap-2 self-end pb-2">
            <Checkbox id="tr-cert" defaultChecked={!!initial?.providesCertification} onCheckedChange={(v) => form.setValue("providesCertification", v === true)} />
            <Label htmlFor="tr-cert">Issues certificate</Label>
          </div>
          <FormField label="Description" htmlFor="tr-desc" error={e.description?.message} className="sm:col-span-3">
            <Textarea rows={4} {...form.register("description")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="tr-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EnrollDialog({ trainingId, employees }: { trainingId: string; employees: { id: string; label: string; dept: string }[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const { execute, pending } = useAction(enrollEmployeesAction, { onSuccess: () => { setOpen(false); setSelected([]); } });
  const shown = employees.filter((e) => `${e.label} ${e.dept}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus /> Enrol employees
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enrol employees</DialogTitle>
        </DialogHeader>
        <Input aria-label="Filter employees" placeholder="Filter by name or department" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
          {shown.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-3 py-2">
              <Checkbox id={`en-${e.id}`} checked={selected.includes(e.id)} onCheckedChange={(v) => setSelected((s) => (v === true ? [...s, e.id] : s.filter((x) => x !== e.id)))} />
              <Label htmlFor={`en-${e.id}`} className="flex-1 font-normal">
                {e.label} <span className="text-muted-foreground text-xs">· {e.dept}</span>
              </Label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button disabled={pending || selected.length === 0} onClick={() => execute({ trainingId, employeeIds: selected })}>
            {pending ? "Enrolling…" : `Enrol ${selected.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompletionDialog({ name, initial }: { name: string; initial: z.input<typeof completionSchema> }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof completionSchema>>({ resolver: zodResolver(completionSchema), defaultValues: initial });
  const { execute, pending } = useAction(recordCompletionAction, { form, onSuccess: () => setOpen(false) });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Record attendance for ${name}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attendance & completion — {name}</DialogTitle>
        </DialogHeader>
        <form id="cmp-form" className="grid gap-4 sm:grid-cols-3" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField label="Status" htmlFor="cmp-status">
            <NativeSelect {...form.register("status")}>
              {["ENROLLED", "ATTENDED", "COMPLETED", "NO_SHOW", "CANCELLED"].map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Attendance %" htmlFor="cmp-att" error={e.attendancePercent?.message}>
            <Input type="number" min={0} max={100} {...form.register("attendancePercent")} />
          </FormField>
          <FormField label="Assessment score" htmlFor="cmp-score" error={e.score?.message}>
            <Input type="number" min={0} max={100} {...form.register("score")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="cmp-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TrainingFeedbackDialog({ enrollmentId, title }: { enrollmentId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof trainingFeedbackSchema>>({ resolver: zodResolver(trainingFeedbackSchema), defaultValues: { enrollmentId, rating: 4, feedback: "" } });
  const { execute, pending } = useAction(trainingFeedbackAction, { form, onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Star /> Rate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How effective was “{title}”?</DialogTitle>
        </DialogHeader>
        <form id="tf-form" className="grid gap-4" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField label="Rating" htmlFor="tf-rating">
            <NativeSelect {...form.register("rating")}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Comments" htmlFor="tf-text">
            <Textarea rows={4} {...form.register("feedback")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="tf-form" disabled={pending}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SkillForm() {
  const form = useForm<z.input<typeof skillSchema>>({ resolver: zodResolver(skillSchema), defaultValues: { name: "", level: 3 } });
  const { execute, pending } = useAction(saveSkillAction, { form, onSuccess: () => form.reset() });
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
      <FormField label="Skill" htmlFor="sk-name" error={form.formState.errors.name?.message}>
        <Input {...form.register("name")} />
      </FormField>
      <FormField label="Level" htmlFor="sk-level">
        <NativeSelect {...form.register("level")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} — {["Beginner", "Basic", "Proficient", "Advanced", "Expert"][n - 1]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <Button type="submit" variant="outline" disabled={pending}>
        Add skill
      </Button>
    </form>
  );
}
