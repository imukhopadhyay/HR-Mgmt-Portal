/**
 * Permission catalog and default role mapping.
 * This file is the single source of truth; the seed script syncs it into the
 * Role / Permission / RolePermission tables, and runtime checks read from DB.
 *
 * Scoped permissions follow `resource:action:scope` where scope is one of
 *   all > department > team. Self-access is implicit for a user's own records.
 */
export const PERMISSIONS = {
  "directory:read": "View the employee directory (limited fields)",
  "employee:read:all": "View all employee records",
  "employee:read:department": "View employee records in departments you head",
  "employee:read:team": "View employee records of your reporting line",
  "employee:create": "Create employees",
  "employee:update": "Update employee records",
  "employee:archive": "Archive / offboard employees",
  "employee:sensitive:read": "View sensitive personal and statutory data",
  "user:manage": "Manage user accounts and role assignments",
  "department:manage": "Manage departments, designations and hierarchy",
  "document:manage": "Upload and verify documents for employees in scope",
  "attendance:read:all": "View all attendance",
  "attendance:read:department": "View department attendance",
  "attendance:read:team": "View team attendance",
  "attendance:approve": "Approve attendance correction requests in scope",
  "attendance:manage": "Configure shifts, holidays and edit attendance",
  "leave:read:all": "View all leave requests",
  "leave:read:department": "View department leave requests",
  "leave:read:team": "View team leave requests",
  "leave:approve": "Approve or reject leave requests in scope",
  "leave:manage": "Configure leave types and adjust balances",
  "payroll:read": "View payroll runs and salary structures",
  "payroll:manage": "Manage salary structures and process payroll",
  "payroll:approve": "Approve payroll runs",
  "recruitment:read": "View requisitions and candidates",
  "recruitment:request": "Raise job requisitions",
  "recruitment:manage": "Manage requisitions, candidates and offers",
  "interview:feedback": "Submit interview feedback for assigned interviews",
  "performance:manage": "Manage performance cycles",
  "performance:review": "Review direct reports",
  "training:manage": "Manage training programmes and enrolments",
  "announcement:manage": "Publish announcements",
  "request:manage": "Process profile update requests and HR support tickets",
  "report:read": "View HR analytics",
  "report:export": "Export reports",
  "audit:read": "View the audit trail",
  "settings:manage": "Manage system settings, statutory rules and retention",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLES = {
  SUPER_ADMIN: { name: "Super Admin", description: "Full system access" },
  HR_ADMIN: { name: "HR Administrator", description: "Administers all HR functions and payroll" },
  HR_MANAGER: { name: "HR Manager", description: "Manages day-to-day HR operations" },
  DEPARTMENT_HEAD: { name: "Department Head", description: "Leads a department" },
  REPORTING_MANAGER: { name: "Reporting Manager", description: "Manages direct reports" },
  EMPLOYEE: { name: "Employee", description: "Self-service access" },
} as const;

export type RoleKey = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

const EMPLOYEE_BASE: Permission[] = ["directory:read"];

const MANAGER_BASE: Permission[] = [
  ...EMPLOYEE_BASE,
  "employee:read:team",
  "attendance:read:team",
  "attendance:approve",
  "leave:read:team",
  "leave:approve",
  "performance:review",
  "interview:feedback",
];

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  HR_ADMIN: ALL_PERMISSIONS.filter((p) => p !== "settings:manage"),
  HR_MANAGER: [
    ...EMPLOYEE_BASE,
    "employee:read:all",
    "employee:create",
    "employee:update",
    "document:manage",
    "attendance:read:all",
    "attendance:approve",
    "leave:read:all",
    "leave:approve",
    "recruitment:read",
    "recruitment:request",
    "recruitment:manage",
    "interview:feedback",
    "performance:manage",
    "performance:review",
    "training:manage",
    "announcement:manage",
    "request:manage",
    "report:read",
    "report:export",
  ],
  DEPARTMENT_HEAD: [
    ...MANAGER_BASE,
    "employee:read:department",
    "attendance:read:department",
    "leave:read:department",
    "recruitment:read",
    "recruitment:request",
    "report:read",
  ],
  REPORTING_MANAGER: [...MANAGER_BASE],
  EMPLOYEE: [...EMPLOYEE_BASE],
};

export type ScopedResource = "employee" | "attendance" | "leave";
export type Scope = "all" | "department" | "team" | "self";

/** Widest scope a permission set grants for a resource. */
export function resolveScope(perms: ReadonlySet<string>, resource: ScopedResource): Scope {
  if (perms.has(`${resource}:read:all`)) return "all";
  if (perms.has(`${resource}:read:department`)) return "department";
  if (perms.has(`${resource}:read:team`)) return "team";
  return "self";
}
