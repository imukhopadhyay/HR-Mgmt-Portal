"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAction } from "@/hooks/use-action";
import { checkInAction, checkOutAction } from "@/server/actions/attendance";

function fmt(iso: string | null, tz: string) {
  return iso
    ? new Date(iso).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
      })
    : "—";
}

export function CheckInCard({
  checkInAt,
  checkOutAt,
  shiftLabel,
  blockedReason,
  tz,
}: {
  checkInAt: string | null;
  checkOutAt: string | null;
  shiftLabel: string;
  blockedReason?: string | null;
  tz: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ci = useAction(checkInAction);
  const co = useAction(checkOutAction);
  const working = !!checkInAt && !checkOutAt;
  const elapsed =
    working && now
      ? Math.max(0, Math.floor((now.getTime() - new Date(checkInAt!).getTime()) / 60000))
      : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today</CardTitle>
        <CardDescription>{shiftLabel}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="text-3xl font-semibold tabular-nums" suppressHydrationWarning>
          {now
            ? now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: tz })
            : "--:--"}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Check-in</dt>
            <dd className="font-medium">{fmt(checkInAt, tz)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Check-out</dt>
            <dd className="font-medium">{fmt(checkOutAt, tz)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Elapsed</dt>
            <dd className="font-medium tabular-nums">
              {working ? `${Math.floor(elapsed / 60)}h ${elapsed % 60}m` : "—"}
            </dd>
          </div>
        </dl>
        {blockedReason ? (
          <p className="bg-muted rounded-md px-3 py-2 text-sm">{blockedReason}</p>
        ) : !checkInAt ? (
          <Button size="lg" onClick={() => ci.execute(undefined)} disabled={ci.pending}>
            <LogIn /> {ci.pending ? "Checking in…" : "Check in"}
          </Button>
        ) : working ? (
          <Button
            size="lg"
            variant="secondary"
            onClick={() => co.execute(undefined)}
            disabled={co.pending}
          >
            <LogOut /> {co.pending ? "Checking out…" : "Check out"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">
            You have completed today&apos;s attendance.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
