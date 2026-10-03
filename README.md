# Enterprise HR Management Portal

A secure, role-based HR portal for Indian organisations: employees, organisation structure,
attendance, leave, payroll, recruitment, performance, training, self-service and analytics —
built with Next.js 15, TypeScript, PostgreSQL and Prisma.

> **Status:** feature-complete for the scope in [`TASKS.md`](TASKS.md); verified locally with
> lint, type checks, 81 unit/integration tests, 26 Playwright E2E tests and a production build.
> It has **not** been deployed to staging or production yet — see
> [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and [`IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md).

## Features

| Area | Highlights |
| --- | --- |
| Access | DB-backed sessions, lockout, rate limiting, password reset/invite, 6 roles with scoped permissions (self / team / department / all) |
| Dashboard | Role-specific: my day, team approvals & presence, organisation KPIs, attendance trend, headcount trend, announcements, holidays |
| Employees | Directory (search, filters, pagination, CSV/XLSX/PDF export), profiles, emergency contacts, documents with verification, history, onboarding/offboarding checklists, transfers/promotions, exits, statutory & bank details |
| Organisation | Departments (hierarchy, heads), designations & job levels, org chart, department statistics |
| Attendance | Check-in/out, monthly calendar, shifts & weekly-offs, holidays, late/early/overtime, corrections with approval, team roll-call, monthly reports, absentee job |
| Leave | Configurable types & policies, accrual, carry-forward, balances, half days, multi-level approvals, modification requests, withdrawal/cancellation, team calendar, reports, notifications |
| Payroll | Salary structures, configurable PF/ESI/PT/TDS rules, LOP from attendance & unpaid leave, process → approve (segregation of duties) → paid, PDF payslips, register / bank / journal exports |
| Recruitment | Requisitions with approval, candidates & résumés, pipeline, interviews & feedback, calendar invites, offer letters, hire-to-employee with onboarding |
| Performance | Cycles, goals/KPIs with weights, self & manager reviews, development plans, history |
| Training | Programmes, calendar, enrolment (self/bulk), attendance & completion, certificates, skills, effectiveness |
| Self-service | Profile update requests, HR help desk, payslips, documents, personal data export, personal ICS calendar |
| Analytics | Turnover, attendance rate, leave utilisation, tenure, recruitment funnel, workforce trends; CSV/XLSX/PDF |
| Governance | Append-only hash-chained audit log, retention & anonymisation, security headers, CSRF protection |

## Quick start (local)

Prerequisites: Node.js ≥ 20.18 (22 recommended), PostgreSQL 14+ (16 recommended).

```bash
git clone <repo> && cd HR-Mgmt-Portal
npm ci
cp .env.example .env               # then edit values (see below)
createdb hrportal                  # or use any empty PostgreSQL database
npm run db:deploy                  # apply migrations
npm run db:seed                    # synthetic demo data (fictional company)
npm run dev                        # http://localhost:3000
```

Minimum `.env` for development:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/hrportal?schema=public"
DIRECT_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/hrportal?schema=public"
SESSION_SECRET="<output of: openssl rand -base64 48>"
EMAIL_DRIVER="console"     # dev only — emails (incl. reset links) are printed to the server log
STORAGE_DRIVER="local"
```

### Demo accounts

All seeded data is synthetic (fictional names, reserved `.test` email domain). Password:
`Passw0rd!2026` (or `SEED_PASSWORD`).

| Email | Role | Try |
| --- | --- | --- |
| `admin@acme.test` | Super Admin (CEO) | Settings → statutory rules & retention, users & roles, audit verification, payroll approval |
| `hradmin@acme.test` | HR Administrator | Payroll processing, all modules |
| `hrmanager@acme.test` | HR Manager | Employees, leave/attendance approvals (HR level), recruitment, training |
| `enghead@acme.test` | Department Head (Engineering) | Department-scoped team views and approvals |
| `manager@acme.test` | Reporting Manager | Team approvals, reviews, interviews |
| `employee@acme.test` | Employee | Self-service: attendance, leave, payslips, goals, help desk |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build (runs `prisma generate`), serve production build |
| `npm run lint` / `typecheck` / `format` / `format:check` | Code quality |
| `npm run test:unit` | Pure business-logic tests (no DB) |
| `npm run test:integration` | Service tests against a real PostgreSQL. Uses `TEST_DATABASE_URL` (database name must contain `test`); each run creates and drops its own schema |
| `npm run test:e2e` | Playwright (desktop, tablet, mobile, axe accessibility). Needs a seeded DB; starts `npm run dev` automatically, or set `BASE_URL` to test a running server |
| `npm run db:migrate` | Create a new migration in development |
| `npm run db:deploy` | Apply committed migrations (CI / staging / production) |
| `npm run db:seed` | Seed synthetic data (skips if users exist) |
| `scripts/backup.sh` / `scripts/restore.sh` | Logical backups and verified restore into an empty database |

## Configuration

All variables are documented in [`.env.example`](.env.example) and validated at startup by
[`src/lib/env.ts`](src/lib/env.ts) (the app refuses to start in production with a placeholder
`SESSION_SECRET` or with the console email driver).

External services that need **your credentials** before production:

| Service | Variables | Notes |
| --- | --- | --- |
| Managed PostgreSQL (Neon, Supabase, RDS, Azure, …) | `DATABASE_URL` (pooled), `DIRECT_DATABASE_URL` (direct) | TLS required (`sslmode=require`); Mumbai region recommended for data residency |
| S3-compatible storage (AWS S3, Cloudflare R2, MinIO…) | `STORAGE_DRIVER=s3`, `S3_*` | Private bucket, no public ACLs; server-side encryption is requested on upload |
| SMTP (SES, Postmark, SendGrid, M365…) | `EMAIL_DRIVER=smtp`, `SMTP_*`, `EMAIL_FROM` | Configure SPF/DKIM/DMARC for the sender domain |
| Scheduler | `CRON_SECRET` | Vercel Cron calls `/api/cron/daily` (absentee marking, leave accrual, retention) |
| Error tracking (optional) | — | Structured logs + `onRequestError` hook in `src/instrumentation.ts`; forward to Sentry etc. if desired |

Local disk storage (`STORAGE_DRIVER=local`) is **not** suitable for Vercel (ephemeral filesystem).

## Architecture

See [`CLAUDE.md`](CLAUDE.md) for conventions and architectural rules. In short:

- **Server Components** render pages; **Server Actions** handle mutations via
  `runAction(schema, input, handler)` → **services** in `src/server/services`, which enforce
  authorization and business rules and write audit entries in the same transaction.
- **Prisma/PostgreSQL** with a normalised schema (`prisma/schema.prisma`), soft deletion for
  business records, and a DB trigger making `AuditLog` append-only.
- **RBAC**: permission catalog in `src/lib/auth/permissions.ts`; scoped data access via
  `employeeScopeWhere()`; derived roles for managers and department heads.

## Documentation

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel + managed PostgreSQL, CI/CD, staging, production checklist
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — backups, recovery, monitoring, incident response, jobs
- [`docs/SECURITY.md`](docs/SECURITY.md) — security controls, privacy, compliance notes for India
- [`TASKS.md`](TASKS.md) — phased checklist · [`IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md) — status and known limitations
