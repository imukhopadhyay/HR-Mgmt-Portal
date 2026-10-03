/** Default onboarding / offboarding checklist templates. */
export interface ChecklistTemplateItem {
  title: string;
  category: string;
  owner: "HR" | "IT" | "MANAGER" | "EMPLOYEE" | "FINANCE";
  dueInDays: number;
}

export const ONBOARDING_TEMPLATE: ChecklistTemplateItem[] = [
  {
    title: "Send offer letter and welcome email",
    category: "Pre-joining",
    owner: "HR",
    dueInDays: -7,
  },
  {
    title: "Collect signed offer and joining documents",
    category: "Documents",
    owner: "HR",
    dueInDays: 0,
  },
  { title: "Verify identity and address proofs", category: "Documents", owner: "HR", dueInDays: 3 },
  { title: "Provision laptop and email account", category: "IT setup", owner: "IT", dueInDays: 0 },
  { title: "Grant access to required systems", category: "IT setup", owner: "IT", dueInDays: 1 },
  {
    title: "Collect bank, PAN and UAN details",
    category: "Payroll",
    owner: "FINANCE",
    dueInDays: 5,
  },
  { title: "Assign onboarding buddy", category: "Orientation", owner: "MANAGER", dueInDays: 0 },
  {
    title: "Complete HR induction and POSH training",
    category: "Orientation",
    owner: "EMPLOYEE",
    dueInDays: 7,
  },
  { title: "Set 30/60/90-day goals", category: "Orientation", owner: "MANAGER", dueInDays: 14 },
];

export const OFFBOARDING_TEMPLATE: ChecklistTemplateItem[] = [
  {
    title: "Acknowledge resignation / termination letter",
    category: "Exit",
    owner: "HR",
    dueInDays: 0,
  },
  { title: "Knowledge transfer plan", category: "Handover", owner: "MANAGER", dueInDays: 7 },
  { title: "Recover laptop, ID card and assets", category: "Assets", owner: "IT", dueInDays: 0 },
  { title: "Revoke system access", category: "IT", owner: "IT", dueInDays: 0 },
  { title: "Exit interview", category: "Exit", owner: "HR", dueInDays: -2 },
  { title: "Full and final settlement", category: "Payroll", owner: "FINANCE", dueInDays: 30 },
  { title: "Issue relieving and experience letters", category: "Exit", owner: "HR", dueInDays: 30 },
];
