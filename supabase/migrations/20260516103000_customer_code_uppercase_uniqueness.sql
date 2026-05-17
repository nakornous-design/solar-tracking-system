update public.projects
set customer_code = upper(btrim(customer_code))
where customer_code <> upper(btrim(customer_code));

update public.customers
set customer_code = upper(btrim(customer_code))
where customer_code <> upper(btrim(customer_code));

create unique index if not exists projects_customer_code_upper_key
on public.projects (upper(btrim(customer_code)));

create unique index if not exists customers_customer_code_upper_key
on public.customers (upper(btrim(customer_code)));
