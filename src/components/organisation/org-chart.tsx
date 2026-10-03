"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { OrgNode } from "@/server/services/organisation.service";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { Button } from "@/components/ui/button";

function count(n: OrgNode): number {
  return n.children.reduce((s, c) => s + 1 + count(c), 0);
}

function Node({ node, depth }: { node: OrgNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const total = count(node);
  return (
    <li
      role="treeitem"
      aria-expanded={node.children.length ? open : undefined}
      aria-selected={false}
    >
      <div className="flex items-center gap-1 py-1">
        {node.children.length > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setOpen(!open)}
            aria-label={open ? `Collapse ${node.name}'s team` : `Expand ${node.name}'s team`}
          >
            {open ? <ChevronDown /> : <ChevronRight />}
          </Button>
        ) : (
          <span className="w-7" />
        )}
        <Link
          href={`/employees/${node.id}`}
          className="hover:bg-muted flex items-center gap-3 rounded-md border px-3 py-2"
        >
          <EmployeeAvatar id={node.id} name={node.name} />
          <div>
            <div className="text-sm font-medium">{node.name}</div>
            <div className="text-muted-foreground text-xs">
              {node.title ?? "—"} · {node.department ?? "—"}
              {total > 0 && ` · ${total} in team`}
            </div>
          </div>
        </Link>
      </div>
      {open && node.children.length > 0 && (
        <ul role="group" className="ml-6 border-l pl-4">
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OrgChart({ roots }: { roots: OrgNode[] }) {
  if (!roots.length) return <p className="text-muted-foreground text-sm">No employees yet.</p>;
  return (
    <ul role="tree" aria-label="Organisation chart" className="min-w-max">
      {roots.map((r) => (
        <Node key={r.id} node={r} depth={0} />
      ))}
    </ul>
  );
}
