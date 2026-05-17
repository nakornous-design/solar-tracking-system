-- Customer master data split from project snapshots.

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique,
  name text not null,
  phone text,
  contact_name text,
  contact_verified boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customer_sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  label text,
  address text,
  postal_code text,
  subdistrict text,
  district text,
  province text,
  google_maps_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_sites_customer_id_idx on customer_sites(customer_id);
create index if not exists customer_sites_location_idx on customer_sites(province, district, subdistrict);

alter table projects
  add column if not exists customer_id uuid references customers(id) on delete set null,
  add column if not exists customer_site_id uuid references customer_sites(id) on delete set null;

create index if not exists projects_customer_id_idx on projects(customer_id);
create index if not exists projects_customer_site_id_idx on projects(customer_site_id);

insert into customers (
  customer_code,
  name,
  phone,
  contact_name,
  contact_verified,
  metadata,
  created_at,
  updated_at
)
select
  p.customer_code,
  p.customer_name,
  p.customer_phone,
  nullif(p.customer_intake->>'contactName', ''),
  coalesce((p.customer_intake->>'contactVerified')::boolean, false),
  jsonb_build_object('source', 'projects_backfill', 'project_id', p.id),
  p.created_at,
  now()
from projects p
where not exists (
  select 1 from customers c where c.customer_code = p.customer_code
);

insert into customer_sites (
  customer_id,
  label,
  address,
  postal_code,
  subdistrict,
  district,
  province,
  google_maps_url,
  metadata,
  created_at,
  updated_at
)
select
  c.id,
  'Main installation site',
  nullif(p.customer_intake->>'siteAddress', ''),
  nullif(p.customer_intake->>'postalCode', ''),
  nullif(p.customer_intake->>'siteSubdistrict', ''),
  nullif(p.customer_intake->>'siteDistrict', ''),
  nullif(p.customer_intake->>'siteProvince', ''),
  nullif(p.customer_intake->>'googleMapsUrl', ''),
  jsonb_build_object('source', 'projects_backfill', 'project_id', p.id),
  p.created_at,
  now()
from projects p
join customers c on c.customer_code = p.customer_code
where not exists (
  select 1
  from customer_sites s
  where s.customer_id = c.id
    and coalesce(s.address, '') = coalesce(nullif(p.customer_intake->>'siteAddress', ''), '')
    and coalesce(s.postal_code, '') = coalesce(nullif(p.customer_intake->>'postalCode', ''), '')
    and coalesce(s.subdistrict, '') = coalesce(nullif(p.customer_intake->>'siteSubdistrict', ''), '')
    and coalesce(s.district, '') = coalesce(nullif(p.customer_intake->>'siteDistrict', ''), '')
    and coalesce(s.province, '') = coalesce(nullif(p.customer_intake->>'siteProvince', ''), '')
);

update projects p
set customer_id = c.id
from customers c
where p.customer_id is null
  and c.customer_code = p.customer_code;

update projects p
set customer_site_id = s.id
from customers c
join customer_sites s on s.customer_id = c.id
where p.customer_site_id is null
  and p.customer_id = c.id
  and coalesce(s.address, '') = coalesce(nullif(p.customer_intake->>'siteAddress', ''), '')
  and coalesce(s.postal_code, '') = coalesce(nullif(p.customer_intake->>'postalCode', ''), '')
  and coalesce(s.subdistrict, '') = coalesce(nullif(p.customer_intake->>'siteSubdistrict', ''), '')
  and coalesce(s.district, '') = coalesce(nullif(p.customer_intake->>'siteDistrict', ''), '')
  and coalesce(s.province, '') = coalesce(nullif(p.customer_intake->>'siteProvince', ''), '');
