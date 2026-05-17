-- Unified RES-S Standard Workflow V1
-- Keeps legacy CASH/LOAN workflows for existing projects, while new projects
-- can use one workflow version with a switchable finance path.

alter table projects
  add column if not exists finance_state text not null default 'CASH_PENDING_PAYMENT';

alter table projects
  add column if not exists payment_path_history jsonb not null default '[]'::jsonb;

create unique index if not exists workflow_transitions_unique_path_idx
  on workflow_transitions(workflow_version_id, from_stage_id, to_stage_id, type);

do $$
begin
  alter table projects
    drop constraint if exists projects_finance_state_check;

  alter table projects
    add constraint projects_finance_state_check
    check (finance_state in (
      'CASH_PENDING_PAYMENT',
      'CASH_PAID',
      'LOAN_DOC_COLLECTION',
      'LOAN_SUBMITTED',
      'LOAN_APPROVED',
      'LOAN_REJECTED_CASH_OFFERED',
      'CUSTOMER_ACCEPTED_CASH',
      'CUSTOMER_DECLINED_CASH',
      'CANCELLED'
    ));
end $$;

insert into workflow_templates (
  code,
  name,
  project_type,
  payment_type,
  description,
  is_active
)
values (
  'RES-S-STANDARD',
  'RES-S Standard',
  'RES-S',
  'CASH',
  'Residential standard workflow with switchable CASH / LOAN finance path.',
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

update workflow_templates
set is_active = false, updated_at = now()
where code in ('RES-S-CASH', 'RES-S-LOAN');

do $$
declare
  template_id uuid;
  version_id uuid;
  stage_rec record;
  transition_rec record;
  checklist_rec record;
  document_rec record;
  v_from_stage_id uuid;
  v_to_stage_id uuid;
  stage_id uuid;
begin
  select id into template_id from workflow_templates where code = 'RES-S-STANDARD';

  insert into workflow_versions (
    workflow_template_id,
    version_number,
    name,
    status,
    is_active,
    published_at
  )
  values (
    template_id,
    1,
    'RES-S Standard v1',
    'PUBLISHED',
    true,
    now()
  )
  on conflict (workflow_template_id, version_number) do update
  set
    name = excluded.name,
    status = excluded.status,
    is_active = true,
    published_at = coalesce(workflow_versions.published_at, excluded.published_at),
    updated_at = now()
  returning id into version_id;

  for stage_rec in
    select * from (values
      ('LEAD', 'Lead', 1, 'sales', 24, true, false),
      ('SURVEY', 'Survey', 2, 'ops', 72, false, false),
      ('TSSR', 'TSSR', 3, 'engineer', 48, false, false),
      ('QUOTATION', 'Quotation', 4, 'sales', 48, false, false),
      ('PAYMENT', 'Cash Payment', 5, 'finance', 72, false, false),
      ('LOAN_DOCUMENT_COLLECTION', 'Loan Document Collection', 6, 'sales', 72, false, false),
      ('LOAN_SUBMISSION', 'Loan Submission', 7, 'finance', 48, false, false),
      ('LOAN_REVIEW', 'Loan Review', 8, 'finance', 120, false, false),
      ('LOAN_APPROVAL', 'Loan Approval', 9, 'finance', 48, false, false),
      ('DOWN_PAYMENT', 'Down Payment', 10, 'finance', 72, false, false),
      ('READY_FOR_INSTALL', 'Ready for Install', 11, 'ops', 24, false, false),
      ('SCHEDULING', 'Scheduling', 12, 'ops', 48, false, false),
      ('INSTALLATION', 'Installation', 13, 'contractor', 72, false, false),
      ('QA', 'QA', 14, 'qa', 48, false, false),
      ('HANDOVER', 'Handover', 15, 'ops', 48, false, false),
      ('BILLING', 'Billing', 16, 'finance', 72, false, false),
      ('CLOSURE', 'Closure', 17, 'ops', 24, false, true)
    ) as s(code, name, order_index, owner_role, sla_hours, is_start, is_terminal)
  loop
    insert into workflow_stages (
      workflow_version_id,
      code,
      name,
      order_index,
      owner_role,
      sla_hours,
      is_start,
      is_terminal,
      is_active
    )
    values (
      version_id,
      stage_rec.code,
      stage_rec.name,
      stage_rec.order_index,
      stage_rec.owner_role::user_role,
      stage_rec.sla_hours,
      stage_rec.is_start,
      stage_rec.is_terminal,
      true
    )
    on conflict (workflow_version_id, code) do update
    set
      name = excluded.name,
      order_index = excluded.order_index,
      owner_role = excluded.owner_role,
      sla_hours = excluded.sla_hours,
      is_start = excluded.is_start,
      is_terminal = excluded.is_terminal,
      is_active = true,
      updated_at = now();
  end loop;

  for transition_rec in
    select * from (values
      ('LEAD', 'SURVEY', 'Lead to Survey', 'HARD', '{}'::jsonb),
      ('SURVEY', 'TSSR', 'Survey to TSSR', 'HARD', '{"requires_documents": ["SURVEY_PHOTOS"]}'::jsonb),
      ('TSSR', 'QUOTATION', 'TSSR to Quotation', 'HARD', '{"requires_documents": ["SLD", "BOQ"]}'::jsonb),
      ('QUOTATION', 'PAYMENT', 'Quotation to Cash Payment', 'HARD', '{"when_payment_type": "CASH", "requires_documents": ["SIGNED_CONTRACT"]}'::jsonb),
      ('QUOTATION', 'LOAN_DOCUMENT_COLLECTION', 'Quotation to Loan Documents', 'HARD', '{"when_payment_type": "LOAN", "requires_documents": ["SIGNED_CONTRACT"]}'::jsonb),
      ('PAYMENT', 'READY_FOR_INSTALL', 'Cash Payment to Ready for Install', 'OVERRIDEABLE', '{"requires_documents": ["PAYMENT_PROOF"], "override_type": "INSTALL_BEFORE_FULL_PAYMENT"}'::jsonb),
      ('LOAN_DOCUMENT_COLLECTION', 'LOAN_SUBMISSION', 'Loan Documents to Loan Submission', 'HARD', '{"requires_documents": ["LOAN_DOCUMENTS"]}'::jsonb),
      ('LOAN_SUBMISSION', 'LOAN_REVIEW', 'Loan Submission to Loan Review', 'HARD', '{"requires_documents": ["LOAN_SUBMISSION_PROOF"]}'::jsonb),
      ('LOAN_REVIEW', 'LOAN_APPROVAL', 'Loan Review to Loan Approval', 'HARD', '{"requires_checklist": ["LOAN_REVIEW_COMPLETE"]}'::jsonb),
      ('LOAN_APPROVAL', 'DOWN_PAYMENT', 'Loan Approval to Down Payment', 'HARD', '{"requires_documents": ["LOAN_APPROVAL"]}'::jsonb),
      ('DOWN_PAYMENT', 'READY_FOR_INSTALL', 'Down Payment to Ready for Install', 'OVERRIDEABLE', '{"requires_documents": ["DOWN_PAYMENT_PROOF"], "override_type": "INSTALL_BEFORE_LOAN_PAYMENT_COMPLETE"}'::jsonb),
      ('READY_FOR_INSTALL', 'SCHEDULING', 'Ready for Install to Scheduling', 'HARD', '{}'::jsonb),
      ('SCHEDULING', 'INSTALLATION', 'Scheduling to Installation', 'HARD', '{}'::jsonb),
      ('INSTALLATION', 'QA', 'Installation to QA', 'HARD', '{"requires_documents": ["INSTALLATION_PHOTOS", "INVERTER_PHOTO", "SERIAL_NUMBER_PHOTO", "GROUNDING_PHOTO"]}'::jsonb),
      ('QA', 'HANDOVER', 'QA to Handover', 'HARD', '{"requires_checklist": ["QA_MECHANICAL", "QA_ELECTRICAL", "QA_MONITORING", "QA_DOCUMENTATION"]}'::jsonb),
      ('HANDOVER', 'BILLING', 'Handover to Billing', 'HARD', '{"requires_documents": ["CUSTOMER_ACCEPTANCE"]}'::jsonb),
      ('BILLING', 'CLOSURE', 'Billing to Closure', 'HARD', '{"requires_documents": ["INVOICE", "PAC", "FBOQ"]}'::jsonb),
      ('QA', 'INSTALLATION', 'QA Rework to Installation', 'HARD', '{"reason_required": true}'::jsonb),
      ('BILLING', 'HANDOVER', 'Billing Rework to Handover', 'HARD', '{"reason_required": true}'::jsonb)
    ) as t(from_code, to_code, name, gate_severity, rule_config)
  loop
    select id into v_from_stage_id from workflow_stages where workflow_version_id = version_id and code = transition_rec.from_code;
    select id into v_to_stage_id from workflow_stages where workflow_version_id = version_id and code = transition_rec.to_code;

    insert into workflow_transitions (
      workflow_version_id,
      from_stage_id,
      to_stage_id,
      type,
      name,
      requires_approval,
      gate_severity,
      rule_config,
      is_active
    )
    values (
      version_id,
      v_from_stage_id,
      v_to_stage_id,
      case when transition_rec.name ilike '%Rework%' then 'REWORK'::transition_type else 'FORWARD'::transition_type end,
      transition_rec.name,
      false,
      transition_rec.gate_severity::gate_severity,
      transition_rec.rule_config,
      true
    )
    on conflict (workflow_version_id, from_stage_id, to_stage_id, type) do update
    set
      name = excluded.name,
      requires_approval = excluded.requires_approval,
      gate_severity = excluded.gate_severity,
      rule_config = excluded.rule_config,
      is_active = true,
      updated_at = now();
  end loop;

  for checklist_rec in
    select * from (values
      ('LEAD', 'CUSTOMER_REGISTERED', 'Customer registration is complete', 1, 'HARD'),
      ('SURVEY', 'ROOF_INSPECTED', 'Roof inspection complete', 1, 'HARD'),
      ('SURVEY', 'MDB_INSPECTED', 'MDB inspection complete', 2, 'HARD'),
      ('SURVEY', 'GROUNDING_INSPECTED', 'Grounding inspection complete', 3, 'HARD'),
      ('TSSR', 'ENGINEERING_APPROVED', 'Engineering design approved', 1, 'HARD'),
      ('QUOTATION', 'CUSTOMER_CONFIRMED', 'Customer confirmed quotation', 1, 'HARD'),
      ('PAYMENT', 'PAYMENT_CONFIRMED', 'Payment has been confirmed', 1, 'OVERRIDEABLE'),
      ('LOAN_DOCUMENT_COLLECTION', 'LOAN_DOCUMENTS_COMPLETE', 'Loan documents are complete', 1, 'HARD'),
      ('LOAN_SUBMISSION', 'LOAN_SUBMITTED', 'Loan package has been submitted', 1, 'HARD'),
      ('LOAN_REVIEW', 'LOAN_REVIEW_COMPLETE', 'Loan review status has been updated', 1, 'HARD'),
      ('LOAN_APPROVAL', 'LOAN_APPROVED', 'Loan approval is confirmed', 1, 'HARD'),
      ('DOWN_PAYMENT', 'DOWN_PAYMENT_CONFIRMED', 'Down payment has been confirmed', 1, 'OVERRIDEABLE'),
      ('READY_FOR_INSTALL', 'MATERIAL_READY', 'Material ready', 1, 'HARD'),
      ('READY_FOR_INSTALL', 'TEAM_READY', 'Team ready', 2, 'HARD'),
      ('SCHEDULING', 'SCHEDULE_CONFIRMED', 'Installation schedule confirmed', 1, 'HARD'),
      ('INSTALLATION', 'INSTALLATION_COMPLETE', 'Installation completed', 1, 'HARD'),
      ('QA', 'QA_MECHANICAL', 'Mechanical QA passed', 1, 'HARD'),
      ('QA', 'QA_ELECTRICAL', 'Electrical QA passed', 2, 'HARD'),
      ('QA', 'QA_MONITORING', 'Monitoring QA passed', 3, 'HARD'),
      ('QA', 'QA_DOCUMENTATION', 'Documentation QA passed', 4, 'HARD'),
      ('HANDOVER', 'CUSTOMER_HANDOVER_DONE', 'Customer handover completed', 1, 'HARD'),
      ('BILLING', 'BILLING_REVIEW_COMPLETE', 'Billing review complete', 1, 'HARD'),
      ('CLOSURE', 'PROJECT_CLOSED', 'Project closure confirmed', 1, 'INFO')
    ) as c(stage_code, code, label, order_index, gate_severity)
  loop
    select id into stage_id from workflow_stages where workflow_version_id = version_id and code = checklist_rec.stage_code;

    insert into workflow_checklists (
      workflow_stage_id,
      code,
      label,
      is_required,
      gate_severity,
      order_index
    )
    values (
      stage_id,
      checklist_rec.code,
      checklist_rec.label,
      true,
      checklist_rec.gate_severity::gate_severity,
      checklist_rec.order_index
    )
    on conflict (workflow_stage_id, code) do update
    set
      label = excluded.label,
      is_required = excluded.is_required,
      gate_severity = excluded.gate_severity,
      order_index = excluded.order_index,
      updated_at = now();
  end loop;

  for document_rec in
    select * from (values
      ('SURVEY', 'SURVEY_PHOTOS', 'Survey Photos', '02_Survey_TSSR', 1, true, 'HARD'),
      ('TSSR', 'SLD', 'Single Line Diagram', '02_Survey_TSSR', 1, true, 'HARD'),
      ('TSSR', 'BOQ', 'Bill of Quantity', '02_Survey_TSSR', 2, true, 'HARD'),
      ('QUOTATION', 'SIGNED_CONTRACT', 'Signed Contract', '01_Sales_Commercial', 1, true, 'HARD'),
      ('PAYMENT', 'PAYMENT_PROOF', 'Payment Proof', '01_Sales_Commercial', 1, true, 'OVERRIDEABLE'),
      ('LOAN_DOCUMENT_COLLECTION', 'LOAN_DOCUMENTS', 'Loan Documents', '03_Loan_Documents', 1, true, 'HARD'),
      ('LOAN_SUBMISSION', 'LOAN_SUBMISSION_PROOF', 'Loan Submission Proof', '03_Loan_Documents', 1, true, 'HARD'),
      ('LOAN_APPROVAL', 'LOAN_APPROVAL', 'Loan Approval', '03_Loan_Documents', 1, true, 'HARD'),
      ('DOWN_PAYMENT', 'DOWN_PAYMENT_PROOF', 'Down Payment Proof', '01_Sales_Commercial', 1, true, 'OVERRIDEABLE'),
      ('INSTALLATION', 'INSTALLATION_PHOTOS', 'Installation Photos', '04_Installation_Photos', 1, true, 'HARD'),
      ('INSTALLATION', 'INVERTER_PHOTO', 'Inverter Photo', '04_Installation_Photos', 2, true, 'HARD'),
      ('INSTALLATION', 'SERIAL_NUMBER_PHOTO', 'Serial Number Photo', '04_Installation_Photos', 3, true, 'HARD'),
      ('INSTALLATION', 'GROUNDING_PHOTO', 'Grounding Photo', '04_Installation_Photos', 4, true, 'HARD'),
      ('HANDOVER', 'CUSTOMER_ACCEPTANCE', 'Customer Acceptance', '05_Site_Folder_Handover', 1, true, 'HARD'),
      ('BILLING', 'INVOICE', 'Invoice', '06_Billing_Finance', 1, true, 'HARD'),
      ('BILLING', 'PAC', 'PAC', '06_Billing_Finance', 2, true, 'HARD'),
      ('BILLING', 'FBOQ', 'FBOQ', '06_Billing_Finance', 3, true, 'HARD')
    ) as d(stage_code, code, name, drive_folder_key, order_index, requires_verification, gate_severity)
  loop
    select id into stage_id from workflow_stages where workflow_version_id = version_id and code = document_rec.stage_code;

    insert into workflow_required_documents (
      workflow_stage_id,
      code,
      name,
      drive_folder_key,
      is_required,
      requires_verification,
      gate_severity,
      order_index
    )
    values (
      stage_id,
      document_rec.code,
      document_rec.name,
      document_rec.drive_folder_key,
      true,
      document_rec.requires_verification,
      document_rec.gate_severity::gate_severity,
      document_rec.order_index
    )
    on conflict (workflow_stage_id, code) do update
    set
      name = excluded.name,
      drive_folder_key = excluded.drive_folder_key,
      is_required = excluded.is_required,
      requires_verification = excluded.requires_verification,
      gate_severity = excluded.gate_severity,
      order_index = excluded.order_index,
      updated_at = now();
  end loop;
end $$;
