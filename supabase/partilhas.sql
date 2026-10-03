-- Endereços partilhados: qualquer pessoa (mesmo sem conta) vê a letra e a tradução de um cântico durante 24 h.
-- Só a função "conteudo" (chave de serviço) lê e escreve esta tabela.
create table if not exists public.song_shares (
  token text primary key,
  song_slug text not null references public.songs(slug) on delete cascade on update cascade,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  views int not null default 0
);
alter table public.song_shares enable row level security;
revoke all on public.song_shares from anon, authenticated;
-- endereços expirados são apagados todos os dias (04:40 UTC)
select cron.schedule('cancioneiro-partilhas-limpeza', '40 4 * * *', $$ delete from public.song_shares where expires_at < now() - interval '1 day' $$);
select 'ok' as partilhas;

-- Endereços de coleções: valem enquanto a coleção não expirar (a data é sempre a da coleção)
alter table public.song_shares alter column song_slug drop not null;
alter table public.song_shares add column if not exists collection_id uuid references public.collections(id) on delete cascade;
alter table public.song_shares drop constraint if exists song_shares_alvo;
alter table public.song_shares add constraint song_shares_alvo check ((song_slug is null) <> (collection_id is null));
select 'ok' as partilhas_colecoes;
