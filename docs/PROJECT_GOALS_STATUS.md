# Project Goals Status

Source of truth: `docs/FINAL_ARCHITECTURE_SOURCE_OF_TRUTH.md`

## Goal

Build the Solar Operations Platform until the MVP foundation is complete for RES-S + CASH, while keeping the implementation aligned with the dynamic workflow architecture.

## Completed Foundation

- Database foundation schema for workflow definitions, runtime project stages, gates, documents, exceptions, approvals, and activity logs.
- Seed workflow data for RES-S CASH and baseline RES-S LOAN.
- Create Project Engine with workflow version lock, standard version lock, runtime stage generation, checklist/document generation, Drive folder creation, SLA start, audit log, and notification trigger.
- Runtime Workflow Engine for existing/backfilled projects.
- Gate Validation Engine for checklist/document hard gates and overrideable gates.
- Transition Engine for forward and rework transitions with hard-gate blocking, exception creation, audit log, and notifications.
- SLA Engine with ON_TRACK, NEAR_SLA, OVER_SLA, SLA_PAUSED handling, SLA exception creation/resolution, escalation notification trigger, and engine coverage for overdue detection, duplicate prevention, and recovered-stage resolution.
- Exception Engine with lifecycle transitions, WAIVED support, audit log, and notification coverage.
- Approval / Override Engine with request, decision, audit log, and notification trigger.
- Document Engine with rejection, versioning, metadata governance, and audit log.
- Document verification now runs through an authenticated API with verified-by metadata and activity-log audit records instead of direct client-side table updates.
- Project checklist pass action now runs through an authenticated API with completed-by metadata and activity-log audit records instead of direct client-side table updates.
- Field check-in now runs through an authenticated API with field metadata and activity-log audit records instead of direct client-side table updates.
- Non-document stage evidence uploads now attach metadata and activity-log audit records through the Drive upload API instead of direct client-side stage metadata updates.
- Google Drive folder/upload API integration.
- Notification & Escalation foundation with in-app notification queue and delivery audit table.
- Notification delivery processing foundation with in-app send marking, due-pending processing, and explicit failed audit records for EMAIL/LINE until providers are configured.
- Notification Center filters for status, severity, channel, and project context.
- Resource & Scheduling foundation with resource teams, assignments, conflict detection, conflict exceptions, scheduling API, and engine coverage for confirmed assignments, conflict exceptions, notifications, and assignment upsert behavior.
- Resource Team admin UI with create, edit, enable/disable, capacity, territory, and skill tag management.
- Resource Team admin changes now write activity-log audit records with actor attribution.
- API permission foundation with centralized role checks, automatic production strict mode, explicit strict-mode support through `AUTH_ENFORCEMENT=strict`, and test coverage for advisory mode, production enforcement, invalid sessions, inactive profiles, and role denial.
- Production readiness foundation with `/api/health`, required environment validation, and release runbook.
- Profile admin readiness UI/API for mapping Supabase Auth users to active platform roles before strict auth is enabled, including first-admin bootstrap and profile change audit logs.
- Workflow Builder draft/edit/publish foundation with version cloning, draft stage editing, add stage, stage reorder, checklist editing, required document editing, transition graph editing, and controlled publish activation.
- Workflow Builder draft, publish, stage, checklist, document, transition, and reorder actions now write activity-log audit records with actor attribution.
- Mobile upload retry queue backed by browser IndexedDB with field retry/remove controls.
- Focused unit and integration-style test foundation using Node test runner for API permission enforcement, create project engine/runtime generation, duplicate prevention, runtime workflow backfill, project UI rules, gate validation, document rejection/versioning, notification delivery records, SLA timing rules, SLA engine exception lifecycle, exception status lifecycle, approval rules, override approval lifecycle, QA pass/fail/rework flows, Billing approve/reject flows, forward/rework transition engine paths, transition helper rules, resource scheduling conflict rules, and resource scheduling engine assignments/exceptions.
- Backend E2E workflow smoke coverage for RES-S CASH create project -> runtime lock -> hard-gate block -> transition -> overrideable gate -> approval -> transition.
- Backend E2E workflow smoke coverage for RES-S LOAN Basic project creation, workflow version lock, loan runtime stages, loan required documents, audit log, and notification.
- RES-S LOAN fallback foundation: loan rejection can offer CASH, accepted offers convert the same locked project to CASH and resume at Down Payment, declined offers cancel the project, with exception lifecycle, audit logs, and notifications.
- SLA pause/resume backend lifecycle with remaining-time preservation, stage/project status updates, metadata history, and audit logs.
- Create Project UI captures customer phone so the backend duplicate active-project phone check can protect lead intake.
- Frontend API calls use authenticated fetch, and the app shell has a basic Supabase sign-in/sign-out dialog.
- Dashboard and project detail UI foundation with Command Center, exceptions, approvals, field operations, scheduling board, billing center, QA console, workflow governance, document drawer, and timeline rail.
- Continued frontend decomposition with field upload retry queue extracted into a focused component.

## Current MVP Gaps

- Authentication and role-based permissions are wired in advisory mode for local/dev; production automatically uses strict auth, and first-admin bootstrap/profile admin tools are available for assigning real user roles.
- Notification delivery can process in-app sends; Email and LINE are audited as failed-provider deliveries until external providers are configured.
- Scheduling UI can submit assignments to the scheduling API; drag-and-drop scheduling is still pending.
- Mobile upload supports a persistent browser retry queue; automatic background sync can still be improved.
- Workflow Builder supports draft/edit/publish for stage-level fields, add/reorder stages, checklist/document editing, transition graph editing, and publish validation for start stage + forward paths.
- QA and Billing flows exist with engine coverage for pass/approve and rework/reject routing; deeper exception/rework UX can still be improved.
- Dashboard needs a cleaner modular component split and continued cleanup of any remaining legacy/mojibake text.
- Automated test foundation exists with create project, runtime workflow, transition, gate override lifecycle, SLA pause/resume, notification delivery processing, and backend E2E workflow smoke coverage; browser end-to-end coverage is still pending.

## Next Build Order

1. Assign real user roles in Profile Admin before production use; production now enforces strict auth automatically, and `AUTH_ENFORCEMENT=strict` can still be used outside production.
2. Run the production readiness smoke checklist in `docs/PRODUCTION_READINESS.md` on staging.
3. Connect real Email/LINE providers when credentials and channel policy are ready.
4. Continue decomposing `app/page.tsx` into screen components.

## Definition of Done for MVP Foundation

- A RES-S CASH project can be created from UI and locked to workflow + standard versions.
- Runtime stages, gates, documents, SLA, Drive folders, and audit logs are generated automatically.
- A project can move through the 12-stage workflow using configured transitions.
- Hard gates block transitions and create visible exceptions.
- Overrideable gates require approval and can unblock the transition only after approval.
- SLA risk creates exceptions and in-app notifications.
- SLA can be paused/resumed with auditable remaining-time preservation.
- Field upload, QA, rework, handover, billing, and closure are usable from UI.
- Scheduling detects resource conflicts and exposes them to the Command Center.
- Managers can see exceptions, approvals, SLA risk, resource conflicts, and document risks first.
- Production build passes.
