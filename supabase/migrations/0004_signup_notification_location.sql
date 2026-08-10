alter table public.profiles
  add column if not exists signup_ip text,
  add column if not exists signup_location text;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare new_org_id uuid;
begin
  insert into public.organizations(name) values(coalesce(nullif(new.raw_user_meta_data->>'organization_name',''),'My organization')) returning id into new_org_id;
  insert into public.profiles(id,name,email,company,signup_ip,signup_location) values(
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''),split_part(new.email,'@',1)),
    new.email,
    nullif(new.raw_user_meta_data->>'company',''),
    nullif(new.raw_user_meta_data->>'signup_ip',''),
    nullif(new.raw_user_meta_data->>'signup_location','')
  );
  insert into public.organization_members(organization_id,user_id,role) values(new_org_id,new.id,'owner');
  return new;
end; $$;
