"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { FilePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { profileUpdateSchema } from "@/lib/validation/self-service";
import { submitProfileUpdateAction } from "@/server/actions/self-service";

type Values = z.input<typeof profileUpdateSchema>;
type Current = { phone: string | null; personalEmail: string | null; addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null };

export function ProfileUpdateRequestDialog({ employee }: { employee: Current }) {
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: Object.fromEntries(Object.entries(employee).map(([k, v]) => [k, v ?? ""])) as Values,
  });
  const { execute, pending } = useAction(submitProfileUpdateAction, { form, onSuccess: () => setOpen(false) });
  const e = form.formState.errors;
  const field = (name: keyof Values, label: string, type = "text") => (
    <FormField label={label} htmlFor={`pu-${name}`} error={e[name]?.message}>
      <Input type={type} {...form.register(name)} />
    </FormField>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FilePen /> Request profile update
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Request profile update</DialogTitle>
          <DialogDescription>HR reviews changes to your contact details before they are applied.</DialogDescription>
        </DialogHeader>
        <form id="pu-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          {field("phone", "Phone", "tel")}
          {field("personalEmail", "Personal email", "email")}
          {field("addressLine1", "Address line 1")}
          {field("addressLine2", "Address line 2")}
          {field("city", "City")}
          {field("state", "State")}
          {field("postalCode", "Postal code")}
          {field("reason", "Reason (optional)")}
        </form>
        <DialogFooter>
          <Button type="submit" form="pu-form" disabled={pending}>
            {pending ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
