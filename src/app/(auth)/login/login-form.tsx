"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { loginSchema } from "@/lib/validation/auth";
import { loginAction } from "@/server/actions/auth";

type Values = z.input<typeof loginSchema>;

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const res = await loginAction(values, next);
      if (res.ok) {
        router.replace(res.data.redirectTo);
        router.refresh();
      } else setError(res.error);
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Use your work email and password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {error && (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {error}
            </div>
          )}
          <FormField
            label="Work email"
            htmlFor="email"
            error={form.formState.errors.email?.message}
          >
            <Input type="email" autoComplete="username" autoFocus {...form.register("email")} />
          </FormField>
          <FormField
            label="Password"
            htmlFor="password"
            error={form.formState.errors.password?.message}
          >
            <Input type="password" autoComplete="current-password" {...form.register("password")} />
          </FormField>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <Link
            href="/forgot-password"
            className="text-primary text-center text-sm hover:underline"
          >
            Forgot password?
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
