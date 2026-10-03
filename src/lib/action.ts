import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getSessionUser, requestMeta } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session-user";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type Actor = SessionUser & { ipAddress?: string | null; userAgent?: string | null };

export function toActionError(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string[]> } {
  if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof z.ZodError) {
    return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: err.flatten().fieldErrors as Record<string, string[]> };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return { ok: false, error: "A record with the same unique value already exists." };
    if (err.code === "P2025") return { ok: false, error: "Record not found." };
    if (err.code === "P2003") return { ok: false, error: "This record is referenced by other data." };
    if (err.code === "P2034") return { ok: false, error: "Another update happened at the same time. Please try again." };
  }
  // Re-throw Next.js control-flow errors (redirect/notFound).
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_")) {
    throw err;
  }
  logger.error("action.unhandled", { err });
  return { ok: false, error: "Something went wrong. Please try again." };
}

/**
 * Standard server-action pipeline: authenticate → validate input → run handler
 * (which performs authorization) → map errors to a serialisable result.
 */
export async function runAction<S extends z.ZodTypeAny, T>(
  schema: S,
  input: unknown,
  handler: (data: z.infer<S>, actor: Actor) => Promise<T>,
  message?: string,
): Promise<ActionResult<T>> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }
    const meta = await requestMeta();
    const data = await handler(parsed.data, { ...user, ...meta });
    return { ok: true, data, message };
  } catch (err) {
    return toActionError(err);
  }
}
