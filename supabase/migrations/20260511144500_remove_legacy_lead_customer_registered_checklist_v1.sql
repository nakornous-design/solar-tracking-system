-- Remove the old broad Lead checklist after replacing it with granular intake checks.

delete from project_checklists pc
using project_stages ps
where pc.project_stage_id = ps.id
  and ps.code = 'LEAD'
  and pc.code = 'CUSTOMER_REGISTERED';

delete from workflow_checklists wc
using workflow_stages ws
where wc.workflow_stage_id = ws.id
  and ws.code = 'LEAD'
  and wc.code = 'CUSTOMER_REGISTERED';
