"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { useAction } from "@/hooks/use-action";
import { emergencyContactSchema } from "@/lib/validation/employee";
import {
  deleteEmergencyContactAction,
  saveEmergencyContactAction,
} from "@/server/actions/employees";

interface Contact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
}

export function EmergencyContacts({
  employeeId,
  contacts,
  canEdit,
}: {
  employeeId: string;
  contacts: Contact[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  return (
    <div className="grid gap-3">
      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-end"
          onClick={() => setEditing("new")}
        >
          <Plus /> Add contact
        </Button>
      )}
      {contacts.length === 0 && (
        <EmptyState
          icon={Phone}
          title="No emergency contacts"
          description="Add at least one person to contact in an emergency."
        />
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {contacts.map((c) => (
          <li key={c.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {c.name} {c.isPrimary && <Badge variant="info">Primary</Badge>}
                </p>
                <p className="text-muted-foreground text-sm">{c.relationship}</p>
                <p className="mt-1 text-sm">{c.phone}</p>
                {c.email && <p className="text-sm">{c.email}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => setEditing(c)}
                  >
                    <Pencil />
                  </Button>
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Remove ${c.name}`}>
                        <Trash2 />
                      </Button>
                    }
                    title="Remove contact?"
                    destructive
                    confirmLabel="Remove"
                    action={() => deleteEmergencyContactAction(c.id)}
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <ContactDialog
          employeeId={employeeId}
          contact={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ContactDialog({
  employeeId,
  contact,
  onClose,
}: {
  employeeId: string;
  contact: Contact | null;
  onClose: () => void;
}) {
  const form = useForm<z.input<typeof emergencyContactSchema>>({
    resolver: zodResolver(emergencyContactSchema),
    defaultValues: contact
      ? { ...contact, email: contact.email ?? "", employeeId }
      : { employeeId, name: "", relationship: "", phone: "", email: "", isPrimary: false },
  });
  const { execute, pending } = useAction(saveEmergencyContactAction, { form, onSuccess: onClose });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add emergency contact"}</DialogTitle>
        </DialogHeader>
        <form
          id="contact-form"
          className="grid gap-4"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField label="Name" htmlFor="ec-name" required error={e.name?.message}>
            <Input {...form.register("name")} />
          </FormField>
          <FormField label="Relationship" htmlFor="ec-rel" required error={e.relationship?.message}>
            <Input {...form.register("relationship")} />
          </FormField>
          <FormField label="Phone" htmlFor="ec-phone" required error={e.phone?.message}>
            <Input type="tel" {...form.register("phone")} />
          </FormField>
          <FormField label="Email" htmlFor="ec-email" error={e.email?.message}>
            <Input type="email" {...form.register("email")} />
          </FormField>
          <div className="flex items-center gap-2">
            <Checkbox
              id="ec-primary"
              defaultChecked={contact?.isPrimary}
              onCheckedChange={(v) => form.setValue("isPrimary", v === true)}
            />
            <Label htmlFor="ec-primary">Primary contact</Label>
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="contact-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
