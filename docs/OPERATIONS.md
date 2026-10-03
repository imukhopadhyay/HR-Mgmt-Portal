# Operations runbook

## Scheduled jobs

`/api/cron/daily` (Vercel Cron, 20:30 UTC = 02:00 IST; authenticated with `CRON_SECRET`). Idempotent:

| Step | What it does |
| --- | --- |
| Attendance | For yesterday: marks `ON_LEAVE` for full-day approved leave and `ABSENT` for active employees with no record on a working day |
| Accrual | Recomputes entitlements for monthly-accrual leave types |
| Retention | Applies the retention policy (anonymise ex-employees, purge rejected candidates, old notifications, expired tokens) |

Manual run: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/daily`.
Year-end leave carry-forward is run manually by HR in **HR configuration → Leave policy** (guarded against re-runs).

## Backups

| Layer | Mechanism | Frequency / retention |
| --- | --- | --- |
| Database | Provider PITR | Continuous, ≥ 7–35 days per provider plan |
| Database | `scripts/backup.sh` (pg_dump custom format + SHA-256) | Daily from a secured runner (or before every production migration); keep 30 days; copy to an encrypted, access-controlled, off-site bucket |
| Files | S3 bucket versioning + lifecycle rules | Keep non-current versions ≥ 30 days; optional cross-region replication |

Backups contain personal data: encrypt at rest, restrict access to named administrators, log access.

## Recovery procedures

1. **Bad deploy (app only):** promote the previous deployment in Vercel.
2. **Data corruption / accidental change:** restore PITR to a *new* database at a timestamp before the
   incident, verify, then either repoint `DATABASE_URL` or copy specific rows back. Record the action
   in the incident log.
3. **Full restore from logical backup:**
   ```bash
   createdb hrportal_recovery                       # empty target
   TARGET_DATABASE_URL=postgresql://…/hrportal_recovery ./scripts/restore.sh backups/hrportal-<stamp>.dump
   DATABASE_URL=postgresql://…/hrportal_recovery npx prisma migrate status   # must be up to date
   ```
   The script verifies the checksum and refuses non-empty targets. After restore, sign in as an
   administrator and run **Audit trail → Verify integrity**.
4. **Lost file storage:** restore objects from bucket versioning; document records reference
   `storageKey`, so restored keys reappear automatically.

The restore procedure was exercised during development (backup → restore into an empty database →
row counts, migration status and the append-only trigger verified).

**Targets (proposed, confirm with the business):** RPO ≤ 15 minutes (PITR), RTO ≤ 4 hours.

## Monitoring & error tracking

- **Health:** `GET /api/health` → 200 `{status:"ok"}` / 503 when the DB is unreachable. Point an uptime
  monitor at it (1-minute interval).
- **Logs:** structured JSON on stdout/stderr with secret/PII redaction. Configure a Vercel log drain
  (Datadog, Better Stack, Axiom, …). Alert on `level=error`, `msg=request.error`, `cron.*.failed`,
  `email.failed`, and spikes of `auth.account_locked` audit events.
- **Errors:** `src/instrumentation.ts` logs every unhandled server error with the Next.js error
  *digest* shown to users ("Reference: …"), allowing support to correlate reports. Forward to Sentry
  if desired (requires a DSN).
- **Database:** monitor connections (use the pooled URL), slow queries, storage growth.

## Incident response

1. **Triage** severity (data exposure / outage / degradation). Assign an incident lead.
2. **Contain:** for suspected account compromise, disable the user (Users & roles) — all sessions are
   revoked immediately; rotate `SESSION_SECRET` to invalidate *all* sessions if needed.
3. **Investigate** with the audit trail (filter by actor/entity/date) and logs; verify chain integrity.
4. **Recover** using the procedures above.
5. **Notify:** personal-data breaches may need to be reported to the Data Protection Board of India
   and affected individuals under the DPDP Act 2023/Rules, and to CERT-In within 6 hours for
   reportable cyber incidents. Legal decides; keep timestamps.
6. **Post-mortem** within 5 working days.

## Routine administration

- Rotate `SESSION_SECRET`, `CRON_SECRET`, SMTP and S3 keys at least annually and on staff changes.
- Review **Users & roles** quarterly (leavers, privileged roles).
- Before each payroll: confirm statutory rules, holidays and pending attendance corrections.
- Keep dependencies patched (Dependabot PRs; CI audits production dependencies).
