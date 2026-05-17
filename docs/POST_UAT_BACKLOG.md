# Post-UAT Backlog Notes

Status: Parking lot for after user testing
Created: 2026-05-12
Scope: Ideas to revisit after the 2-day test freeze

This note is not a source-of-truth architecture document. It is a short backlog so the team does not lose context while users test the current deployed version.

## Current Decision

Freeze the current deployed version for 2 days and collect real user feedback before adding more features.

Only fix production blockers during the freeze, such as:

- Login failure
- Runtime/deploy error
- Data cannot be saved
- Schedule/reschedule cannot be used
- Permission issue that blocks testing
- Critical data corruption or wrong workflow movement

## Recommended Next Priorities

### 1. User Test Fixes

Use real feedback first.

Examples:

- Screens that users do not understand
- Buttons or labels that cause confusion
- Flow steps that feel too long or too hidden
- Missing data that users expect to see during work
- Permission behavior that does not match real operations

### 2. Dashboard API Consolidation

Frontend still reads some dashboard data directly from Supabase.

Next improvement:

- Move dashboard/project pipeline data behind backend APIs
- Centralize permission filtering
- Centralize stage distribution summary
- Support pagination/filter/search from API
- Reduce repeated frontend queries

Why it matters:

- Easier to control permissions
- Better performance as project count grows
- Cleaner backend/frontend contract

### 3. Audit And Activity Log Polish

Make logs easier for managers and operators to read.

Focus areas:

- Reschedule: show from date, to date, move in/out, reason
- Override: show reason, approver, affected gate/stage
- Reject/rework: show who rejected, why, and what must be fixed
- Stage transition: show before/after stage clearly

### 4. Role And Permission Matrix

Create a clear role matrix for both UI and backend.

Roles to clarify:

- admin
- supervisor
- exec
- sales
- ops
- engineer
- qa
- contractor
- finance
- rcm

Important rule:

- `supervisor` can view and approve/check operational work across stages.
- `supervisor` must not edit system configuration, workflow governance, or source-of-truth setup.
- `rcm` should cover MAT/material/billing-adjacent responsibilities.

### 5. Executive Dashboard V2

After managers test the current stage distribution view, decide what additional views are truly needed.

Possible additions:

- Aging by stage
- SLA heat/risk view
- Owner/team workload
- Blocker reason distribution
- Overdue project list
- Region/province filters
- Drilldown from executive card to project list

### 6. Scheduling Robustness

Improve the scheduling engine only after users try the current calendar.

Possible additions:

- Team capacity by date
- Holiday/leave calendar
- Region/province matching
- Skill matching visibility
- Conflict severity
- Contractor availability
- Better reschedule history display

### 7. Mobile Field Hardening

Make field operations more reliable for real site work.

Possible additions:

- Stronger offline upload retry
- Upload progress and retry states
- Mobile-first checklist UX
- Photo evidence grouping
- Check-in location display

## Do Not Do Yet

Avoid these until feedback confirms the need:

- Large redesign
- New workflow engine refactor
- New database model
- Big dashboard rewrite
- Full dark mode
- Advanced GIS
- Complex resource optimization

## Suggested Post-Test Review Flow

1. Collect user feedback and screenshots.
2. Classify each item as blocker, UX polish, requirement, or future idea.
3. Fix blockers first.
4. Update permission matrix if feedback involves roles.
5. Choose one backend stabilization item and one UX improvement item for the next sprint.
