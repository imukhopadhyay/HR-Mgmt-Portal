"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAction } from "@/hooks/use-action";
import { setUserRolesAction } from "@/server/actions/admin";

export function RoleEditor({
  userId,
  email,
  current,
  roles,
}: {
  userId: string;
  email: string;
  current: string[];
  roles: { key: string; name: string; description: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(current);
  const { execute, pending } = useAction(setUserRolesAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSel(current);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <ShieldCheck /> Roles
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Roles for {email}</DialogTitle>
          <DialogDescription>
            Reporting Manager and Department Head are also synchronised automatically from the org
            structure. Changing roles signs the user out.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-3">
          {roles.map((r) => (
            <li key={r.key} className="flex items-start gap-2">
              <Checkbox
                id={`role-${r.key}`}
                checked={sel.includes(r.key)}
                onCheckedChange={(v) =>
                  setSel((s) => (v === true ? [...s, r.key] : s.filter((x) => x !== r.key)))
                }
              />
              <Label htmlFor={`role-${r.key}`} className="grid gap-0.5 font-normal">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground text-xs">{r.description}</span>
              </Label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            disabled={pending || sel.length === 0}
            onClick={() => execute({ userId, roles: sel })}
          >
            {pending ? "Saving…" : "Save roles"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
