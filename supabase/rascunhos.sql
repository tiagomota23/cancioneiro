-- Rascunhos de letra só para Maestros (15 nov 2026): letras transcritas automaticamente (gravações, partituras) ficam
-- em lyrics_draft até um Maestro as rever e publicar; os outros perfis continuam a ver «(letra por transcrever)».
-- As colunas novas não têm grant para authenticated (songs só tem grants por coluna): só a função conteudo as lê
-- (op song devolve o rascunho a quem é Maestro ou Gestor; op draft publica ou descarta).
alter table public.songs add column if not exists lyrics_draft jsonb;
alter table public.songs add column if not exists draft_note text;     -- de onde veio (ex.: «transcrito da gravação…»)
alter table public.songs add column if not exists draft_at timestamptz;

-- Migração (uma vez): os rascunhos que estavam na letra pública passam para lyrics_draft. Reconhecem-se pela 1.ª linha
-- entre parênteses: «(rascunho …», «(texto litúrgico …» ou «(letra por transcrever — é a canção …». As linhas de nota
-- (entre parênteses) saem do rascunho e ficam em draft_note.
with d as (
  select slug, coalesce(lyrics_edit, lyrics) l from public.songs
  where lyrics_draft is null and lyrics_edit is null
    and (lyrics->0->'lines'->>0 ~ '^\((rascunho|texto litúrgico)')
), parts as (
  select d.slug,
    (select string_agg(x, ' ') from jsonb_array_elements(d.l) st, jsonb_array_elements_text(st->'lines') x where x ~ '^\(.*\)$') nota,
    (select jsonb_agg(st2) from (
       select jsonb_build_object('type', st->>'type', 'lines', coalesce((select jsonb_agg(x) from jsonb_array_elements_text(st->'lines') x where x !~ '^\(.*\)$'), '[]'::jsonb)) st2
       from jsonb_array_elements(d.l) st) q where jsonb_array_length(st2->'lines') > 0) corpo
  from d
)
update public.songs s set lyrics_draft = p.corpo, draft_note = p.nota, draft_at = now(),
  lyrics = '[{"type": "verse", "lines": ["(letra por transcrever)"]}]'::jsonb, updated_at = now()
from parts p where s.slug = p.slug and p.corpo is not null;
