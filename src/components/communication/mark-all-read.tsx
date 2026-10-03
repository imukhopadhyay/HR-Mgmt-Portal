"use client";

import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { markAllNotificationsRead } from "@/server/actions/notifications";

export function MarkAllRead() {
  const { execute, pending } = useAction(markAllNotificationsRead);
  return (
    <Button variant="outline" onClick={() => execute(undefined)} disabled={pending}>
      <CheckCheck /> Mark all read
    </Button>
  );
}
