create or replace function public.delete_own_account(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  org_id uuid;
  caller_role text;
  remaining_members integer;
  successor_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select email into caller_email from auth.users where id = caller_id;
  if caller_email is null or lower(trim(p_email)) <> lower(caller_email) then
    raise exception 'Enter your account email to confirm deletion.';
  end if;

  select organization_id, role into org_id, caller_role
  from public.organization_members
  where user_id = caller_id
  limit 1;

  if org_id is null then
    delete from auth.users where id = caller_id;
    return jsonb_build_object('deleted', true, 'workspaceDeleted', false);
  end if;

  select count(*) into remaining_members
  from public.organization_members
  where organization_id = org_id and user_id <> caller_id;

  if remaining_members = 0 then
    if exists (
      select 1 from storage.objects
      where bucket_id = 'reconciliation-files'
        and (storage.foldername(name))[1] = org_id::text
    ) then
      raise exception 'Archived files must be removed before the account can be deleted.';
    end if;
    delete from public.organizations where id = org_id;
    delete from auth.users where id = caller_id;
    return jsonb_build_object('deleted', true, 'workspaceDeleted', true);
  end if;

  select user_id into successor_id
  from public.organization_members
  where organization_id = org_id and user_id <> caller_id
  order by case when role = 'owner' then 0 else 1 end, created_at
  limit 1;

  if caller_role = 'owner' then
    update public.organization_members
    set role = 'owner'
    where organization_id = org_id and user_id = successor_id;
  end if;

  update public.reconciliations
  set created_by = successor_id
  where organization_id = org_id and created_by = caller_id;

  update public.close_periods
  set created_by = successor_id
  where organization_id = org_id and created_by = caller_id;

  update storage.objects
  set owner_id = successor_id::text
  where bucket_id = 'reconciliation-files' and owner_id = caller_id::text;

  delete from auth.users where id = caller_id;
  return jsonb_build_object('deleted', true, 'workspaceDeleted', false);
end;
$$;

revoke all on function public.delete_own_account(text) from public;
grant execute on function public.delete_own_account(text) to authenticated;
