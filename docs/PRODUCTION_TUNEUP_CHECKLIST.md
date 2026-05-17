# Production Tune-Up Checklist

Last updated: 2026-05-16
Status: Active production checklist
Scope: SunBase / Solar Project Tracking System production tune-up

## Operating Rule

This project is already used by real production users.

Every change must preserve existing working behavior unless the change is explicitly approved.

- Do not redesign, rebuild, or broadly refactor during tune-up.
- Fix only the problem being addressed.
- Before changing a production path, identify what already works in that path.
- After changing it, verify the old behavior still works.
- Build success is not enough. Production workflows must be smoke-tested.
- Environment variables, Drive access, permissions, and deployment aliases are production behavior.
- If a task is not done and not explicitly skipped, keep it open and remind the operator before moving on.

## Current Critical Status

- Production app is live at `https://solar-tracking-system.vercel.app`.
- Google Drive currently works after rotating `GOOGLE_OAUTH_REFRESH_TOKEN`.
- `/api/health` now checks the database and Google Drive parent folder.
- Current Drive credential mode is still `oauth`.
- OAuth is a recovery state, not the final long-term state.
- Final target is `driveCredentialMode: service_account` with no Drive warnings.

## Latest Audit Snapshot

Checked on 2026-05-16.

- `npm.cmd run build`: passing.
- Production `/api/health`: passing with database `ok` and Drive `ok`.
- Production Drive warning remains open because credential mode is `oauth`.
- `npm.cmd run test`: passing after aligning checklist behavior tests and fixing Node test import resolution.
- `npm.cmd run lint -- --quiet`: passing.
- `npm.cmd run lint`: runs with warnings only; existing typing debt is tracked as warnings during tune-up.
- Production data read-only check currently finds 0 active projects and 15 profiles after test projects were deleted.
- No active project integrity issues are present because there are currently no active projects.
- No open exceptions, pending approvals, over-SLA stages, or multiple active stages were found.
- Danger-zone permissions are currently assigned only to `system_admin`.
- Temporary OAuth/config artifacts created during recovery were removed from `C:\tmp`.
- Local dev/build log artifacts were removed from the workspace.
- `.next` is ignored generated output and was confirmed to regenerate successfully with `npm.cmd run build`.
- `/api/address/postal-code` is intentionally unauthenticated/public for postal lookup data only; review later if policy requires all API routes to require auth.
- API route auth coverage was checked: all product routes use `authorizeRequest`; only health, bootstrap, and postal lookup are intentionally outside the normal route auth helper.
- Danger permissions were checked in production data and are currently assigned only to `system_admin`.
- Active published workflow v4 was checked: 18 stages, 20 transitions, no broken transition references.
- Removed production-visible TODO text from the standalone admin users page.
- Logout now clears in-memory operational data and returns unauthenticated users to a sign-in prompt.
- The main app header now shows the active user's role beside the email.

### Open Audit Findings

- [ ] P0: Move Drive from OAuth fallback to service account.
- [x] P1: Fix test suite so `npm.cmd run test` is green again.
- [x] P1: Fix Node test alias issue from `services/drive/folderEngine.ts` importing `@/lib/google-drive`.
- [x] P1: Decide checklist `FAILED` behavior and align tests with production logic.
- [x] P1: Keep release provenance clean: commit or otherwise record deployed production changes.
- [x] P2: Keep lint gate usable without broad refactors.
- [ ] P2: Reduce lint warnings incrementally without broad refactors.
- [ ] P2: Continue modularizing `app/page.tsx` only in small, verified slices.
- [ ] P2: Confirm whether active workflow stage `ตัด_MAT` is intentional and belongs in source-of-truth.
- [ ] P2: Confirm intended active installation standard policy because both `V8R2` and `V9` are currently active.
- [ ] P2: Rename active workflow version display if `RES-S Standard v1 Draft V2 Draft V3 Draft V4` is confusing for operators.

## Open Must-Do Checklist

### P0 - Close The Drive Credential Risk

- [ ] Create or locate the existing Google service account in Google Cloud.
- [ ] Create a new JSON key for that service account.
- [ ] Save the key temporarily as `C:\tmp\solar-drive-service-account.json`.
- [ ] Share the Google Drive parent folder with the service account `client_email` as `Editor`.
- [ ] Add `GOOGLE_SERVICE_ACCOUNT_JSON` to Vercel Production.
- [ ] Add the same credential to local `.env.local` or equivalent local secret storage.
- [ ] Redeploy production.
- [ ] Confirm `/api/health` returns `ok: true`.
- [ ] Confirm `/api/health` returns `checks.drive: "ok"`.
- [ ] Confirm `/api/health` returns `driveCredentialMode: "service_account"`.
- [ ] Confirm `/api/health` returns `warnings: []`.
- [ ] Test image preview from an existing uploaded Drive photo.
- [ ] Test document upload to Drive.
- [ ] Test opening the uploaded file from Drive link.
- [ ] Remove any temporary JSON/token files from `C:\tmp`.

Do not mark this risk closed while production still reports `driveCredentialMode: "oauth"`.

### P0 - Protect Existing Production Workflows

- [ ] Login as an active production user.
- [ ] Open dashboard/project list.
- [ ] Open an existing project detail.
- [ ] Confirm project stages still render correctly.
- [ ] Confirm existing uploaded images preview correctly.
- [ ] Confirm document drawer still opens.
- [ ] Confirm notifications/approvals panels still load.
- [ ] Confirm Users & Roles page still loads for admin/system admin.
- [ ] Confirm no normal user can perform system-admin-only destructive actions.

### P0 - Release Guard Before Every Production Deploy

- [ ] Read the intended change scope.
- [ ] Identify existing behavior that must remain working.
- [ ] Run `npm.cmd run build`.
- [ ] Run targeted tests for touched area.
- [ ] Call `/api/health` after deploy.
- [ ] Smoke test every production path touched by the change.
- [ ] If Drive/auth/roles/projects were touched, do a real browser smoke test.
- [ ] Record what was verified in the final deployment note.

## Daily Production Support Checklist

- [ ] Call `/api/health`.
- [ ] Confirm `ok: true`.
- [ ] Confirm `checks.database: "ok"`.
- [ ] Confirm `checks.drive: "ok"`.
- [ ] Check for Drive warnings. Any OAuth warning remains open until service account is active.
- [ ] Review projects with missing Drive folders.
- [ ] Review projects with no runtime stages or no active/current stage.
- [ ] Review blocked hard gates.
- [ ] Review over-SLA and near-SLA stages.
- [ ] Review pending approvals.
- [ ] Review open critical/high exceptions.
- [ ] Review recent upload failures or user reports about preview/upload.

## Weekly Admin/Ops Review Checklist

- [ ] Review active users and roles.
- [ ] Confirm `system_admin` count is intentionally small.
- [ ] Confirm inactive users cannot access the app.
- [ ] Review project deletion audit logs.
- [ ] Review role/permission changes.
- [ ] Review workflow versions and confirm no accidental draft/publish changes.
- [ ] Review Drive folder governance for recent projects.
- [ ] Review QA rework and billing rejection trends.
- [ ] Review SLA exceptions and repeated blockers.
- [ ] Decide only one or two low-risk tune-up fixes for the next week.

## Production Smoke Test Matrix

Run this after any deploy that touches auth, Drive, projects, workflow, documents, roles, or dashboard.

- [ ] Sign in.
- [ ] Load dashboard.
- [ ] Open project list.
- [ ] Open project detail.
- [ ] Create a test project only if explicitly approved.
- [ ] Confirm runtime stages exist.
- [ ] Confirm current stage is visible.
- [ ] Upload a required document/photo.
- [ ] Preview the uploaded image.
- [ ] Verify or reject a document where appropriate.
- [ ] Pass a checklist.
- [ ] Trigger a hard-gate block.
- [ ] Request an override.
- [ ] Approve/reject an override with an authorized role.
- [ ] Move a stage forward.
- [ ] Submit QA pass/fail/rework if the touched change affects QA.
- [ ] Submit billing approve/reject if the touched change affects Billing.
- [ ] Confirm activity logs record the action.

## Top Production Risks To Track

1. Drive credential remains OAuth instead of service account.
2. Users do not report silent upload/preview failures.
3. Projects created without complete runtime workflow data.
4. Projects with missing Drive folder or broken Drive metadata.
5. Gate validation blocks valid work or allows invalid transitions.
6. Role permissions are changed without real production smoke tests.
7. Workflow builder changes accidentally affect live projects.
8. SLA/exception signals are present but not reviewed daily.
9. Audit logs exist but are hard for operators to interpret.
10. Large UI/code refactors break current working workflows.

## Things Not To Change During Tune-Up

- Do not redesign the dashboard broadly.
- Do not rewrite the workflow engine.
- Do not change live workflow stage order without explicit approval.
- Do not run destructive data cleanup without a reviewed target list.
- Do not change role permissions broadly without a role matrix review.
- Do not remove OAuth fallback until service account is verified in production.
- Do not add large modules before production health and support basics are stable.

## Recommended Next Codex Tasks

### Task 1 - Finish Permanent Drive Service Account

Goal: Move production Drive access from OAuth fallback to service account.

Acceptance criteria:

- `/api/health` returns `driveCredentialMode: "service_account"`.
- `/api/health` returns no Drive warnings.
- Existing image preview works.
- New upload works.
- Temporary secret files are removed.

### Task 2 - Add Production Health Admin Surface

Goal: Make production health visible to admin/system_admin without checking API manually.

Acceptance criteria:

- Admin can see database, Drive, credential mode, and warnings.
- Page is read-only.
- Thai operator copy is clear.
- No workflow behavior changes.

### Task 3 - Add Read-Only Data Integrity Report

Goal: Detect production data issues without modifying records.

Acceptance criteria:

- Report lists projects missing runtime stages.
- Report lists projects missing current stage.
- Report lists projects missing Drive folder.
- Report lists required documents missing/rejected/pending verification.
- Report lists pending approvals and over-SLA stages.
- No automatic repair in first version.

## Reminder Policy For This Thread

Until the user explicitly says a checklist item is done or skipped:

- Keep `P0 - Close The Drive Credential Risk` open.
- Remind before or after any future production deploy that Drive is still OAuth if `/api/health` reports `driveCredentialMode: "oauth"`.
- Do not claim the Drive issue is permanently fixed until service account mode is verified.
- Treat all future requests as production tune-up unless the user clearly says otherwise.
