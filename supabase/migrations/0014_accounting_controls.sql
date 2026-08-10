-- Connected accounting controls: immutable history, review locks, close approval,
-- recurring-period continuity, accounting dimensions, and richer variances.

alter table public.reconciliations
  add column if not exists prepared_by_id uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_by_id uuid references auth.users(id) on delete set null,
  add column if not exists locked_at timestamptz,
  add column if not exists certification_version integer not null default 0,
  add column if not exists change_reason text not null default '',
  add column if not exists dimensions jsonb not null default '{}'::jsonb;

alter table public.close_periods
  add column if not exists closed_by uuid references auth.users(id) on delete set null,
  add column if not exists reopened_by uuid references auth.users(id) on delete set null,
  add column if not exists reopened_at timestamptz,
  add column if not exists close_conclusion text not null default '',
  add column if not exists reopen_reason text not null default '';

alter table public.journal_adjustments
  add column if not exists prepared_by_id uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_by_id uuid references auth.users(id) on delete set null;

alter table public.reconciliation_profiles
  add column if not exists preparer_id uuid references auth.users(id) on delete set null,
  add column if not exists reviewer_id uuid references auth.users(id) on delete set null,
  add column if not exists due_offset integer not null default 5,
  add column if not exists dimensions jsonb not null default '{}'::jsonb,
  add column if not exists required_support text[] not null default '{}';

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  entity_type text not null check (entity_type in ('reconciliation','close','adjustment','evidence','profile','variance')),
  entity_id uuid not null,
  action text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_org_created
  on public.audit_events(organization_id, created_at desc);
create index if not exists audit_events_entity
  on public.audit_events(entity_type, entity_id, created_at desc);

alter table public.audit_events enable row level security;
create policy "members read audit events" on public.audit_events for select
using(public.is_org_member(organization_id));
create policy "members append audit events" on public.audit_events for insert
with check(public.is_org_member(organization_id) and actor_id = auth.uid());

-- No update or delete policy is intentionally defined. Audit events are append-only.

create or replace function public.prevent_audit_event_changes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Audit history cannot be changed or deleted.';
end; $$;

drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable before update or delete on public.audit_events
for each row execute function public.prevent_audit_event_changes();
