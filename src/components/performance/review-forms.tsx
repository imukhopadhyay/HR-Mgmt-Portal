"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { managerReviewSchema, selfReviewSchema } from "@/lib/validation/performance";
import { submitManagerReviewAction, submitSelfReviewAction } from "@/server/actions/performance";

const RATINGS = [
  [5, "5 — Outstanding"],
  [4, "4 — Exceeds expectations"],
  [3, "3 — Meets expectations"],
  [2, "2 — Partially meets"],
  [1, "1 — Below expectations"],
] as const;

function RatingSelect(props: React.ComponentProps<"select">) {
  return (
    <NativeSelect {...props}>
      {RATINGS.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </NativeSelect>
  );
}

export function SelfReviewForm({ id }: { id: string }) {
  const form = useForm<z.input<typeof selfReviewSchema>>({ resolver: zodResolver(selfReviewSchema), defaultValues: { id, selfRating: 3, selfComments: "" } });
  const { execute, pending } = useAction(submitSelfReviewAction, { form });
  const e = form.formState.errors;
  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
      <FormField label="Self rating" htmlFor="sr-rating" error={e.selfRating?.message}>
        <RatingSelect {...form.register("selfRating")} />
      </FormField>
      <FormField label="Achievements, challenges and reflections" htmlFor="sr-comments" required error={e.selfComments?.message}>
        <Textarea rows={8} {...form.register("selfComments")} />
      </FormField>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Submitting…" : "Submit self-assessment"}
      </Button>
    </form>
  );
}

export function ManagerReviewForm({ id }: { id: string }) {
  const form = useForm<z.input<typeof managerReviewSchema>>({ resolver: zodResolver(managerReviewSchema), defaultValues: { id, managerRating: 3, managerComments: "", strengths: "", improvements: "", finalRating: 3 } });
  const { execute, pending } = useAction(submitManagerReviewAction, { form });
  const e = form.formState.errors;
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
      <FormField label="Manager rating" htmlFor="mr-rating" error={e.managerRating?.message}>
        <RatingSelect {...form.register("managerRating")} />
      </FormField>
      <FormField label="Final rating" htmlFor="mr-final" error={e.finalRating?.message} hint="After calibration">
        <RatingSelect {...form.register("finalRating")} />
      </FormField>
      <FormField label="Overall feedback" htmlFor="mr-comments" required error={e.managerComments?.message} className="sm:col-span-2">
        <Textarea rows={6} {...form.register("managerComments")} />
      </FormField>
      <FormField label="Strengths" htmlFor="mr-strengths" error={e.strengths?.message}>
        <Textarea rows={4} {...form.register("strengths")} />
      </FormField>
      <FormField label="Areas to improve" htmlFor="mr-improve" error={e.improvements?.message}>
        <Textarea rows={4} {...form.register("improvements")} />
      </FormField>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Submitting…" : "Complete review"}
      </Button>
    </form>
  );
}
