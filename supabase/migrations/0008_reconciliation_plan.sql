create table if not exists public.reconciliation_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  account_number text,
  account_type text not null default 'other',
  method text not null default 'balance' check (method in ('transaction','balance','account_analysis','variance')),
  frequency text not null default 'monthly' check (frequency in ('monthly','quarterly','yearly')),
  risk text not null default 'medium' check (risk in ('low','medium','high')),
  materiality numeric not null default 0,
  preparer text not null default '',
  reviewer text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reconciliation_profiles_org_account
  on public.reconciliation_profiles(organization_id, account_number)
  where account_number is not null and account_number <> '';

alter table public.reconciliation_profiles enable row level security;
create policy "members manage reconciliation profiles"
on public.reconciliation_profiles for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

alter table public.reconciliations
  add column if not exists profile_id uuid
  references public.reconciliation_profiles(id) on delete set null;

create index if not exists reconciliations_profile_period
  on public.reconciliations(profile_id, period_end desc);
