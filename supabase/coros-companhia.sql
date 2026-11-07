-- Livro «Coros & Companhia» (v226): repertório do grupo Coros & Companhia (folha Google pública, por momento da Missa).
-- Fonte coros_companhia (song_sources.ref = título na lista), momentos em song_tags (grp «Coros & Companhia») e
-- gravações por ligação em song_files (kind 'other', path = endereço do YouTube / Drive; não se copiam os MP3).
alter table public.song_sources drop constraint if exists song_sources_source_check;
alter table public.song_sources add constraint song_sources_source_check check (source in ('original', 'coro_clu', 'canti2024', 'songbook', 'novos', 'coros_companhia'));
-- atualização semanal (função sync-cc, pedida pelo pg_cron como as outras)
alter table public.job_requests drop constraint if exists job_requests_job_check;
alter table public.job_requests add constraint job_requests_job_check check (job in ('drive-sync', 'sync-songs', 'health', 'sync-cc'));
create table if not exists public.cc_sync_log (
  id bigint generated always as identity primary key,
  run_at timestamptz not null default now(),
  summary jsonb,
  error text
);
alter table public.cc_sync_log enable row level security;
revoke all on public.cc_sync_log from public, anon, authenticated;
grant select, insert, update, delete on public.cc_sync_log to service_role;
-- todas as segundas-feiras às 06:30 UTC (depois da verificação do Drive do Coro)
select cron.schedule('cancioneiro-coros-companhia-semanal', '30 6 * * 1', $$
  insert into public.job_requests (job) values ('sync-cc');
  select net.http_post(url := 'https://hmfjbyiesghqhwhqgnem.supabase.co/functions/v1/sync-cc', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);
$$);
