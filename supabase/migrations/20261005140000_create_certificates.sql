create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  certification_name text not null default '',
  certificate_number text not null default '',
  issuing_organization text not null default '',
  issue_date text not null default '',
  duration text not null default '',
  skills text[] not null default '{}',
  description text not null default '',
  file_path text,
  file_name text,
  expiration_date text not null default '',
  credential_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists certificates_created_idx
  on public.certificates (created_at desc);

alter table public.certificates enable row level security;
alter table public.certificates drop column if exists user_id;

drop policy if exists "Users can read their own certificates" on public.certificates;
drop policy if exists "Users can create their own certificates" on public.certificates;
drop policy if exists "Users can update their own certificates" on public.certificates;
drop policy if exists "Users can delete their own certificates" on public.certificates;
drop policy if exists "Anyone can read certificates" on public.certificates;
drop policy if exists "Anyone can create certificates" on public.certificates;
drop policy if exists "Anyone can update certificates" on public.certificates;
drop policy if exists "Anyone can delete certificates" on public.certificates;

grant select, insert, update, delete on public.certificates to anon, authenticated;

create policy "Anyone can read certificates"
  on public.certificates for select to anon, authenticated
  using (true);

create policy "Anyone can create certificates"
  on public.certificates for insert to anon, authenticated
  with check (true);

create policy "Anyone can update certificates"
  on public.certificates for update to anon, authenticated
  using (true)
  with check (true);

create policy "Anyone can delete certificates"
  on public.certificates for delete to anon, authenticated
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'Documents',
  'Documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own certificate files" on storage.objects;
drop policy if exists "Users can upload their own certificate files" on storage.objects;
drop policy if exists "Users can update their own certificate files" on storage.objects;
drop policy if exists "Users can delete their own certificate files" on storage.objects;
drop policy if exists "Anyone can read certificate files" on storage.objects;
drop policy if exists "Anyone can upload certificate files" on storage.objects;
drop policy if exists "Anyone can update certificate files" on storage.objects;
drop policy if exists "Anyone can delete certificate files" on storage.objects;

grant select, insert, update, delete on storage.objects to anon, authenticated;

create policy "Anyone can read certificate files"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'Documents');

create policy "Anyone can upload certificate files"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'Documents');

create policy "Anyone can update certificate files"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'Documents')
  with check (bucket_id = 'Documents');

create policy "Anyone can delete certificate files"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'Documents');
