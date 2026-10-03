import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { generateToken, hashPassword, hashToken, verifyPassword } from "@/lib/auth/crypto";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
const RESET_TTL_MINUTES = 30;

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type AuthResult = { ok: true; userId: string; mustChangePassword: boolean } | { ok: false; error: string };

const GENERIC = "Invalid email or password.";

export async function authenticate(email: string, password: string, meta: RequestMeta): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`login:ip:${meta.ipAddress ?? "unknown"}`, 30, 15 * 60),
    rateLimit(`login:email:${normalized}`, 10, 15 * 60),
  ]);
  if (!byIp.allowed || !byEmail.allowed) throw new RateLimitError();

  const user = await db.user.findUnique({ where: { email: normalized } });
  const valid = await verifyPassword(password, user?.passwordHash);

  if (!user || !user.isActive) {
    if (user) await audit({ id: user.id, ...meta }, { action: "auth.login_failed", entityType: "User", entityId: user.id, summary: "Inactive account" });
    return { ok: false, error: GENERIC };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: `Account temporarily locked after repeated failures. Try again in ${LOCKOUT_MINUTES} minutes.` };
  }
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    await audit({ id: user.id, ...meta }, {
      action: lock ? "auth.account_locked" : "auth.login_failed",
      entityType: "User",
      entityId: user.id,
      summary: lock ? "Account locked after repeated failed logins" : "Invalid password",
    });
    return { ok: false, error: GENERIC };
  }
  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit({ id: user.id, ...meta }, { action: "auth.login", entityType: "User", entityId: user.id });
  return { ok: true, userId: user.id, mustChangePassword: user.mustChangePassword };
}

/** Always resolves without revealing whether the account exists. */
export async function requestPasswordReset(email: string, meta: RequestMeta): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const limit = await rateLimit(`reset:${normalized}`, 3, 60 * 60);
  const ipLimit = await rateLimit(`reset:ip:${meta.ipAddress ?? "unknown"}`, 10, 60 * 60);
  if (!limit.allowed || !ipLimit.allowed) return;
  const user = await db.user.findUnique({ where: { email: normalized } });
  if (!user || !user.isActive) return;
  const token = generateToken();
  await db.$transaction([
    db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
    }),
  ]);
  await audit({ id: user.id, ...meta }, { action: "auth.password_reset_requested", entityType: "User", entityId: user.id });
  const url = `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your HR Portal password",
    text: `A password reset was requested for your account.\n\nReset link (valid for ${RESET_TTL_MINUTES} minutes):\n${url}\n\nIf you did not request this, you can ignore this email.`,
  });
}

export async function resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ValidationError("This reset link is invalid or has expired. Please request a new one.");
  }
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    });
    await tx.session.deleteMany({ where: { userId: record.userId } });
  });
  await audit({ id: record.userId, ...meta }, { action: "auth.password_reset", entityType: "User", entityId: record.userId });
}

export async function changePassword(userId: string, current: string, next: string, meta: RequestMeta): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw new ValidationError("Current password is incorrect.", { currentPassword: ["Current password is incorrect."] });
  }
  const passwordHash = await hashPassword(next);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false } }),
    db.session.deleteMany({ where: { userId } }),
  ]);
  await audit({ id: userId, ...meta }, { action: "auth.password_changed", entityType: "User", entityId: userId });
}

const INVITE_TTL_HOURS = 72;

/** Sends a "set your password" link to a newly provisioned account. */
export async function sendAccountInvite(userId: string, name: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const token = generateToken();
  await db.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3600_000) },
  });
  const url = `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: "Welcome to the HR Portal — set your password",
    text: `Hello ${name},\n\nAn HR Portal account has been created for you.\nSet your password using this link (valid for ${INVITE_TTL_HOURS} hours):\n${url}`,
  });
}

/** Unusable random password hash for accounts that must be activated via invite. */
export async function placeholderPasswordHash(): Promise<string> {
  return hashPassword(generateToken() + generateToken());
}
