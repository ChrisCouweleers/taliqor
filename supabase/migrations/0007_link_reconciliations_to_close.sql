alter table public.reconciliations
  add column if not exists close_period_id uuid
  references public.close_periods(id) on delete set null;

create index if not exists reconciliations_close_period
  on public.reconciliations(close_period_id);

create or replace function public.validate_reconciliation_close_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.close_period_id is not null and not exists (
    select 1 from public.close_periods
    where id = new.close_period_id
      and organization_id = new.organization_id
  ) then
    raise exception 'The reconciliation and close must belong to the same workspace.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_reconciliation_close_link on public.reconciliations;
create trigger validate_reconciliation_close_link
before insert or update of close_period_id on public.reconciliations
for each row execute function public.validate_reconciliation_close_link();

update public.reconciliations reconciliation
set close_period_id = (
  select close_period.id
  from public.close_periods close_period
  where close_period.organization_id = reconciliation.organization_id
    and close_period.period_end = reconciliation.period_end
  order by close_period.created_at desc
  limit 1
)
where reconciliation.close_period_id is null
  and reconciliation.period_end is not null;
