create extension if not exists pgcrypto;
create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 1 and 100), created_at timestamptz not null default now());
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, name text not null, created_at timestamptz not null default now());
create table public.organization_members (organization_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role text not null default 'owner' check (role in ('owner','member')), created_at timestamptz not null default now(), primary key (organization_id,user_id));
create table public.mapping_templates (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, name text not null, fingerprint text not null, mapping jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,fingerprint));
create table public.reconciliations (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, created_by uuid not null references auth.users(id), name text not null, left_name text not null, right_name text not null, matches jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index reconciliations_org_created on public.reconciliations(organization_id,created_at desc);

create or replace function public.is_org_member(org_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.organization_members where organization_id=org_id and user_id=auth.uid()) $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare new_org_id uuid;
begin
  insert into public.organizations(name) values(coalesce(nullif(new.raw_user_meta_data->>'organization_name',''),'My organization')) returning id into new_org_id;
  insert into public.profiles(id,name) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'name',''),split_part(new.email,'@',1)));
  insert into public.organization_members(organization_id,user_id,role) values(new_org_id,new.id,'owner');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.mapping_templates enable row level security;
alter table public.reconciliations enable row level security;
create policy "members view organizations" on public.organizations for select using(public.is_org_member(id));
create policy "users view own profile" on public.profiles for select using(id=auth.uid());
create policy "users view memberships" on public.organization_members for select using(user_id=auth.uid());
create policy "members manage templates" on public.mapping_templates for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "members manage reconciliations" on public.reconciliations for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('reconciliation-files','reconciliation-files',false,15728640,array['text/csv','application/csv','text/plain','application/vnd.ms-excel']) on conflict(id) do nothing;
create policy "members upload reconciliation files" on storage.objects for insert to authenticated with check(bucket_id='reconciliation-files' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy "members read reconciliation files" on storage.objects for select to authenticated using(bucket_id='reconciliation-files' and public.is_org_member((storage.foldername(name))[1]::uuid));
