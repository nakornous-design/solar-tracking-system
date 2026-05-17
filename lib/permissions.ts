export type PermissionDefinition = {
  key: string;
  label: string;
  group: string;
  risk: "normal" | "danger";
};

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: "dashboard.view", label: "Dashboard", group: "Menu Visibility", risk: "normal" },
  { key: "projects.view", label: "View projects", group: "Projects", risk: "normal" },
  { key: "projects.create", label: "Create projects", group: "Projects", risk: "normal" },
  { key: "projects.edit", label: "Edit projects and workflow runtime", group: "Projects", risk: "normal" },
  { key: "projects.transition", label: "Move project stages", group: "Projects", risk: "normal" },
  { key: "projects.delete", label: "Delete projects", group: "Danger Zone", risk: "danger" },
  { key: "documents.view", label: "View documents", group: "Documents", risk: "normal" },
  { key: "documents.upload", label: "Upload documents", group: "Documents", risk: "normal" },
  { key: "documents.verify", label: "Verify/reject documents", group: "Documents", risk: "normal" },
  { key: "documents.delete", label: "Delete documents", group: "Danger Zone", risk: "danger" },
  { key: "field.check_in", label: "Field check-in", group: "Field Operations", risk: "normal" },
  { key: "qa.view", label: "View QA", group: "QA", risk: "normal" },
  { key: "qa.edit", label: "Submit QA decisions", group: "QA", risk: "normal" },
  { key: "billing.view", label: "View billing", group: "Billing", risk: "normal" },
  { key: "billing.edit", label: "Edit billing", group: "Billing", risk: "normal" },
  { key: "billing.approve", label: "Approve billing", group: "Billing", risk: "normal" },
  { key: "approvals.view", label: "View approvals", group: "Approvals", risk: "normal" },
  { key: "approvals.decide", label: "Approve/reject overrides", group: "Approvals", risk: "normal" },
  { key: "exceptions.view", label: "View exceptions", group: "Exceptions", risk: "normal" },
  { key: "exceptions.edit", label: "Update exceptions", group: "Exceptions", risk: "normal" },
  { key: "resources.view", label: "View resource teams", group: "Resources", risk: "normal" },
  { key: "resources.edit", label: "Manage resource teams", group: "Resources", risk: "normal" },
  { key: "schedule.view", label: "View schedule", group: "Scheduling", risk: "normal" },
  { key: "schedule.edit", label: "Schedule/reschedule work", group: "Scheduling", risk: "normal" },
  { key: "workflow.view", label: "View workflow", group: "Workflow", risk: "normal" },
  { key: "workflow.edit", label: "Edit workflow", group: "Workflow", risk: "normal" },
  { key: "workflow.publish", label: "Publish workflow", group: "Workflow", risk: "normal" },
  { key: "notifications.view", label: "View notifications", group: "Notifications", risk: "normal" },
  { key: "notifications.edit", label: "Update notifications", group: "Notifications", risk: "normal" },
  { key: "admin.view", label: "Admin console", group: "Administration", risk: "normal" },
  { key: "users.view", label: "View users", group: "Administration", risk: "normal" },
  { key: "users.create", label: "Create users", group: "Administration", risk: "normal" },
  { key: "users.edit", label: "Edit users", group: "Administration", risk: "normal" },
  { key: "users.delete", label: "Delete users", group: "Danger Zone", risk: "danger" },
  { key: "roles.view", label: "View roles", group: "Administration", risk: "normal" },
  { key: "roles.create", label: "Create roles", group: "Administration", risk: "normal" },
  { key: "roles.edit", label: "Edit roles", group: "Administration", risk: "normal" },
  { key: "permissions.edit", label: "Edit permissions", group: "Administration", risk: "normal" },
  { key: "audit_logs.view", label: "View audit logs", group: "Administration", risk: "normal" },
  { key: "danger_zone.view", label: "View danger zone", group: "Danger Zone", risk: "danger" },
  { key: "danger_zone.delete_project", label: "Delete project with Drive cleanup", group: "Danger Zone", risk: "danger" },
  { key: "danger_zone.cleanup_test_data", label: "Cleanup test data", group: "Danger Zone", risk: "danger" },
  { key: "danger_zone.repair_metadata", label: "Repair metadata", group: "Danger Zone", risk: "danger" },
];

const routeRules: Array<{ method: string | "*"; pattern: RegExp; permission: string }> = [
  { method: "GET", pattern: /^\/api\/projects$/, permission: "projects.view" },
  { method: "POST", pattern: /^\/api\/projects$/, permission: "projects.create" },
  { method: "DELETE", pattern: /^\/api\/projects\/[^/]+$/, permission: "projects.delete" },
  { method: "*", pattern: /^\/api\/projects\/[^/]+\/transition$/, permission: "projects.transition" },
  { method: "*", pattern: /^\/api\/projects\/[^/]+\/runtime$/, permission: "projects.edit" },
  { method: "*", pattern: /^\/api\/projects\/[^/]+\/customer-intake$/, permission: "projects.edit" },
  { method: "*", pattern: /^\/api\/projects\/[^/]+\/finance-path$/, permission: "projects.edit" },
  { method: "*", pattern: /^\/api\/projects\/[^/]+\/loan-fallback$/, permission: "projects.edit" },
  { method: "*", pattern: /^\/api\/projects\/[^/]+\/sla$/, permission: "projects.edit" },
  { method: "*", pattern: /^\/api\/projects\/[^/]+\/schedule$/, permission: "schedule.edit" },
  { method: "*", pattern: /^\/api\/projects\/[^/]+\/qa$/, permission: "qa.edit" },
  { method: "*", pattern: /^\/api\/projects\/[^/]+\/billing$/, permission: "billing.edit" },
  { method: "*", pattern: /^\/api\/projects\/[^/]+\/approvals$/, permission: "approvals.view" },
  { method: "*", pattern: /^\/api\/project-checklists\//, permission: "projects.edit" },
  { method: "*", pattern: /^\/api\/project-stages\/[^/]+\/check-in$/, permission: "field.check_in" },
  { method: "*", pattern: /^\/api\/documents\/[^/]+\/version$/, permission: "documents.upload" },
  { method: "*", pattern: /^\/api\/documents\/[^/]+\/verify$/, permission: "documents.verify" },
  { method: "*", pattern: /^\/api\/documents\/[^/]+\/reject$/, permission: "documents.verify" },
  { method: "POST", pattern: /^\/api\/drive\/upload$/, permission: "documents.upload" },
  { method: "*", pattern: /^\/api\/drive\/setup-folders$/, permission: "projects.edit" },
  { method: "GET", pattern: /^\/api\/drive\/image$/, permission: "documents.view" },
  { method: "GET", pattern: /^\/api\/resource-teams$/, permission: "resources.view" },
  { method: "*", pattern: /^\/api\/resource-teams(\/[^/]+)?$/, permission: "resources.edit" },
  { method: "*", pattern: /^\/api\/exceptions\//, permission: "exceptions.edit" },
  { method: "*", pattern: /^\/api\/approvals\//, permission: "approvals.decide" },
  { method: "GET", pattern: /^\/api\/notifications$/, permission: "notifications.view" },
  { method: "*", pattern: /^\/api\/notifications\//, permission: "notifications.edit" },
  { method: "*", pattern: /^\/api\/workflows\/versions\/[^/]+\/publish$/, permission: "workflow.publish" },
  { method: "*", pattern: /^\/api\/workflows\//, permission: "workflow.edit" },
  { method: "GET", pattern: /^\/api\/audit-logs$/, permission: "audit_logs.view" },
  { method: "GET", pattern: /^\/api\/admin\/users$/, permission: "users.view" },
  { method: "POST", pattern: /^\/api\/admin\/users$/, permission: "users.create" },
  { method: "PATCH", pattern: /^\/api\/admin\/users\/[^/]+$/, permission: "users.edit" },
  { method: "DELETE", pattern: /^\/api\/admin\/users\/[^/]+$/, permission: "users.delete" },
  { method: "GET", pattern: /^\/api\/admin\/roles$/, permission: "roles.view" },
  { method: "POST", pattern: /^\/api\/admin\/roles$/, permission: "roles.create" },
  { method: "PATCH", pattern: /^\/api\/admin\/roles\/[^/]+$/, permission: "roles.edit" },
  { method: "GET", pattern: /^\/api\/admin\/role-permissions$/, permission: "roles.view" },
  { method: "PATCH", pattern: /^\/api\/admin\/role-permissions$/, permission: "permissions.edit" },
  { method: "*", pattern: /^\/api\/profiles$/, permission: "users.edit" },
];

export function routePermissionForRequest(request: Request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const rule = routeRules.find((item) => (item.method === "*" || item.method === method) && item.pattern.test(url.pathname));
  return rule?.permission || null;
}

export function isDangerPermission(permissionKey: string) {
  return PERMISSION_DEFINITIONS.some((item) => item.key === permissionKey && item.risk === "danger")
    || permissionKey.startsWith("danger_zone.")
    || permissionKey === "projects.delete"
    || permissionKey === "documents.delete"
    || permissionKey === "users.delete";
}
