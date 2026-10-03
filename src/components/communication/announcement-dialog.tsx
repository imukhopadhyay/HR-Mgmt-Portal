"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Megaphone, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { announcementSchema } from "@/lib/validation/announcement";
import { saveAnnouncementAction } from "@/server/actions/announcements";

type Values = z.input<typeof announcementSchema>;

export function AnnouncementDialog({ departments, initial }: { departments: { id: string; name: string }[]; initial?: Values }) {
  const params = useSearchParams();
  const [open, setOpen] = useState(!initial && params.get("new") === "1");
  const form = useForm<Values>({ resolver: zodResolver(announcementSchema), defaultValues: initial ?? { title: "", body: "", priority: "NORMAL", departmentId: "", expiresAt: "", notify: true } });
  const { execute, pending } = useAction(saveAnnouncementAction, { form, onSuccess: () => { setOpen(false); if (!initial) form.reset(); } });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon" aria-label="Edit announcement">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Megaphone /> New announcement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit announcement" : "New announcement"}</DialogTitle>
        </DialogHeader>
        <form id="ann-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField label="Title" htmlFor="a-title" required error={e.title?.message} className="sm:col-span-2">
            <Input {...form.register("title")} />
          </FormField>
          <FormField label="Message" htmlFor="a-body" required error={e.body?.message} className="sm:col-span-2">
            <Textarea rows={6} {...form.register("body")} />
          </FormField>
          <FormField label="Priority" htmlFor="a-prio" error={e.priority?.message}>
            <NativeSelect {...form.register("priority")}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High (also emailed)</option>
            </NativeSelect>
          </FormField>
          <FormField label="Audience" htmlFor="a-dept" error={e.departmentId?.message}>
            <NativeSelect {...form.register("departmentId")}>
              <option value="">Entire organisation</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Expires on" htmlFor="a-exp" error={e.expiresAt?.message}>
            <Input type="date" {...form.register("expiresAt")} />
          </FormField>
          {!initial && (
            <div className="flex items-center gap-2 self-end pb-2">
              <Checkbox id="a-notify" defaultChecked onCheckedChange={(v) => form.setValue("notify", v === true)} />
              <Label htmlFor="a-notify">Notify recipients</Label>
            </div>
          )}
        </form>
        <DialogFooter>
          <Button type="submit" form="ann-form" disabled={pending}>
            {pending ? "Publishing…" : initial ? "Save" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
