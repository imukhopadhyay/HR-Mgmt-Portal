"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav-config";
import { cn } from "@/lib/utils";

/** Receives the list of permitted hrefs from the server (icons can't cross the RSC boundary). */
export function SidebarNav({ allowed, onNavigate }: { allowed: string[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const allowedSet = new Set(allowed);
  const allHrefs = NAV.flatMap((g) => g.items.map((i) => i.href));
  // Longest matching prefix wins so /attendance/team doesn't also highlight /attendance.
  const activeHref = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-3 py-4">
      {NAV.map((group) => {
        const items = group.items.filter((i) => allowedSet.has(i.href));
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <p className="text-muted-foreground mb-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase">{group.label}</p>
            <ul className="grid gap-0.5">
              {items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px]",
                        active ? "bg-primary/10 text-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
