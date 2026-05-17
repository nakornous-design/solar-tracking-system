import test from "node:test";
import assert from "node:assert/strict";

import { CreateProjectEngine } from "../services/workflow/createProjectEngine.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

test("CreateProjectEngine creates locked runtime workflow, gates, documents, audit log, and notification", async () => {
  const db = {
    projects: [],
    workflow_versions: [
      {
        id: "version-1",
        workflow_template_id: "template-1",
        status: "PUBLISHED",
        is_active: true,
        workflow_templates: { project_type: "RES-S", payment_type: "CASH" },
      },
    ],
    installation_standards: [{ id: "standard-v8r2", code: "V8R2", status: "PUBLISHED", is_active: true }],
    workflow_stages: [
      { id: "wf-lead", workflow_version_id: "version-1", code: "lead", name: "Lead", order_index: 1, owner_role: "sales", sla_hours: 24, is_start: true, is_active: true },
      { id: "wf-survey", workflow_version_id: "version-1", code: "survey", name: "Survey", order_index: 2, owner_role: "ops", sla_hours: 72, is_start: false, is_active: true },
    ],
    workflow_checklists: [
      { id: "wf-check-lead", workflow_stage_id: "wf-lead", code: "CUSTOMER_CONFIRMED", label: "Customer confirmed", is_required: true, gate_severity: "HARD" },
      { id: "wf-check-survey", workflow_stage_id: "wf-survey", code: "ROOF_CHECKED", label: "Roof checked", is_required: true, gate_severity: "HARD" },
    ],
    workflow_required_documents: [
      { id: "wf-doc-survey", workflow_stage_id: "wf-survey", code: "SURVEY_PHOTO", name: "Survey Photo", is_required: true, requires_verification: true, gate_severity: "HARD", drive_folder_key: "02_Survey_TSSR" },
    ],
    project_stages: [],
    project_checklists: [],
    project_documents: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
  const folderCalls = [];
  const engine = new CreateProjectEngine(fakeSupabase(db), async (_supabase, customerCode, projectId) => {
    folderCalls.push({ customerCode, projectId });
  });

  const project = await engine.execute({
    customerCode: "C-100",
    customerName: "Ready Customer",
    customerPhone: "0999999999",
    projectType: "RES-S",
    paymentType: "CASH",
  });

  assert.equal(db.projects.length, 1);
  assert.equal(project.id, db.projects[0].id);
  assert.equal(project.current_stage_id, db.projects[0].current_stage_id);
  assert.equal(db.projects[0].workflow_version_id, "version-1");
  assert.equal(db.projects[0].applied_standard_id, "standard-v8r2");
  assert.equal(db.projects[0].project_type, "RES-S");
  assert.equal(db.projects[0].payment_type, "CASH");

  assert.equal(db.project_stages.length, 2);
  assert.equal(db.project_stages[0].status, "IN_PROGRESS");
  assert.equal(db.project_stages[1].status, "PENDING");
  assert.ok(db.project_stages[0].started_at);
  assert.ok(db.project_stages[0].due_at);

  assert.equal(db.project_checklists.length, 2);
  assert.deepEqual(db.project_checklists.map((item) => item.status), ["PENDING", "PENDING"]);

  assert.equal(db.project_documents.length, 1);
  assert.equal(db.project_documents[0].status, "REQUIRED");
  assert.deepEqual(db.project_documents[0].metadata, { drive_folder_key: "02_Survey_TSSR" });

  assert.deepEqual(folderCalls, [{ customerCode: "C-100", projectId: db.projects[0].id }]);
  assert.equal(db.activity_logs[0].action, "PROJECT_CREATED");
  assert.equal(db.notifications[0].title, "New project started: C-100");
  assert.equal(db.notifications[0].recipient_role, "sales");
  assert.equal(db.notification_deliveries[0].notification_id, db.notifications[0].id);
});

test("CreateProjectEngine rejects duplicate customer code before creating runtime rows", async () => {
  const db = {
    projects: [{ id: "existing-project", customer_code: "C-100", status: "IN_PROGRESS" }],
    project_stages: [],
  };
  const engine = new CreateProjectEngine(fakeSupabase(db), async () => {});

  await assert.rejects(
    () => engine.execute({ customerCode: "C-100", customerName: "Duplicate Customer" }),
    /Project with customer code C-100 already exists\./,
  );

  assert.equal(db.projects.length, 1);
  assert.equal(db.project_stages.length, 0);
});

test("CreateProjectEngine normalizes customer code to uppercase before duplicate checks", async () => {
  const db = {
    projects: [{ id: "existing-project", customer_code: "C-100", status: "IN_PROGRESS" }],
    project_stages: [],
  };
  const engine = new CreateProjectEngine(fakeSupabase(db), async () => {});

  await assert.rejects(
    () => engine.execute({ customerCode: "c-100", customerName: "Duplicate Customer" }),
    /Project with customer code C-100 already exists\./,
  );

  assert.equal(db.projects.length, 1);
  assert.equal(db.project_stages.length, 0);
});

test("CreateProjectEngine stores new customer codes in uppercase", async () => {
  const db = {
    projects: [],
    workflow_versions: [
      {
        id: "version-1",
        workflow_template_id: "template-1",
        status: "PUBLISHED",
        is_active: true,
        workflow_templates: { project_type: "RES-S", payment_type: "CASH" },
      },
    ],
    installation_standards: [{ id: "standard-v8r2", code: "V8R2", status: "PUBLISHED", is_active: true }],
    workflow_stages: [
      { id: "wf-lead", workflow_version_id: "version-1", code: "LEAD", name: "Lead", order_index: 1, owner_role: "sales", sla_hours: 24, is_start: true, is_active: true },
    ],
    workflow_checklists: [],
    workflow_required_documents: [],
    project_stages: [],
    project_checklists: [],
    project_documents: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
  const folderCalls = [];
  const engine = new CreateProjectEngine(fakeSupabase(db), async (_supabase, customerCode) => {
    folderCalls.push(customerCode);
  });

  await engine.execute({ customerCode: "cust-2026-001", customerName: "Uppercase Customer" });

  assert.equal(db.projects[0].customer_code, "CUST-2026-001");
  assert.deepEqual(folderCalls, ["CUST-2026-001"]);
});

test("CreateProjectEngine skips inactive loan branch stages for CASH projects", async () => {
  const db = {
    projects: [],
    workflow_versions: [
      {
        id: "version-standard",
        workflow_template_id: "template-standard",
        status: "PUBLISHED",
        is_active: true,
        workflow_templates: { code: "RES-S-STANDARD", project_type: "RES-S", payment_type: "CASH" },
      },
    ],
    installation_standards: [{ id: "standard-v8r2", code: "V8R2", status: "PUBLISHED", is_active: true }],
    workflow_stages: [
      { id: "wf-lead", workflow_version_id: "version-standard", code: "LEAD", name: "Lead", order_index: 1, owner_role: "sales", sla_hours: 24, is_start: true, is_active: true },
      { id: "wf-payment", workflow_version_id: "version-standard", code: "PAYMENT", name: "Cash Payment", order_index: 5, owner_role: "finance", sla_hours: 72, is_start: false, is_active: true },
      { id: "wf-loan-docs", workflow_version_id: "version-standard", code: "LOAN_DOCUMENT_COLLECTION", name: "Loan Document Collection", order_index: 6, owner_role: "sales", sla_hours: 72, is_start: false, is_active: true },
      { id: "wf-loan-submit", workflow_version_id: "version-standard", code: "LOAN_SUBMISSION", name: "Loan Submission", order_index: 7, owner_role: "finance", sla_hours: 48, is_start: false, is_active: true },
      { id: "wf-ready", workflow_version_id: "version-standard", code: "READY_FOR_INSTALL", name: "Ready for Install", order_index: 11, owner_role: "ops", sla_hours: 24, is_start: false, is_active: true },
    ],
    workflow_checklists: [],
    workflow_required_documents: [],
    project_stages: [],
    project_checklists: [],
    project_documents: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
  const engine = new CreateProjectEngine(fakeSupabase(db), async () => {});

  await engine.execute({
    customerCode: "CASH-UNIFIED-001",
    customerName: "Cash Customer",
    projectType: "RES-S",
    paymentType: "CASH",
  });

  const paymentStage = db.project_stages.find((stage) => stage.code === "PAYMENT");
  const loanStages = db.project_stages.filter((stage) => stage.code.startsWith("LOAN_"));

  assert.equal(paymentStage.status, "PENDING");
  assert.deepEqual(loanStages.map((stage) => stage.status), ["SKIPPED", "SKIPPED"]);
  assert.deepEqual(
    loanStages.map((stage) => stage.metadata.skipped_source),
    ["INITIAL_FINANCE_PATH", "INITIAL_FINANCE_PATH"],
  );
});

test("CreateProjectEngine stores customer intake and pre-fills Lead checklist notes", async () => {
  const db = {
    projects: [],
    workflow_versions: [
      {
        id: "version-standard",
        workflow_template_id: "template-standard",
        status: "PUBLISHED",
        is_active: true,
        workflow_templates: { code: "RES-S-STANDARD", project_type: "RES-S", payment_type: "CASH" },
      },
    ],
    installation_standards: [{ id: "standard-v8r2", code: "V8R2", status: "PUBLISHED", is_active: true }],
    workflow_stages: [
      { id: "wf-lead", workflow_version_id: "version-standard", code: "LEAD", name: "Lead", order_index: 1, owner_role: "sales", sla_hours: 24, is_start: true, is_active: true },
    ],
    workflow_checklists: [
      { id: "wf-profile", workflow_stage_id: "wf-lead", code: "CUSTOMER_PROFILE_CAPTURED", label: "Customer profile captured", is_required: true, gate_severity: "HARD" },
      { id: "wf-contact", workflow_stage_id: "wf-lead", code: "CONTACT_VERIFIED", label: "Contact verified", is_required: true, gate_severity: "HARD" },
      { id: "wf-site", workflow_stage_id: "wf-lead", code: "SITE_ADDRESS_CAPTURED", label: "Site address captured", is_required: true, gate_severity: "HARD" },
      { id: "wf-requirement", workflow_stage_id: "wf-lead", code: "INITIAL_REQUIREMENT_CAPTURED", label: "Requirement captured", is_required: true, gate_severity: "HARD" },
      { id: "wf-duplicate", workflow_stage_id: "wf-lead", code: "DUPLICATE_CHECKED", label: "Duplicate checked", is_required: true, gate_severity: "HARD" },
    ],
    workflow_required_documents: [],
    project_stages: [],
    project_checklists: [],
    project_documents: [],
    activity_logs: [],
    notifications: [],
    notification_deliveries: [],
  };
  const engine = new CreateProjectEngine(fakeSupabase(db), async () => {});

  await engine.execute({
    customerCode: "INTAKE-001",
    customerName: "Intake Customer",
    customerPhone: "0811111111",
    projectType: "RES-S",
    paymentType: "CASH",
    customerIntake: {
      contactName: "Khun Intake",
      contactVerified: true,
      siteAddress: "99 Solar Road",
      postalCode: "20110",
      siteSubdistrict: "Nong Prue",
      siteDistrict: "Bang Lamung",
      siteProvince: "Chonburi",
      googleMapsUrl: "https://maps.example/test",
      interestedSystemSizeKw: "10 kW",
      monthlyElectricBill: "15000",
      initialRequirement: "Reduce daytime electricity bill.",
    },
  });

  assert.equal(db.projects[0].customer_intake.contactName, "Khun Intake");
  assert.equal(db.projects[0].customer_intake.siteProvince, "Chonburi");

  const profileChecklist = db.project_checklists.find((item) => item.code === "CUSTOMER_PROFILE_CAPTURED");
  const siteChecklist = db.project_checklists.find((item) => item.code === "SITE_ADDRESS_CAPTURED");
  const requirementChecklist = db.project_checklists.find((item) => item.code === "INITIAL_REQUIREMENT_CAPTURED");

  assert.equal(profileChecklist.status, "PASSED");
  assert.match(profileChecklist.notes, /Intake Customer/);
  assert.match(profileChecklist.notes, /0811111111/);
  assert.equal(siteChecklist.status, "PASSED");
  assert.match(siteChecklist.notes, /99 Solar Road/);
  assert.match(siteChecklist.notes, /20110/);
  assert.match(siteChecklist.notes, /Bang Lamung/);
  assert.equal(requirementChecklist.status, "PASSED");
  assert.match(requirementChecklist.notes, /10 kW/);
});
