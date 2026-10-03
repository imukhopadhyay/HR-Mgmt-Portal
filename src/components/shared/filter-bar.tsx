"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "./form-field";

export interface FilterDef {
  name: string;
  label: string;
  options?: { value: string; label: string }[];
  type?: "select" | "date" | "month";
}

/** URL-driven search + filters; server components read them from searchParams. */
export function FilterBar({ searchPlaceholder, filters = [], search = true }: { searchPlaceholder?: string; filters?: FilterDef[]; search?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();

  function update(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete("page");
    startTransition(() => router.replace(`${pathname}?${sp.toString()}`));
  }

  useEffect(() => {
    if (!search) return;
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update({ q });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = filters.some((f) => params.get(f.name)) || !!params.get("q");

  return (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center" aria-busy={pending}>
      {search && (
        <div className="relative md:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" aria-hidden />
          <Input aria-label="Search" placeholder={searchPlaceholder ?? "Search…"} className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {filters.map((f) =>
        f.type === "date" || f.type === "month" ? (
          <Input
            key={f.name}
            type={f.type}
            aria-label={f.label}
            className="md:w-44"
            value={params.get(f.name) ?? ""}
            onChange={(e) => update({ [f.name]: e.target.value })}
          />
        ) : (
          <NativeSelect key={f.name} aria-label={f.label} className="md:w-48" value={params.get(f.name) ?? ""} onChange={(e) => update({ [f.name]: e.target.value })}>
            <option value="">{f.label}: All</option>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        ),
      )}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname));
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
