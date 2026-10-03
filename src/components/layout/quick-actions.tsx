"use client";

import Link from "next/link";
import { CalendarPlus, Clock, Plus, UserPlus, Megaphone, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function QuickActions({ perms, hasEmployee }: { perms: string[]; hasEmployee: boolean }) {
  const p = new Set(perms);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Quick actions">
          <Plus /> <span className="hidden sm:inline">Quick action</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hasEmployee && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/attendance">
                <Clock /> Check in / out
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/leave?apply=1">
                <CalendarPlus /> Apply for leave
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/help-desk">
                <LifeBuoy /> Raise HR request
              </Link>
            </DropdownMenuItem>
          </>
        )}
        {p.has("employee:create") && (
          <DropdownMenuItem asChild>
            <Link href="/employees/new">
              <UserPlus /> Add employee
            </Link>
          </DropdownMenuItem>
        )}
        {p.has("announcement:manage") && (
          <DropdownMenuItem asChild>
            <Link href="/announcements?new=1">
              <Megaphone /> Post announcement
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
