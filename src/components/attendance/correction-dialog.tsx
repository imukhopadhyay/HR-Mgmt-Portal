"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ClockAlert } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { correctionSchema } from "@/lib/validation/attendance";
import { requestCorrectionAction } from "@/server/actions/attendance";

export function CorrectionDialog({ maxDate }: { maxDate: string }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof correctionSchema>>({
    resolver: zodResolver(correctionSchema),
    defaultValues: { date: "", checkIn: "09:30", checkOut: "18:30", reason: "" },
  });
  const { execute, pending } = useAction(requestCorrectionAction, {
    form,
    onSuccess: () => {
      setOpen(false);
      form.reset();
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ClockAlert /> Request correction
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attendance correction</DialogTitle>
          <DialogDescription>
            For missed or incorrect punches in the last 45 days. Your manager will review the
            request.
          </DialogDescription>
        </DialogHeader>
        <form
          id="corr-form"
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField label="Date" htmlFor="c-date" required error={e.date?.message}>
            <Input type="date" max={maxDate} {...form.register("date")} />
          </FormField>
          <FormField label="Check-in" htmlFor="c-in" required error={e.checkIn?.message}>
            <Input type="time" {...form.register("checkIn")} />
          </FormField>
          <FormField label="Check-out" htmlFor="c-out" required error={e.checkOut?.message}>
            <Input type="time" {...form.register("checkOut")} />
          </FormField>
          <FormField
            label="Reason"
            htmlFor="c-reason"
            required
            error={e.reason?.message}
            className="sm:col-span-3"
          >
            <Textarea rows={3} {...form.register("reason")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="corr-form" disabled={pending}>
            {pending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
