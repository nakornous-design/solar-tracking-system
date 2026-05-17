# Production Analysis Brief

## Purpose

Use this document as a prompt/brief for ChatGPT Pro or another analysis assistant.

The system is now being used in production by real users. There is no user feedback yet, so the goal is to think proactively and identify the safest, highest-value improvements without disrupting live operations.

## Current Situation

SunBase / Solar Project Tracking System is now live for real operational use.

The product manages solar project workflows:

- Lead
- Survey
- TSSR
- Quotation
- Payment
- Ready for Install
- Scheduling
- Installation
- QA
- Handover
- Billing
- Closure

Core architecture:

- Next.js frontend
- Supabase Auth
- Supabase PostgreSQL
- Google Drive API for files
- Supabase metadata for projects, workflows, documents, exceptions, approvals, users, teams, and logs

Important platform concepts:

- Dynamic workflow engine
- Runtime project stages
- Hard gate validation
- Required checklist/document gates
- SLA monitoring
- Exception tracking
- Approval/override flow
- Google Drive folder governance
- Project audit trail
- Role-based access

## Production Mindset

Because users are already using the system:

- Avoid large UI redesigns.
- Avoid broad refactors.
- Avoid destructive data changes.
- Avoid changing workflow behavior without strong reason.
- Prioritize bug prevention, data safety, observability, and operational support.
- Prefer small changes that reduce risk.
- Prefer read-only monitoring before write-heavy automation.
- Any production change should be reversible or low-risk.

## Recent Work Completed

The following work was recently added:

- Removed test projects and related Drive folders.
- Added controlled project delete API for `system_admin`.
- Added `system_admin` role to Supabase.
- Added early Users & Roles admin page at `/admin/users`.
- Added `roles` and `role_permissions` tables.
- Added real-data user/role admin APIs.
- Added route from Settings > User to `/admin/users`.
- Build passed locally.
- Latest Users & Roles work has not necessarily been deployed unless explicitly done later.

## Current Concern

There is currently no feedback from real users.

This is a risky moment because:

- Problems may exist but users may not report them.
- Silent data inconsistencies may appear later.
- Drive/API issues may only appear during uploads.
- Gate validation mistakes may block or incorrectly allow stage movement.
- Users may be confused but continue using workarounds.

The goal is to identify what should be checked or improved next.

## What We Need From ChatGPT Pro

Please analyze the production situation and recommend what to do next.

Do not propose a big redesign.
Do not propose rebuilding the product.
Do not propose adding many new modules.

Focus on:

1. Production safety
2. Operational reliability
3. Data integrity
4. User support
5. Monitoring and observability
6. Small UX fixes that help real users
7. Prioritized next actions for Codex to implement

## Areas To Analyze

### 1. Project Creation

Questions:

- What should be verified after each project is created?
- What data integrity checks should exist?
- What failure states should be visible to admin/ops?

Important checks:

- Project has `workflow_version_id`
- Project has `applied_standard_id`
- Runtime stages are generated
- Current stage is set
- Required checklists are generated
- Required documents are generated
- Drive folder is created or can be created
- Activity log exists

### 2. Runtime Workflow

Questions:

- What production risks exist in stage transitions?
- How can we detect projects stuck due to missing runtime data?
- How can ops know why a stage cannot move forward?

Important checks:

- Stage order is valid
- Only one active/current stage exists
- Skipped stages are expected
- Completed stages have timestamps
- Current stage matches project state
- Rework paths are understandable

### 3. Gate Validation

Questions:

- How should hard gate failures be surfaced to users?
- What are the highest-risk gate mistakes?
- Should admins get a daily report of blocked projects?

Important checks:

- Required checklist incomplete
- Required document missing
- Required document rejected
- Required document pending verification
- Overrideable gate without approval
- Payment gate for CASH projects
- QA pass/fail gate
- Billing PAC/FBOQ/invoice gates

### 4. Google Drive Governance

Questions:

- What Drive issues should be monitored?
- What should happen if Drive API fails?
- How should missing folder/file links be repaired?

Important checks:

- Project has root Drive folder ID
- Drive folder ID exists in Google Drive
- Required subfolders exist
- Document metadata points to valid Drive file
- Upload failures are visible
- File upload retry queue works

### 5. Dashboard / Command Center

Questions:

- Does the dashboard show the right production problems?
- What should managers see first every morning?
- What should be hidden or deprioritized?

Important signals:

- Over SLA
- Near SLA
- Blocked by hard gate
- QA fail/rework
- Billing reject
- Missing Drive folder
- Missing required documents
- Pending approvals
- Projects with no active stage

### 6. Users & Roles

Questions:

- Is current access safe enough for production?
- What roles should be allowed to create/edit projects?
- Should user creation be limited further?
- Are role permissions actually enforced or only documented?

Important checks:

- Active user count
- system_admin count
- inactive users cannot access
- admin cannot do system_admin actions
- destructive actions require system_admin

### 7. Audit / Support

Questions:

- What logs should support/admin check daily?
- What actions need stronger audit trails?
- What support information should be visible inside project detail?

Important logs:

- Project created
- Drive folders created
- Document uploaded
- Checklist passed
- Stage transitioned
- Gate blocked
- Override requested/approved
- QA outcome
- Billing decision
- Project deleted
- User/role changes

### 8. User Feedback Collection

Questions:

- Since users are not giving feedback yet, how should feedback be collected?
- Should the app include a small feedback/report issue button?
- What fields should a production support issue capture?

Possible feedback fields:

- Project code
- Page/location
- What user tried to do
- What happened
- Screenshot optional
- Severity
- User role/team

## Output Format Requested

Please produce:

1. Top 10 production risks right now
2. Top 10 low-risk improvements to implement next
3. Daily production support checklist
4. Weekly admin/ops review checklist
5. Suggested monitoring/readiness checks
6. Bugs or data integrity issues to proactively search for
7. Things NOT to change right now
8. Recommended first 3 Codex implementation tasks
9. For each implementation task, provide:
   - Goal
   - Why it matters
   - Files/modules likely involved
   - Backend/API needs
   - UI needs
   - Acceptance criteria
   - Risks
10. A final concise prompt I can send to Codex to implement the highest-priority task

## Constraints For Recommendations

Recommendations must respect:

- Production is already live.
- Changes must be small and safe.
- Avoid broad refactors.
- Avoid changing core workflow behavior unless necessary.
- Avoid destructive cleanup unless explicitly reviewed.
- Prefer observability and validation first.
- Prefer admin/support tools that are read-only before automation.
- Keep Thai users in mind.
- Use clear Thai UX copy where helpful.

## Suggested Highest-Value Direction

The likely best next step is not a redesign.

The likely best next step is a small Production Health / Readiness check that detects:

- Projects without runtime stages
- Projects without current stage
- Projects missing Drive folder
- Projects with required documents missing
- Projects blocked by hard gates
- Projects over SLA
- Pending approvals
- Recent upload failures
- Profiles/users with risky roles
- Test data accidentally created again

But ChatGPT Pro should evaluate this and may suggest a better first step.

## Prompt To Copy Into ChatGPT Pro

```text
You are a senior product manager and production support architect for enterprise operations software.

Analyze the following situation:

SunBase / Solar Project Tracking System is now live in production with real users. There is no user feedback yet. The system manages solar project workflows from Lead, Survey, TSSR, Quotation, Payment, Ready for Install, Scheduling, Installation, QA, Handover, Billing, and Closure. It uses Next.js, Supabase Auth/PostgreSQL, and Google Drive API. It has dynamic workflow versions, runtime project stages, hard gate validation, checklist/document gates, SLA tracking, exceptions, approvals/overrides, Drive folder/document governance, users/roles, and audit logs.

We need to decide what to do next safely. Do not propose a big redesign. Do not propose broad refactors. Do not propose risky workflow changes. Production users are active.

Please produce:
1. Top 10 production risks right now.
2. Top 10 low-risk improvements to implement next.
3. Daily production support checklist.
4. Weekly admin/ops review checklist.
5. Suggested monitoring/readiness checks.
6. Bugs or data integrity issues to proactively search for.
7. Things NOT to change right now.
8. Recommended first 3 Codex implementation tasks.
9. For each implementation task:
   - Goal
   - Why it matters
   - Files/modules likely involved
   - Backend/API needs
   - UI needs
   - Acceptance criteria
   - Risks
10. A final concise prompt I can send to Codex to implement the highest-priority task.

Prioritize production safety, data integrity, observability, and small support tools. Keep Thai operations users in mind.
```
