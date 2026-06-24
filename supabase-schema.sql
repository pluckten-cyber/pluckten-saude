create table if not exists public.products (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.orders enable row level security;

-- The app uses the service role key only on the server, so no public table
-- policies are required for normal reads/writes.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public product image read" on storage.objects;
create policy "Public product image read"
on storage.objects
for select
to public
using (bucket_id = 'product-images');

drop policy if exists "Service role product image write" on storage.objects;
create policy "Service role product image write"
on storage.objects
for all
to service_role
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');
