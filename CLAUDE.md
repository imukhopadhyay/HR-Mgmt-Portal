# CLAUDE.md — Enterprise HR Management Portal

Guidance for anyone (human or AI) working in this repository.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15.5 (App Router, Server Components, Server Actions), React 19, TypeScript (strict) |
| UI | Tailwind CSS 4, shadcn/ui (new-york, authored in `src/components/ui` on Radix via `radix-ui`), Lucide icons, Recharts, Sonner toasts, next-themes |
| Data | PostgreSQL 16, Prisma 6 (`prisma/schema.prisma`, SQL migrations in `prisma/migrations`) |
| Auth | Custom DB-backed sessions (see "Security"); bcrypt (cost 12) |
| Validation | Zod 3 schemas in `src/lib/validation/*`, shared by React Hook Form and server actions |
| Files | Storage driver abstraction: local disk (dev) or any S3-compatible bucket (`src/lib/storage`) |
| Email | Nodemailer SMTP, console driver for dev (`src/lib/email`) |
| Tests | Vitest (unit + integration against a real Postgres test DB), Playwright (E2E) |
| Deploy | Vercel + managed PostgreSQL; GitHub Actions CI |

## Commands

```bash
npm run dev              # start dev server on :3000
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint (next/core-web-vitals + typescript)
npm run format           # Prettier
npm run test:unit        # pure business-logic tests (no DB)
npm run test:integration # service tests against TEST_DATABASE_URL (database is RESET)
npm run test:e2e         # Playwright (needs a seeded dev DB + running/buildable app)
npm run db:migrate       # create/apply a dev migration (prisma migrate dev)
npm run db:deploy        # apply migrations (CI/staging/production)
npm run db:seed          # synthetic demo data (skips a non-empty DB); runs tsx with --conditions=react-server
npm run db:reset         # drop + migrate + seed (DEV ONLY — Prisma requires explicit human consent)
scripts/bootstrap.ts     # first-run setup for staging/production (no demo data)
scripts/backup.sh / restore.sh   # logical backups; restore only into an empty database
node scripts/smoke-pages.mjs <outDir> <email> /path…   # screenshot + console-error smoke check
npm run build            # prisma generate + next build
```

Demo accounts after seeding (password `Passw0rd!2026` unless `SEED_PASSWORD` set):
`admin@acme.test` (Super Admin), `hradmin@acme.test` (HR Admin), `hrmanager@acme.test` (HR Manager),
`enghead@acme.test` (Department Head), `manager@acme.test` (Reporting Manager), `employee@acme.test` (Employee).

## Architecture

```
src/
  app/(auth)/…            login, forgot/reset password (public)
  app/(portal)/…          authenticated app shell + module pages (Server Components)
  app/api/…               route handlers: file downloads, exports, payslip PDFs, cron, health
  components/ui/          shadcn/ui primitives (do not put business logic here)
  components/shared/      reusable app components (filters, pagination, forms, badges…)
  components/layout/      sidebar, top bar, nav config
  lib/                    cross-cutting: db, env, auth, rbac, audit, storage, email, dates, validation
  server/services/        BUSINESS LOGIC + AUTHORIZATION. Pure TS, takes an `actor`, testable.
  server/actions/         "use server" wrappers: auth → zod validation → service → ActionResult
  middleware.ts           cookie presence gate + CSRF origin check for API mutations
prisma/                   schema, migrations, synthetic seed
tests/unit|integration|e2e
```

Rules:

1. **Every mutation goes through a service** in `src/server/services`. Services take an `Actor`
   (`SessionUser` + request meta), perform authorization themselves, validate business rules,
   run multi-step writes in `db.$transaction`, and call `writeAudit(tx, …)` inside the same transaction.
2. **Server actions** (`src/server/actions`) only: call `runAction(schema, input, handler)` → service.
   Never trust client-provided ids for ownership; resolve them against the actor's scope.
3. **Pages** load data via services or scoped Prisma queries. Use `requireUser()` / `requirePagePermission()`
   from `src/lib/auth/guard.ts`. Hiding a button is never the only control — the service enforces it too.
4. **Reads are scoped** with `employeeScopeWhere(actor, "employee" | "attendance" | "leave")`
   (self ∪ reporting tree ∪ headed departments, or all).
5. **Validation schemas** live in `src/lib/validation` and are shared between client forms and the server.
6. Calendar days are `YYYY-MM-DD` keys in business logic (`src/lib/dates.ts`), persisted as `@db.Date`.
   Business timezone is `APP_TIMEZONE` (default Asia/Kolkata).
7. Money is `Decimal(14,2)`; convert with `toNumber()` and round with `round2()` only at the edges.
8. Soft-delete business records (`deletedAt`); always filter `deletedAt: null`.
9. **Transactions that call `writeAudit` must run at READ COMMITTED** (the default). Never use
   `Serializable`/`RepeatableRead` there — the snapshot would predate the audit advisory lock and fork
   the hash chain (`writeAudit` throws if violated). Serialise competing writes with row locks
   (`SELECT … FOR UPDATE`) or conditional `updateMany` "claims" on the expected state instead.
10. Never pass functions from Server to Client Components. For confirm dialogs pass a bound server
    action: `action={someAction.bind(null, id)}`.
11. Recharts discovers axes by scanning direct children — don't wrap `<XAxis>`/`<YAxis>` in fragments.

## RBAC

- Permission catalog + default role mapping: `src/lib/auth/permissions.ts` (source of truth),
  synced into `Role`/`Permission`/`RolePermission` by the seed (`syncRolesAndPermissions`).
- Roles: SUPER_ADMIN, HR_ADMIN, HR_MANAGER, DEPARTMENT_HEAD, REPORTING_MANAGER, EMPLOYEE. Users may hold several.
- REPORTING_MANAGER / DEPARTMENT_HEAD are **derived** from org data by `syncDerivedRoles()` whenever
  reporting lines or department heads change.
- Scoped permissions use `resource:read:{all|department|team}`; self-access is implicit.
- Approvals: users can never approve their own requests. Payroll approver must differ from the processor.

## Security requirements (non-negotiable)

- Sessions: 256-bit random token in an `httpOnly`, `SameSite=Lax`, `Secure` (prod, `__Host-` prefix) cookie;
  only an HMAC-SHA256 of the token is stored. Idle timeout `SESSION_TTL_HOURS`, absolute 7 days.
  Password change/reset revokes all sessions. Deactivated users lose access on the next request.
  *Why not Auth.js?* Auth.js v5 with credentials requires stateless JWT sessions, which cannot be
  revoked immediately on deactivation/password reset — a hard requirement for an HR system.
- Login: DB-backed rate limits (per IP and per email), lockout after 5 failures for 15 minutes,
  constant-time responses for unknown users, generic error messages.
- CSRF: Server Actions are origin-checked by Next.js; middleware rejects cross-origin non-GET `/api` calls;
  cookies are `SameSite=Lax`.
- Security headers (CSP, HSTS, frame-ancestors none, nosniff…) in `next.config.ts`.
- Uploads: 10 MB limit, MIME allow-list verified by magic bytes, sanitized filenames, random storage keys,
  served only through authorized route handlers (`/api/documents/[id]`) with `Content-Disposition: attachment`.
- Sensitive data (`EmployeeFinancialInfo`, DOB, address, salary) requires `employee:sensitive:read` /
  payroll permissions; never select it in list queries.
- Audit trail: `AuditLog` is append-only (DB trigger blocks UPDATE/DELETE/TRUNCATE) and hash-chained;
  verify integrity from **Admin → Audit trail**.
- Logger redacts secrets/PII keys. Never log request bodies containing personal data.
- Never commit `.env*` (except `.env.example`), real employee data, or credentials.
- Never run destructive migrations against production without explicit approval and a verified backup.

## Conventions

- TypeScript strict, no `any` (use `unknown` + narrowing). Named exports except Next.js pages/layouts.
- File names kebab-case; services `*.service.ts`; actions grouped per module in `server/actions/<module>.ts`.
- UI: use `PageHeader`, `FilterBar`, `Pagination`, `EmptyState`, `StatusBadge`, `ConfirmAction`, `FormField`.
  All forms use React Hook Form + `zodResolver` + `useAction` (toasts + field error mapping).
- Accessibility: label every input (`FormField`), use semantic tables, keep focus states, dialogs via Radix.
- Add/adjust tests with every business-rule change (unit for pure logic, integration for services).

## Testing notes

- Integration tests create a uniquely named schema in `TEST_DATABASE_URL` per run and drop it afterwards.
- E2E tests authenticate once per role (`tests/e2e/auth.setup.ts`) — logging in per test trips the
  login rate limits. They expect the synthetic seed and are written to be repeatable.

## Assumptions (documented defaults)

- Single legal entity, INR currency, Indian statutory deductions (PF/ESI/PT/TDS new regime) as **configurable
  defaults** in Settings → Payroll statutory rules. They must be validated by HR/Finance before production use.
- Leave days exclude the employee's shift weekly-offs and company holidays. Half-day = 0.5.
- Leave approval: level 1 = reporting manager (or HR if none); level 2 (when the leave type requires it) = HR.
- Attendance: one record per employee per day; absence auto-marking runs via the daily cron job.
- Payroll LOP = approved unpaid-leave days + days marked ABSENT in the month; earnings are prorated by calendar days.
