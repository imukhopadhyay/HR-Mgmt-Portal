"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { useAction } from "@/hooks/use-action";
import { retentionSchema } from "@/lib/validation/settings";
import { saveRetentionPolicyAction } from "@/server/actions/settings";
import { runRetentionAction } from "@/server/actions/privacy";

type Values = z.input<typeof retentionSchema>;

export function RetentionForm({ initial }: { initial: Values }) {
  const form = useForm<Values>({ resolver: zodResolver(retentionSchema), defaultValues: initial });
  const { execute, pending } = useAction(saveRetentionPolicyAction, { form });
  const [preview, setPreview] = useState<string | null>(null);
  const dry = useAction(runRetentionAction, { successMessage: "Dry run complete", refresh: false, onSuccess: (r) => setPreview(JSON.stringify(r, null, 2)) });
  const e = form.formState.errors;
  const f = (name: keyof Values, label: string) => (
    <FormField label={label} htmlFor={`ret-${name}`} error={e[name]?.message}>
      <Input type="number" {...form.register(name)} />
    </FormField>
  );
  return (
    <div className="grid gap-6">
      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
        {f("exitedEmployeeYears", "Anonymise ex-employees after (years)")}
        {f("rejectedCandidateMonths", "Purge rejected candidates after (months)")}
        {f("notificationDays", "Delete read notifications after (days)")}
        {f("securityTokenDays", "Delete expired tokens after (days)")}
        {f("auditLogYears", "Audit retention (years, archive only)")}
        <div className="sm:col-span-2 lg:col-span-5">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save policy"}
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => dry.execute(true)} disabled={dry.pending}>
          Preview (dry run)
        </Button>
        <ConfirmAction trigger={<Button variant="destructive">Apply retention now</Button>} title="Apply retention policy now?" description="Anonymisation and deletions cannot be undone. Run a dry run first." destructive confirmLabel="Apply" action={runRetentionAction.bind(null, false)} />
      </div>
      {preview && <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">{preview}</pre>}
    </div>
  );
}
