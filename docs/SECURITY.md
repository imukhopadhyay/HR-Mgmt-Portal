# Security & privacy

## Controls implemented

| Area | Control | Where |
| --- | --- | --- |
| Authentication | bcrypt (cost 12); 256-bit opaque session tokens stored as HMAC-SHA256; httpOnly, `Secure`, `SameSite=Lax`, `__Host-` cookie in production; idle timeout + 7-day absolute lifetime; sessions revoked on password change/reset, role change and deactivation | `src/lib/auth/*` |
| Brute force | Per-email (10/15 min) and per-IP (100/15 min) DB-backed rate limits; account lockout after 5 failures for 15 min; generic errors; constant-time path for unknown users | `auth.service.ts`, `rate-limit.ts` |
| Password reset | Single-use, 30-minute keyed tokens; no account enumeration; invites expire in 72h | `auth.service.ts` |
| Authorization | Permission checks in every service, not just the UI; scoped data access (self/team/department/all); no self-approval; payroll segregation of duties; Super Admin changes restricted | `rbac.ts`, services |
| CSRF | Next.js Server Action origin checks; middleware rejects cross-origin non-GET `/api` requests; SameSite cookies | `middleware.ts` |
| Input validation | Zod schemas on every action and route input; Prisma parameterised queries; raw SQL only via tagged templates | `src/lib/validation` |
| Uploads | 10 MB limit, allow-listed types verified by magic bytes, extension must match content, sanitised names, random storage keys, private storage, authorised download route with `attachment` disposition and sandbox CSP | `storage/validation.ts`, `api/documents` |
| Exports | Formula-injection neutralisation for CSV/XLSX; export actions audited | `lib/export.ts` |
| Headers | CSP, HSTS (prod), `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP | `next.config.ts` |
| Audit | Append-only `AuditLog` (DB trigger blocks UPDATE/DELETE/TRUNCATE) with SHA-256 hash chain and in-app verification; sensitive values redacted | `lib/audit.ts`, migration |
| Secrets | Validated env; production refuses placeholder secrets and the console email driver; `.env*` git-ignored | `lib/env.ts` |
| Logging | Structured logs with key-based redaction of secrets/PII | `lib/logger.ts` |
| Data minimisation | No Aadhaar stored; statutory/bank data in a separate table readable only with `employee:sensitive:read`; payslips mask PAN/UAN/account numbers | schema, `payroll.service.ts` |

## Privacy (DPDP Act 2023) — configurable controls

- **Access:** employees can download their personal data (account menu → *Download my data*).
- **Correction:** profile update requests reviewed by HR.
- **Retention & erasure:** policy in *HR configuration → Privacy & retention*; daily job anonymises
  ex-employees after the configured period while keeping statutory payroll/attendance figures.
- **Purpose limitation:** role-based scoping; managers see job data, not personal data.

These controls support but do not by themselves establish compliance. Before production, Legal/HR
must review: privacy notice and consent language, retention periods (Income-tax, EPF/ESI, Shops &
Establishments and labour-code record-keeping), cross-border transfer (hosting region), grievance
officer details, and breach-notification procedures.

## Known accepted risks / follow-ups

- `npm audit` reports high-severity advisories in the **Prisma CLI's** config loader
  (`deepmerge-ts`, prototype/stack issues on attacker-controlled config). It runs only at build/migrate
  time on trusted input; track Prisma releases and upgrade when fixed.
- CSP allows `'unsafe-inline'` scripts/styles (needed by Next.js without nonce middleware). A nonce-based
  CSP is a recommended hardening step.
- Rate limiting is DB-backed (adequate for HR-portal traffic); consider an edge WAF/rate limiter for
  internet-exposed deployments.
- Malware scanning of uploads is not included; add an AV scan (e.g. S3 + GuardDuty Malware Protection
  or ClamAV) before enabling uploads from untrusted parties.
- MFA/SSO is not implemented; integrating the organisation's IdP (SAML/OIDC) is recommended.
