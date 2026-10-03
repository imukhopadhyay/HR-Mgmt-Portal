"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { holidaySchema, shiftSchema } from "@/lib/validation/attendance";
import { saveHolidayAction, saveShiftAction } from "@/server/actions/attendance";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ShiftDialog({ initial }: { initial?: z.input<typeof shiftSchema> }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof shiftSchema>>({
    resolver: zodResolver(shiftSchema),
    defaultValues: initial ?? { name: "", startTime: "09:30", endTime: "18:30", graceMinutes: 15, fullDayMinutes: 450, halfDayMinutes: 240, weeklyOffs: [0, 6], isDefault: false },
  });
  const { execute, pending } = useAction(saveShiftAction, { form, onSuccess: () => setOpen(false) });
  const e = form.formState.errors;
  const offs = form.watch("weeklyOffs") as number[];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${initial.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus /> New shift
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit shift" : "New shift"}</DialogTitle>
        </DialogHeader>
        <form id="shift-form" className="grid gap-4 sm:grid-cols-3" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField label="Name" htmlFor="s-name" required error={e.name?.message} className="sm:col-span-3">
            <Input {...form.register("name")} />
          </FormField>
          <FormField label="Start" htmlFor="s-start" error={e.startTime?.message}>
            <Input type="time" {...form.register("startTime")} />
          </FormField>
          <FormField label="End" htmlFor="s-end" error={e.endTime?.message}>
            <Input type="time" {...form.register("endTime")} />
          </FormField>
          <FormField label="Grace (min)" htmlFor="s-grace" error={e.graceMinutes?.message}>
            <Input type="number" {...form.register("graceMinutes")} />
          </FormField>
          <FormField label="Full day (min worked)" htmlFor="s-full" error={e.fullDayMinutes?.message}>
            <Input type="number" {...form.register("fullDayMinutes")} />
          </FormField>
          <FormField label="Half day (min worked)" htmlFor="s-half" error={e.halfDayMinutes?.message}>
            <Input type="number" {...form.register("halfDayMinutes")} />
          </FormField>
          <fieldset className="sm:col-span-3">
            <legend className="mb-2 text-sm font-medium">Weekly offs</legend>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((d, i) => (
                <div key={d} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`s-off-${i}`}
                    checked={offs.includes(i)}
                    onCheckedChange={(v) => form.setValue("weeklyOffs", v === true ? [...offs, i].sort() : offs.filter((x) => x !== i))}
                  />
                  <Label htmlFor={`s-off-${i}`}>{d}</Label>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center gap-2 sm:col-span-3">
            <Checkbox id="s-default" defaultChecked={!!initial?.isDefault} onCheckedChange={(v) => form.setValue("isDefault", v === true)} />
            <Label htmlFor="s-default">Default shift for new employees</Label>
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="shift-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HolidayDialog({ initial }: { initial?: z.input<typeof holidaySchema> }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof holidaySchema>>({ resolver: zodResolver(holidaySchema), defaultValues: initial ?? { name: "", date: "", type: "PUBLIC", location: "" } });
  const { execute, pending } = useAction(saveHolidayAction, { form, onSuccess: () => { setOpen(false); if (!initial) form.reset(); } });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${initial.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus /> Add holiday
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit holiday" : "Add holiday"}</DialogTitle>
        </DialogHeader>
        <form id="hol-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField label="Name" htmlFor="h-name" required error={e.name?.message} className="sm:col-span-2">
            <Input {...form.register("name")} />
          </FormField>
          <FormField label="Date" htmlFor="h-date" required error={e.date?.message}>
            <Input type="date" {...form.register("date")} />
          </FormField>
          <FormField label="Type" htmlFor="h-type" error={e.type?.message} hint="Only public holidays are excluded from leave and attendance">
            <NativeSelect {...form.register("type")}>
              <option value="PUBLIC">Public</option>
              <option value="OPTIONAL">Optional</option>
              <option value="RESTRICTED">Restricted</option>
            </NativeSelect>
          </FormField>
          <FormField label="Location (blank = all)" htmlFor="h-loc" error={e.location?.message} className="sm:col-span-2">
            <Input {...form.register("location")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="hol-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
