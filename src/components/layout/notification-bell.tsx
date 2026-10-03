"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAllNotificationsRead } from "@/server/actions/notifications";
import { useAction } from "@/hooks/use-action";

export interface BellItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export function NotificationBell({ unread, items }: { unread: number; items: BellItem[] }) {
  const { execute } = useAction(markAllNotificationsRead, { successMessage: "All caught up" });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications (${unread} unread)`}
        >
          <Bell />
          {unread > 0 && (
            <span className="bg-destructive absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-2 text-xs"
              onClick={() => execute(undefined)}
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <p className="text-muted-foreground px-2 py-6 text-center text-sm">
            No notifications yet.
          </p>
        )}
        {items.map((n) => (
          <DropdownMenuItem key={n.id} asChild className="items-start">
            <Link href={n.link ?? "/notifications"} className="flex flex-col items-start gap-0.5">
              <span className={n.read ? "text-muted-foreground text-sm" : "text-sm font-medium"}>
                {n.title}
              </span>
              <span className="text-muted-foreground line-clamp-2 text-xs">{n.body}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications" className="justify-center text-sm">
            View all
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
