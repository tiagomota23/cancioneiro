-- Letra de um cântico só numa folha (o Maestro tira estrofes ou muda o texto sem mexer no original).
-- Apaga-se com o cântico na folha (e com a folha, pela cascata de collection_songs).
-- A letra é conteúdo protegido: só a função "conteudo" a lê e escreve (service_role); a app só vê que existe.
create table if not exists public.collection_lyrics (
  collection_id uuid not null, -- sem chave direta para collections: com ela o PostgREST via duas ligações collections → collection_songs
  song_slug text not null,
  lyrics jsonb not null,
  edited_by text,
  edited_at timestamptz not null default now(),
  primary key (collection_id, song_slug),
  foreign key (collection_id, song_slug) references public.collection_songs(collection_id, song_slug) on update cascade on delete cascade
);
alter table public.collection_lyrics enable row level security;
revoke all on public.collection_lyrics from public, anon, authenticated;
grant select, insert, update, delete on public.collection_lyrics to service_role;
grant select (collection_id, song_slug, edited_at) on public.collection_lyrics to authenticated;
drop policy if exists "folhas letras ler" on public.collection_lyrics;
create policy "folhas letras ler" on public.collection_lyrics for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_lyrics.collection_id));
