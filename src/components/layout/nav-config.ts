import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  Clock,
  FileText,
  GraduationCap,
  IndianRupee,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Network,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Visible when the user holds any of these. Empty = everyone signed in. */
  anyOf?: Permission[];
  /** Requires a linked employee profile. */
  employee?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Announcements", href: "/announcements", icon: Megaphone },
      { title: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    label: "My workspace",
    items: [
      { title: "My profile", href: "/profile", icon: UserCircle, employee: true },
      { title: "Attendance", href: "/attendance", icon: Clock, employee: true },
      { title: "Leave", href: "/leave", icon: CalendarDays, employee: true },
      { title: "Payslips", href: "/payslips", icon: IndianRupee, employee: true },
      { title: "Goals & reviews", href: "/performance", icon: Target, employee: true },
      { title: "Learning", href: "/training", icon: GraduationCap },
      { title: "HR help desk", href: "/help-desk", icon: LifeBuoy, employee: true },
    ],
  },
  {
    label: "Team & approvals",
    items: [
      {
        title: "Approvals",
        href: "/approvals",
        icon: ClipboardCheck,
        anyOf: ["leave:approve", "attendance:approve", "request:manage"],
      },
      {
        title: "Team attendance",
        href: "/attendance/team",
        icon: CalendarCheck,
        anyOf: ["attendance:read:team", "attendance:read:department", "attendance:read:all"],
      },
      {
        title: "Leave calendar",
        href: "/leave/calendar",
        icon: CalendarDays,
        anyOf: ["leave:read:team", "leave:read:department", "leave:read:all"],
      },
    ],
  },
  {
    label: "Organisation",
    items: [
      { title: "Employees", href: "/employees", icon: Users, anyOf: ["directory:read"] },
      { title: "Departments", href: "/departments", icon: Building2, anyOf: ["directory:read"] },
      { title: "Org chart", href: "/org-chart", icon: Network, anyOf: ["directory:read"] },
    ],
  },
  {
    label: "HR operations",
    items: [
      { title: "Payroll", href: "/payroll", icon: IndianRupee, anyOf: ["payroll:read"] },
      {
        title: "Recruitment",
        href: "/recruitment",
        icon: Briefcase,
        anyOf: ["recruitment:read", "interview:feedback"],
      },
      {
        title: "Performance cycles",
        href: "/performance/cycles",
        icon: Target,
        anyOf: ["performance:manage"],
      },
      { title: "Analytics", href: "/analytics", icon: BarChart3, anyOf: ["report:read"] },
      { title: "Documents", href: "/documents", icon: FileText, anyOf: ["document:manage"] },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "HR configuration",
        href: "/settings",
        icon: Settings,
        anyOf: ["leave:manage", "attendance:manage", "settings:manage", "payroll:manage"],
      },
      { title: "Users & roles", href: "/admin/users", icon: ShieldCheck, anyOf: ["user:manage"] },
      { title: "Audit trail", href: "/admin/audit", icon: ScrollText, anyOf: ["audit:read"] },
    ],
  },
];

export function visibleNav(perms: ReadonlySet<string>, hasEmployee: boolean): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => (!i.employee || hasEmployee) && (!i.anyOf || i.anyOf.some((p) => perms.has(p))),
    ),
  })).filter((g) => g.items.length > 0);
}
