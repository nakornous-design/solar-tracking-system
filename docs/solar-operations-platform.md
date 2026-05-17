# Solar Operations Platform

## Enterprise Solar Project Tracking & Workflow Management System

Version: MVP Architecture V1  
Target Stack: Next.js + Vercel + Supabase + Google Drive API

---

# 1. Vision & Purpose

Solar Operations Platform is an enterprise-grade workflow-driven system designed to manage the complete lifecycle of solar installation projects from lead intake to billing closure.

The platform replaces fragmented manual processes, spreadsheets, chat-based coordination, and disconnected operational tracking with a centralized real-time operations platform.

The system is specifically designed for:

- Solar installation operations
- QA governance
- Workflow enforcement
- Contractor coordination
- Billing governance
- SLA monitoring
- Exception-based management
- Enterprise scalability

---

# 2. Core Philosophy

This platform is NOT a simple CRM or project tracker.

It is:

- Workflow Platform
- QA Platform
- Operations Platform
- Contractor Management Platform
- Billing Governance Platform
- Command Center

---

# 3. Key Design Principles

---

## 3.1 Exception-First Operations

The platform prioritizes visibility of abnormal conditions:

- Over SLA
- Missing documents
- QA Failures
- Billing delays
- Resource conflicts
- Pending approvals

The dashboard must surface operational risks before normal projects.

---

## 3.2 Dynamic Workflow Engine

Workflow must NEVER be hardcoded.

Admin users must be able to:

- Add stages
- Remove stages
- Reorder stages
- Change SLA
- Configure checklist rules
- Configure document requirements
- Publish workflow versions

without code changes.

---

## 3.3 Hard Gate Validation

Projects cannot progress unless required conditions are satisfied.

Examples:

- Installation cannot close without required photos
- QA cannot pass without checklist completion
- Billing cannot approve without PAC
- Installation scheduling blocked if payment incomplete

---

## 3.4 Version Snapshot Architecture

Each project snapshots:

- Workflow version
- Installation standard version

at the moment the project is created.

Example:

| Project | Workflow | Standard |
|---|---|---|
| Project A | RES-S-CASH v1 | V8R2 |
| Project B | RES-S-LOAN v2 | V9 |

Projects must NOT be affected by future standard changes.

---

## 3.5 Auditability

Every critical action must be traceable.

Examples:

- Approvals
- Rejections
- Overrides
- QA failures
- Billing decisions
- Workflow transitions

All actions require:

- User
- Timestamp
- Reason
- Evidence
- Before/after state

---

# 4. Target Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) |
| Hosting | Vercel |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Realtime | Supabase Realtime |
| File Storage | Google Drive API |
| Backend Runtime | Server Actions / API Routes |
| Mobile | Responsive Web App |
| Styling | TailwindCSS + shadcn/ui |

---

# 5. MVP Scope

---

## Included in MVP

### Workflow

- RES-S + CASH
- RES-S + LOAN (Basic Workflow)

### Core Modules

- Authentication
- Project creation
- Workflow runtime
- SLA engine
- Exception engine
- Approval / override engine
- QA workflow
- Billing workflow (basic)
- Google Drive integration
- Dashboard / Command Center
- Mobile contractor workflow
- Resource scheduling basic
- GIS map view basic

---

## Excluded from MVP

- B2G workflow
- Enterprise >30kW workflow
- Multi-phase billing
- PM / maintenance lifecycle
- AI analytics
- Predictive analytics
- Multi-company architecture
- Advanced GIS heatmaps
- ERP integrations

---

# 6. Workflow Overview

---

# 6.1 CASH Flow

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

# 6.2 LOAN Flow

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

---

# 7. Runtime Engines

---

# 7.1 Create Project Engine

Responsible for:

- Creating project
- Selecting workflow version
- Selecting standard version
- Generating runtime stages
- Generating runtime checklists
- Generating required documents
- Creating Google Drive folders
- Starting SLA
- Creating initial activity logs

---

# 7.2 Transition Engine

Responsible for:

- Stage transitions
- Rework loops
- Permission validation
- Workflow direction control
- Audit logging
- Runtime status updates

Transition types:

- FORWARD
- BACKWARD
- REWORK
- HOLD
- CANCEL
- OVERRIDE

---

# 7.3 Gate Validation Engine

Responsible for validating:

- Required checklist
- Required documents
- Required photos
- Approval requirements
- Business rules

before allowing stage transitions.

Examples:

```text
IF payment incomplete
-> block Ready for Install
```

```text
IF serial number photo missing
-> block QA transition
```

---

# 7.4 SLA Engine

Responsible for:

- SLA timers
- Near SLA warnings
- Over SLA detection
- Pause / resume logic
- Escalation
- SLA status management

SLA statuses:

- ON_TRACK
- NEAR_SLA
- OVER_SLA
- SLA_PAUSED

---

# 7.5 Exception Engine

Responsible for:

- Detecting abnormal conditions
- Creating exceptions
- Assigning severity
- Escalation
- Resolution tracking
- Exception lifecycle management

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

# 7.6 Approval / Override Engine

Responsible for:

- Override requests
- QA waivers
- Billing overrides
- Cancel requests
- Escalated approvals

Examples:

```text
Install before full payment
```

```text
Billing approve with missing document
```

All overrides require:

- Reason
- Evidence
- Approver
- Audit log

---

# 7.7 Resource & Scheduling Engine

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

---

# 7.8 Document & Google Drive Engine

Responsible for:

- Automatic folder generation
- File uploads
- Metadata management
- Verification workflow
- Versioning
- Gate integration
- Progressive upload

---

# 8. Installation Standard Architecture

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

Projects snapshot the standard version at creation.

---

# 9. Google Drive Folder Structure

Every project automatically generates:

```text
[Customer_Code]/
|-- 01_Sales_Commercial
|-- 02_Survey_TSSR
|-- 03_Loan_Documents
|-- 04_Installation_Photos
|-- 05_Site_Folder_Handover
`-- 06_Billing_Finance
```

---

# 10. QA Philosophy

QA is a hard operational gate.

QA validates:

- Mechanical installation
- Electrical installation
- Grounding
- Monitoring systems
- Documentation completeness

QA failures trigger:

- Rework stage
- Exception creation
- Billing lock

---

# 11. Database Architecture

---

## Identity

- profiles

---

## Workflow

- workflow_templates
- workflow_versions
- workflow_stages
- workflow_transitions
- workflow_checklists
- workflow_required_documents

---

## Standards

- installation_standards

---

## Runtime

- projects
- project_stages
- project_checklists
- project_documents

---

## Exceptions

- project_exceptions

---

## Approvals

- approval_requests

---

## Logs

- activity_logs

---

# 12. Dashboard & Command Center

Dashboard philosophy:

```text
Exception First
```

The dashboard prioritizes:

- Over SLA projects
- QA failures
- Billing risks
- Waiting approvals
- Resource conflicts

---

## Dashboard Modules

### Executive KPI Cards

- Total projects
- Over SLA
- QA Fail
- Billing risk
- Near SLA
- Pending approvals

---

### Exception Panel

Displays:

- Critical issues
- Aging exceptions
- Open QA failures
- Missing documents

---

### GIS Map View

Map markers:

| Color | Meaning |
|---|---|
| Green | Normal |
| Yellow | Near SLA |
| Red | Exception |
| Black | Critical |

---

### Side Detail Panel

Displays:

- Project summary
- Current stage
- SLA status
- Exceptions
- Documents
- Activity log
- Action buttons

---

# 13. Mobile Contractor UX

Contractors use mobile workflow for:

- Today's jobs
- Check-in
- Upload photos
- Complete checklist
- Submit installation
- Rework actions

Mobile principles:

- Large buttons
- Fast upload
- Retry support
- Minimal clicks
- Field-friendly UX

---

# 14. Security & Governance

---

## Authentication

Supabase Auth

---

## Authorization

Role-based access control

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

## Audit Requirements

All critical actions logged:

- approvals
- rejections
- overrides
- workflow transitions
- billing approvals
- QA results

---

# 15. Recommended Repository Structure

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

---

# 16. Recommended Module Structure

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

---

# 17. Recommended Development Phases

---

## Phase 1

Foundation

- SQL schema
- Seed workflow
- Authentication
- Project creation
- Workflow runtime

---

## Phase 2

Core Operations

- Transition engine
- SLA engine
- Exception engine
- Dashboard

---

## Phase 3

Field Operations

- Mobile install UX
- QA workflow
- Scheduling engine
- Google Drive integration

---

## Phase 4

Governance

- Approval engine
- Workflow builder
- Admin console
- Version management

---

## Phase 5

Enterprise Expansion

- Loan advanced flow
- Enterprise workflow
- B2G workflow
- Multi-phase billing
- AI analytics

---

# 18. Recommended UI/UX Style

---

## Design Direction

Professional Operations Command Center

---

## Visual Style

- Dark sidebar
- Light workspace
- Rounded cards
- Status badges
- GIS side-panel layout
- Smooth transitions
- Minimal clutter

---

## UX Principles

- Exception-first
- Operational speed
- Low-click workflow
- Mobile-first field operation
- Real-time visibility

---

# 19. Success Criteria

MVP is successful when:

- Projects can run end-to-end
- Workflow transitions work correctly
- Hard gates block invalid transitions
- QA reject/rework works
- Billing approve/reject works
- Dashboard shows operational risks
- Mobile contractor workflow usable in field
- One operational team can run production workload

---

# 20. Long-Term Vision

Future expansion:

- Enterprise solar workflow
- PM lifecycle
- AI operational analytics
- Predictive SLA risk
- Smart scheduling optimization
- Advanced GIS heatmaps
- Multi-company operations
- ERP integrations
- Utility integrations

---

# 21. Final Principle

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
