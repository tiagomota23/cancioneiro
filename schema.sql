-- Cancioneiro: tabela de cânticos
create table if not exists public.songs (
  id                   bigint generated always as identity primary key,
  slug                 text unique not null,
  number               int  not null,
  title                text not null,
  author               text,
  language             text not null,          -- código ISO (pt, it, en, la, es, fr, ...)
  lyrics               jsonb not null,         -- [{type: 'verse'|'chorus', lines: ['texto com [acordes]', ...]}]
  translation          jsonb,                  -- mesma estrutura que lyrics
  translation_language text,
  has_chords           boolean not null default false,
  pdf_url              text,
  book_page            int,                    -- página no livro impresso
  updated_at           timestamptz not null default now()
);
create index if not exists songs_number_idx on public.songs (number);

alter table public.songs enable row level security;
drop policy if exists "leitura publica" on public.songs;
create policy "leitura publica" on public.songs for select to anon, authenticated using (true);

-- Emails autorizados e verificação de acesso
create table if not exists public.allowed_emails (email text primary key);
alter table public.allowed_emails enable row level security;
create or replace function public.is_allowed() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.allowed_emails where email = lower(coalesce(auth.jwt() ->> 'email', ''))) $$;
-- Cânticos: só utilizadores autorizados
drop policy if exists "leitura publica" on public.songs;
create policy "leitura familia" on public.songs for select to authenticated using (public.is_allowed());
revoke select on public.songs from anon;

-- Preferidos por utilizador
create table if not exists public.favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text not null references public.songs(slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);
alter table public.favorites enable row level security;
create policy "favoritos ler" on public.favorites for select to authenticated using (user_id = auth.uid() and public.is_allowed());
create policy "favoritos inserir" on public.favorites for insert to authenticated with check (user_id = auth.uid() and public.is_allowed());
create policy "favoritos apagar" on public.favorites for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.favorites to authenticated;

-- Verificação semanal do site original (função sync-songs)
alter table public.songs add column if not exists source_hash text;  -- impressão digital do bloco HTML de origem
create table if not exists public.sync_log (
  id bigint generated always as identity primary key, run_at timestamptz not null default now(),
  added jsonb not null default '[]', updated jsonb not null default '[]', baseline int not null default 0, error text
);
alter table public.sync_log enable row level security;
create policy "registo ler" on public.sync_log for select to authenticated using (public.is_allowed());
-- set_source_hashes(jsonb): regista a impressão inicial (só service_role)
-- cron: select cron.schedule('cancioneiro-verificacao-semanal', '0 5 * * 1', $$ select net.http_post(url := '<SUPABASE_URL>/functions/v1/sync-songs', headers := ..., body := '{}'::jsonb) $$);

-- Fontes, etiquetas e ficheiros (Coro CLU e outras fontes)
-- "original" = cancioneiro.marriaga.com; um cântico pode ter várias fontes.
create table public.song_sources (
  song_slug text references public.songs(slug) on delete cascade on update cascade,
  source text check (source in ('original','coro_clu','canti2024','songbook')), ref text,
  primary key (song_slug, source));
create table public.song_tags (
  song_slug text references public.songs(slug) on delete cascade on update cascade,
  grp text, tag text, primary key (song_slug, grp, tag));   -- ex.: ('Coro CLU — momento', 'Comunhão')
create table public.song_files (
  id bigint generated always as identity primary key,
  song_slug text references public.songs(slug) on delete cascade on update cascade,
  kind text check (kind in ('recording','score','other')), label text, path text unique,  -- caminho no bucket "coro"
  mime text, size bigint, drive_id text unique, sort int default 0, created_at timestamptz default now());
-- RLS: leitura só para emails autorizados (is_allowed) nas três tabelas; nada para anon.
-- Os cânticos do site original recebem a fonte 'original' (trigger cancioneiro_song_original, quando source_hash não é nulo).
-- Storage: bucket privado "coro"; policy "coro ler" (select, authenticated, is_allowed()). A app usa URLs assinados.
-- Importação: função supabase/functions/coro-import (cabeçalho x-import-token = segredo IMPORT_TOKEN).

-- Direitos de autor e edição de letras (a letra original nunca é alterada)
alter table public.songs add column if not exists rights text;
alter table public.songs add column if not exists lyrics_edit jsonb;
alter table public.songs add column if not exists edited_by text;
alter table public.songs add column if not exists edited_at timestamptz;
create table if not exists public.song_edits (
  id bigint generated always as identity primary key,
  song_slug text references public.songs(slug) on delete cascade on update cascade,
  old_lyrics jsonb, new_lyrics jsonb, edited_by text, edited_at timestamptz not null default now());
alter table public.song_edits enable row level security;
drop policy if exists "edicoes ler" on public.song_edits;
create policy "edicoes ler" on public.song_edits for select to authenticated using (public.is_allowed());
revoke all on public.song_edits from anon, authenticated;
grant select on public.song_edits to authenticated;
create or replace function public.song_edit_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lyrics_edit is distinct from old.lyrics_edit then
    new.edited_by := auth.jwt() ->> 'email';
    new.edited_at := now();
    insert into public.song_edits (song_slug, old_lyrics, new_lyrics, edited_by)
      values (new.slug, coalesce(old.lyrics_edit, old.lyrics), new.lyrics_edit, new.edited_by);
  end if;
  return new;
end $$;
drop trigger if exists cancioneiro_song_edit on public.songs;
create trigger cancioneiro_song_edit before update on public.songs for each row execute function public.song_edit_stamp();
revoke insert, update, delete on public.songs from anon, authenticated;
grant update (lyrics_edit) on public.songs to authenticated;
drop policy if exists "canticos editar letra" on public.songs;
create policy "canticos editar letra" on public.songs for update to authenticated using (public.is_allowed()) with check (public.is_allowed());

-- Proteção contra cópias em massa (v40): a letra e os ficheiros só saem pela função `conteudo`, um cântico de cada vez e com limites
create table if not exists public.access_log (
  id bigint generated always as identity primary key,
  user_id uuid not null, email text, kind text not null, key text, at timestamptz not null default now());
create index if not exists access_log_user_kind_at on public.access_log (user_id, kind, at desc);
alter table public.access_log enable row level security; -- sem políticas: só service_role
alter table public.songs add column if not exists has_translation boolean generated always as (translation is not null) stored;
alter table public.songs add column if not exists is_edited boolean generated always as (lyrics_edit is not null) stored;
-- As edições passam a ser gravadas pela função `conteudo` (service_role), que indica o autor em edited_by
create or replace function public.song_edit_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lyrics_edit is distinct from old.lyrics_edit then
    new.edited_by := coalesce(auth.jwt() ->> 'email', new.edited_by);
    new.edited_at := now();
    insert into public.song_edits (song_slug, old_lyrics, new_lyrics, edited_by)
      values (new.slug, coalesce(old.lyrics_edit, old.lyrics), new.lyrics_edit, new.edited_by);
  end if;
  return new;
end $$;
-- Permissões mínimas: o browser só lê o índice (sem letra) e gere os favoritos
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant select (id, slug, number, book_page, title, author, language, translation_language, has_chords, has_translation,
  pdf_url, rights, is_edited, edited_by, edited_at) on public.songs to authenticated;
grant select on public.song_sources, public.song_tags, public.song_files, public.sync_log to authenticated;
grant select, insert, delete on public.favorites to authenticated;
drop policy if exists "canticos editar letra" on public.songs;
drop policy if exists "coro ler" on storage.objects; -- ficheiros do bucket `coro` só por URL assinado pela função `conteudo`
-- Partituras (antes em /partituras no site público) estão agora no bucket privado `coro`, em partituras/<nome>.pdf
update public.songs set pdf_url = lower(pdf_url) where pdf_url like 'partituras/%';

-- Perfis de utilizador (v42): ver supabase/perfis.sql
