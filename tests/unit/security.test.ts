import { describe, expect, it } from "vitest";
import { sanitizeFilename, sniffMime, validateUpload } from "@/lib/storage/validation";
import { redact } from "@/lib/logger";
import { computeAuditHash } from "@/lib/audit";
import { hashToken, safeEqual } from "@/lib/auth/crypto";
import { DEFAULT_ROLE_PERMISSIONS, resolveScope } from "@/lib/auth/permissions";
import { password } from "@/lib/validation/common";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

describe("upload validation", () => {
  it("sniffs magic bytes", () => {
    expect(sniffMime(PDF)).toBe("application/pdf");
    expect(sniffMime(new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("rejects spoofed extensions and unknown content", () => {
    expect(validateUpload({ name: "cv.pdf", size: 100 }, PNG).ok).toBe(false);
    expect(
      validateUpload({ name: "x.pdf", size: 100 }, new TextEncoder().encode("<script>")).ok,
    ).toBe(false);
    expect(validateUpload({ name: "doc.pdf", size: 100 }, PDF)).toMatchObject({
      ok: true,
      mime: "application/pdf",
    });
  });
  it("enforces size limits", () => {
    expect(validateUpload({ name: "a.pdf", size: 0 }, PDF).ok).toBe(false);
    expect(validateUpload({ name: "a.pdf", size: 11 * 1024 * 1024 }, PDF).ok).toBe(false);
  });
  it("sanitises filenames", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\x\\..\\my file<script>.pdf")).toBe("my file_script_.pdf");
    expect(sanitizeFilename("...")).toBe("file");
  });
});

describe("secrets handling", () => {
  it("redacts sensitive keys recursively", () => {
    expect(
      redact({ email: "a@b", password: "x", nested: { panNumber: "ABCDE1234F", ok: 1 } }),
    ).toEqual({ email: "a@b", password: "[REDACTED]", nested: { panNumber: "[REDACTED]", ok: 1 } });
  });
  it("hashes tokens with a key and compares in constant time", () => {
    const a = hashToken("token", "x".repeat(32));
    expect(a).not.toBe(hashToken("token", "y".repeat(32)));
    expect(safeEqual(a, a)).toBe(true);
    expect(safeEqual(a, a.slice(1))).toBe(false);
    expect(() => hashToken("t", "short")).toThrow();
  });
  it("audit hashes are canonical and chained", () => {
    const h1 = computeAuditHash(null, { a: 1, b: { c: 2, d: [1, 2] } });
    expect(computeAuditHash(null, { b: { d: [1, 2], c: 2 }, a: 1 })).toBe(h1);
    expect(computeAuditHash("prev", { a: 1, b: { c: 2, d: [1, 2] } })).not.toBe(h1);
  });
  it("enforces password policy", () => {
    expect(password.safeParse("short1!A").success).toBe(false);
    expect(password.safeParse("alllowercase1!").success).toBe(false);
    expect(password.safeParse("NoSymbols12345").success).toBe(false);
    expect(password.safeParse("Valid!Passw0rd").success).toBe(true);
  });
});

describe("RBAC catalog", () => {
  it("employees get only self-service permissions", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.EMPLOYEE).toEqual(["directory:read"]);
  });
  it("only Super Admin manages system settings", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN).toContain("settings:manage");
    expect(DEFAULT_ROLE_PERMISSIONS.HR_ADMIN).not.toContain("settings:manage");
  });
  it("HR managers cannot see payroll or the audit trail", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.HR_MANAGER).not.toContain("payroll:read");
    expect(DEFAULT_ROLE_PERMISSIONS.HR_MANAGER).not.toContain("audit:read");
  });
  it("resolves the widest scope", () => {
    expect(resolveScope(new Set(DEFAULT_ROLE_PERMISSIONS.REPORTING_MANAGER), "leave")).toBe("team");
    expect(resolveScope(new Set(DEFAULT_ROLE_PERMISSIONS.DEPARTMENT_HEAD), "leave")).toBe(
      "department",
    );
    expect(resolveScope(new Set(DEFAULT_ROLE_PERMISSIONS.HR_MANAGER), "leave")).toBe("all");
    expect(resolveScope(new Set(DEFAULT_ROLE_PERMISSIONS.EMPLOYEE), "leave")).toBe("self");
  });
});
