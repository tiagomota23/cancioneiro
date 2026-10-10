-- Índices nas chaves estrangeiras (relatório de testes v155, ESC-01/02): as listas com cânticos e ficheiros
-- (perfil Coro) e as coleções juntam estas tabelas por song_slug / collection_id.
create index if not exists song_files_song_slug_idx on public.song_files (song_slug);
create index if not exists collection_songs_song_slug_idx on public.collection_songs (song_slug);
create index if not exists collection_sections_collection_id_idx on public.collection_sections (collection_id);
create index if not exists song_shares_song_slug_idx on public.song_shares (song_slug);
create index if not exists song_shares_collection_id_idx on public.song_shares (collection_id);
create index if not exists favorites_slug_idx on public.favorites (slug);
create index if not exists song_edits_song_slug_idx on public.song_edits (song_slug);
select 'ok' as indices;
