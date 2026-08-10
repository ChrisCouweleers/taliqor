create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'taliqor_signup_webhook') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'taliqor_signup_webhook',
      'Authenticates profile inserts sent to the Taliqor signup notification function'
    );
  end if;
end $$;

create or replace function public.verify_signup_webhook(supplied_secret text)
returns boolean
language sql
security definer
set search_path = public, vault
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'taliqor_signup_webhook'
      and decrypted_secret = supplied_secret
  );
$$;

revoke all on function public.verify_signup_webhook(text) from public, anon, authenticated;
grant execute on function public.verify_signup_webhook(text) to service_role;

create or replace function public.send_new_signup_notification()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'taliqor_signup_webhook'
  limit 1;

  if webhook_secret is null then
    raise warning 'Taliqor signup webhook secret is missing';
    return new;
  end if;

  perform net.http_post(
    url := 'https://kvwukntfxqycavqfmaoz.supabase.co/functions/v1/new-signup-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-taliqor-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists taliqor_new_signup_notification on public.profiles;
create trigger taliqor_new_signup_notification
after insert on public.profiles
for each row execute function public.send_new_signup_notification();
