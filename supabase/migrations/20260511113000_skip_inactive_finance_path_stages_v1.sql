-- Hide inactive finance branch stages from runtime project timelines.
-- Unified workflows keep both CASH and LOAN stages so projects can switch paths,
-- but the non-selected branch should start as SKIPPED.

update project_stages ps
set
  status = 'SKIPPED',
  started_at = null,
  due_at = null,
  blocked_at = null,
  metadata = coalesce(ps.metadata, '{}'::jsonb) || jsonb_build_object(
    'skipped_reason', 'Inactive for CASH finance path.',
    'skipped_source', 'INITIAL_FINANCE_PATH_BACKFILL',
    'payment_type', p.payment_type
  ),
  updated_at = now()
from projects p
where ps.project_id = p.id
  and p.payment_type = 'CASH'
  and ps.code in ('LOAN_DOCUMENT_COLLECTION', 'LOAN_SUBMISSION', 'LOAN_REVIEW', 'LOAN_APPROVAL', 'DOWN_PAYMENT')
  and ps.status in ('PENDING', 'WAITING', 'BLOCKED');

update project_stages ps
set
  status = 'SKIPPED',
  started_at = null,
  due_at = null,
  blocked_at = null,
  metadata = coalesce(ps.metadata, '{}'::jsonb) || jsonb_build_object(
    'skipped_reason', 'Inactive for LOAN finance path.',
    'skipped_source', 'INITIAL_FINANCE_PATH_BACKFILL',
    'payment_type', p.payment_type
  ),
  updated_at = now()
from projects p
where ps.project_id = p.id
  and p.payment_type = 'LOAN'
  and ps.code = 'PAYMENT'
  and ps.status in ('PENDING', 'WAITING', 'BLOCKED');
