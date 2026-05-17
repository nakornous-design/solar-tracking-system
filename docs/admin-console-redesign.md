# Admin Console Redesign Spec

## Goal

Redesign the current Settings/Admin area into a clear enterprise Admin Console for the Solar Project Tracking System.

The Admin Console must help admins manage the platform safely and quickly without mixing unrelated controls on one page.

Primary goals:

- Make each admin feature easy to find.
- Separate operational settings from destructive system actions.
- Make `system_admin` privileges visibly different from normal `admin`.
- Support production readiness before real operational use.
- Keep the interface dense, professional, and suitable for repeated internal operations.

## Product Context

This app is a Solar Operations Platform for managing:

- Sales
- Survey
- TSSR / Engineering
- Payment
- Scheduling
- Installation
- QA
- Handover
- Billing
- Closure
- Exceptions
- SLA
- Google Drive document governance

The platform uses:

- Next.js frontend
- Supabase Auth and PostgreSQL
- Google Drive API for file storage
- Supabase metadata for workflows, projects, documents, exceptions, approvals, teams, and logs

Important architecture rules:

- Workflows must be dynamic, never hardcoded.
- Projects lock to a workflow version and installation standard version.
- Hard gates prevent stage movement when required items are missing.
- Overrides require approval and audit trail.
- Google Drive stores files only; Supabase stores metadata.
- Dashboard and admin screens should prioritize exceptions, risk, and readiness.

## Current Admin Problem

The current Settings page mixes too many jobs:

- Workflow setup
- Team setup
- User management
- Role description
- Audit logs

This makes it hard to know:

- Which tab controls production safety.
- Where to change users and roles.
- Where to inspect workflow readiness.
- Which actions are destructive.
- Which features are available only to `system_admin`.

## Target Experience

The new Admin Console should feel like a professional internal operations console:

- Calm, dense, and readable.
- No marketing hero layout.
- No decorative cards inside cards.
- Strong tab structure with clear page purpose.
- Tables for management tasks.
- Status badges for readiness and risk.
- Confirmation flows for destructive actions.
- Clear role/permission boundaries.

## Navigation Structure

Top-level Admin Console tabs:

1. Overview
2. Users & Roles
3. Workflow Builder
4. Gates & Documents
5. Drive Governance
6. SLA & Exceptions
7. Resources & Teams
8. Audit Logs
9. Danger Zone

### 1. Overview

Purpose:

Give admins a fast production-readiness snapshot.

Content:

- Readiness summary strip:
  - Workflow published
  - Active users
  - Drive connected
  - Projects with missing Drive folder
  - Open critical exceptions
  - Test data detected
- System health checklist:
  - Supabase connected
  - Google Drive credentials configured
  - Workflow version available
  - Installation standard available
  - Required document definitions configured
- Recent admin activity:
  - Profile changes
  - Workflow edits
  - Project deletions
  - Drive folder creation
- Quick actions:
  - Create user
  - Review workflow
  - Check Drive health
  - Open audit logs

Design notes:

- Use compact KPI tiles, not large hero cards.
- Readiness warnings should be visually stronger than healthy metrics.
- Use a two-column layout on desktop:
  - Left: readiness and health
  - Right: recent admin activity

### 2. Users & Roles

Purpose:

Manage real users, role assignment, active status, and permission clarity.

Content:

- User table:
  - Email
  - Full name
  - Role
  - Active
  - Last sign-in
  - Status
  - Actions
- Create user panel:
  - Email
  - Password
  - Full name
  - Role
  - Active
  - Email confirmed
- Role details panel:
  - Selected role
  - Purpose
  - Allowed pages
  - Responsibilities
  - Risk level
- Permission matrix:
  - Rows: feature/action
  - Columns: roles
  - Values: view, edit, approve, delete, none

Roles:

- `system_admin`
  - Highest privilege.
  - Can delete projects.
  - Can access Danger Zone.
  - Can manage production-readiness actions.
- `admin`
  - Can manage users, workflow, roles, logs.
  - Cannot perform destructive project delete unless promoted to `system_admin`.
- `supervisor`
  - Operational oversight.
- `exec`
  - Executive read-only visibility.
- `sales`
  - Lead, quotation, payment path.
- `ops`
  - Operations, scheduling, SLA follow-up.
- `engineer`
  - Survey/TSSR engineering readiness.
- `qa`
  - QA console and QA decisions.
- `contractor`
  - Field work and upload.
- `finance`
  - Billing review.
- `rcm`
  - Material/resource coordination.
- `sbc`
  - Solar Champion Business operational role.

Design notes:

- Make `system_admin` visibly distinct.
- Role dropdown should show both human label and role code where useful.
- User save action should be per-row, with clear saved/error state.

### 3. Workflow Builder

Purpose:

Manage workflow templates, versions, stages, transitions, and publish flow.

Content:

- Workflow version selector:
  - Template
  - Version
  - Status: draft/published/archived
  - Published date
- Stage list:
  - Order
  - Stage code
  - Stage name
  - Owner role
  - SLA hours
  - Active
  - Start/terminal flags
- Stage editor:
  - Name
  - Owner role
  - SLA
  - Active status
- Transition editor:
  - From stage
  - To stage
  - Type: forward/rework
  - Gate severity
  - Requires approval
- Publish panel:
  - Validation warnings
  - Publish button
  - Version lock explanation

Design notes:

- Stage order should be visually scannable.
- Avoid making workflow editing look like a generic form dump.
- Use a master-detail layout:
  - Left: stage list
  - Right: selected stage editor

### 4. Gates & Documents

Purpose:

Configure checklist gates and required documents per workflow stage.

Content:

- Stage selector
- Checklist definitions:
  - Code
  - Label
  - Required
  - Gate severity
  - Active
- Required documents:
  - Code
  - Name
  - Required
  - Requires verification
  - Gate severity
  - Drive folder key
- Gate severity legend:
  - HARD
  - OVERRIDEABLE
  - SOFT
  - INFO
- Validation panel:
  - Missing hard gate definitions
  - Documents without Drive folder key
  - Required documents without verification

Design notes:

- Checklist and document definitions should be separate tables.
- Gate severity should use color-coded badges.
- Make hard gates very visible.

### 5. Drive Governance

Purpose:

Manage Google Drive folder structure and document metadata health.

Content:

- Drive connection status:
  - Parent folder configured
  - OAuth credentials configured
  - Last API check
- Folder structure reference:
  - `01_Sales_Commercial`
  - `02_Survey_TSSR`
  - `03_Loan_Documents`
  - `04_Installation_Photos`
  - `05_Site_Folder_Handover`
  - `06_Billing_Finance`
- Project Drive health table:
  - Project code
  - Customer name
  - Root folder status
  - Linked document count
  - Missing file count
  - Actions
- Repair actions:
  - Create missing folder
  - Relink folder
  - Check file existence

Design notes:

- Show missing Drive folders as operational risk.
- Do not hide document metadata problems.
- Avoid destructive file operations here; reserve them for Danger Zone.

### 6. SLA & Exceptions

Purpose:

Configure and monitor SLA/exception rules at admin level.

Content:

- SLA policy overview:
  - Near SLA threshold
  - Over SLA behavior
  - Pause/resume rules
- Exception categories:
  - SLA
  - QA
  - Billing
  - Document
  - Workflow
  - System
  - Resource
- Exception severity:
  - INFO
  - WARNING
  - HIGH
  - CRITICAL
- Escalation rules:
  - Recipient role
  - Channel
  - Trigger
  - Acknowledgement required

Design notes:

- This page may begin read-only if the backend does not yet support editing all rules.
- Clearly mark editable versus coming-soon config.

### 7. Resources & Teams

Purpose:

Manage contractor/resource teams, capacity, territory, and skills.

Content:

- Resource team table:
  - Team name
  - Owner role
  - Territory
  - Daily capacity
  - Skills
  - Active
- Create/edit team form
- Capacity preview:
  - Active teams
  - Total daily capacity
  - Skill coverage
- Scheduling risk hints:
  - No installation team
  - Territory missing
  - Capacity too low

Design notes:

- This should feel operational and table-heavy.
- Keep creation/edit controls close to the table.

### 8. Audit Logs

Purpose:

Give admins traceability for all important changes.

Content:

- Log table:
  - Time
  - Actor
  - Action
  - Project
  - Entity
  - Reason
  - Metadata
- Filters:
  - Action
  - Search
  - Date range
  - Actor
  - Entity type
- Important actions:
  - `PROJECT_DELETED`
  - `PROFILE_UPSERTED`
  - `AUTH_USER_CREATED`
  - `WORKFLOW_VERSION_PUBLISHED`
  - `GOOGLE_DRIVE_FOLDERS_CREATED`
  - `APPROVAL_REQUEST_DECIDED`

Design notes:

- Logs should be compact.
- Allow expanding a row to inspect before/after state.
- Destructive actions should be visually emphasized.

### 9. Danger Zone

Purpose:

Group destructive and irreversible actions in one locked area.

Access:

- Only `system_admin`.

Content:

- Delete project:
  - Search/select project
  - Show customer code, customer name, current stage, Drive folder, document count
  - Require confirmation
  - Delete Drive folder first
  - Delete Supabase project second
  - Write audit log
- Cleanup test data:
  - Detect `TC-*`
  - Detect names containing Testcase/test
  - Preview before delete
  - Execute cleanup
- Metadata repair:
  - Project has DB folder ID but Drive folder missing
  - Document has file ID but file missing
  - Missing runtime rows

Design notes:

- Danger Zone should not share visual style with normal admin forms.
- Use warning tones, but avoid making the whole page red.
- Require explicit confirmation for destructive actions.
- Clearly explain what will be deleted.

## Permission Matrix Draft

| Feature | system_admin | admin | supervisor | exec | sales | ops | engineer | qa | contractor | finance | rcm | sbc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Admin Overview | edit | edit | view | view | none | view | none | none | none | none | none | view |
| Users & Roles | edit | edit | none | none | none | none | none | none | none | none | none | none |
| Workflow Builder | edit | edit | view | none | none | edit | none | none | none | none | none | edit |
| Gates & Documents | edit | edit | view | none | none | edit | edit | view | none | view | none | edit |
| Drive Governance | edit | edit | view | none | view | edit | view | view | none | view | none | edit |
| SLA & Exceptions | edit | edit | view | view | view | edit | view | view | none | view | view | edit |
| Resources & Teams | edit | edit | view | none | none | edit | none | none | view | none | edit | view |
| Audit Logs | view | view | none | none | none | none | none | none | none | none | none | none |
| Danger Zone | edit | none | none | none | none | none | none | none | none | none | none | none |
| Delete Project | yes | no | no | no | no | no | no | no | no | no | no | no |

## Visual Design Direction

Use an enterprise operations style:

- White and slate surfaces.
- Subtle borders.
- Compact spacing.
- Dense tables.
- Clear badges.
- Clear tab hierarchy.
- Professional form controls.
- Avoid large marketing hero sections.
- Avoid decorative gradient backgrounds.
- Avoid nested cards.
- Avoid huge rounded components.
- Use full-width admin sections and compact panels.

Recommended layout:

- Left admin sub-navigation or top tab bar.
- Header with:
  - Page title
  - Short purpose line
  - Current role badge
  - Last updated / refresh action
- Main content:
  - Full-width sections
  - Tables and master-detail panes
  - Right-side inspector only when helpful

## Implementation Notes For Codex

When implementing in code:

- Preserve existing API patterns.
- Keep destructive APIs backend-enforced.
- Do not rely only on UI hiding for permissions.
- Reuse existing `apiFetch`, `authorizeRequest`, and Supabase clients.
- Avoid broad refactors outside the Admin Console unless needed.
- Prefer extracting admin UI into components under `components/settings` or `components/admin`.
- Keep `app/page.tsx` from growing further if possible.
- Move large admin sections into dedicated components.

Suggested component structure:

```text
components/admin/AdminConsole.tsx
components/admin/AdminOverview.tsx
components/admin/AdminUsersRoles.tsx
components/admin/AdminWorkflowBuilder.tsx
components/admin/AdminGatesDocuments.tsx
components/admin/AdminDriveGovernance.tsx
components/admin/AdminSlaExceptions.tsx
components/admin/AdminResourcesTeams.tsx
components/admin/AdminAuditLogs.tsx
components/admin/AdminDangerZone.tsx
components/admin/AdminTabNav.tsx
components/admin/AdminStatusBadge.tsx
```

## Prompt For ChatGPT UI Design

Copy and paste this prompt into ChatGPT or another design assistant:

```text
You are a senior product designer specializing in enterprise operations software.

Design a complete Admin Console redesign for a Solar Operations Platform.

Context:
- The product manages solar project workflows from Lead, Survey, TSSR, Quotation, Payment, Scheduling, Installation, QA, Handover, Billing, and Closure.
- The stack is Next.js, Supabase, and Google Drive API.
- The platform has dynamic workflow versions, hard gates, SLA tracking, exception management, approval overrides, Google Drive document governance, resource teams, and audit logs.
- The current Settings page is too crowded and mixes workflow, users, teams, roles, and logs.

Goal:
Create a clear Admin Console information architecture and UI design that separates admin features into tabs:
1. Overview
2. Users & Roles
3. Workflow Builder
4. Gates & Documents
5. Drive Governance
6. SLA & Exceptions
7. Resources & Teams
8. Audit Logs
9. Danger Zone

Critical requirements:
- The design must feel like a dense professional internal operations console, not a marketing page.
- It should be easy for admins to understand which page does what.
- `system_admin` must be visually and functionally separate from normal `admin`.
- Danger Zone must be visible only to `system_admin`.
- Delete Project must be treated as a destructive action with confirmation and audit trail.
- Google Drive stores files; Supabase stores metadata.
- Workflows are dynamic and projects lock to workflow versions.
- Hard gates prevent stage transitions when required checklist/documents are incomplete.

Please produce:
1. A sitemap / tab structure.
2. A detailed wireframe description for each tab.
3. Recommended table columns and form fields.
4. Permission matrix by role.
5. Visual design rules: spacing, colors, badges, typography, empty states, warnings.
6. UX copy for important admin actions.
7. Recommendations for responsive desktop/tablet behavior.
8. Implementation notes for a Next.js engineer.

Avoid:
- Large hero sections.
- Marketing copy.
- Decorative gradient backgrounds.
- Nested cards.
- Vague generic dashboards.

Prioritize:
- Operational clarity.
- Fast scanning.
- Safety for destructive actions.
- Clean grouping of admin responsibilities.
```

## Acceptance Criteria

The redesigned Admin Console is successful when:

- A new admin can identify where each admin task belongs within 10 seconds.
- User management is clearly separate from workflow management.
- Drive/document health is visible without opening project details.
- Audit logs are easy to filter and inspect.
- Destructive actions are isolated in Danger Zone.
- Only `system_admin` can see and execute destructive project deletion.
- The interface remains readable on laptop-width screens.
