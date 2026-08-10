create table if not exists public.request_rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0)
);

alter table public.request_rate_limits enable row level security;

create or replace function public.consume_request_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  result_count integer;
begin
  if caller_id is null then
    return false;
  end if;
  if p_action not in ('upload', 'create_reconciliation', 'update_reconciliation', 'invite') then
    return false;
  end if;
  if p_limit < 1 or p_limit > 1000 or p_window_seconds < 60 or p_window_seconds > 86400 then
    return false;
  end if;

  insert into public.request_rate_limits as limits (key, window_started_at, request_count)
  values (caller_id::text || ':' || p_action, now(), 1)
  on conflict (key) do update
  set
    window_started_at = case
      when limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
      else limits.request_count + 1
    end
  returning request_count into result_count;

  return result_count <= p_limit;
end;
$$;

revoke all on function public.consume_request_limit(text, integer, integer) from public;
grant execute on function public.consume_request_limit(text, integer, integer) to authenticated;

-- Uploaded source documents can be removed when a reconciliation is deleted.
create policy "members delete reconciliation files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'reconciliation-files'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);
