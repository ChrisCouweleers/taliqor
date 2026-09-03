-- Large reconciliation storage. Results are stored independently so imports,
-- reads, and decisions never rewrite one enormous JSON document.

alter table public.reconciliations
  add column if not exists result_storage text not null default 'inline'
    check (result_storage in ('inline', 'rows')),
  add column if not exists result_count integer not null default 0,
  add column if not exists resolved_count integer not null default 0,
  add column if not exists open_count integer not null default 0;

alter table public.reconciliations
  add column if not exists import_status text not null default 'ready'
    check (import_status in ('pending', 'ready', 'failed'));

update public.reconciliations
set result_count = jsonb_array_length(matches),
    resolved_count = (
      select count(*) from jsonb_array_elements(matches) item
      where item->>'status' = 'matched' or item->>'decision' = 'approved'
    ),
    open_count = (
      select count(*) from jsonb_array_elements(matches) item
      where item->>'status' <> 'matched' and item->>'decision' <> 'approved'
    )
where result_storage = 'inline';

alter table public.reconciliations
  add constraint reconciliations_id_organization_unique unique (id, organization_id);

create table if not exists public.reconciliation_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reconciliation_id uuid not null,
  position integer not null check (position >= 0),
  result_id text not null,
  result jsonb not null,
  match_status text not null,
  decision text not null,
  source_amount numeric not null default 0,
  exception_type text not null default '',
  explanation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reconciliation_id, position),
  unique (reconciliation_id, result_id),
  foreign key (reconciliation_id, organization_id)
    references public.reconciliations(id, organization_id) on delete cascade
);

create index if not exists reconciliation_results_page
  on public.reconciliation_results(reconciliation_id, position);
create index if not exists reconciliation_results_controls
  on public.reconciliation_results(reconciliation_id, match_status, decision, source_amount);

alter table public.reconciliation_results enable row level security;
create policy "members read reconciliation results" on public.reconciliation_results for select
using(public.is_org_member(organization_id));
create policy "members create reconciliation results" on public.reconciliation_results for insert
with check(public.is_org_member(organization_id));
create policy "members update reconciliation results" on public.reconciliation_results for update
using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "members delete reconciliation results" on public.reconciliation_results for delete
using(public.is_org_member(organization_id));

update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array[
      'text/csv','application/csv','text/plain','application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
where id = 'reconciliation-files';
