# Cancioneiro

Webapp móvel (PWA) do cancioneiro: pesquisa por título, autor, número ou palavras da letra/tradução; acordes sobre a letra; tradução alternativa; tamanho de letra ajustável.

- Dados: tabela `songs` no Supabase (ver `schema.sql`), lida com a chave pública *anon* (só leitura via RLS).
- `parse.py` converte o HTML original em JSON; `seed.py` carrega-o no Supabase.
- Alojamento: GitHub Pages.

Formato da letra (`lyrics`/`translation`, jsonb): `[{ "type": "verse" | "chorus", "lines": ["Texto com [Acorde]sílaba", ...] }]`
