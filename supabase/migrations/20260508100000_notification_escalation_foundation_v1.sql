-- Notification & Escalation Foundation V1
-- Source of truth: docs/FINAL_ARCHITECTURE_SOURCE_OF_TRUTH.md
--
-- Scope:
-- - In-app notification queue
-- - Channel delivery audit for future Email / LINE integrations
-- - Escalation metadata without requiring external providers in MVP

do $$
begin
  create type notification_channel as enum ('IN_APP', 'EMAIL', 'LINE');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type notification_status as enum ('PENDING', 'SENT', 'READ', 'FAILED', 'CANCELLED');
exception
  when duplicate_object then null;
end $$;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  project_stage_id uuid references project_stages(id) on delete set null,
  exception_id uuid references project_exceptions(id) on delete set null,
  approval_request_id uuid references approval_requests(id) on delete set null,
  recipient_role user_role,
  recipient_id uuid references profiles(id) on delete set null,
  channel notification_channel not null default 'IN_APP',
  status notification_status not null default 'PENDING',
  severity exception_severity not null default 'INFO',
  title text not null,
  message text,
  action_url text,
  escalation_level integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  channel notification_channel not null,
  status notification_status not null default 'PENDING',
  provider text,
  provider_message_id text,
  payload jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  attempted_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notifications_project_status_idx
  on notifications(project_id, status, created_at desc);

create index if not exists notifications_recipient_status_idx
  on notifications(recipient_id, recipient_role, status, created_at desc);

create index if not exists notifications_escalation_idx
  on notifications(severity, escalation_level, scheduled_at)
  where status = 'PENDING';

create index if not exists notification_deliveries_notification_idx
  on notification_deliveries(notification_id, channel, status);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['notifications', 'notification_deliveries']
  loop
    execute format('drop trigger if exists set_%I_updated_at on %I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on %I for each row execute function set_updated_at()', table_name, table_name);
  end loop;
end $$;
