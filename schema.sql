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
  updated_at           timestamptz not null default now()
);
create index if not exists songs_number_idx on public.songs (number);

alter table public.songs enable row level security;
drop policy if exists "leitura pública" on public.songs;
create policy "leitura pública" on public.songs for select to anon, authenticated using (true);
