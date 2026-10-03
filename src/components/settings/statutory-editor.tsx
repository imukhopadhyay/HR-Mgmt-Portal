"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAction } from "@/hooks/use-action";
import { saveStatutoryConfigAction } from "@/server/actions/settings";

export function StatutoryEditor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const { execute, pending } = useAction(saveStatutoryConfigAction);
  async function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setError("Invalid JSON.");
      return;
    }
    setError(null);
    const res = await execute(parsed);
    if (!res.ok) setError(Object.entries(res.fieldErrors ?? {}).map(([k, v]) => `${k}: ${v?.join(", ")}`).join("; ") || res.error);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit rules</CardTitle>
        <CardDescription>Structured JSON, validated on save. Changes apply to payroll runs processed afterwards and are audited.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Label htmlFor="statutory-json" className="sr-only">
          Statutory configuration JSON
        </Label>
        <Textarea id="statutory-json" value={value} onChange={(e) => setValue(e.target.value)} rows={18} className="font-mono text-xs" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? "statutory-error" : undefined} />
        {error && (
          <p id="statutory-error" role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save rules"}
          </Button>
          <Button variant="outline" onClick={() => setValue(initial)}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
