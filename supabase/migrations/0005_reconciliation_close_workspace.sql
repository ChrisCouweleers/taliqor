alter table public.reconciliations
  add column if not exists period_end date,
  add column if not exists method text not null default 'transaction' check (method in ('transaction','balance','account_analysis','variance')),
  add column if not exists status text not null default 'draft' check (status in ('draft','review','changes_requested','certified')),
  add column if not exists materiality numeric not null default 0,
  add column if not exists source_balance numeric,
  add column if not exists comparison_balance numeric,
  add column if not exists conclusion text not null default '',
  add column if not exists certification jsonb not null default '{}'::jsonb,
  add column if not exists rules jsonb not null default '{}'::jsonb,
  add column if not exists prior_reconciliation_id uuid references public.reconciliations(id) on delete set null;

create table if not exists public.matching_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.close_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null,
  period_type text not null default 'month' check (period_type in ('month','quarter','year')),
  period_end date not null,
  status text not null default 'open' check (status in ('open','closed')),
  materiality numeric not null default 0,
  tasks jsonb not null default '[]'::jsonb,
  variances jsonb not null default '[]'::jsonb,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists close_periods_org_end on public.close_periods(organization_id, period_end desc);
create index if not exists matching_rules_org on public.matching_rules(organization_id);

alter table public.matching_rules enable row level security;
alter table public.close_periods enable row level security;
create policy "members manage matching rules" on public.matching_rules for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "members manage close periods" on public.close_periods for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
