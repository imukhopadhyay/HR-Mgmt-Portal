"use client";

import Link from "next/link";
import { CalendarPlus, Download, KeyRound, LogOut, UserCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/server/actions/auth";

export function UserMenu({
  name,
  email,
  roles,
  hasEmployee,
}: {
  name: string;
  email: string;
  roles: string[];
  hasEmployee: boolean;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Account menu">
          <Avatar className="size-7">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-36 truncate text-sm font-medium md:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="text-muted-foreground truncate text-xs">{email}</div>
          <div className="text-muted-foreground mt-1 text-xs">{roles.join(" · ")}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hasEmployee && (
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <UserCircle /> My profile
            </Link>
          </DropdownMenuItem>
        )}
        {hasEmployee && (
          <DropdownMenuItem asChild>
            <a href="/api/me/export">
              <Download /> Download my data
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href="/api/calendar/me">
            <CalendarPlus /> Export my calendar (.ics)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/password">
            <KeyRound /> Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOut /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
