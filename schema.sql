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
