import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/utils";

type Variant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

const MAP: Record<string, Variant> = {
  ACTIVE: "success",
  APPROVED: "success",
  COMPLETED: "success",
  PRESENT: "success",
  VERIFIED: "success",
  HIRED: "success",
  PAID: "success",
  OPEN: "info",
  RESOLVED: "success",
  ONBOARDING: "info",
  PROCESSED: "info",
  IN_PROGRESS: "info",
  ONGOING: "info",
  SCHEDULED: "info",
  INTERVIEW: "info",
  OFFER: "info",
  SCREENING: "info",
  ENROLLED: "info",
  ATTENDED: "info",
  SELF_REVIEW: "info",
  MANAGER_REVIEW: "warning",
  PENDING: "warning",
  PENDING_APPROVAL: "warning",
  MODIFICATION_REQUESTED: "warning",
  ON_NOTICE: "warning",
  HALF_DAY: "warning",
  ON_HOLD: "warning",
  DRAFT: "secondary",
  PLANNED: "secondary",
  APPLIED: "secondary",
  NOT_STARTED: "secondary",
  HOLIDAY: "secondary",
  WEEKLY_OFF: "secondary",
  ON_LEAVE: "info",
  CLOSED: "secondary",
  REJECTED: "destructive",
  ABSENT: "destructive",
  EXITED: "destructive",
  SUSPENDED: "destructive",
  CANCELLED: "outline",
  WITHDRAWN: "outline",
  NO_SHOW: "destructive",
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
  NORMAL: "secondary",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge variant={MAP[status] ?? "secondary"}>{label ?? humanize(status)}</Badge>;
}
