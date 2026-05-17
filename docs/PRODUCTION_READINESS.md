# Production Readiness

## Current Scope

MVP production scope is complete for the core Solar Operations Platform backend and operational UI, excluding the explicitly deferred phase-two items:

- Email provider delivery
- LINE provider delivery
- GIS/basic map view

## Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON` preferred for production Drive access
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` supported
- `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` supported for legacy service-account config
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN` supported only as fallback/recovery, not final production state
- `GOOGLE_DRIVE_PARENT_FOLDER_ID`
- `PROFILE_BOOTSTRAP_SECRET`

## Active Tune-Up Checklist

Use `docs/PRODUCTION_TUNEUP_CHECKLIST.md` as the current production tune-up checklist.

The Drive credential risk is not permanently closed until `/api/health` reports:

- `checks.drive: "ok"`
- `driveCredentialMode: "service_account"`
- `warnings: []`

## Required Checks Before Release

1. Run database migrations in the target Supabase project.
2. Create or bootstrap at least one active `admin` profile.
3. Set `AUTH_ENFORCEMENT=strict` outside Vercel production if you want strict auth in staging.
4. Run `npm.cmd test`.
5. Run `npm.cmd run build`.
6. Deploy.
7. Call `/api/health` and confirm `ok: true`, `checks.database: "ok"`, and `checks.drive: "ok"`.
8. Smoke test:
   - Create project
   - Generate/open Drive folder
   - Upload and verify a required document
   - Pass checklist
   - Move stage forward
   - Trigger hard gate block
   - Request and approve override
   - Submit QA rework
   - Submit billing approve/reject
   - Test loan rejected to CASH fallback

## Deferred Behavior

Email and LINE notifications are intentionally audited as failed provider deliveries until provider credentials and channel policy are added. GIS/map is intentionally phase two.
