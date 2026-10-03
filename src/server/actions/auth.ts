"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, getSessionUser, requestMeta } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/action";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import {
  authenticate,
  changePassword,
  requestPasswordReset,
  resetPassword,
} from "@/server/services/auth.service";

function safeNext(next: unknown): string {
  if (
    typeof next !== "string" ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  )
    return "/dashboard";
  return next;
}

export async function loginAction(
  input: unknown,
  next?: string,
): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success)
      return {
        ok: false,
        error: "Enter your email and password.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    const meta = await requestMeta();
    const result = await authenticate(parsed.data.email, parsed.data.password, meta);
    if (!result.ok) return { ok: false, error: result.error };
    await createSession(result.userId);
    return {
      ok: true,
      data: {
        redirectTo: result.mustChangePassword ? "/account/password?required=1" : safeNext(next),
      },
      message: "Welcome back",
    };
  } catch (err) {
    return toActionError(err);
  }
}

export async function logoutAction() {
  const user = await getSessionUser();
  if (user) {
    const meta = await requestMeta();
    await audit(
      { id: user.id, ...meta },
      { action: "auth.logout", entityType: "User", entityId: user.id },
    );
  }
  await destroySession();
  redirect("/login");
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const parsed = forgotPasswordSchema.safeParse(input);
    if (!parsed.success)
      return {
        ok: false,
        error: "Enter a valid email address.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    await requestPasswordReset(parsed.data.email, await requestMeta());
    return {
      ok: true,
      data: undefined,
      message: "If an account exists for that email, a reset link has been sent.",
    };
  } catch (err) {
    return toActionError(err);
  }
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const parsed = resetPasswordSchema.safeParse(input);
    if (!parsed.success)
      return {
        ok: false,
        error: "Please correct the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    await resetPassword(parsed.data.token, parsed.data.password, await requestMeta());
    return { ok: true, data: undefined, message: "Password updated. Please sign in." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function changePasswordAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success)
      return {
        ok: false,
        error: "Please correct the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    await changePassword(
      user.id,
      parsed.data.currentPassword,
      parsed.data.password,
      await requestMeta(),
    );
    // All sessions were revoked; start a fresh one for this device.
    await createSession(user.id);
    return { ok: true, data: undefined, message: "Password changed" };
  } catch (err) {
    return toActionError(err);
  }
}
