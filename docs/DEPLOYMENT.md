# Deployment guide — Vercel + managed PostgreSQL

> Nothing in this repository has been deployed yet. Staging and production require
> credentials and an explicit go-ahead from the system owner (see "Approvals" below).

## 1. Provision services (per environment: `staging`, `production`)

| Service | Recommendation | Notes |
| --- | --- | --- |
| Hosting | Vercel project linked to this GitHub repository | Region `bom1` (Mumbai) is set in `vercel.json` |
| Database | Managed PostgreSQL 16 (Neon / Supabase / AWS RDS / Azure) in an Indian region | Two connection strings: **pooled** for the app, **direct** for migrations. Enforce TLS. Enable point-in-time recovery (PITR) |
| Object storage | Private S3-compatible bucket (AWS S3 `ap-south-1`, Cloudflare R2, …) | Block public access, default encryption on, versioning on, lifecycle for old versions |
| Email | SMTP provider (Amazon SES, Postmark, SendGrid, Microsoft 365) | Verified sender domain with SPF, DKIM, DMARC |
| DNS / TLS | Custom domain on Vercel | Vercel issues and renews certificates automatically; HSTS is sent by the app |

Use **separate** databases, buckets and secrets for staging and production.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

Set for **Preview (staging)** and **Production** separately — never reuse production secrets.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Pooled URL, e.g. `postgresql://…-pooler…/hrportal?sslmode=require&pgbouncer=true&connection_limit=5` |
| `DIRECT_DATABASE_URL` | Direct (non-pooled) URL with `sslmode=require` |
| `APP_URL` | `https://hr.example.com` (no trailing slash) |
| `APP_TIMEZONE` | `Asia/Kolkata` |
| `SESSION_SECRET` | `openssl rand -base64 48` (unique per environment) |
| `SESSION_TTL_HOURS` | `12` (idle timeout) |
| `STORAGE_DRIVER` | `s3` and `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (+ `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` for R2/MinIO) |
| `EMAIL_DRIVER` | `smtp` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM` |
| `CRON_SECRET` | `openssl rand -hex 32` — Vercel Cron sends it as `Authorization: Bearer …` |
| `COMPANY_NAME` | Legal entity name printed on payslips and offer letters |
| `LOG_LEVEL` | `info` |

The IAM user for S3 should only have `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on the bucket.

## 3. CI/CD

- **`.github/workflows/ci.yml`** runs on every push/PR: `npm ci`, Prisma validate, lint, typecheck,
  Prettier check, unit tests, integration tests (PostgreSQL service), migration drift check,
  production dependency audit, migration replay, production build and Playwright E2E against the
  built app with seeded synthetic data.
- **Vercel** builds previews for PRs and production from `main` (`npm run build`). Builds do **not**
  run migrations.
- **`.github/workflows/migrate.yml`** applies migrations manually per environment. Configure GitHub
  Environments `staging` and `production` with **required reviewers** and secrets
  `DATABASE_URL`/`DIRECT_DATABASE_URL`. Production runs refuse to start without confirming a fresh
  verified backup.
- Recommended branch protection on `main`: require CI to pass and one review.

## 4. First deployment (staging first)

1. Create the staging database, bucket and SMTP credentials; set Preview env vars in Vercel.
2. Run **Database migrations** workflow → `staging`.
3. Bootstrap (idempotent, no demo data) with the target environment's variables:
   ```bash
   ADMIN_EMAIL=it.admin@company.in ADMIN_FIRST_NAME=Asha ADMIN_LAST_NAME=Rao \
     npx tsx --conditions=react-server scripts/bootstrap.ts
   ```
   This syncs roles/permissions, creates default settings, salary components, leave types and a
   default shift (all to be reviewed), and creates the first Super Admin, who receives a
   set-password email. For staging UAT you may instead load synthetic data with `npm run db:seed`
   (never in production). Then configure holidays, departments and statutory rules in the UI.
4. Deploy the staging branch/preview and run the **staging validation** below.
5. Obtain **written approval** from the owner, then repeat for production (backup → migrate → deploy).

### Staging validation checklist

- [ ] `/api/health` returns `{"status":"ok"}`
- [ ] Login, logout, lockout after 5 failures, password reset email received and link works
- [ ] Each role sees only its permitted navigation; direct URL access to admin pages is denied
- [ ] Create employee → invite email → new user sets password → onboarding checklist present
- [ ] Check-in/out, correction request → manager approval
- [ ] Leave apply → manager (and HR for 2-level types) approval → balances update → cancellation
- [ ] Document upload (PDF) → stored in S3 (not public) → download only by authorised users
- [ ] Payroll run processed by HR Admin, approved by a different user, payslip PDF downloads
- [ ] Exports (CSV/XLSX/PDF) open correctly; audit trail shows the actions; "Verify integrity" passes
- [ ] Vercel Cron executed `/api/cron/daily` (check function logs) — 401 without the secret
- [ ] Security headers present (`curl -I https://…`), HTTPS only, cookies `Secure; HttpOnly; SameSite=Lax`
- [ ] Mobile layout and dark mode spot-checked

## 5. Production deployment checklist

- [ ] Owner approval recorded (who, when, which commit SHA)
- [ ] Statutory payroll rules reviewed and signed off by HR + Finance (+ tax advisor)
- [ ] Retention periods reviewed by Legal; privacy notice published to employees
- [ ] Production secrets generated fresh; no staging values reused
- [ ] Database PITR enabled; manual backup taken (`scripts/backup.sh`) and restore-tested within 24h
- [ ] `migrate.yml` → production (with backup confirmation) succeeded; `prisma migrate status` clean
- [ ] Vercel production deploy of the approved SHA; custom domain + HTTPS verified
- [ ] Smoke test: health, login, dashboard, one read per module (no test data written to production)
- [ ] Monitoring: Vercel log drain / alerting configured; uptime check on `/api/health`
- [ ] Rollback plan confirmed: redeploy previous Vercel deployment; forward-fix migrations or restore from backup
- [ ] First Super Admin created; demo accounts absent; `SEED_PASSWORD` not set

## 6. Rollback

- **Application:** Vercel → Deployments → promote the previous production deployment (instant).
- **Database:** Prisma migrations are forward-only. Prefer additive, backwards-compatible migrations
  (expand → migrate → contract) so the previous app version keeps working. If a migration must be
  undone, write a new corrective migration; in a disaster, restore from PITR/backup into a new
  database (see `docs/OPERATIONS.md`) and repoint `DATABASE_URL`.
- **Never** run `prisma migrate reset` or destructive SQL against production.
