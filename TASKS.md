# TASKS.md — Implementation checklist

Legend: `[x]` implemented & verified (tests and/or browser) · `[~]` partial (see note) · `[ ]` not done

## Phase 1 — Foundation & infrastructure
- [x] Repository inspection (empty repo → greenfield) and architecture decision (CLAUDE.md)
- [x] Next.js 15 + TypeScript strict, Tailwind 4, shadcn/ui (authored on Radix — registry host blocked), Lucide
- [x] Modular structure (`app`, `components`, `lib`, `server/services`, `server/actions`)
- [x] Prisma + PostgreSQL, normalised schema (all requested models + supporting ones), initial migration, append-only audit trigger
- [x] Authentication: login, logout, DB sessions, password reset, invite, change password, lockout, rate limits
- [x] RBAC: 6 roles, permission catalog, scoped access, derived manager/head roles
- [x] Route protection (middleware + server guards), server-side authorization, permission-aware UI
- [x] Env validation (fail-fast at boot), `.env.example`, secret hygiene
- [x] Reusable UI, error boundaries, 404/forbidden mapping, structured logger, notifications (in-app + email)
- [x] ESLint, Prettier, Vitest, Playwright

## Phase 2 — Core HR modules
- [x] Application shell, responsive sidebar/mobile nav, top bar (notifications, quick actions, profile, theme)
- [x] Role-specific dashboards with real aggregates, charts, date-range and department filters
- [x] Employee management (CRUD, archive, unique IDs, profiles, contacts, photo, documents, on/offboarding, directory search/filter/pagination/export, history, audit)
- [x] Departments, designations/job levels, heads, hierarchy, org chart, department stats, transfers
- [x] Attendance (check-in/out, calendar, shifts, holidays, weekly offs, late/early/OT, corrections + approval, monthly summaries, CSV/XLSX/PDF, absentee job)
- [x] Leave (types/policies, accrual, carry-forward, balances, apply, multi-level approval, modification, withdraw/cancel, holiday-aware counting, team calendar, history, reports, email + in-app notifications)

## Phase 3 — Advanced modules
- [x] Payroll (structures, earnings/allowances/deductions, configurable PF/ESI/PT/TDS, LOP, processing, SoD approval, PDF payslips, history, register/bank/journal exports)
- [x] Recruitment & onboarding (requisitions + approval, candidates, résumé upload, pipeline, interviews + feedback, ICS invites, offer letters, analytics, hire → onboarding checklist & document transfer)
- [x] Performance (cycles, KPIs/goals with weights, self & manager reviews, history, development plans)
- [x] Training (programmes, enrolment, calendar, attendance/completion, certificates, skills, effectiveness report)
- [x] Employee self-service (profile & update requests, attendance, leave, payslips, documents, announcements, help desk)

## Phase 4 — Analytics, security & integration
- [x] HR analytics dashboard (org/department, turnover, attendance, leave, recruitment, workforce trends) + CSV/XLSX/PDF
- [x] Immutable audit trail viewer + hash-chain verification
- [x] Server-side authorization everywhere; input validation; upload sanitisation; CSRF; security headers; rate limiting
- [x] Privacy controls: personal data export, retention policy, anonymisation job
- [x] Email notifications (SMTP driver), calendar integration (ICS per interview + personal feed)
- [x] Backup/restore scripts (restore exercised) and documented recovery procedures
- [~] Indian compliance: statutory rules and retention are configurable with defaults — **must be reviewed by HR/Finance/Legal before production**

## Phase 5 — Testing & QA
- [x] Unit tests — 54 (dates, leave rules & entitlement, attendance metrics, payroll engine, uploads, crypto, audit hashing, RBAC catalog, validation, exports)
- [x] Integration tests — 27 against real PostgreSQL (auth, lockout, rate limits, reset; RBAC scopes; employee lifecycle; leave workflow; attendance; payroll SoD/payslip access; audit immutability & chain; documents; concurrency)
- [x] E2E — 26 Playwright (login/validation, RBAC & API denial, CSRF, headers, employee create/search/export, attendance, leave apply→approve→cancel, mobile & tablet, axe a11y)
- [x] Migration validation: drift check vs. shadow DB, replay on empty schema, backup→restore
- [~] Performance testing: indexes on hot paths and bounded queries; no load test was run (see report)

## Phase 6 — Deployment
- [x] CI workflow (lint, typecheck, format, unit, integration, drift, audit, build, E2E) — written, **not yet executed on GitHub**
- [x] Manual migration workflow with environment approvals and backup confirmation
- [x] `vercel.json` (region, cron), production checklist, deployment/operations/security docs, bootstrap script
- [x] Production build verified locally; E2E passes against `next start`
- [ ] Staging deployment — **requires owner credentials (Vercel, PostgreSQL, S3, SMTP)**
- [ ] Production deployment — **requires explicit approval**
