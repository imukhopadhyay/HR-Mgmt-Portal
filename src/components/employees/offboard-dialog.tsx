"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { LogOut } from "lucide-react";
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
import { offboardSchema } from "@/lib/validation/employee";
import { initiateOffboardingAction } from "@/server/actions/employees";

export function OffboardDialog({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof offboardSchema>>({
    resolver: zodResolver(offboardSchema),
    defaultValues: { employeeId, exitDate: "", exitReason: "" },
  });
  const { execute, pending } = useAction(initiateOffboardingAction, {
    form,
    onSuccess: () => setOpen(false),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          <LogOut /> Start offboarding
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start offboarding</DialogTitle>
          <DialogDescription>
            Marks the employee as on notice and creates the offboarding checklist. Access is revoked
            when the exit is completed.
          </DialogDescription>
        </DialogHeader>
        <form
          id="offboard-form"
          className="grid gap-4"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField
            label="Last working day"
            htmlFor="exitDate"
            required
            error={e.exitDate?.message}
          >
            <Input type="date" {...form.register("exitDate")} />
          </FormField>
          <FormField label="Reason" htmlFor="exitReason" required error={e.exitReason?.message}>
            <Textarea rows={3} {...form.register("exitReason")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="offboard-form" variant="destructive" disabled={pending}>
            {pending ? "Saving…" : "Start offboarding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
