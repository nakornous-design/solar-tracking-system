-- Solar Project Tracking System
-- Seed Workflow Data V1
-- Source of truth: docs/FINAL_ARCHITECTURE_SOURCE_OF_TRUTH.md
--
-- Scope:
-- - Installation standards: V8R2, V9
-- - Published workflows: RES-S CASH v1, RES-S LOAN Basic v1
-- - Workflow stages, transitions, checklists, and required documents

insert into installation_standards (
  code,
  name,
  version,
  status,
  is_active,
  effective_from,
  published_at,
  rules
)
values
  (
    'V8R2',
    'Installation Standard V8R2',
    'V8R2',
    'PUBLISHED',
    true,
    current_date,
    now(),
    '{
      "required_photo_concepts": ["before", "after", "inverter", "serial_number", "grounding"],
      "qa_categories": ["mechanical", "electrical", "monitoring", "documentation"],
      "hard_gate_rules": ["required_installation_photos", "qa_checklist_completion", "billing_document_completion"]
    }'::jsonb
  ),
  (
    'V9',
    'Installation Standard V9',
    'V9',
    'PUBLISHED',
    true,
    current_date,
    now(),
    '{
      "required_photo_concepts": ["before", "after", "inverter", "serial_number", "grounding"],
      "qa_categories": ["mechanical", "electrical", "monitoring", "documentation"],
      "hard_gate_rules": ["required_installation_photos", "qa_checklist_completion", "billing_document_completion"],
      "technical_checklist": ["v9_grounding_validation", "v9_monitoring_validation"]
    }'::jsonb
  )
on conflict (code) do update
set
  name = excluded.name,
  version = excluded.version,
  status = excluded.status,
  is_active = excluded.is_active,
  effective_from = excluded.effective_from,
  published_at = coalesce(installation_standards.published_at, excluded.published_at),
  rules = excluded.rules,
  updated_at = now();

insert into workflow_templates (
  code,
  name,
  project_type,
  payment_type,
  description,
  is_active
)
values
  (
    'RES-S-CASH',
    'RES-S CASH',
    'RES-S',
    'CASH',
    'Residential standard solar installation workflow for cash payment projects.',
    true
  ),
  (
    'RES-S-LOAN',
    'RES-S LOAN Basic',
    'RES-S',
    'LOAN',
    'Residential standard solar installation workflow for basic loan payment projects.',
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  project_type = excluded.project_type,
  payment_type = excluded.payment_type,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

do $$
declare
  cash_template_id uuid;
  cash_version_id uuid;
  loan_template_id uuid;
  loan_version_id uuid;
  stage_rec record;
  transition_rec record;
  checklist_rec record;
  document_rec record;
  v_from_stage_id uuid;
  v_to_stage_id uuid;
  stage_id uuid;
begin
  select id into cash_template_id from workflow_templates where code = 'RES-S-CASH';
  select id into loan_template_id from workflow_templates where code = 'RES-S-LOAN';

  insert into workflow_versions (
    workflow_template_id,
    version_number,
    name,
    status,
    is_active,
    published_at
  )
  values (
    cash_template_id,
    1,
    'RES-S CASH v1',
    'PUBLISHED',
    true,
    now()
  )
  on conflict (workflow_template_id, version_number) do update
  set
    name = excluded.name,
    status = excluded.status,
    is_active = excluded.is_active,
    published_at = coalesce(workflow_versions.published_at, excluded.published_at),
    updated_at = now()
  returning id into cash_version_id;

  insert into workflow_versions (
    workflow_template_id,
    version_number,
    name,
    status,
    is_active,
    published_at
  )
  values (
    loan_template_id,
    1,
    'RES-S LOAN Basic v1',
    'PUBLISHED',
    true,
    now()
  )
  on conflict (workflow_template_id, version_number) do update
  set
    name = excluded.name,
    status = excluded.status,
    is_active = excluded.is_active,
    published_at = coalesce(workflow_versions.published_at, excluded.published_at),
    updated_at = now()
  returning id into loan_version_id;

  for stage_rec in
    select * from (values
      ('LEAD', 'Lead', 1, 'sales', 24, true, false),
      ('SURVEY', 'Survey', 2, 'ops', 72, false, false),
      ('TSSR', 'TSSR', 3, 'engineer', 48, false, false),
      ('QUOTATION', 'Quotation', 4, 'sales', 48, false, false),
      ('PAYMENT', 'Payment', 5, 'finance', 72, false, false),
      ('READY_FOR_INSTALL', 'Ready for Install', 6, 'ops', 24, false, false),
      ('SCHEDULING', 'Scheduling', 7, 'ops', 48, false, false),
      ('INSTALLATION', 'Installation', 8, 'contractor', 72, false, false),
      ('QA', 'QA', 9, 'qa', 48, false, false),
      ('HANDOVER', 'Handover', 10, 'ops', 48, false, false),
      ('BILLING', 'Billing', 11, 'finance', 72, false, false),
      ('CLOSURE', 'Closure', 12, 'ops', 24, false, true)
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
      cash_version_id,
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
      is_active = excluded.is_active,
      updated_at = now();
  end loop;

  for stage_rec in
    select * from (values
      ('LEAD', 'Lead', 1, 'sales', 24, true, false),
      ('SURVEY', 'Survey', 2, 'ops', 72, false, false),
      ('TSSR', 'TSSR', 3, 'engineer', 48, false, false),
      ('QUOTATION', 'Quotation', 4, 'sales', 48, false, false),
      ('LOAN_DOCUMENT_COLLECTION', 'Loan Document Collection', 5, 'sales', 72, false, false),
      ('LOAN_SUBMISSION', 'Loan Submission', 6, 'finance', 48, false, false),
      ('LOAN_REVIEW', 'Loan Review', 7, 'finance', 120, false, false),
      ('LOAN_APPROVAL', 'Loan Approval', 8, 'finance', 48, false, false),
      ('DOWN_PAYMENT', 'Down Payment', 9, 'finance', 72, false, false),
      ('READY_FOR_INSTALL', 'Ready for Install', 10, 'ops', 24, false, false),
      ('SCHEDULING', 'Scheduling', 11, 'ops', 48, false, false),
      ('INSTALLATION', 'Installation', 12, 'contractor', 72, false, false),
      ('QA', 'QA', 13, 'qa', 48, false, false),
      ('HANDOVER', 'Handover', 14, 'ops', 48, false, false),
      ('BILLING', 'Billing', 15, 'finance', 72, false, false),
      ('CLOSURE', 'Closure', 16, 'ops', 24, false, true)
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
      loan_version_id,
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
      is_active = excluded.is_active,
      updated_at = now();
  end loop;

  for transition_rec in
    select cash_version_id as workflow_version_id, * from (values
      ('LEAD', 'SURVEY', 'FORWARD', 'Lead to Survey', false, 'HARD', '{"requires_gate_validation": true}'),
      ('SURVEY', 'TSSR', 'FORWARD', 'Survey to TSSR', false, 'HARD', '{"requires_documents": ["SURVEY_PHOTOS"]}'),
      ('TSSR', 'QUOTATION', 'FORWARD', 'TSSR to Quotation', false, 'HARD', '{"requires_checklist": ["ENGINEERING_REVIEW"]}'),
      ('QUOTATION', 'PAYMENT', 'FORWARD', 'Quotation to Payment', false, 'HARD', '{"requires_documents": ["SIGNED_CONTRACT"]}'),
      ('PAYMENT', 'READY_FOR_INSTALL', 'FORWARD', 'Payment to Ready for Install', false, 'OVERRIDEABLE', '{"requires_documents": ["PAYMENT_PROOF"], "override_type": "INSTALL_BEFORE_FULL_PAYMENT"}'),
      ('READY_FOR_INSTALL', 'SCHEDULING', 'FORWARD', 'Ready for Install to Scheduling', false, 'HARD', '{"requires_checklist": ["READY_FOR_INSTALL_CHECK"]}'),
      ('SCHEDULING', 'INSTALLATION', 'FORWARD', 'Scheduling to Installation', false, 'HARD', '{"requires_checklist": ["SCHEDULE_CONFIRMED"]}'),
      ('INSTALLATION', 'QA', 'FORWARD', 'Installation to QA', false, 'HARD', '{"requires_documents": ["INSTALLATION_PHOTOS"], "requires_checklist": ["INSTALLATION_COMPLETE"]}'),
      ('QA', 'HANDOVER', 'FORWARD', 'QA to Handover', false, 'HARD', '{"requires_checklist": ["QA_PASS"]}'),
      ('HANDOVER', 'BILLING', 'FORWARD', 'Handover to Billing', false, 'HARD', '{"requires_documents": ["CUSTOMER_ACCEPTANCE"]}'),
      ('BILLING', 'CLOSURE', 'FORWARD', 'Billing to Closure', false, 'HARD', '{"requires_documents": ["INVOICE", "PAC", "FBOQ"]}'),
      ('QA', 'INSTALLATION', 'REWORK', 'QA Fail to Installation Rework', false, 'HARD', '{"creates_exception": true, "rework_reason_required": true}'),
      ('BILLING', 'HANDOVER', 'REWORK', 'Billing Reject to Handover Rework', false, 'HARD', '{"creates_exception": true, "rework_reason_required": true}')
    ) as t(from_code, to_code, type, name, requires_approval, gate_severity, rule_config)
    union all
    select loan_version_id as workflow_version_id, * from (values
      ('LEAD', 'SURVEY', 'FORWARD', 'Lead to Survey', false, 'HARD', '{"requires_gate_validation": true}'),
      ('SURVEY', 'TSSR', 'FORWARD', 'Survey to TSSR', false, 'HARD', '{"requires_documents": ["SURVEY_PHOTOS"]}'),
      ('TSSR', 'QUOTATION', 'FORWARD', 'TSSR to Quotation', false, 'HARD', '{"requires_checklist": ["ENGINEERING_REVIEW"]}'),
      ('QUOTATION', 'LOAN_DOCUMENT_COLLECTION', 'FORWARD', 'Quotation to Loan Document Collection', false, 'HARD', '{"requires_documents": ["SIGNED_CONTRACT"]}'),
      ('LOAN_DOCUMENT_COLLECTION', 'LOAN_SUBMISSION', 'FORWARD', 'Loan Document Collection to Loan Submission', false, 'HARD', '{"requires_documents": ["LOAN_DOCUMENTS"]}'),
      ('LOAN_SUBMISSION', 'LOAN_REVIEW', 'FORWARD', 'Loan Submission to Loan Review', false, 'HARD', '{"requires_checklist": ["LOAN_SUBMITTED"]}'),
      ('LOAN_REVIEW', 'LOAN_APPROVAL', 'FORWARD', 'Loan Review to Loan Approval', false, 'HARD', '{"requires_checklist": ["LOAN_REVIEW_COMPLETE"]}'),
      ('LOAN_APPROVAL', 'DOWN_PAYMENT', 'FORWARD', 'Loan Approval to Down Payment', false, 'HARD', '{"requires_documents": ["LOAN_APPROVAL"]}'),
      ('DOWN_PAYMENT', 'READY_FOR_INSTALL', 'FORWARD', 'Down Payment to Ready for Install', false, 'OVERRIDEABLE', '{"requires_documents": ["DOWN_PAYMENT_PROOF"], "override_type": "INSTALL_BEFORE_LOAN_PAYMENT_COMPLETE"}'),
      ('READY_FOR_INSTALL', 'SCHEDULING', 'FORWARD', 'Ready for Install to Scheduling', false, 'HARD', '{"requires_checklist": ["READY_FOR_INSTALL_CHECK"]}'),
      ('SCHEDULING', 'INSTALLATION', 'FORWARD', 'Scheduling to Installation', false, 'HARD', '{"requires_checklist": ["SCHEDULE_CONFIRMED"]}'),
      ('INSTALLATION', 'QA', 'FORWARD', 'Installation to QA', false, 'HARD', '{"requires_documents": ["INSTALLATION_PHOTOS"], "requires_checklist": ["INSTALLATION_COMPLETE"]}'),
      ('QA', 'HANDOVER', 'FORWARD', 'QA to Handover', false, 'HARD', '{"requires_checklist": ["QA_PASS"]}'),
      ('HANDOVER', 'BILLING', 'FORWARD', 'Handover to Billing', false, 'HARD', '{"requires_documents": ["CUSTOMER_ACCEPTANCE"]}'),
      ('BILLING', 'CLOSURE', 'FORWARD', 'Billing to Closure', false, 'HARD', '{"requires_documents": ["INVOICE", "PAC", "FBOQ"]}'),
      ('QA', 'INSTALLATION', 'REWORK', 'QA Fail to Installation Rework', false, 'HARD', '{"creates_exception": true, "rework_reason_required": true}'),
      ('BILLING', 'HANDOVER', 'REWORK', 'Billing Reject to Handover Rework', false, 'HARD', '{"creates_exception": true, "rework_reason_required": true}')
    ) as t(from_code, to_code, type, name, requires_approval, gate_severity, rule_config)
  loop
    select id into v_from_stage_id
    from workflow_stages
    where workflow_version_id = transition_rec.workflow_version_id
      and code = transition_rec.from_code;

    select id into v_to_stage_id
    from workflow_stages
    where workflow_version_id = transition_rec.workflow_version_id
      and code = transition_rec.to_code;

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
    select
      transition_rec.workflow_version_id,
      v_from_stage_id,
      v_to_stage_id,
      transition_rec.type::transition_type,
      transition_rec.name,
      transition_rec.requires_approval,
      transition_rec.gate_severity::gate_severity,
      transition_rec.rule_config::jsonb,
      true
    where not exists (
      select 1
      from workflow_transitions existing
      where existing.workflow_version_id = transition_rec.workflow_version_id
        and existing.from_stage_id = v_from_stage_id
        and existing.to_stage_id = v_to_stage_id
        and existing.type = transition_rec.type::transition_type
    );
  end loop;

  for checklist_rec in
    select cash_version_id as workflow_version_id, * from (values
      ('LEAD', 'CUSTOMER_REGISTERED', 'Customer information is registered', 1, 'HARD'),
      ('SURVEY', 'ROOF_INSPECTED', 'Roof inspection is complete', 1, 'HARD'),
      ('SURVEY', 'MDB_INSPECTED', 'MDB inspection is complete', 2, 'HARD'),
      ('SURVEY', 'GROUNDING_INSPECTED', 'Grounding inspection is complete', 3, 'HARD'),
      ('TSSR', 'ENGINEERING_REVIEW', 'Engineering review is complete', 1, 'HARD'),
      ('QUOTATION', 'CUSTOMER_CONFIRMED', 'Customer confirmed quotation', 1, 'HARD'),
      ('PAYMENT', 'PAYMENT_CONFIRMED', 'Payment has been confirmed', 1, 'OVERRIDEABLE'),
      ('READY_FOR_INSTALL', 'READY_FOR_INSTALL_CHECK', 'Payment, material, team, and schedule readiness checked', 1, 'HARD'),
      ('SCHEDULING', 'SCHEDULE_CONFIRMED', 'Installation schedule is confirmed', 1, 'HARD'),
      ('INSTALLATION', 'INSTALLATION_COMPLETE', 'Installation execution is complete', 1, 'HARD'),
      ('QA', 'QA_MECHANICAL_PASS', 'Mechanical QA passed', 1, 'HARD'),
      ('QA', 'QA_ELECTRICAL_PASS', 'Electrical QA passed', 2, 'HARD'),
      ('QA', 'QA_MONITORING_PASS', 'Monitoring QA passed', 3, 'HARD'),
      ('QA', 'QA_DOCUMENTATION_PASS', 'Documentation QA passed', 4, 'HARD'),
      ('QA', 'QA_PASS', 'Final QA decision is PASS', 5, 'HARD'),
      ('HANDOVER', 'CUSTOMER_HANDOVER_COMPLETE', 'Customer handover is complete', 1, 'HARD'),
      ('BILLING', 'BILLING_REVIEW_COMPLETE', 'Billing review is complete', 1, 'HARD'),
      ('CLOSURE', 'PROJECT_CLOSURE_CONFIRMED', 'Project closure is confirmed', 1, 'HARD')
    ) as c(stage_code, code, label, order_index, gate_severity)
    union all
    select loan_version_id as workflow_version_id, * from (values
      ('LEAD', 'CUSTOMER_REGISTERED', 'Customer information is registered', 1, 'HARD'),
      ('SURVEY', 'ROOF_INSPECTED', 'Roof inspection is complete', 1, 'HARD'),
      ('SURVEY', 'MDB_INSPECTED', 'MDB inspection is complete', 2, 'HARD'),
      ('SURVEY', 'GROUNDING_INSPECTED', 'Grounding inspection is complete', 3, 'HARD'),
      ('TSSR', 'ENGINEERING_REVIEW', 'Engineering review is complete', 1, 'HARD'),
      ('QUOTATION', 'CUSTOMER_CONFIRMED', 'Customer confirmed quotation', 1, 'HARD'),
      ('LOAN_DOCUMENT_COLLECTION', 'LOAN_DOCUMENTS_COMPLETE', 'Loan documents are complete', 1, 'HARD'),
      ('LOAN_SUBMISSION', 'LOAN_SUBMITTED', 'Loan package has been submitted', 1, 'HARD'),
      ('LOAN_REVIEW', 'LOAN_REVIEW_COMPLETE', 'Loan review status has been updated', 1, 'HARD'),
      ('LOAN_APPROVAL', 'LOAN_APPROVED', 'Loan approval is confirmed', 1, 'HARD'),
      ('DOWN_PAYMENT', 'DOWN_PAYMENT_CONFIRMED', 'Down payment has been confirmed', 1, 'OVERRIDEABLE'),
      ('READY_FOR_INSTALL', 'READY_FOR_INSTALL_CHECK', 'Loan, payment, material, team, and schedule readiness checked', 1, 'HARD'),
      ('SCHEDULING', 'SCHEDULE_CONFIRMED', 'Installation schedule is confirmed', 1, 'HARD'),
      ('INSTALLATION', 'INSTALLATION_COMPLETE', 'Installation execution is complete', 1, 'HARD'),
      ('QA', 'QA_MECHANICAL_PASS', 'Mechanical QA passed', 1, 'HARD'),
      ('QA', 'QA_ELECTRICAL_PASS', 'Electrical QA passed', 2, 'HARD'),
      ('QA', 'QA_MONITORING_PASS', 'Monitoring QA passed', 3, 'HARD'),
      ('QA', 'QA_DOCUMENTATION_PASS', 'Documentation QA passed', 4, 'HARD'),
      ('QA', 'QA_PASS', 'Final QA decision is PASS', 5, 'HARD'),
      ('HANDOVER', 'CUSTOMER_HANDOVER_COMPLETE', 'Customer handover is complete', 1, 'HARD'),
      ('BILLING', 'BILLING_REVIEW_COMPLETE', 'Billing review is complete', 1, 'HARD'),
      ('CLOSURE', 'PROJECT_CLOSURE_CONFIRMED', 'Project closure is confirmed', 1, 'HARD')
    ) as c(stage_code, code, label, order_index, gate_severity)
  loop
    select id into stage_id
    from workflow_stages
    where workflow_version_id = checklist_rec.workflow_version_id
      and code = checklist_rec.stage_code;

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
    select cash_version_id as workflow_version_id, * from (values
      ('SURVEY', 'SURVEY_PHOTOS', 'Survey Photos', '02_Survey_TSSR', 1, true, 'HARD'),
      ('TSSR', 'SLD', 'Single Line Diagram', '02_Survey_TSSR', 1, true, 'HARD'),
      ('TSSR', 'BOQ', 'Bill of Quantity', '02_Survey_TSSR', 2, true, 'HARD'),
      ('QUOTATION', 'SIGNED_CONTRACT', 'Signed Contract', '01_Sales_Commercial', 1, true, 'HARD'),
      ('PAYMENT', 'PAYMENT_PROOF', 'Payment Proof', '01_Sales_Commercial', 1, true, 'OVERRIDEABLE'),
      ('INSTALLATION', 'INSTALLATION_PHOTOS', 'Installation Photos', '04_Installation_Photos', 1, true, 'HARD'),
      ('INSTALLATION', 'INVERTER_PHOTO', 'Inverter Photo', '04_Installation_Photos', 2, true, 'HARD'),
      ('INSTALLATION', 'SERIAL_NUMBER_PHOTO', 'Serial Number Photo', '04_Installation_Photos', 3, true, 'HARD'),
      ('INSTALLATION', 'GROUNDING_PHOTO', 'Grounding Photo', '04_Installation_Photos', 4, true, 'HARD'),
      ('HANDOVER', 'CUSTOMER_ACCEPTANCE', 'Customer Acceptance', '05_Site_Folder_Handover', 1, true, 'HARD'),
      ('BILLING', 'INVOICE', 'Invoice', '06_Billing_Finance', 1, true, 'HARD'),
      ('BILLING', 'PAC', 'PAC', '06_Billing_Finance', 2, true, 'HARD'),
      ('BILLING', 'FBOQ', 'FBOQ', '06_Billing_Finance', 3, true, 'HARD')
    ) as d(stage_code, code, name, drive_folder_key, order_index, requires_verification, gate_severity)
    union all
    select loan_version_id as workflow_version_id, * from (values
      ('SURVEY', 'SURVEY_PHOTOS', 'Survey Photos', '02_Survey_TSSR', 1, true, 'HARD'),
      ('TSSR', 'SLD', 'Single Line Diagram', '02_Survey_TSSR', 1, true, 'HARD'),
      ('TSSR', 'BOQ', 'Bill of Quantity', '02_Survey_TSSR', 2, true, 'HARD'),
      ('QUOTATION', 'SIGNED_CONTRACT', 'Signed Contract', '01_Sales_Commercial', 1, true, 'HARD'),
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
    select id into stage_id
    from workflow_stages
    where workflow_version_id = document_rec.workflow_version_id
      and code = document_rec.stage_code;

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
