-- Store customer intake details captured at project creation.

alter table projects
  add column if not exists customer_intake jsonb not null default '{}'::jsonb;
