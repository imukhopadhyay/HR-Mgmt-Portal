import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { generateToken, hashToken, verifyPassword } from "@/lib/auth/crypto";
import {
  authenticate,
  changePassword,
  MAX_FAILED_LOGINS,
  requestPasswordReset,
  resetPassword,
} from "@/server/services/auth.service";
import { makePerson, PASSWORD } from "./fixtures";

const meta = { ipAddress: "10.0.0.1", userAgent: "vitest" };

describe("authentication", () => {
  it("accepts valid credentials and rejects invalid ones with a generic error", async () => {
    const p = await makePerson();
    expect(await authenticate(p.email, PASSWORD, meta)).toMatchObject({
      ok: true,
      userId: p.userId,
    });
    const bad = await authenticate(p.email, "wrong-password", meta);
    expect(bad).toEqual({ ok: false, error: "Invalid email or password." });
    expect(await authenticate("nobody@example.test", "x", meta)).toEqual({
      ok: false,
      error: "Invalid email or password.",
    });
  });

  it("locks the account after repeated failures", async () => {
    const p = await makePerson();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++)
      await authenticate(p.email, "nope", { ...meta, ipAddress: `10.1.0.${i}` });
    const r = await authenticate(p.email, PASSWORD, meta);
    expect(r.ok).toBe(false);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: p.userId } })).lockedUntil,
    ).not.toBeNull();
  });

  it("rejects deactivated users", async () => {
    const p = await makePerson();
    await db.user.update({ where: { id: p.userId }, data: { isActive: false } });
    expect((await authenticate(p.email, PASSWORD, meta)).ok).toBe(false);
  });

  it("rate limits brute force per email", async () => {
    const p = await makePerson();
    await db.user.update({ where: { id: p.userId }, data: { lockedUntil: null } });
    let limited = false;
    for (let i = 0; i < 12; i++) {
      try {
        await authenticate(p.email, "nope", { ...meta, ipAddress: `10.2.0.${i}` });
      } catch (e) {
        limited = (e as Error).name === "RateLimitError";
        if (limited) break;
      }
    }
    expect(limited).toBe(true);
  });

  it("resets a password with a single-use token and revokes sessions", async () => {
    const p = await makePerson();
    await db.session.create({
      data: {
        tokenHash: hashToken(generateToken()),
        userId: p.userId,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await requestPasswordReset(p.email, meta);
    const tok = await db.passwordResetToken.findFirstOrThrow({
      where: { userId: p.userId, usedAt: null },
    });
    // Replace stored hash with a known token so we can exercise the flow.
    const token = generateToken();
    await db.passwordResetToken.update({
      where: { id: tok.id },
      data: { tokenHash: hashToken(token) },
    });
    await resetPassword(token, "N3w!Password99", meta);
    const user = await db.user.findUniqueOrThrow({ where: { id: p.userId } });
    expect(await verifyPassword("N3w!Password99", user.passwordHash)).toBe(true);
    expect(await db.session.count({ where: { userId: p.userId } })).toBe(0);
    await expect(resetPassword(token, "An0ther!Password", meta)).rejects.toThrow(
      /invalid or has expired/,
    );
  });

  it("requires the current password to change it", async () => {
    const p = await makePerson();
    await expect(changePassword(p.userId, "wrong", "N3w!Password99", meta)).rejects.toThrow(
      /incorrect/,
    );
    await changePassword(p.userId, PASSWORD, "N3w!Password99", meta);
  });
});
