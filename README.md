# Cancioneiro

Webapp móvel (PWA) do cancioneiro: pesquisa por título, autor, número ou palavras da letra/tradução; acordes sobre a letra; tradução alternativa; tamanho de letra ajustável.

- Dados: tabela `songs` no Supabase (ver `schema.sql`), lida com a chave pública *anon* (só leitura via RLS).
- `parse.py` converte o HTML original em JSON; `seed.py` carrega-o no Supabase.
- Alojamento: GitHub Pages.

Formato da letra (`lyrics`/`translation`, jsonb): `[{ "type": "verse" | "chorus", "lines": ["Texto com [Acorde]sílaba", ...] }]`

## Verificação semanal
A função `supabase/functions/sync-songs` (agendada com pg_cron às segundas, 05:00 UTC) lê https://cancioneiro.marriaga.com/index.html,
acrescenta cânticos novos e atualiza os que mudaram (comparando a impressão digital `source_hash` de cada bloco). Cânticos apagados na origem não são apagados aqui.
Cada execução fica registada na tabela `sync_log` e aparece no ecrã ⓘ da app.

## Fontes e Coro CLU
Cada cântico tem uma ou mais fontes (`song_sources`): `original` (site cancioneiro.marriaga.com) e `coro_clu` (Drive do Coro CLU).
No ecrã ⓘ, "Mostrar cânticos de" permite voltar a ver só o Cancioneiro original, tal como era.
Os cânticos do Coro CLU têm etiquetas (`song_tags`: para a Missa / para Gestos / momentos da Missa) e ficheiros (`song_files`):
gravações por voz (AAC) e partituras, guardados no bucket privado `coro` do Supabase Storage.
Os scripts de importação ficam em `drive-coro-clu/` (fora do git).
