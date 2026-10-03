"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus } from "lucide-react";
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
import { FormField } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { cycleSchema } from "@/lib/validation/performance";
import { saveCycleAction } from "@/server/actions/performance";

export function CycleDialog() {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof cycleSchema>>({
    resolver: zodResolver(cycleSchema),
    defaultValues: {
      name: "",
      startDate: "",
      endDate: "",
      selfReviewDue: "",
      managerReviewDue: "",
    },
  });
  const { execute, pending } = useAction(saveCycleAction, {
    form,
    onSuccess: () => {
      setOpen(false);
      form.reset();
    },
  });
  const e = form.formState.errors;
  const f = (n: keyof z.input<typeof cycleSchema>, l: string, t = "date") => (
    <FormField label={l} htmlFor={`cy-${n}`} required error={e[n]?.message}>
      <Input type={t} {...form.register(n)} />
    </FormField>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New cycle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New performance cycle</DialogTitle>
        </DialogHeader>
        <form
          id="cy-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <div className="sm:col-span-2">{f("name", "Name", "text")}</div>
          {f("startDate", "Period start")}
          {f("endDate", "Period end")}
          {f("selfReviewDue", "Self review due")}
          {f("managerReviewDue", "Manager review due")}
        </form>
        <DialogFooter>
          <Button type="submit" form="cy-form" disabled={pending}>
            {pending ? "Saving…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
