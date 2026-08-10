-- Keep the database workflow constraint aligned with the review states used by
-- the dashboard. This must be a new migration because 0005 may already have
-- been applied before these statuses were introduced.
alter table public.reconciliations
  drop constraint if exists reconciliations_status_check;

alter table public.reconciliations
  add constraint reconciliations_status_check
  check (status in ('draft', 'review', 'changes_requested', 'certified'));
