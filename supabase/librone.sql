-- Livro «Librone dei canti» (v250): https://www.libronedeicanti.it/ (índice indice.js e letras testi.js, públicos).
-- Fonte librone (song_sources.ref = id do cântico no site; página em https://www.libronedeicanti.it/canti/<id>.html),
-- secções em song_tags (grp «Librone dei canti», as mesmas do CANTI). Letras: 1.ª linha
-- «(letra do librone dei canti — libronedeicanti.it)»; estrofes pelo divisor supabase/functions/sync-librone/strofe.js.
alter table public.song_sources drop constraint if exists song_sources_source_check;
alter table public.song_sources add constraint song_sources_source_check check (source in ('original', 'coro_clu', 'canti2024', 'songbook', 'novos', 'coros_companhia', 'librone'));
-- atualização semanal (função sync-librone, pedida pelo pg_cron como as outras)
alter table public.job_requests drop constraint if exists job_requests_job_check;
alter table public.job_requests add constraint job_requests_job_check check (job in ('drive-sync', 'sync-songs', 'health', 'sync-cc', 'cc-transcribe', 'sync-librone'));
create table if not exists public.librone_sync_log (
  id bigint generated always as identity primary key,
  run_at timestamptz not null default now(),
  summary jsonb,
  error text
);
alter table public.librone_sync_log enable row level security;
revoke all on public.librone_sync_log from public, anon, authenticated;
grant select, insert, update, delete on public.librone_sync_log to service_role;
-- todas as segundas-feiras às 06:45 UTC (depois do Coros & Companhia)
select cron.schedule('cancioneiro-librone-semanal', '45 6 * * 1', $$
  insert into public.job_requests (job) values ('sync-librone');
  select net.http_post(url := 'https://hmfjbyiesghqhwhqgnem.supabase.co/functions/v1/sync-librone', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);
$$);
