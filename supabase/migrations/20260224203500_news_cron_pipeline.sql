BEGIN;

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vault;

select vault.create_secret(
  secret := 'https://eenwcyuyugyrjgpivxrq.supabase.co',
  name := 'project_url'
);
select vault.create_secret(
  secret := '<YOUR_ANON_KEY>',
  name := 'anon_key'
);

select cron.unschedule(jobid) from cron.job where jobname = 'cron_ingest_news_every_5m';
select cron.unschedule(jobid) from cron.job where jobname = 'cron_translate_news_every_2m';

select cron.schedule(
  'cron_ingest_news_every_5m',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron_ingest_news',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

select cron.schedule(
  'cron_translate_news_every_2m',
  '*/2 * * * *',
  $$
  select
    net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron_translate_news',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
      ),
      body := '{"limit":10}'::jsonb
    );
  $$
);

COMMIT;
