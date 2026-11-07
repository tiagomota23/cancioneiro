-- Transcrição (uma vez, pedido do Tiago, 7 nov 2026) das gravações MP3 do Coros & Companhia no Drive do grupo, para
-- rascunhos de letra «a rever». A função cc-transcribe só corre com pedido em job_requests (como as outras).
alter table public.job_requests drop constraint if exists job_requests_job_check;
alter table public.job_requests add constraint job_requests_job_check check (job in ('drive-sync', 'sync-songs', 'health', 'sync-cc', 'cc-transcribe'));
create table if not exists public.cc_transcripts (
  song_slug text primary key references public.songs(slug) on update cascade on delete cascade,
  drive_id text not null,
  text text,
  language text,
  error text,
  created_at timestamptz not null default now()
);
alter table public.cc_transcripts enable row level security;
revoke all on public.cc_transcripts from public, anon, authenticated;
grant select, insert, update, delete on public.cc_transcripts to service_role;
