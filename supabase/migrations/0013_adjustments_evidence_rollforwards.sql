alter table public.reconciliations
  add column if not exists beginning_balance numeric,
  add column if not exists period_activity numeric;

create table if not exists public.journal_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  reconciliation_id uuid references public.reconciliations(id) on delete cascade,
  close_period_id uuid references public.close_periods(id) on delete cascade,
  match_id text,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  posting_date date,
  status text not null default 'draft' check (status in ('draft','review','approved','posted','no_entry')),
  lines jsonb not null default '[]'::jsonb,
  recurring boolean not null default false,
  auto_reverse boolean not null default false,
  reversal_date date,
  external_reference text not null default '',
  prepared_by text not null default '',
  reviewed_by text not null default '',
  origin_adjustment_id uuid references public.journal_adjustments(id) on delete set null,
  entry_kind text not null default 'original' check (entry_kind in ('original','recurring_copy','reversal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(close_period_id, origin_adjustment_id, entry_kind)
);

create table if not exists public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  reconciliation_id uuid references public.reconciliations(id) on delete cascade,
  adjustment_id uuid references public.journal_adjustments(id) on delete cascade,
  match_id text,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

create index if not exists journal_adjustments_org_period on public.journal_adjustments(organization_id, close_period_id, created_at desc);
create index if not exists journal_adjustments_reconciliation on public.journal_adjustments(reconciliation_id, match_id);
create index if not exists evidence_files_reconciliation on public.evidence_files(reconciliation_id, match_id);
create index if not exists evidence_files_adjustment on public.evidence_files(adjustment_id);

alter table public.journal_adjustments enable row level security;
alter table public.evidence_files enable row level security;
create policy "members manage journal adjustments" on public.journal_adjustments
for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "members manage evidence records" on public.evidence_files
for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values(
  'supporting-evidence',
  'supporting-evidence',
  false,
  10485760,
  array[
    'application/pdf','image/png','image/jpeg','text/plain','text/csv','application/csv',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict(id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "members upload supporting evidence" on storage.objects for insert to authenticated
with check(bucket_id='supporting-evidence' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy "members read supporting evidence" on storage.objects for select to authenticated
using(bucket_id='supporting-evidence' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy "members delete supporting evidence" on storage.objects for delete to authenticated
using(bucket_id='supporting-evidence' and public.is_org_member((storage.foldername(name))[1]::uuid));
