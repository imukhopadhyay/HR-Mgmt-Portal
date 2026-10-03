# TASKS.md — Implementation checklist

Legend: `[x]` done & verified · `[~]` partial (see notes) · `[ ]` not started

## Phase 1 — Foundation & infrastructure
- [x] Repository inspection (empty repo → greenfield) and architecture decision
- [x] Next.js 15 + TypeScript strict, Tailwind 4, shadcn/ui components, Lucide
- [x] Modular folder structure (`app`, `components`, `lib`, `server/services`, `server/actions`)
- [x] Prisma + PostgreSQL, normalized schema, initial migration (+ append-only audit trigger)
- [x] Authentication: login, logout, DB sessions, password reset, change password, lockout, rate limits
- [x] RBAC: 6 roles, permission catalog, scoped access helpers, derived roles
- [x] Route protection (middleware + server guards), permission-based navigation
- [x] Environment validation (`src/lib/env.ts`), `.env.example`
- [x] Reusable UI, error boundaries, structured logger, notifications infrastructure
- [x] ESLint, Prettier, Vitest, Playwright configuration

## Phase 2 — Core HR modules
- [ ] Application shell & role-specific dashboards
- [ ] Employee management (CRUD, archive, IDs, profiles, contacts, documents, on/offboarding, directory, export, history)
- [ ] Departments, designations, hierarchy, org chart, transfers
- [ ] Attendance (check-in/out, calendar, shifts, holidays, corrections + approvals, summaries, exports)
- [ ] Leave (types/policies, balances, apply, multi-level approval, cancel/withdraw, team calendar, reports, notifications)

## Phase 3 — Advanced modules
- [ ] Payroll (structures, statutory config, processing, approval, payslips, exports)
- [ ] Recruitment & onboarding (requisitions, candidates, pipeline, interviews, offers, analytics)
- [ ] Performance (cycles, goals/KPIs, self & manager reviews, history, development plans)
- [ ] Training (programmes, enrolment, completion, certifications/skills, effectiveness)
- [ ] Employee self-service (profile update requests, help desk, documents, payslips)

## Phase 4 — Analytics, security & integration
- [ ] HR analytics dashboard + CSV/Excel/PDF exports
- [ ] Immutable audit trail viewer + integrity verification
- [ ] Privacy controls & retention job, personal data export
- [ ] Email notifications, calendar (ICS) integration
- [ ] Backup & recovery documentation

## Phase 5 — Testing & QA
- [ ] Unit tests (dates, leave calc, attendance metrics, payroll engine, validation, uploads)
- [ ] Integration tests (auth, RBAC scope, employees, leave workflow, attendance, payroll, audit immutability)
- [ ] E2E (login, RBAC, employee mgmt, attendance, leave approval, responsive)

## Phase 6 — Deployment
- [ ] CI workflow (lint, typecheck, unit, integration, build, e2e)
- [ ] Vercel config, cron, production checklist, deployment docs
- [ ] Staging deployment — **requires credentials/approval from the owner**
- [ ] Production deployment — **requires explicit approval**
