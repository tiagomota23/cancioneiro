-- Pedidos do agendamento: as funções drive-sync, sync-songs e notify (health) só correm se encontrarem um pedido recente
-- (escrito aqui pelo pg_cron). Ninguém de fora consegue escrever nesta tabela, por isso não as consegue pôr a correr.
create table if not exists public.job_requests (
  id bigint generated always as identity primary key,
  job text not null check (job in ('drive-sync', 'sync-songs', 'health')),
  requested_at timestamptz not null default now()
);
alter table public.job_requests enable row level security;
revoke all on public.job_requests from anon, authenticated;

select cron.schedule('cancioneiro-drive-semanal', '15 6 * * 1', $$
  insert into public.job_requests (job) values ('drive-sync');
  select net.http_post(url := 'https://hmfjbyiesghqhwhqgnem.supabase.co/functions/v1/drive-sync', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);
$$);
select cron.schedule('cancioneiro-saude-semanal', '30 5 * * 1', $$
  insert into public.job_requests (job) values ('health');
  select public.call_notify('{"type": "health"}'::jsonb);
$$);
-- a verificação do site original mantém o comando (com a chave pública), só com o pedido antes
select cron.schedule('cancioneiro-verificacao-semanal', '0 5 * * 1',
  'insert into public.job_requests (job) values (''sync-songs''); ' || (select command from cron.job where jobname = 'cancioneiro-verificacao-semanal' and command not like '%job_requests%')
) where exists (select 1 from cron.job where jobname = 'cancioneiro-verificacao-semanal' and command not like '%job_requests%');
-- pedidos antigos (não usados) são apagados todos os dias
select cron.schedule('cancioneiro-pedidos-limpeza', '50 4 * * *', $$ delete from public.job_requests where requested_at < now() - interval '1 day' $$);
select jobname, left(command, 90) from cron.job order by 1;
