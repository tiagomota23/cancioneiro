# Relatório de testes — Cancioneiro v155 (quick)

2026-10-10 12:50 UTC · 1 s · 22 ok, 0 falhas, 1 avisos, 0 não corridos

| Dimensão | ok | falhas | avisos | não corridos |
|---|---|---|---|---|
| Estabilidade — versões | 4 | 0 | 0 | 0 |
| Ligações e navegação — repositório | 3 | 0 | 0 | 0 |
| Segurança — repositório | 11 | 0 | 0 | 0 |
| Usabilidade — padrão de design | 4 | 0 | 1 | 0 |

## Avisos

- **USA-04** viewport não bloqueia o zoom (maximum-scale=1 / user-scalable=no) — viewport «width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover» impede ampliar com os dedos (WCAG 1.4.4); A−/A+ compensa só na letra · gravidade baixa

## Todos os testes

| ID | Teste | Resultado | Detalhe |
|---|---|---|---|
| EST-01 | APP_VERSION, ?v=N (index.html) e CACHE (sw.js) coincidem | ok | v155 |
| EST-02 | APP_VERSION tem a data e o formato «AAAA-MM-DD vN» | ok |  |
| EST-03 | sw.js: todos os ficheiros do SHELL existem | ok |  |
| EST-04 | sw.js: a versão do supabase-js no CDN e no index.html é a mesma da CSP | ok |  |
| LNK-01 | Todas as referências locais (href/src) das páginas existem | ok |  |
| LNK-02 | manifest.json: ícones existem, start_url e scope relativos | ok |  |
| LNK-03 | Ficheiros referidos no app.js (vendor, worker, sw) existem | ok |  |
| SEG-01 | CSP presente em index/admin/drive com object-src none e base-uri self | ok |  |
| SEG-02 | Hash CSP dos scripts inline (admin.html, drive.html) corresponde ao conteúdo | ok |  |
| SEG-03 | supabase-js do CDN tem SRI (integrity + crossorigin) e versão fixa | ok |  |
| SEG-04 | Nenhum segredo no repositório (service_role, chaves Groq/Resend/Google, tokens) | ok |  |
| SEG-05 | config.js só tem a chave anon (role=anon) | ok |  |
| SEG-06 | Nenhuma letra de cântico versionada (songs.json, seed/ fora do repositório) | ok |  |
| SEG-07 | Ficheiros vendor (pdf.js, pdf-lib) iguais à referência | ok |  |
| SEG-08 | Funções do servidor: CORS do conteudo só para o GitHub Pages; OIDC com repo/ramo/workflow fixos | ok |  |
| SEG-09 | Workflows: permissões mínimas, ações com versão, sem segredos em claro | ok |  |
| SEG-10 | SQL do repositório: o filtro «approved» da política «leitura familia» (novos.sql) está no esquema | ok |  |
| SEG-11 | conteudo «shared» com songs:true devolve só os campos previstos e a letra sem acordes (noChords) | ok |  |
| USA-01 | theme.css gerado de design/tokens.json está atualizado (tools/theme/build.mjs --check) | ok |  |
| USA-05 | Tokens: on-brand sobre brand e brand-deep ≥ 4.5:1 (design/tokens.json) | ok | brand #10835c 4.75:1, brand-deep #0b6b4b 6.52:1 |
| USA-02 | styles.css não usa cores fixas fora de theme.css (exceto na secção COMPONENTES documentada) | ok |  |
| USA-03 | Botões só com ícone têm aria-label (index.html) | ok |  |
| USA-04 | viewport não bloqueia o zoom (maximum-scale=1 / user-scalable=no) | aviso | viewport «width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover» impede ampliar com os dedos (WCAG 1.4.4); A−/A+ compensa só na letra |
