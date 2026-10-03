"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAction } from "@/hooks/use-action";
import { toggleChecklistAction } from "@/server/actions/employees";

export interface ChecklistRow {
  id: string;
  title: string;
  category: string;
  owner: string;
  dueDate: string | null;
  completedAt: string | null;
  canToggle: boolean;
}

export function Checklist({ title, items }: { title: string; items: ChecklistRow[] }) {
  const { execute, pending } = useAction(toggleChecklistAction);
  const done = items.filter((i) => i.completedAt).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  return (
    <section className="grid gap-3" aria-label={title}>
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-medium">{title}</h3>
        <span className="text-muted-foreground text-sm">
          {done}/{items.length} done
        </span>
      </div>
      <Progress value={pct} aria-label={`${title} progress`} />
      <ul className="divide-y rounded-lg border">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-3 p-3">
            <Checkbox
              id={`cl-${i.id}`}
              checked={!!i.completedAt}
              disabled={!i.canToggle || pending}
              onCheckedChange={(v) => execute({ id: i.id, done: v === true })}
              className="mt-0.5"
            />
            <label htmlFor={`cl-${i.id}`} className="grid flex-1 gap-0.5">
              <span className={i.completedAt ? "text-muted-foreground line-through" : ""}>{i.title}</span>
              <span className="text-muted-foreground text-xs">
                {i.category}
                {i.dueDate && ` · due ${new Date(i.dueDate).toLocaleDateString("en-IN", { timeZone: "UTC" })}`}
              </span>
            </label>
            <Badge variant="outline">{i.owner}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
