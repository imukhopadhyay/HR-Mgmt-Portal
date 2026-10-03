"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/hooks/use-action";
import { createRunAction } from "@/server/actions/payroll";

export function NewRunForm({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const { execute, pending } = useAction(createRunAction, { onSuccess: (r) => router.push(`/payroll/${r.id}`) });
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const [y, m] = month.split("-").map(Number);
        execute({ year: y, month: m });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="run-month">Payroll month</Label>
        <Input id="run-month" type="month" value={month} max={defaultMonth} onChange={(e) => setMonth(e.target.value)} className="w-44" />
      </div>
      <Button type="submit" disabled={pending || !month}>
        <Plus /> {pending ? "Creating…" : "New payroll run"}
      </Button>
    </form>
  );
}
