"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { humanize } from "@/lib/utils";
import { adminAttendanceSchema } from "@/lib/validation/attendance";
import { adminSetAttendanceAction } from "@/server/actions/attendance";

export function AdminEditDialog({
  employeeId,
  name,
  date,
  checkIn,
  checkOut,
  status,
}: {
  employeeId: string;
  name: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof adminAttendanceSchema>>({
    resolver: zodResolver(adminAttendanceSchema),
    defaultValues: {
      employeeId,
      date,
      status: (["PRESENT", "ABSENT", "HALF_DAY", "ON_LEAVE", "HOLIDAY", "WEEKLY_OFF"].includes(
        status,
      )
        ? status
        : "PRESENT") as "PRESENT",
      checkIn: checkIn ?? "",
      checkOut: checkOut ?? "",
      remarks: "",
    },
  });
  const { execute, pending } = useAction(adminSetAttendanceAction, {
    form,
    onSuccess: () => setOpen(false),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit attendance for ${name}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit attendance</DialogTitle>
          <DialogDescription>
            {name} · {date}. Changes are audited.
          </DialogDescription>
        </DialogHeader>
        <form
          id="adm-att"
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField label="Status" htmlFor="aa-status" error={e.status?.message}>
            <NativeSelect {...form.register("status")}>
              {["PRESENT", "HALF_DAY", "ABSENT", "ON_LEAVE", "HOLIDAY", "WEEKLY_OFF"].map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Check-in" htmlFor="aa-in" error={e.checkIn?.message}>
            <Input type="time" {...form.register("checkIn")} />
          </FormField>
          <FormField label="Check-out" htmlFor="aa-out" error={e.checkOut?.message}>
            <Input type="time" {...form.register("checkOut")} />
          </FormField>
          <FormField
            label="Remarks"
            htmlFor="aa-rem"
            required
            error={e.remarks?.message}
            className="sm:col-span-3"
          >
            <Input {...form.register("remarks")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="adm-att" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
