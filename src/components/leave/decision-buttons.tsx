"use client";

import { Check, MessageSquareWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { decideLeaveAction } from "@/server/actions/leave";
import { decideCorrectionAction } from "@/server/actions/attendance";
import { reviewProfileUpdateAction } from "@/server/actions/self-service";

export function LeaveDecisionButtons({
  id,
  name,
  finalStage,
}: {
  id: string;
  name: string;
  finalStage: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <ConfirmAction
        trigger={
          <Button size="sm" aria-label={`Approve leave for ${name}`}>
            <Check /> Approve
          </Button>
        }
        title={finalStage ? "Approve leave?" : "Approve and forward to HR?"}
        description={
          finalStage
            ? "The days will be deducted from the employee's balance."
            : "This request needs a second-level (HR) approval."
        }
        confirmLabel="Approve"
        withComment
        commentLabel="Comment (optional)"
        action={(comment) => decideLeaveAction({ id, decision: "APPROVE", comment })}
      />
      <ConfirmAction
        trigger={
          <Button size="sm" variant="outline" aria-label={`Request changes from ${name}`}>
            <MessageSquareWarning /> Changes
          </Button>
        }
        title="Request modification?"
        description="The employee can edit and resubmit the request."
        confirmLabel="Send back"
        withComment
        commentRequired
        commentLabel="What should change?"
        action={(comment) => decideLeaveAction({ id, decision: "REQUEST_MODIFICATION", comment })}
      />
      <ConfirmAction
        trigger={
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            aria-label={`Reject leave for ${name}`}
          >
            <X /> Reject
          </Button>
        }
        title="Reject leave?"
        destructive
        confirmLabel="Reject"
        withComment
        commentRequired
        commentLabel="Reason"
        action={(comment) => decideLeaveAction({ id, decision: "REJECT", comment })}
      />
    </div>
  );
}

export function SimpleDecisionButtons({
  id,
  kind,
}: {
  id: string;
  kind: "correction" | "profile";
}) {
  const act = (approve: boolean, comment?: string) =>
    kind === "correction"
      ? decideCorrectionAction({ id, approve, comment })
      : reviewProfileUpdateAction({ id, approve, comment });
  return (
    <div className="flex justify-end gap-1">
      <ConfirmAction
        trigger={
          <Button size="sm">
            <Check /> Approve
          </Button>
        }
        title="Approve request?"
        confirmLabel="Approve"
        withComment
        commentLabel="Comment (optional)"
        action={(c) => act(true, c)}
      />
      <ConfirmAction
        trigger={
          <Button size="sm" variant="outline" className="text-destructive">
            <X /> Reject
          </Button>
        }
        title="Reject request?"
        destructive
        confirmLabel="Reject"
        withComment
        commentRequired
        commentLabel="Reason"
        action={(c) => act(false, c)}
      />
    </div>
  );
}
