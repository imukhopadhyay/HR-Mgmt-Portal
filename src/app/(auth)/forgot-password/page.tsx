"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { forgotPasswordAction } from "@/server/actions/auth";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const onSubmit = form.handleSubmit((v) =>
    startTransition(async () => {
      const res = await forgotPasswordAction(v);
      setMessage(res.ok ? (res.message ?? "Check your inbox.") : res.error);
    }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Reset password</CardTitle>
        <CardDescription>We will email you a link to choose a new password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {message && (
            <p role="status" className="bg-muted rounded-md px-3 py-2 text-sm">
              {message}
            </p>
          )}
          <FormField label="Work email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...form.register("email")} />
          </FormField>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
          <Link href="/login" className="text-primary text-center text-sm hover:underline">
            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
