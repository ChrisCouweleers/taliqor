create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists team_invitations_pending_email
  on public.team_invitations (organization_id, lower(email))
  where status = 'pending';

create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid() and role = 'owner'
  )
$$;

create or replace function public.enforce_free_team_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare used_slots integer;
begin
  if not public.is_org_owner(new.organization_id) then
    raise exception 'Only workspace owners can invite team members.';
  end if;

  if new.email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid email address.';
  end if;

  select
    (select count(*) from public.organization_members
      where organization_id = new.organization_id and role <> 'owner') +
    (select count(*) from public.team_invitations
      where organization_id = new.organization_id
        and status = 'pending' and expires_at > now())
  into used_slots;

  if used_slots >= 3 then
    raise exception 'The free workspace includes three team invitations.';
  end if;

  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists enforce_free_team_limit on public.team_invitations;
create trigger enforce_free_team_limit
before insert on public.team_invitations
for each row execute function public.enforce_free_team_limit();

alter table public.team_invitations enable row level security;

create policy "owners view team invitations"
on public.team_invitations for select
using (public.is_org_owner(organization_id));

create policy "owners create team invitations"
on public.team_invitations for insert
with check (public.is_org_owner(organization_id) and invited_by = auth.uid());

create policy "owners revoke team invitations"
on public.team_invitations for update
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists "users view memberships" on public.organization_members;
create policy "members view organization memberships"
on public.organization_members for select
using (public.is_org_member(organization_id));

drop policy if exists "users view own profile" on public.profiles;
create policy "members view organization profiles"
on public.profiles for select
using (
  id = auth.uid() or exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  invitation public.team_invitations%rowtype;
  invite_token uuid;
begin
  if nullif(new.raw_user_meta_data->>'invite_token', '') is not null then
    begin
      invite_token := (new.raw_user_meta_data->>'invite_token')::uuid;
    exception when invalid_text_representation then
      raise exception 'This team invitation is invalid.';
    end;

    select * into invitation
    from public.team_invitations
    where token = invite_token
      and status = 'pending'
      and expires_at > now()
      and lower(email) = lower(new.email)
    for update;

    if not found then
      raise exception 'This invitation is invalid, expired, or belongs to another email.';
    end if;

    new_org_id := invitation.organization_id;
  else
    insert into public.organizations(name)
    values(coalesce(nullif(new.raw_user_meta_data->>'organization_name',''),'My organization'))
    returning id into new_org_id;
  end if;

  insert into public.profiles(id,name,email,company,signup_ip,signup_location) values(
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''),split_part(new.email,'@',1)),
    new.email,
    nullif(new.raw_user_meta_data->>'company',''),
    nullif(new.raw_user_meta_data->>'signup_ip',''),
    nullif(new.raw_user_meta_data->>'signup_location','')
  );

  insert into public.organization_members(organization_id,user_id,role)
  values(new_org_id,new.id,case when invitation.id is null then 'owner' else 'member' end);

  if invitation.id is not null then
    update public.team_invitations
    set status = 'accepted', accepted_at = now()
    where id = invitation.id;
  end if;

  return new;
end;
$$;
