# Implementation report

Date: 3 October 2026 · Branch: `claude/funny-planck-a5puvf`

## Summary

The repository was empty, so the portal was built from scratch with the requested stack (Next.js 15
App Router, React 19, TypeScript, Tailwind 4, shadcn/ui, Prisma 6, PostgreSQL 16, Zod, React Hook
Form, Recharts, Vitest, Playwright). Every module in the brief has working database-backed workflows,
server-side authorization, validation, audit logging and tests. **Nothing has been deployed** — that
needs your credentials and approval.

## Verification performed

| Check | Result |
| --- | --- |
| `npm run lint` (ESLint, zero warnings allowed) | ✅ pass |
| `npm run typecheck` (strict TS) | ✅ pass |
| `npm run format:check` | ✅ pass |
| Unit tests (Vitest) | ✅ 54 / 54 |
| Integration tests on real PostgreSQL (isolated schema per run) | ✅ 27 / 27, stable over 6 consecutive full-suite runs (files run in parallel) |
| E2E (Playwright: desktop, tablet, mobile, axe-core WCAG 2 A/AA) | ✅ 26 / 26 against the **production build** (`next start`), two consecutive runs |
| `npm run build` | ✅ success (50 routes) |
| Migration drift (`prisma migrate diff` vs shadow DB) | ✅ no difference |
| Backup → restore into empty DB | ✅ checksum verified, data present, `migrate status` clean, audit trigger active |
| Bootstrap script on empty DB | ✅ idempotent |
| Response times (production build, local, 42-employee seed) | Dashboard ~50 ms, directory ~30 ms, team attendance ~55 ms, analytics ~30 ms, XLSX export ~35 ms (median of 5) |

Bugs found and fixed through testing (worth noting because they would have reached production):

1. **Audit hash chain could fork under concurrency** — services running SERIALIZABLE transactions read
   a stale "previous" audit row. Fixed by using READ COMMITTED + row locks, adding a runtime guard in
   `writeAudit`, and adding a concurrency regression test.
2. **Statutory-rule validation turned open-ended tax/PT slabs (`null`) into `0`**, which would have
   silently corrupted saved rules. Fixed and covered by a unit test.
3. **Server components passed closures to client components** (runtime error in confirmation dialogs) —
   replaced with bound server actions.
4. Recharts axes inside fragments rendered empty bar charts — fixed.
5. Per-IP login limit (30/15 min) would have locked out an office behind a single NAT — raised to 100,
   per-account limits and lockout unchanged.
6. Console email driver logs reset links — now refused in production.

## Module status

| Module | Status | Notes |
| --- | --- | --- |
| Foundation, auth, RBAC | Complete | Custom DB sessions chosen over Auth.js (immediate revocation; documented in CLAUDE.md). No MFA/SSO yet |
| Dashboard | Complete | Personal, team and organisation sections; date-range/department filters; charts with table views |
| Employees | Complete | Includes documents, checklists, history, statutory data, exports |
| Departments & hierarchy | Complete | Org chart is a collapsible tree (not a graphical diagram) |
| Attendance | Complete | Web check-in only (no biometric/geo integration) |
| Leave | Complete | Holiday-aware; 1- or 2-level approvals; year-end rollover is a manual HR action |
| Payroll | Complete, **requires statutory review** | TDS is a projection (no investment declarations, prior-employer income or marginal relief); PT is monthly slabs without February adjustment; no Form 16/24Q/ECR filings |
| Recruitment & onboarding | Complete | Offer letter is a generated template (no e-signature); no public careers page |
| Performance | Complete | No 360° feedback or calibration workflow (final rating entered by reviewer) |
| Training | Complete | No LMS content hosting; certificates are recorded, not generated as PDFs |
| Self-service | Complete | |
| Analytics & exports | Complete | CSV/XLSX/PDF |
| Audit, security, privacy | Complete | See `docs/SECURITY.md` for accepted risks |
| CI/CD & deployment assets | Written, not yet executed on GitHub/Vercel | |

## Outstanding / requires your action

1. **Credentials** to deploy staging: Vercel project, managed PostgreSQL (pooled + direct URLs), S3-compatible
   bucket, SMTP provider, and a production domain. Then follow `docs/DEPLOYMENT.md` (staging first).
2. **Explicit approval** before production deployment or any production data change.
3. **Compliance review**: HR/Finance (payroll statutory rules), Legal (retention periods, DPDP privacy
   notice, grievance officer, breach procedures).
4. **First CI run** on GitHub to confirm the workflows in this environment-independent form.

## Known limitations & recommendations

- Load testing at realistic scale (thousands of employees, concurrent payroll runs) was not performed;
  queries are indexed and bounded, but run a load test on staging before go-live.
- shadcn/ui components were authored to the shadcn new-york spec because the shadcn registry host is
  blocked in this build environment; they use the same Radix primitives.
- No MFA/SSO, no antivirus scanning of uploads, CSP uses `'unsafe-inline'` (see `docs/SECURITY.md`).
- Single legal entity and INR only; multi-entity/multi-currency would need schema changes.
- Times display in `APP_TIMEZONE` (default Asia/Kolkata) for all users.
- E2E tests mutate the seeded database (they create employees and leave records) — run them against
  a disposable database (as CI does), never against staging/production data.
- The local development database names used during this session (`hrportal_v4`, etc.) are local only.
