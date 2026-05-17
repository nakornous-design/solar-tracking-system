# Solar Project Tracking System
## Master Architecture & Workflow Documentation
Version: 1.0
Status: Foundation Blueprint
Target Stack: Next.js + Supabase + Google Drive API

---

# 1. Executive Vision

## 1.1 What is this system?

This is not a simple project tracker.

This system is designed to become a:

# Solar Operations Platform

An enterprise-grade end-to-end operational platform for managing:

- Sales
- Survey
- Engineering
- Installation
- QA
- Billing
- Contractor Operations
- SLA Monitoring
- Exception Management
- Workflow Governance

The system is designed around:

- Dynamic Workflow Engine
- Hard Gate Validation
- Exception-First Monitoring
- SLA & Escalation Control
- Technical Standard Versioning (V8R2/V9)
- Mobile Field Operations
- Google Drive Document Governance

---

# 2. Design Philosophy

## 2.1 Exception-First Operations

The dashboard is not designed to show normal work.

The platform is designed to highlight:

- Over SLA
- QA Failures
- Missing Documents
- Billing Risks
- Workflow Blockers
- Contractor Delays
- Critical Exceptions

Managers should immediately see:

- What is stuck
- Who owns it
- What action is required
- Which project is at risk

---

## 2.2 Hard Gate Architecture

Projects cannot move forward unless mandatory conditions are completed.

Examples:

- Missing installation photos → Cannot move to QA
- Payment incomplete → Cannot schedule installation
- QA Fail → Cannot handover
- Missing PAC → Cannot approve billing

Hard Gates are central to the system.

---

## 2.3 Dynamic Workflow Engine

Workflow must never be hardcoded.

Admin users must be able to:

- Add stages
- Remove stages
- Reorder stages
- Edit SLA
- Edit owner role
- Configure checklist
- Configure required documents
- Publish workflow versions

Projects lock to a specific workflow version.

---

## 2.4 Standard Version Snapshot

Every project locks to a specific technical installation standard version.

Examples:

- V8R2
- V9
- V9.1

Projects created under V8R2 remain under V8R2 even after the organization moves to V9.

This prevents:

- Audit conflicts
- Retroactive QA failures
- Version inconsistency

---

# 3. Technology Stack

| Component | Technology |
|---|---|
| Frontend | Next.js |
| Hosting | Vercel |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Realtime | Supabase Realtime |
| File Storage | Google Drive API |
| Serverless Logic | Edge Functions |
| Mobile Field UX | Responsive Next.js App |

---

# 4. System Engines

The platform is built around specialized operational engines.

---

## 4.1 Create Project Engine

Responsibilities:

- Validate input
- Detect duplicates
- Select workflow version
- Select standard version
- Create project runtime stages
- Generate checklists
- Generate required documents
- Create Google Drive folders
- Start SLA tracking
- Create activity logs

---

## 4.2 Transition Engine

Controls project stage movement.

Examples:

- Survey → TSSR
- Installation → QA
- QA Fail → Installation Rework
- Billing Reject → Billing Rework

Responsibilities:

- Permission validation
- Workflow validation
- Gate validation
- Transition logging
- Exception creation
- Notification trigger

---

## 4.3 Gate Validation Engine

Validates whether a project can move to the next stage.

Validation types:

- Checklist completion
- Required document verification
- Required photo verification
- Approval requirement
- Business rule validation

Examples:

- Missing serial number photo
- Payment incomplete
- QA not approved
- PAC missing

Gate severities:

- HARD
- SOFT
- OVERRIDEABLE
- INFO

---

## 4.4 SLA Engine

Controls timing and escalation.

Responsibilities:

- Calculate due dates
- Detect near SLA
- Detect over SLA
- Pause/resume SLA
- Trigger escalation
- Create SLA exceptions

SLA statuses:

- ON_TRACK
- NEAR_SLA
- OVER_SLA
- SLA_PAUSED

---

## 4.5 Exception Engine

The operational nervous system of the platform.

Exception categories:

- SLA Exception
- QA Exception
- Billing Exception
- Document Exception
- Workflow Exception
- System Exception

Exception lifecycle:

- OPEN
- ACKNOWLEDGED
- IN_PROGRESS
- RESOLVED
- WAIVED
- CLOSED

Severity levels:

- INFO
- WARNING
- HIGH
- CRITICAL

---

## 4.6 Approval / Override Engine

Handles controlled exceptions.

Examples:

- Install before full payment
- QA Waive
- Billing Override
- Cancel Project
- SLA Waive

Requirements:

- Reason
- Evidence
- Approver
- Audit Log
- Scope limitation

---

## 4.7 Notification & Escalation Engine

Responsibilities:

- Notify owner
- Escalate delays
- Send alerts
- Track acknowledgement

Channels:

- LINE
- Email
- In-app Notification

---

## 4.8 Resource & Scheduling Engine

Controls:

- Contractor teams
- Capacity
- Territory
- Skill matching
- Installation scheduling
- Calendar conflict detection

Supports:

- Drag & Drop scheduling
- Rework scheduling
- Team availability

---

## 4.9 Document & Google Drive Engine

Responsibilities:

- Create folder structure
- Upload document metadata
- Verify required files
- Manage document versioning
- Support progressive mobile upload

Google Drive stores actual files.
Supabase stores metadata.

---

## 4.10 Dashboard & Command Center

Central operational control interface.

Key areas:

- Executive KPI
- Exception Panel
- SLA Heatmap
- GIS Map View
- Project Side Panel
- Billing Risk
- QA Failures
- Resource Conflicts

---

# 5. MVP Scope

## 5.1 Initial MVP Scope

The first MVP will support:

# RES-S + CASH only

The goal is to validate:

- Runtime workflow
- Gate validation
- Exception management
- Mobile installation flow
- QA rework flow
- Billing review flow

---

## 5.2 MVP Workflow

Lead
→ Survey
→ TSSR
→ Quotation
→ Payment
→ Ready for Install
→ Scheduling
→ Installation
→ QA
→ Handover
→ Billing
→ Closure

---

## 5.3 Excluded from MVP

The following are intentionally excluded from the first MVP:

- Loan workflow
- B2G workflow
- Enterprise >30kW
- Advanced milestone billing
- PM / Maintenance
- Advanced GIS analytics
- Multi-company tenancy

---

# 6. Workflow Runtime Logic

---

## 6.1 Lead Stage

Responsibilities:

- Register customer
- Verify contact
- Select project type
- Select payment type

Outputs:

- Project created
- Workflow generated
- Drive folder generated

---

## 6.2 Survey Stage

Responsibilities:

- Roof inspection
- MDB inspection
- Grounding inspection
- GPS collection
- Survey photo upload

Hard Gate:

- Required survey photos mandatory

---

## 6.3 TSSR Stage

Responsibilities:

- SLD creation
- BOQ creation
- Technical design
- Engineering approval

Possible Exception:

- Survey rejected
- Missing engineering data

---

## 6.4 Quotation Stage

Responsibilities:

- Generate quotation
- Sign contract
- Customer confirmation

---

## 6.5 Payment Stage

Responsibilities:

- Confirm payment
- Upload payment proof

Hard Gate:

- Full payment required for CASH projects

Override supported via Approval Engine.

---

## 6.6 Ready for Install Gate

Checks:

- Payment ready
- Material ready
- Team ready
- Schedule ready

---

## 6.7 Installation Stage

Responsibilities:

- Installation execution
- Progressive photo upload
- Checklist completion

Mandatory Photos:

- Before
- After
- Inverter
- Serial Number
- Grounding

---

## 6.8 QA Stage

QA categories:

- Mechanical
- Electrical
- Monitoring
- Documentation

QA outcomes:

- PASS
- FAIL
- REWORK

QA Fail creates exceptions and rework loops.

---

## 6.9 Handover Stage

Responsibilities:

- Customer acceptance
- Site folder delivery
- Final documentation

---

## 6.10 Billing Stage

Required documents:

- Invoice
- PAC
- FBOQ

Billing supports:

- Reject / Resubmit
- Same-cycle payment protection

---

# 7. Google Drive Structure

Every project automatically creates:

```text
[Customer_Code]/
├── 01_Sales_Commercial
├── 02_Survey_TSSR
├── 03_Loan_Documents
├── 04_Installation_Photos
├── 05_Site_Folder_Handover
└── 06_Billing_Finance
```

---

# 8. Database Architecture Overview

Core tables:

```text
profiles
workflow_templates
workflow_versions
workflow_stages
workflow_transitions
workflow_checklists
workflow_required_documents
installation_standards
projects
project_stages
project_checklists
project_documents
project_exceptions
approval_requests
activity_logs
```

Projects lock to:

- workflow_version_id
- applied_standard_id

Runtime stages are generated dynamically from workflow definitions.

---

# 9. UI/UX Architecture

## Design Style

- Professional enterprise workflow interface
- Responsive operational workspace
- Exception-first visibility
- High-density operational monitoring layout

---

## Key Screens

- Dashboard
- Project List
- Project Detail
- GIS View
- Calendar Scheduling
- Workflow Builder
- Billing Center
- QA Console
- Mobile Field Operations
- Admin Console

---

# 10. Mobile Field Operations

Field technicians must be able to:

- View today's jobs
- Check-in
- Upload photos
- Complete checklist
- Submit installation

Requirements:

- Large buttons
- Mobile optimized
- Progressive upload
- Retry upload support

---

# 11. Enterprise Governance Rules

Critical rules:

- Workflow must never be hardcoded.
- Every action must be auditable.
- Overrides require approval.
- Every project locks to workflow and standard version.
- Exceptions must have lifecycle tracking.
- Google Drive is storage only; metadata belongs in database.
- Dashboard must prioritize problems, not normal operations.

---

# 12. Current Implementation Priority

Current development focus:

# MVP Foundation

Build order:

1. Database Schema
2. Seed Workflow Data
3. Create Project Engine
4. Runtime Workflow
5. Gate Validation
6. SLA Engine
7. Exception Engine
8. Mobile Installation Upload
9. QA Flow
10. Billing Flow
11. Dashboard

---

# End of Document

