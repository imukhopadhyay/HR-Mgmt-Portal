import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
}) {
  const body = (
    <Card className="hover:border-primary/40 h-full gap-1 px-5 py-4 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">{label}</span>
        {Icon && <Icon className="text-muted-foreground size-4" aria-hidden />}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
    </Card>
  );
  return href ? (
    <Link href={href} className="focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-[3px]">
      {body}
    </Link>
  ) : (
    body
  );
}
