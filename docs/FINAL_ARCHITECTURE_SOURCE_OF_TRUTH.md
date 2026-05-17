# Solar Project Tracking System
# Final Architecture & Workflow Source of Truth

Version: 2.1 Final
Status: Final Implementation Blueprint
Target Stack: Next.js + Vercel + Supabase + Google Drive API
Primary Principle: Dynamic Workflow Runtime + Exception-First Operations + Hard Gate Governance

---

# 0. Purpose of This Document

This document is the official Source of Truth for the Solar Project Tracking System.

It should be used by:

- Developers
- AI coding assistants
- Codex / Cursor / Claude Code
- Product owner
- System analyst
- Solution architect
- Operations team
- QA team
- Finance team
- Project admin

This document must be read before making architectural, database, workflow, or UI implementation decisions.

The system must not be redesigned without updating this document.

---

# 1. Executive Vision

## 1.1 What This System Is

The Solar Project Tracking System is an enterprise-grade workflow-driven platform for managing the full solar installation lifecycle from lead intake to billing closure.

It is not a simple CRM.
It is not a static checklist app.
It is not a basic project tracker.
It is not a fault ticket system.

It is designed to become:

- Workflow Platform
- Operations Platform
- QA Governance Platform
- Contractor Management Platform
- Billing Governance Platform
- Exception-first Command Center
- Solar ERP Foundation

The platform replaces:

- Spreadsheet-based tracking
- Chat-based coordination
- Manual document chasing
- Manual SLA follow-up
- Disconnected Google Drive folders
- Uncontrolled status updates
- Non-auditable approvals

with a centralized, auditable, workflow-driven operations platform.

---

## 1.2 Business Goal

The platform must help the organization:

- Control every project stage end-to-end
- Prevent work from skipping required gates
- Improve installation quality
- Reduce billing delays
- Track contractor performance
- Monitor SLA and operational bottlenecks
- Govern technical standard changes such as V8R2 to V9
- Support future scaling across teams, regions, and project types

---

# 2. Core Operating Principles

## 2.1 Exception-First Operations

The platform must surface operational risk before normal work.

Dashboard and command views must prioritize:

- Over SLA
- Near SLA
- Missing documents
- QA failures
- Billing risks
- Workflow blockers
- Contractor delays
- Pending approvals
- Resource conflicts
- Critical exceptions

The dashboard must answer:

- What is stuck?
- Who owns it?
- What action is required?
- Which project is at risk?
- Which stage is creating bottleneck?
- Which contractor or owner needs attention?

Normal work should be visible, but exceptions must be more prominent.

---

## 2.2 Dynamic Workflow Engine

Workflow must never be hardcoded in UI or business logic.

Admin users must be able to configure workflow definitions without code changes:

- Add stages
- Remove or deactivate stages
- Reorder stages
- Edit SLA
- Edit owner role
- Configure checklist rules
- Configure required documents
- Configure transitions
- Configure rework routes
- Publish workflow versions

Runtime project stages must be generated from published workflow versions.

UI must read runtime workflow data from Supabase.

---

## 2.3 Hard Gate Validation

Projects cannot progress unless required conditions are satisfied.

Examples:

- Payment incomplete blocks Ready for Install for CASH projects.
- Missing installation photos block Installation → QA transition.
- QA failure blocks Handover and Billing.
- Missing PAC blocks Billing approval.
- Missing required survey photos blocks Survey → TSSR.

Gate severities:

| Severity | Behavior |
|---|---|
| HARD | Blocks transition immediately |
| SOFT | Shows warning but allows transition |
| OVERRIDEABLE | Blocks transition unless approved override exists |
| INFO | Informational only |

---

## 2.4 Version Snapshot Architecture

Every project locks to these versions at creation time:

- `workflow_version_id`
- `applied_standard_id`

Projects must not be affected by future workflow or technical standard changes.

Example:

| Project | Workflow | Standard |
|---|---|---|
| Project A | RES-S-CASH v1 | V8R2 |
| Project B | RES-S-LOAN v1 | V9 |

If the company changes from V8R2 to V9, existing V8R2 projects remain governed by V8R2.

This prevents:

- Audit inconsistency
- Retroactive QA failure
- Wrong checklist enforcement
- Old projects being judged by new standards

---

## 2.5 Auditability

Every critical action must be traceable.

Audit requirements:

- User
- Timestamp
- Action
- Reason when applicable
- Evidence when applicable
- Before state
- After state
- Related entity ID

Audited actions include:

- Project creation
- Workflow transitions
- Approvals
- Rejections
- Overrides
- QA failures
- Billing decisions
- Document verification
- Exception lifecycle changes
- Assignment changes
- SLA pause/resume
- Project cancellation

---

## 2.6 Document Governance

Google Drive stores files.
Supabase stores metadata.

The database is the source of truth for:

- Required document rules
- Uploaded document metadata
- Verification status
- Document version
- Gate validation status
- Related project/stage/checklist references
- Uploaded by
- Verified by
- Rejection reason

Google Drive alone must not be treated as the workflow source of truth.

---

# 3. Target Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js App Router |
| Hosting | Vercel |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Realtime | Supabase Realtime |
| File Storage | Google Drive API |
| Backend Runtime | API Routes / Server Actions |
| Mobile | Responsive Web App |
| Styling | TailwindCSS + shadcn/ui |

---

## 3.1 Architecture Rules

- Keep business logic in service layers.
- Keep route handlers thin.
- Keep workflow logic reusable.
- Do not duplicate business rules in UI.
- Do not hardcode workflow stages in UI.
- Do not hardcode workflow transitions in UI.
- Use typed database access.
- Use runtime workflow data from Supabase.
- Treat exceptions separately from activity logs.
- Google Drive stores files only.
- Supabase stores operational metadata.

---

# 4. System Boundary

## 4.1 Included Platform Domains

The platform covers:

- Lead intake
- Site survey
- TSSR / engineering
- Quotation / contract
- Payment / loan readiness
- Ready for installation gate
- Resource scheduling
- Installation execution
- QA / commissioning
- Handover
- Billing
- Project closure
- Exception monitoring
- Approval / override
- Document governance
- Contractor mobile operations

---

## 4.2 Not a Fault Pending System

This system must not copy repair/fault pending workflow logic.

The system is a solar project lifecycle platform.

It may borrow from previous dashboards only these concepts:

- Smooth operational UX
- Exception-first dashboard
- Priority monitoring
- SLA risk visibility

But solar workflow, data model, and logic must be designed specifically for solar project lifecycle.

---

# 5. MVP Scope

## 5.1 Included in MVP V1

Workflow scope:

- RES-S + CASH
- RES-S + LOAN Basic

Core modules:

- Authentication foundation
- Project creation
- Workflow runtime
- SLA engine foundation
- Exception engine foundation
- Approval / override foundation
- QA workflow foundation
- Billing workflow foundation
- Google Drive integration
- Dashboard / Command Center foundation
- Mobile contractor workflow foundation
- Basic resource scheduling
- Basic GIS map view

---

## 5.2 Excluded from MVP V1

The following are intentionally outside MVP V1:

- B2G workflow
- Enterprise >30kW workflow
- Advanced loan automation
- Bank integration
- Multi-phase billing
- PM / maintenance lifecycle
- AI analytics
- Predictive analytics
- Multi-company architecture
- Advanced GIS heatmaps
- ERP integrations

Note: LOAN is included as a basic RES-S workflow path in MVP V1. Advanced loan automation, bank integrations, and complex loan exception handling are deferred.

---

# 6. Workflow Definitions

## 6.1 Project Classification

Project workflow may vary by:

- Payment type
- Project size
- Site complexity
- Customer segment
- Contract type

Initial classification:

| Code | Meaning |
|---|---|
| RES-S | Residential Standard, typically ≤10kW |
| RES-A | Residential Advanced |
| COM-M | Commercial Medium |
| COM-L | Commercial / Enterprise |
| CUSTOM | Custom workflow |

MVP starts with RES-S.

---

## 6.2 RES-S CASH Flow

```text
Lead
-> Survey
-> TSSR
-> Quotation
-> Payment
-> Ready for Install
-> Scheduling
-> Installation
-> QA
-> Handover
-> Billing
-> Closure
```

---

## 6.3 RES-S LOAN Basic Flow

```text
Lead
-> Survey
-> TSSR
-> Quotation
-> Loan Document Collection
-> Loan Submission
-> Loan Review
-> Loan Approval
-> Down Payment
-> Ready for Install
-> Scheduling
-> Installation
-> QA
-> Handover
-> Billing
-> Closure
```

Workflow stages above are conceptual product definitions.
The application must read active workflow versions from the database and generate runtime stages dynamically.

---

# 7. Definition Layer vs Runtime Layer

The platform separates workflow definitions from runtime execution.

---

## 7.1 Definition Layer

Definition tables act as templates.

Examples:

```text
workflow_templates
workflow_versions
workflow_stages
workflow_transitions
workflow_checklists
workflow_required_documents
```

These tables define operational rules.
They do not represent active project execution.

---

## 7.2 Runtime Layer

Runtime tables represent actual operational execution.

Examples:

```text
projects
project_stages
project_checklists
project_documents
project_exceptions
approval_requests
activity_logs
```

Runtime data changes continuously as work progresses.

---

## 7.3 Runtime Workflow Generation

When a project is created:

```text
workflow_templates
-> workflow_versions
-> workflow_stages

GENERATE

project_stages
project_checklists
project_documents
```

Workflow definition tables remain templates.
Runtime project tables become operational state.

---

# 8. Runtime State Machine

## 8.1 Runtime Stage Statuses

Every runtime stage must use controlled statuses.

| Status | Meaning |
|---|---|
| PENDING | Stage not started |
| IN_PROGRESS | Currently active |
| WAITING | Waiting external dependency |
| BLOCKED | Cannot continue due to gate or exception |
| COMPLETED | Successfully completed |
| SKIPPED | Intentionally skipped |
| CANCELLED | Closed due to cancellation |

---

## 8.2 Runtime Transition Rules

Runtime stages may only move through configured transitions.

Examples:

```text
PENDING -> IN_PROGRESS
IN_PROGRESS -> COMPLETED
IN_PROGRESS -> WAITING
WAITING -> IN_PROGRESS
IN_PROGRESS -> BLOCKED
BLOCKED -> IN_PROGRESS
```

Direct uncontrolled state modification is prohibited.

---

# 9. Ownership Model

Ownership exists at multiple operational levels.

---

## 9.1 Project Owner

Responsible for overall project coordination.

Examples:

- Sales owner
- Project admin
- Operations coordinator

---

## 9.2 Stage Owner

Responsible for active operational stage execution.

Examples:

- Survey team owns Survey stage
- Engineer owns TSSR stage
- Finance owns Payment/Billing stage
- Contractor owns Installation stage
- QA owns QA stage

---

## 9.3 Exception Owner

Responsible for resolving operational issue.

Examples:

- Contractor owns missing installation photo exception
- Finance owns billing rejection exception
- QA owns QA fail exception until assigned to rework owner

---

## 9.4 Approval Owner

Responsible for approval decisions.

Examples:

- Sales manager approves install before full payment
- QA lead approves QA waiver
- Finance manager approves billing override
- Admin approves cancellation

Ownership drives:

- SLA
- Escalation
- Notification routing
- Dashboard visibility
- Operational accountability

---

# 10. Runtime Engines

## 10.1 Create Project Engine

Responsible for:

- Validate customer/project input
- Detect duplicate customer code
- Detect duplicate phone when needed
- Select active workflow version
- Select active installation standard
- Create project
- Lock project to workflow version
- Lock project to installation standard
- Generate runtime project stages
- Generate runtime project checklists
- Generate required project documents
- Create Google Drive folder structure
- Start first stage as `IN_PROGRESS`
- Calculate first `due_at` from SLA
- Create initial activity log
- Notify project/stage owner

Create Project Engine must be implemented before transition logic.

---

## 10.2 Transition Engine

Responsible for:

- Stage transitions
- Rework loops
- Permission validation
- Workflow direction control
- Runtime status updates
- Audit logging
- Exception updates
- Notification triggering

Transition types:

| Type | Meaning |
|---|---|
| FORWARD | Move to next stage |
| BACKWARD | Move backward |
| REWORK | Return for correction |
| HOLD | Pause project/stage |
| CANCEL | Cancel project |
| OVERRIDE | Move with approved exception |

Transitions must use the `workflow_transitions` table.

---

## 10.3 Gate Validation Engine

Responsible for validating before workflow transitions:

- Required checklist completion
- Required document verification
- Required photo verification
- Approval requirements
- Business rules

Examples:

```text
IF payment incomplete
-> block Ready for Install
```

```text
IF serial number photo missing
-> block QA transition
```

```text
IF PAC missing
-> block Billing approval
```

---

## 10.4 SLA Engine

Responsible for:

- Calculate due dates
- Detect near SLA
- Detect over SLA
- Pause SLA
- Resume SLA
- Trigger escalation
- Create SLA exceptions

SLA statuses:

| Status | Meaning |
|---|---|
| ON_TRACK | Normal |
| NEAR_SLA | Near due time |
| OVER_SLA | Past due |
| SLA_PAUSED | Time counting paused |

---

## 10.5 Exception Engine

Responsible for:

- Detect abnormal conditions
- Create exceptions
- Assign severity
- Assign owner
- Escalate
- Track resolution
- Manage exception lifecycle

Exception categories:

- SLA
- QA
- Billing
- Document
- Workflow
- Resource
- System

Severity levels:

- INFO
- WARNING
- HIGH
- CRITICAL

Lifecycle:

- OPEN
- ACKNOWLEDGED
- IN_PROGRESS
- RESOLVED
- WAIVED
- CLOSED

---

## 10.6 Approval / Override Engine

Responsible for controlled exceptions:

- Install before full payment
- QA waiver
- Billing override
- Cancel request
- SLA waiver

All overrides require:

- Reason
- Evidence
- Approver
- Scope limitation
- Audit log

---

## 10.7 Resource & Scheduling Engine

Responsible for:

- Team assignment
- Territory matching
- Capacity planning
- Calendar scheduling
- Schedule conflict detection
- Rework scheduling

Supports:

- Daily capacity
- Team skills
- Territory validation
- Scheduling SLA
- Public holiday rules
- Multi-day installation
- Travel buffer
- Weather risk warning

---

## 10.8 Document & Google Drive Engine

Responsible for:

- Automatic folder generation
- File uploads
- Metadata management
- Verification workflow
- Document versioning
- Gate integration
- Progressive mobile upload
- Retry upload support

Google Drive stores actual files.
Supabase stores file metadata.

---

## 10.9 Notification & Escalation Engine

Responsible for:

- Notify owner
- Escalate delays
- Send alerts
- Track acknowledgement

Channels:

- In-app notification
- Email
- LINE in future

Routing hierarchy:

```text
Stage Owner
-> Team Lead
-> Manager
-> Executive Dashboard
```

---

# 11. Rework Loop Strategy

Rejected stages must preserve operational history.

Recommended behavior:

```text
QA FAIL
-> create new runtime rework stage instance
-> preserve previous failed stage
```

Benefits:

- Full auditability
- Accurate SLA tracking
- Historical analytics
- QA traceability
- Rework rate reporting

Rework examples:

```text
QA Fail -> Installation Rework -> Re-QA
Billing Reject -> Billing Rework -> Billing Review
TSSR Reject -> Survey Correction -> TSSR Review
```

---

# 12. Document Verification Lifecycle

Document lifecycle statuses:

| Status | Meaning |
|---|---|
| REQUIRED | Required but missing |
| UPLOADED | Uploaded successfully |
| PENDING_VERIFY | Waiting review |
| VERIFIED | Approved |
| REJECTED | Rejected |
| SUPERSEDED | Replaced by newer version |

Document version history must be preserved.

Example:

```text
Invoice v1 -> REJECTED
Invoice v2 -> VERIFIED
Invoice v1 -> SUPERSEDED
```

---

# 13. Installation Standard Architecture

Installation standards are versioned.

Examples:

- V8R2
- V9
- V9.1

Each standard controls:

- Required photos
- QA checklist
- Hard gate rules
- SOP references
- Installation requirements
- Technical checklist

Every project snapshots the active standard at creation.

---

# 14. Google Drive Folder Structure

Every project automatically creates:

```text
[Customer_Code]/
|-- 01_Sales_Commercial
|-- 02_Survey_TSSR
|-- 03_Loan_Documents
|-- 04_Installation_Photos
|-- 05_Site_Folder_Handover
`-- 06_Billing_Finance
```

Folder IDs and file metadata are stored in Supabase.
File content remains in Google Drive.

---

# 15. Workflow Runtime Notes

## 15.1 Lead

Responsibilities:

- Register customer
- Verify contact
- Select project type
- Select payment type

Outputs:

- Project created
- Workflow version locked
- Standard version locked
- Runtime stages generated
- Drive folder generated

---

## 15.2 Survey

Responsibilities:

- Roof inspection
- MDB inspection
- Grounding inspection
- GPS collection
- Survey photo upload

Hard gate:

- Required survey photos mandatory

Possible exceptions:

- Unsafe roof
- Survey incomplete
- Missing roof photo
- Missing consumer unit photo

---

## 15.3 TSSR

Responsibilities:

- SLD creation
- BOQ creation
- Technical design
- Engineering approval

Possible exceptions:

- Survey rejected
- Missing engineering data
- Design conflict

---

## 15.4 Quotation

Responsibilities:

- Generate quotation
- Sign contract
- Customer confirmation

Possible exceptions:

- Customer delay
- Contract pending
- Package change request

---

## 15.5 Payment / Loan

CASH responsibilities:

- Confirm payment
- Upload payment proof

CASH hard gate:

- Full payment required before Ready for Install unless approved override exists.

LOAN Basic responsibilities:

- Collect loan documents
- Submit loan package
- Track review
- Confirm approval
- Confirm down payment

LOAN Basic hard gate:

- Loan approval and required down payment must be complete before Ready for Install unless approved override exists.

---

## 15.6 Ready for Install

Checks:

- Payment or loan readiness
- Material readiness
- Team readiness
- Schedule readiness

Possible exceptions:

- Material not ready
- Team unavailable
- Payment incomplete
- Permit missing

---

## 15.7 Scheduling

Responsibilities:

- Assign installation team
- Confirm installation date
- Validate capacity
- Validate territory

Possible exceptions:

- Schedule conflict
- Team overload
- Customer reschedule
- Weather risk

---

## 15.8 Installation

Responsibilities:

- Installation execution
- Progressive photo upload
- Checklist completion

Mandatory photo concepts:

- Before
- After
- Inverter
- Serial number
- Grounding

Possible exceptions:

- Missing photo
- Wrong installation
- Grounding issue
- Safety issue
- Roof damage

---

## 15.9 QA

QA categories:

- Mechanical
- Electrical
- Monitoring
- Documentation

QA outcomes:

- PASS
- FAIL
- REWORK

QA failure creates exception and rework loop.

---

## 15.10 Handover

Responsibilities:

- Customer acceptance
- Site folder delivery
- Final documentation

Possible exceptions:

- Customer complaint
- Missing site folder
- Monitoring unavailable

---

## 15.11 Billing

Required document concepts:

- Invoice
- PAC
- FBOQ

Billing supports:

- Approve
- Reject
- Resubmit
- Override with approval

Possible exceptions:

- Missing invoice
- PAC missing
- FBOQ issue
- Billing rejected
- Cutoff risk

---

## 15.12 Closure

Responsibilities:

- Confirm all operational gates are complete
- Close project
- Preserve audit trail

---

# 16. Database Architecture

## 16.1 Identity

- profiles

## 16.2 Workflow Definition

- workflow_templates
- workflow_versions
- workflow_stages
- workflow_transitions
- workflow_checklists
- workflow_required_documents

## 16.3 Standards

- installation_standards

## 16.4 Runtime

- projects
- project_stages
- project_checklists
- project_documents

## 16.5 Exceptions

- project_exceptions

## 16.6 Approvals

- approval_requests

## 16.7 Logs

- activity_logs

Required project locks:

- `projects.workflow_version_id`
- `projects.applied_standard_id`

Runtime stages must be generated dynamically from workflow definitions.

---

# 17. Dashboard & Command Center

Dashboard philosophy:

```text
Exception First
```

Dashboard priorities:

- Over SLA projects
- Near SLA projects
- QA failures
- Billing risks
- Waiting approvals
- Resource conflicts
- Missing documents

Dashboard modules:

- Executive KPI cards
- Exception panel
- SLA heatmap
- GIS map view
- Project side panel
- Billing risk panel
- QA failure panel
- Resource conflict view

GIS markers:

| Color | Meaning |
|---|---|
| Green | Normal |
| Yellow | Near SLA |
| Red | Exception |
| Black | Critical |

---

# 18. Mobile Contractor UX

Field technicians must be able to:

- View today's jobs
- Check in
- Upload photos
- Complete checklist
- Submit installation
- Handle rework

Mobile principles:

- Large buttons
- Fast upload
- Retry upload support
- Minimal clicks
- Field-friendly UX
- Progressive upload

---

# 19. Security & Governance

## 19.1 Authentication

Use Supabase Auth.

---

## 19.2 Authorization

Use role-based access control.

Roles:

- admin
- exec
- sales
- ops
- engineer
- qa
- contractor
- finance

---

## 19.3 Governance Rules

- Workflow must never be hardcoded.
- Every action must be auditable.
- Overrides require approval.
- Every project locks to workflow and standard version.
- Exceptions must have lifecycle tracking.
- Exceptions must be separate from activity logs.
- Google Drive is storage only; metadata belongs in Supabase.
- Dashboard must prioritize problems, not normal operations.
- UI must not encode workflow behavior.

---

# 20. Backend Architecture Pattern

Application architecture must follow:

```text
Route / Server Action
-> Service Layer
-> Repository Layer
-> Supabase
```

---

## 20.1 Route Layer

Responsibilities:

- Request parsing
- Authentication
- Response handling

---

## 20.2 Service Layer

Responsibilities:

- Workflow orchestration
- Business logic
- Engine execution
- Transaction coordination

---

## 20.3 Repository Layer

Responsibilities:

- Database access only
- Query isolation
- Typed data access

---

## 20.4 UI Layer

UI must:

- Read runtime state only
- Never hardcode workflow
- Never hardcode transitions
- Never contain business logic

---

# 21. Repository Architecture

Recommended structure:

```text
/app
/components
/modules
/services
/lib
/types
/hooks
/styles
/supabase
/scripts
/docs
```

Recommended modules:

```text
/modules
  /projects
  /workflow
  /qa
  /billing
  /scheduling
  /documents
  /dashboard
  /auth
  /exceptions
```

Implementation guidance:

- Route handlers call services.
- Services own business orchestration.
- Repositories own database access.
- UI reads runtime data.
- UI must not encode workflow behavior.
- Tests should cover workflow and gate rules as engines are added.

---

# 22. Development Phases

## Phase 1: Foundation

- SQL schema
- Seed workflow data for RES-S CASH and RES-S LOAN Basic
- Authentication foundation
- Create Project Engine
- Workflow runtime generation

---

## Phase 2: Core Operations

- Transition Engine
- Gate Validation Engine
- SLA Engine
- Exception Engine
- Dashboard foundation

---

## Phase 3: Field Operations

- Mobile installation UX
- QA workflow
- Scheduling engine
- Google Drive upload integration

---

## Phase 4: Governance

- Approval Engine
- Workflow builder
- Admin console
- Version management

---

## Phase 5: Enterprise Expansion

- Advanced loan workflow
- Enterprise workflow
- B2G workflow
- Multi-phase billing
- PM lifecycle
- AI analytics

---

# 23. Current Implementation Gap

Current repository state may not yet fully match this architecture.

Known gaps to check:

- Create Project logic may still be inside an API route.
- Existing runtime may use `project_milestones`; target runtime uses `project_stages`.
- Existing workflow may read `workflow_definitions`; target architecture uses versioned workflow tables.
- Project creation should select active published workflow/standard server-side.
- Google Drive folder creation should be moved into service orchestration.
- Activity logs, exceptions, approvals, and document metadata runtime tables must be wired.
- UI timeline behavior must be decoupled from old milestone shape.

Migration approach:

- Implement one engine at a time.
- Start with Create Project Engine V1.
- Preserve current app behavior while adding service-layer architecture.
- Avoid broad dashboard redesign during engine work.

---

# 24. Success Criteria

MVP V1 is successful when:

- RES-S CASH projects can run end to end.
- RES-S LOAN Basic projects can run end to end.
- Projects lock workflow and standard versions at creation.
- Runtime stages are generated dynamically.
- Workflow transitions use configured transitions.
- Hard gates block invalid transitions.
- QA reject/rework works.
- Billing approve/reject works.
- Dashboard surfaces operational risks.
- Mobile contractor workflow is usable in the field.
- One operational team can run production workload.

---

# 25. Current Development Priority

Current implementation priority:

1. Database Schema
2. Seed Workflow Data
3. Create Project Engine
4. Runtime Workflow
5. Gate Validation
6. SLA Engine
7. Exception Engine
8. Mobile Upload Flow
9. QA Flow
10. Billing Flow
11. Dashboard

---

# 26. AI / Codex Instruction

Before writing or modifying code, AI coding tools must:

1. Read this document first.
2. Treat it as the source of truth.
3. Do not redesign the architecture.
4. Do not simplify workflow logic.
5. Do not hardcode workflow stages in UI.
6. Follow runtime workflow architecture strictly.
7. Implement one engine at a time.
8. Explain files to modify before editing.
9. Avoid dashboard work until foundation engines are stable.

---

# 27. Final Principle

This system is designed to become:

```text
Solar ERP
+
Workflow Platform
+
Operations Platform
+
QA Governance Platform
+
Billing Governance Platform
+
Field Operations Command Center
```

for scalable enterprise solar operations.

The architecture must always prioritize:

- Runtime flexibility
- Auditability
- Exception visibility
- Operational scalability
- Workflow governance
- Long-term maintainability

---

# End of Final Architecture Source of Truth

