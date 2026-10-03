import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { generateToken, hashToken } from "./crypto";
import { buildSessionUser, type SessionUser, sessionUserInclude } from "./session-user";

const IDLE_REFRESH_MS = 15 * 60 * 1000;
const ABSOLUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-hr_session" : "hr_session";
}

export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return { ipAddress: ip, userAgent: h.get("user-agent")?.slice(0, 255) ?? null };
}

export async function createSession(userId: string) {
  const token = generateToken();
  const ttlMs = env().SESSION_TTL_HOURS * 60 * 60 * 1000;
  const meta = await requestMeta();
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + ttlMs),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });
  const jar = await cookies();
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(sessionCookieName());
}

export async function revokeAllSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

/**
 * Resolve the signed-in user for this request (memoised per request).
 * Returns null when there is no valid session or the account is disabled.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: sessionUserInclude } },
  });
  if (!session) return null;
  const now = Date.now();
  if (
    session.expiresAt.getTime() < now ||
    session.createdAt.getTime() + ABSOLUTE_MAX_MS < now ||
    !session.user.isActive
  ) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now - session.lastSeenAt.getTime() > IDLE_REFRESH_MS) {
    const ttlMs = env().SESSION_TTL_HOURS * 60 * 60 * 1000;
    await db.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(now + ttlMs) },
      })
      .catch(() => undefined);
  }
  return buildSessionUser(session.user);
});
