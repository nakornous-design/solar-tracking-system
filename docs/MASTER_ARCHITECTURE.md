# Solar Operations Platform

## Master Architecture & Workflow Documentation

> Superseded: use `docs/FINAL_ARCHITECTURE_SOURCE_OF_TRUTH.md` as the highest-priority architecture and workflow source of truth from this point forward.

Version: MVP Architecture V1  
Status: Source of Truth  
Target Stack: Next.js + Vercel + Supabase PostgreSQL + Supabase Auth + Supabase Realtime + Google Drive API

---

# 1. Executive Vision

Solar Operations Platform is an enterprise-grade workflow-driven system for managing the full solar installation lifecycle from lead intake to billing closure.

This is not a simple CRM, checklist app, or project tracker. It is designed to become:

- Workflow Platform
- QA Governance Platform
- Operations Platform
- Contractor Management Platform
- Billing Governance Platform
- Exception-first Command Center
- Solar ERP foundation

The platform replaces spreadsheets, chat-based coordination, disconnected document handling, and manual status chasing with a centralized real-time operations platform.

---

# 2. Core Operating Principles

## 2.1 Exception-First Operations

The platform must surface operational risk before normal work.

Priority signals:

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

Dashboards must answer:

- What is stuck?
- Who owns it?
- What action is required?
- Which project is at risk?

## 2.2 Dynamic Workflow Engine

Workflow must never be hardcoded in UI or business logic.

Admin users must be able to configure workflow definitions without code changes:

- Add stages
- Remove stages
- Reorder stages
- Edit SLA
- Edit owner role
- Configure checklist rules
- Configure document requirements
- Configure transitions
- Publish workflow versions

Runtime project stages must be generated from published workflow versions.

## 2.3 Hard Gate Validation

Projects cannot progress unless required conditions are satisfied.

Examples:

- Payment incomplete blocks Ready for Install for CASH projects.
- Missing installation photos block QA transition.
- QA failure blocks Handover and Billing.
- Missing PAC blocks Billing approval.

Gate severities:

- HARD
- SOFT
- OVERRIDEABLE
- INFO

## 2.4 Version Snapshot Architecture

Every project locks to:

- `workflow_version_id`
- `applied_standard_id`

at creation time.

Projects must not be affected by future workflow or installation standard changes.

Example:

| Project | Workflow | Standard |
|---|---|---|
| Project A | RES-S-CASH v1 | V8R2 |
| Project B | RES-S-LOAN v1 | V9 |

## 2.5 Auditability

Every critical action must be traceable.

Audit requirements:

- User
- Timestamp
- Action
- Reason, when applicable
- Evidence, when applicable
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

## 2.6 Document Governance

Google Drive stores files. Supabase stores metadata.

The database is the source of truth for:

- Required document rules
- Uploaded document metadata
- Verification status
- Document version
- Gate validation status
- Related project/stage/checklist references

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

Architecture rules:

- Keep business logic in service layers.
- Keep route handlers thin.
- Keep workflow logic reusable.
- Do not duplicate business rules in UI.
- Do not hardcode workflow stages in UI.
- Use typed database access.
- Use runtime workflow data from Supabase.
- Treat exceptions separately from activity logs.

---

# 4. MVP Scope

## 4.1 Included in MVP V1

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

## 4.2 Excluded from MVP V1

The following are intentionally outside MVP V1:

- B2G workflow
- Enterprise >30kW workflow
- Advanced loan workflow
- Multi-phase billing
- PM / maintenance lifecycle
- AI analytics
- Predictive analytics
- Multi-company architecture
- Advanced GIS heatmaps
- ERP integrations

Note: LOAN is included as a basic RES-S workflow path in MVP V1. Advanced loan automation, bank integrations, and complex loan exception handling are deferred.

---

# 5. Workflow Definitions

## 5.1 RES-S CASH Flow

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

## 5.2 RES-S LOAN Basic Flow

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

Workflow stages above are conceptual product definitions. The application must read active workflow versions from the database and generate runtime stages dynamically.

---

# 6. Runtime Engines

## 6.1 Create Project Engine

Responsible for:

- Validate customer/project input
- Detect duplicate customer code
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

Create Project Engine must be implemented before transition logic.

## 6.2 Transition Engine

Responsible for:

- Stage transitions
- Rework loops
- Permission validation
- Workflow direction control
- Runtime status updates
- Audit logging

Transition types:

- FORWARD
- BACKWARD
- REWORK
- HOLD
- CANCEL
- OVERRIDE

Transitions must use the `workflow_transitions` table.

## 6.3 Gate Validation Engine

Responsible for validating:

- Required checklist completion
- Required document verification
- Required photo verification
- Approval requirements
- Business rules

before allowing workflow transitions.

Examples:

```text
IF payment incomplete
-> block Ready for Install
```

```text
IF serial number photo missing
-> block QA transition
```

## 6.4 SLA Engine

Responsible for:

- Calculate due dates
- Detect near SLA
- Detect over SLA
- Pause SLA
- Resume SLA
- Trigger escalation
- Create SLA exceptions

SLA statuses:

- ON_TRACK
- NEAR_SLA
- OVER_SLA
- SLA_PAUSED

## 6.5 Exception Engine

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

## 6.6 Approval / Override Engine

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

## 6.7 Resource & Scheduling Engine

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

## 6.8 Document & Google Drive Engine

Responsible for:

- Automatic folder generation
- File uploads
- Metadata management
- Verification workflow
- Document versioning
- Gate integration
- Progressive mobile upload

## 6.9 Notification & Escalation Engine

Responsible for:

- Notify owner
- Escalate delays
- Send alerts
- Track acknowledgement

Channels:

- In-app notification
- Email
- LINE, future

---

# 7. Installation Standard Architecture

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

Every project snapshots the active standard at creation.

---

# 8. Database Architecture

## 8.1 Identity

- profiles

## 8.2 Workflow

- workflow_templates
- workflow_versions
- workflow_stages
- workflow_transitions
- workflow_checklists
- workflow_required_documents

## 8.3 Standards

- installation_standards

## 8.4 Runtime

- projects
- project_stages
- project_checklists
- project_documents

## 8.5 Exceptions

- project_exceptions

## 8.6 Approvals

- approval_requests

## 8.7 Logs

- activity_logs

Required project locks:

- `projects.workflow_version_id`
- `projects.applied_standard_id`

Runtime stages must be generated dynamically from workflow definitions.

---

# 9. Google Drive Folder Structure

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

Folder IDs and file metadata are stored in Supabase. File content remains in Google Drive.

---

# 10. Workflow Runtime Notes

## 10.1 Lead

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

## 10.2 Survey

Responsibilities:

- Roof inspection
- MDB inspection
- Grounding inspection
- GPS collection
- Survey photo upload

Hard gate:

- Required survey photos mandatory

## 10.3 TSSR

Responsibilities:

- SLD creation
- BOQ creation
- Technical design
- Engineering approval

Possible exceptions:

- Survey rejected
- Missing engineering data

## 10.4 Quotation

Responsibilities:

- Generate quotation
- Sign contract
- Customer confirmation

## 10.5 Payment / Loan

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

## 10.6 Ready for Install

Checks:

- Payment or loan readiness
- Material readiness
- Team readiness
- Schedule readiness

## 10.7 Scheduling

Responsibilities:

- Assign installation team
- Confirm installation date
- Validate capacity
- Validate territory

## 10.8 Installation

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

## 10.9 QA

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

## 10.10 Handover

Responsibilities:

- Customer acceptance
- Site folder delivery
- Final documentation

## 10.11 Billing

Required document concepts:

- Invoice
- PAC
- FBOQ

Billing supports:

- Approve
- Reject
- Resubmit
- Override with approval

## 10.12 Closure

Responsibilities:

- Confirm all operational gates are complete
- Close project
- Preserve audit trail

---

# 11. Dashboard & Command Center

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

# 12. Mobile Contractor UX

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

# 13. Security & Governance

## 13.1 Authentication

Supabase Auth.

## 13.2 Authorization

Role-based access control.

Roles:

- admin
- exec
- sales
- ops
- engineer
- qa
- contractor
- finance

## 13.3 Critical Governance Rules

- Workflow must never be hardcoded.
- Every action must be auditable.
- Overrides require approval.
- Every project locks to workflow and standard version.
- Exceptions must have lifecycle tracking.
- Exceptions must be separate from activity logs.
- Google Drive is storage only; metadata belongs in Supabase.
- Dashboard must prioritize problems, not normal operations.

---

# 14. Repository Architecture

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

# 15. Development Phases

## Phase 1: Foundation

- SQL schema
- Seed workflow data for RES-S CASH and RES-S LOAN Basic
- Authentication foundation
- Create Project Engine
- Workflow runtime generation

## Phase 2: Core Operations

- Transition Engine
- Gate Validation Engine
- SLA Engine
- Exception Engine
- Dashboard foundation

## Phase 3: Field Operations

- Mobile installation UX
- QA workflow
- Scheduling engine
- Google Drive upload integration

## Phase 4: Governance

- Approval Engine
- Workflow builder
- Admin console
- Version management

## Phase 5: Enterprise Expansion

- Advanced loan workflow
- Enterprise workflow
- B2G workflow
- Multi-phase billing
- PM lifecycle
- AI analytics

---

# 16. Current Implementation Gap

Current repository state does not yet fully match this architecture.

Known gaps:

- Create Project logic is still inside an API route.
- Existing runtime uses `project_milestones`; target runtime uses `project_stages`.
- Existing workflow reads `workflow_definitions`; target architecture uses versioned workflow tables.
- Project creation currently accepts workflow/standard choices from client instead of selecting active published records server-side.
- Google Drive folder creation is currently initiated from client flow after project creation.
- Activity logs, exceptions, approvals, and document metadata runtime tables are not yet fully wired.
- UI has timeline behavior coupled to current milestone shape.

Migration approach:

- Implement one engine at a time.
- Start with Create Project Engine V1.
- Preserve current app behavior while adding service-layer architecture.
- Avoid broad dashboard redesign during engine work.

---

# 17. Success Criteria

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

# 18. Final Principle

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
