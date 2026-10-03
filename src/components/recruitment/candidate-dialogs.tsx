"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  CalendarPlus,
  FileSignature,
  MessageSquare,
  Pencil,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { humanize } from "@/lib/utils";
import {
  candidateSchema,
  feedbackSchema,
  hireSchema,
  interviewSchema,
  offerSchema,
  stageSchema,
} from "@/lib/validation/recruitment";
import {
  generateOfferAction,
  hireCandidateAction,
  moveCandidateAction,
  saveCandidateAction,
  scheduleInterviewAction,
  submitFeedbackAction,
} from "@/server/actions/recruitment";

function useDialog() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}

export function CandidateDialog({
  recruitmentId,
  initial,
}: {
  recruitmentId: string;
  initial?: z.input<typeof candidateSchema>;
}) {
  const d = useDialog();
  const form = useForm<z.input<typeof candidateSchema>>({
    resolver: zodResolver(candidateSchema),
    defaultValues: initial ?? { recruitmentId, firstName: "", lastName: "", email: "" },
  });
  const { execute, pending } = useAction(saveCandidateAction, {
    form,
    onSuccess: () => {
      d.setOpen(false);
      if (!initial) form.reset();
    },
  });
  const e = form.formState.errors;
  const f = (
    name: keyof z.input<typeof candidateSchema>,
    label: string,
    type = "text",
    required = false,
  ) => (
    <FormField label={label} htmlFor={`cd-${name}`} required={required} error={e[name]?.message}>
      <Input type={type} {...form.register(name)} />
    </FormField>
  );
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon" aria-label="Edit candidate">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <UserPlus /> Add candidate
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit candidate" : "Add candidate"}</DialogTitle>
          <DialogDescription>
            Upload the resume from the candidate row after saving.
          </DialogDescription>
        </DialogHeader>
        <form
          id="cand-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          {f("firstName", "First name", "text", true)}
          {f("lastName", "Last name", "text", true)}
          {f("email", "Email", "email", true)}
          {f("phone", "Phone", "tel")}
          {f("source", "Source (e.g. Referral)")}
          {f("currentCompany", "Current company")}
          {f("experienceYears", "Experience (years)", "number")}
          {f("expectedCtc", "Expected CTC (₹)", "number")}
          <FormField
            label="Notes"
            htmlFor="cd-notes"
            error={e.notes?.message}
            className="sm:col-span-2"
          >
            <Textarea rows={3} {...form.register("notes")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="cand-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NEXT: Record<string, string[]> = {
  APPLIED: ["SCREENING", "REJECTED", "WITHDRAWN"],
  SCREENING: ["INTERVIEW", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["SCREENING", "REJECTED", "WITHDRAWN"],
  OFFER: ["INTERVIEW", "REJECTED", "WITHDRAWN"],
  REJECTED: ["SCREENING"],
};

export function MoveStageDialog({ candidateId, stage }: { candidateId: string; stage: string }) {
  const d = useDialog();
  const options = NEXT[stage] ?? [];
  const form = useForm<z.input<typeof stageSchema>>({
    resolver: zodResolver(stageSchema),
    defaultValues: { candidateId, stage: (options[0] ?? "SCREENING") as "SCREENING", note: "" },
  });
  const { execute, pending } = useAction(moveCandidateAction, {
    form,
    onSuccess: () => d.setOpen(false),
  });
  if (!options.length) return null;
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Move
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move candidate</DialogTitle>
        </DialogHeader>
        <form
          id="stage-form"
          className="grid gap-4"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField label="New stage" htmlFor="st-stage">
            <NativeSelect {...form.register("stage")}>
              {options.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Note" htmlFor="st-note" error={form.formState.errors.note?.message}>
            <Input {...form.register("note")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="stage-form" disabled={pending}>
            {pending ? "Saving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleInterviewDialog({
  candidateId,
  interviewers,
}: {
  candidateId: string;
  interviewers: { id: string; label: string }[];
}) {
  const d = useDialog();
  const form = useForm<z.input<typeof interviewSchema>>({
    resolver: zodResolver(interviewSchema),
    defaultValues: {
      candidateId,
      round: "",
      date: "",
      time: "15:00",
      durationMinutes: 60,
      mode: "VIDEO",
      location: "",
      interviewerId: "",
    },
  });
  const { execute, pending } = useAction(scheduleInterviewAction, {
    form,
    onSuccess: () => {
      d.setOpen(false);
      form.reset();
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Schedule interview">
          <CalendarPlus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule interview</DialogTitle>
          <DialogDescription>
            The interviewer is notified by email and in-app, with a calendar invite link.
          </DialogDescription>
        </DialogHeader>
        <form
          id="iv-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField
            label="Round"
            htmlFor="iv-round"
            required
            error={e.round?.message}
            className="sm:col-span-2"
          >
            <Input placeholder="e.g. Technical round 1" {...form.register("round")} />
          </FormField>
          <FormField label="Date" htmlFor="iv-date" required error={e.date?.message}>
            <Input type="date" {...form.register("date")} />
          </FormField>
          <FormField label="Time" htmlFor="iv-time" required error={e.time?.message}>
            <Input type="time" {...form.register("time")} />
          </FormField>
          <FormField label="Duration (min)" htmlFor="iv-dur" error={e.durationMinutes?.message}>
            <Input type="number" {...form.register("durationMinutes")} />
          </FormField>
          <FormField label="Mode" htmlFor="iv-mode" error={e.mode?.message}>
            <NativeSelect {...form.register("mode")}>
              <option value="VIDEO">Video</option>
              <option value="ONSITE">On-site</option>
              <option value="PHONE">Phone</option>
            </NativeSelect>
          </FormField>
          <FormField
            label="Interviewer"
            htmlFor="iv-int"
            required
            error={e.interviewerId?.message}
            className="sm:col-span-2"
          >
            <NativeSelect {...form.register("interviewerId")}>
              <option value="">Select…</option>
              {interviewers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            label="Location / meeting link"
            htmlFor="iv-loc"
            error={e.location?.message}
            className="sm:col-span-2"
          >
            <Input {...form.register("location")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="iv-form" disabled={pending}>
            {pending ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackDialog({ interviewId, label }: { interviewId: string; label: string }) {
  const d = useDialog();
  const form = useForm<z.input<typeof feedbackSchema>>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      interviewId,
      status: "COMPLETED",
      rating: 3,
      recommendation: "HIRE",
      feedback: "",
    },
  });
  const { execute, pending } = useAction(submitFeedbackAction, {
    form,
    onSuccess: () => d.setOpen(false),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MessageSquare /> Feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Interview feedback</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <form
          id="fb-form"
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField label="Outcome" htmlFor="fb-status">
            <NativeSelect {...form.register("status")}>
              <option value="COMPLETED">Completed</option>
              <option value="NO_SHOW">No-show</option>
            </NativeSelect>
          </FormField>
          <FormField label="Rating (1–5)" htmlFor="fb-rating" error={e.rating?.message}>
            <NativeSelect {...form.register("rating")}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Recommendation" htmlFor="fb-rec">
            <NativeSelect {...form.register("recommendation")}>
              {["STRONG_HIRE", "HIRE", "HOLD", "NO_HIRE"].map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            label="Feedback"
            htmlFor="fb-text"
            required
            error={e.feedback?.message}
            className="sm:col-span-3"
          >
            <Textarea rows={5} {...form.register("feedback")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="fb-form" disabled={pending}>
            {pending ? "Submitting…" : "Submit feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OfferDialog({ candidateId, expected }: { candidateId: string; expected?: number }) {
  const d = useDialog();
  const form = useForm<z.input<typeof offerSchema>>({
    resolver: zodResolver(offerSchema),
    defaultValues: { candidateId, offeredCtc: expected ?? 0, joiningDate: "" },
  });
  const { execute, pending } = useAction(generateOfferAction, {
    form,
    onSuccess: (r) => {
      d.setOpen(false);
      if (r.aboveBudget) toast.warning("The offered CTC is above the requisition budget.");
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Generate offer">
          <FileSignature />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate offer letter</DialogTitle>
        </DialogHeader>
        <form
          id="offer-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField label="Annual CTC (₹)" htmlFor="of-ctc" required error={e.offeredCtc?.message}>
            <Input type="number" step="10000" {...form.register("offeredCtc")} />
          </FormField>
          <FormField label="Joining date" htmlFor="of-join" required error={e.joiningDate?.message}>
            <Input type="date" {...form.register("joiningDate")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="offer-form" disabled={pending}>
            {pending ? "Generating…" : "Generate offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HireDialog({ candidateId, name }: { candidateId: string; name: string }) {
  const d = useDialog();
  const form = useForm<z.input<typeof hireSchema>>({
    resolver: zodResolver(hireSchema),
    defaultValues: { candidateId, workEmail: "" },
  });
  const { execute, pending } = useAction(hireCandidateAction, {
    form,
    onSuccess: () => d.setOpen(false),
  });
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserCheck /> Hire
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hire {name}</DialogTitle>
          <DialogDescription>
            Creates the employee record, onboarding checklist, leave balances and a portal account
            invite. The candidate&apos;s documents move to the employee profile.
          </DialogDescription>
        </DialogHeader>
        <form
          id="hire-form"
          className="grid gap-4"
          onSubmit={form.handleSubmit((v) => execute(v))}
          noValidate
        >
          <FormField
            label="Work email"
            htmlFor="hire-email"
            required
            error={form.formState.errors.workEmail?.message}
          >
            <Input type="email" {...form.register("workEmail")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form="hire-form" disabled={pending}>
            {pending ? "Hiring…" : "Confirm hire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
