"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { useAction } from "@/hooks/use-action";
import { changePasswordSchema } from "@/lib/validation/auth";
import { changePasswordAction } from "@/server/actions/auth";

export function ChangePasswordForm() {
  const router = useRouter();
  const form = useForm<z.input<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });
  const { execute, pending } = useAction(changePasswordAction, {
    form,
    onSuccess: () => router.replace("/dashboard"),
  });
  const e = form.formState.errors;
  return (
    <Card>
      <CardContent>
        <form className="grid gap-4" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField
            label="Current password"
            htmlFor="currentPassword"
            error={e.currentPassword?.message}
          >
            <Input
              type="password"
              autoComplete="current-password"
              {...form.register("currentPassword")}
            />
          </FormField>
          <FormField
            label="New password"
            htmlFor="password"
            error={e.password?.message}
            hint="10+ characters, mixed case, a number and a symbol."
          >
            <Input type="password" autoComplete="new-password" {...form.register("password")} />
          </FormField>
          <FormField
            label="Confirm new password"
            htmlFor="confirmPassword"
            error={e.confirmPassword?.message}
          >
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
          </FormField>
          <Button type="submit" disabled={pending} className="justify-self-start">
            {pending ? "Saving…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
