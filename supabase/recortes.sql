-- Recortes dos livros a rever (Songbook, CANTI 2024): song_files.path com #p=…&c=… que não coincidem com a letra do
-- cântico (verificação do texto dos PDF, 14 nov 2026). O Maestro / Gestor revê cada um na página do cântico
-- (op crops / cropset da função conteudo). Só o servidor lê e escreve (chave de serviço).
create table if not exists public.crop_reviews (
  id           bigint generated always as identity primary key,
  song_file_id bigint not null unique references public.song_files(id) on delete cascade,
  song_slug    text not null references public.songs(slug) on delete cascade on update cascade,
  proposed     text,          -- recorte proposto (caminho completo), se houver
  previous     text,          -- recorte anterior, quando já foi corrigido automaticamente (para o poder repor)
  note         text,
  status       text not null default 'pendente' check (status in ('pendente', 'feito')),
  decided_by   text,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists crop_reviews_status_idx on public.crop_reviews (status);
alter table public.crop_reviews enable row level security;   -- sem políticas: só a chave de serviço
revoke all on public.crop_reviews from anon, authenticated;
grant all on public.crop_reviews to service_role;
