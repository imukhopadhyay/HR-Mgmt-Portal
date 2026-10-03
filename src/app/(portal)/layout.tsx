import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/auth/permissions";
import { visibleNav } from "@/components/layout/nav-config";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { QuickActions } from "@/components/layout/quick-actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (user.mustChangePassword && !pathname.startsWith("/account/password")) redirect("/account/password?required=1");

  const allowed = visibleNav(user.permissions, !!user.employeeId).flatMap((g) => g.items.map((i) => i.href));
  const [unread, latest] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r lg:flex">
        <Link href="/dashboard" className="flex h-14 items-center gap-2 border-b px-5">
          <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
            <Building2 className="size-4" aria-hidden />
          </div>
          <span className="font-semibold">HR Portal</span>
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav allowed={allowed} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/90 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-6">
          <MobileNav allowed={allowed} />
          <div className="flex-1" />
          <QuickActions perms={[...user.permissions]} hasEmployee={!!user.employeeId} />
          <ThemeToggle />
          <NotificationBell
            unread={unread}
            items={latest.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt.toISOString(), read: !!n.readAt }))}
          />
          <UserMenu name={user.name} email={user.email} roles={user.roles.map((r) => ROLES[r]?.name ?? r)} hasEmployee={!!user.employeeId} />
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
