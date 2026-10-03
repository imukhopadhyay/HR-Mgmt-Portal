"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { LifeBuoy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { humanize } from "@/lib/utils";
import { TICKET_CATEGORIES, ticketSchema, ticketUpdateSchema } from "@/lib/validation/self-service";
import { createTicketAction, updateTicketAction } from "@/server/actions/self-service";

export function NewTicketDialog() {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof ticketSchema>>({ resolver: zodResolver(ticketSchema), defaultValues: { category: "Other", subject: "", description: "", priority: "MEDIUM" } });
  const { execute, pending } = useAction(createTicketAction, { form, onSuccess: () => { setOpen(false); form.reset(); } });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <LifeBuoy /> New request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise an HR request</DialogTitle>
          <DialogDescription>Don&apos;t include passwords or bank PINs. HR will respond here and by email.</DialogDescription>
        </DialogHeader>
        <form id="ticket-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField label="Category" htmlFor="t-cat" error={e.category?.message}>
            <NativeSelect {...form.register("category")}>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Priority" htmlFor="t-prio" error={e.priority?.message}>
            <NativeSelect {...form.register("priority")}>
              {["LOW", "MEDIUM", "HIGH"].map((p) => (
                <option key={p} value={p}>
                  {humanize(p)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Subject" htmlFor="t-subj" required error={e.subject?.message} className="sm:col-span-2">
            <Input {...form.register("subject")} />
          </FormField>
          <FormField label="Details" htmlFor="t-desc" required error={e.description?.message} className="sm:col-span-2">
            <Textarea rows={5} {...form.register("description")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="ticket-form" disabled={pending}>
            {pending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UpdateTicketDialog({ ticket, agents }: { ticket: { id: string; status: string; assigneeId: string | null; resolution: string | null; subject: string }; agents: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof ticketUpdateSchema>>({
    resolver: zodResolver(ticketUpdateSchema),
    defaultValues: { id: ticket.id, status: ticket.status as "OPEN", assigneeId: ticket.assigneeId ?? "", resolution: ticket.resolution ?? "" },
  });
  const { execute, pending } = useAction(updateTicketAction, { form, onSuccess: () => setOpen(false) });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Update ${ticket.subject}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update request</DialogTitle>
          <DialogDescription>{ticket.subject}</DialogDescription>
        </DialogHeader>
        <form id="tu-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField label="Status" htmlFor="tu-status" error={e.status?.message}>
            <NativeSelect {...form.register("status")}>
              {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Assignee" htmlFor="tu-assignee" error={e.assigneeId?.message}>
            <NativeSelect {...form.register("assigneeId")}>
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Resolution / response" htmlFor="tu-res" error={e.resolution?.message} className="sm:col-span-2">
            <Textarea rows={4} {...form.register("resolution")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="tu-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
