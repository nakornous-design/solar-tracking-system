# User & Role RBAC Model

Status: Implemented foundation
Scope: Solar Operations Platform MVP and extensible operations roles

## Design Decision

`roles` is the source of truth.

User role assignment, workflow stage ownership, exception ownership, notification recipient roles, and resource team ownership are no longer limited by the old `user_role` enum. They use role codes stored as text and validated against the `roles` table.

## Role Types

### system_admin

Break-glass platform administrator.

Can do everything, including:

- Delete projects
- Delete users
- Manage danger-zone actions
- Manage roles and permissions

Rules:

- Should be assigned to very few users.
- Cannot delete their own account.
- Cannot delete the last active `system_admin`.

### admin

Full operations administrator.

Can do all normal operational and configuration work:

- View/create/edit projects
- Move workflow stages
- Upload and verify documents
- Manage QA, billing, scheduling, resources, exceptions, approvals
- Manage users, roles, permissions, workflow, audit logs

Cannot do destructive danger-zone actions:

- Cannot delete projects
- Cannot delete users
- Cannot grant danger-zone permissions unless promoted to `system_admin`

### Operational Roles

Default operational roles:

- `supervisor`
- `exec`
- `sales`
- `ops`
- `engineer`
- `qa`
- `contractor`
- `finance`
- `rcm`
- `sbc`

These roles are editable through the Admin Users page. New roles can be added and assigned to users or workflow stages.

## Permission Model

Permissions are stored in `role_permissions`.

Important permission groups:

- `projects.*`
- `documents.*`
- `workflow.*`
- `qa.*`
- `billing.*`
- `schedule.*`
- `resources.*`
- `exceptions.*`
- `approvals.*`
- `users.*`
- `roles.*`
- `danger_zone.*`

Destructive permissions:

- `projects.delete`
- `documents.delete`
- `users.delete`
- `danger_zone.*`

Normal `admin` must not receive these destructive permissions.

## Backend Enforcement

Backend authorization supports both:

- Legacy allowed role lists, for existing routes
- Permission fallback based on API path and HTTP method

This means a custom role can work immediately when its `role_permissions` include the needed permission key.

Example:

- A custom `billing_manager` role with `billing.view`, `billing.edit`, `billing.approve`, `projects.view`, and `documents.verify` can use billing-related APIs without being hardcoded into every route.

## Workflow Ownership

Workflow owner roles should use `roles.role_code`.

Examples:

- Installation owner: `contractor`
- Billing owner: `finance`
- Custom role owner: `billing_manager`

When a project runtime is generated, stage owner role values are copied as snapshots into `project_stages.owner_role`.

## Admin UX Rules

- Role dropdowns load active roles from the database.
- New roles can be created from Admin Users > Roles.
- Permissions can be toggled per role.
- `system_admin` permissions are locked.
- Normal `admin` cannot grant danger-zone permissions.

## Recommended Operating Setup

Minimum production users:

- At least 2 active `system_admin` users
- Day-to-day management users should be `admin`
- Operational users should use focused roles

Recommended pattern:

- Use `system_admin` only for dangerous or emergency operations.
- Use `admin` for normal platform management.
- Create custom roles for real departments when the default roles are too broad.
