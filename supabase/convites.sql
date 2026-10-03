-- Convites: "Partilhar a app" cria um convite para um perfil (até ao de quem convida). Quem entra por ele fica com o
-- pedido de acesso marcado (quem convidou e para que perfil); continua a precisar da aprovação de um Gestor.
create table if not exists public.invites (
  token text primary key,
  role text not null check (role in ('cancioneiro', 'coro', 'maestro', 'gestor')),
  invited_by text not null,
  inviter_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;
alter table public.access_requests add column if not exists invited_by text;
alter table public.access_requests add column if not exists invited_role text;
select cron.schedule('cancioneiro-convites-limpeza', '55 4 * * *', $$ delete from public.invites where expires_at < now() - interval '1 day' $$);
select 'ok' as convites;
