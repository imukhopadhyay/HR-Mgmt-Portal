import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;
// Pre-computed hash used to equalise timing when a user does not exist.
const DUMMY_HASH = "$2b$12$R0VeHrK9ZwZ4tRGZa6RrKO49EM/fw8T4vP/8lalffIiCoLiNoJsu6";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

/** Opaque random token for cookies / emailed links (256 bits). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Keyed hash so a leaked DB alone cannot be used to forge tokens. */
export function hashToken(token: string, secret = process.env.SESSION_SECRET ?? ""): string {
  if (secret.length < 32) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
