"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAction } from "@/hooks/use-action";
import type { ActionResult } from "@/lib/action";

/**
 * Confirmation dialog wrapping a server action. Optionally collects a comment
 * (e.g. rejection reason) which is passed to the action.
 */
export function ConfirmAction<T>({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  withComment,
  commentRequired,
  commentLabel = "Comment",
  action,
  successMessage,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  withComment?: boolean;
  commentRequired?: boolean;
  commentLabel?: string;
  action: (comment?: string) => Promise<ActionResult<T>>;
  successMessage?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const commentId = React.useId();
  const { execute, pending } = useAction((c: string | undefined) => action(c), {
    successMessage,
    onSuccess: () => {
      setOpen(false);
      setComment("");
    },
  });
  const disabled = pending || (commentRequired && comment.trim().length < 3);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {withComment && (
          <div className="grid gap-1.5">
            <Label htmlFor={commentId}>
              {commentLabel}
              {commentRequired && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id={commentId}
              value={comment}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={disabled}
            onClick={() => execute(comment.trim() || undefined)}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
