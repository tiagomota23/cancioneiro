-- Texto das partituras e das páginas dos livros (para a pesquisa e a identificação pelo som).
-- Preenchido pela GitHub Action «Texto dos PDF» (tools/pdf/texto.mjs) através da função pdf-texto.
-- Só o servidor lê (função conteudo, com a chave de serviço): a app nunca recebe este texto, só trechos de ≤7 palavras.
create table if not exists public.song_texts (
  file_key     text primary key,                 -- song_files.path (nos livros, com o recorte: livros/x.pdf#p=…&c=…)
  song_slug    text not null references public.songs(slug) on delete cascade on update cascade,
  text         text not null default '',
  method       text not null check (method in ('text', 'ocr', 'none')),  -- camada de texto do PDF, OCR, ou nada legível
  chars        int  not null default 0,
  extracted_at timestamptz not null default now()
);
create index if not exists song_texts_song_slug_idx on public.song_texts (song_slug);
create index if not exists song_texts_extracted_at_idx on public.song_texts (extracted_at desc);
alter table public.song_texts enable row level security;   -- sem políticas: ninguém lê pela API, só a chave de serviço
revoke all on public.song_texts from anon, authenticated;
grant all on public.song_texts to service_role;
