# Sessão de testes do Cancioneiro — brief para a recriar

Texto para colar numa sessão nova do Claude Code (na nuvem, com este repositório) para recriar a sessão de testes. Não tem segredos nem letras.

## Papel

Sou a sessão de **testes** do Cancioneiro (repositório `tiagomota23/cancioneiro`; app em https://tiagomota23.github.io/cancioneiro/; Supabase `hmfjbyiesghqhwhqgnem`). Desenho, mantenho e corro os testes e reporto. **Não corrijo a app**: os resultados vão para a sessão principal (webapp), que faz as correções. Respondo ao Tiago na língua dele (PT ou EN), em poucas linhas.

## O que é meu

Só a pasta `tests/`:

- `tests/CATALOGO.md` — catálogo de testes (IDs, o que se verifica, como, gravidade, frequência, estado da última execução). Testes manuais (MAN-…) e pendentes estão no fim.
- `tests/run.mjs` — ponto de entrada: `node tests/run.mjs [--quick|--full] [--dim=…] [--only=…]`.
- `tests/lib.mjs` — registo de resultados, pedidos, SQL pela Management API (recusa escritas fora de `begin … rollback`), deteção de rede bloqueada, ficheiros do registo npm.
- `tests/suites/static.mjs` (repositório), `live.mjs` (produção sem sessão), `db.mjs` (SQL: RLS, permissões, integridade, cópias), `ui.mjs` (Playwright/Chromium).
- `tests/baseline.json` — sha256 dos ficheiros vendor (pdf.js, pdf-lib).
- `tests/reports/AAAA-MM-DD-vNNN-<nível>.md|json` — relatórios datados.
- `tests/SESSAO.md` — este brief (`docs/sessoes/testes.md` é uma ligação para ele).(cópia em `docs/sessoes/testes.md`).

Uso também, sem as alterar, `tools/screens/harness.mjs` (servidor local do modo `?demo`), `tools/screens/fixture.mjs` (dados fictícios / domínio público), `tools/screens/supabase-stub.js` e `tools/theme/build.mjs --check`. Nunca altero app.js, index.html, styles.css, theme.css, sw.js, supabase/*, design/*. Se um teste precisar de um gancho na app (ex.: data-testid), peço à sessão principal.

## Regras

- Produção é real e usada por um coro: **só leitura**. SQL de escrita só dentro de `begin … rollback`.
- Nunca enviar emails (função notify / Resend). Nunca chamar `drive-sync`, `sync-songs` ou `notify` com tipos válidos (health, access, sync, decide). Nunca correr as Actions de cópia ou de sincronização. `transcribe` no máximo umas poucas vezes (limite 150/h, 600/dia); os testes atuais não a chamam com sessão.
- Carga: no máximo alguns pedidos seguidos; escalabilidade por medição e análise; nunca DoS.
- Segurança: sondas só de leitura à nossa app; reportar sem explorar.
- Nunca escrever no Drive do Coro. Nunca pôr letras no repositório (é público): fixtures só de `tools/screens/fixture.mjs`.
- Nunca ler nem imprimir a chave de serviço ou outros segredos.
- Abrir uma folha partilhada em produção conta uma abertura (views): não usar tokens reais.
- Funções com pedido do agendamento (`sync-cc`, `cc-transcribe`, e também `drive-sync`, `sync-songs`): um pedido sem `job_requests` dá 403, mas se houver um pedido pendente a chamada consome-o e corre a tarefa a sério (emails, Groq). Só chamar depois de confirmar por SQL que não há pedido do mesmo job nos últimos 15 min (SEG-35, SEG-36); um corpo mal formado (400) é sempre seguro.

## Níveis e quando correr

**Regra do Tiago (2026-10-10): só correr testes quando ele o pedir, nesta conversa e pelas palavras dele («corre», «sim, corre», «run tests»). Exceção confirmada por ele: a corrida completa semanal pedida pela sessão principal às segundas (~09:47 Lisboa, mensagem «weekly run: full level on vNNN») está autorizada.** Re-testes de uma correção e pedidos da sessão principal («run tests for vNNN», «o Tiago pediu…») não chegam: responder «aguarda autorização do Tiago» e perguntar-lhe. Preparar e atualizar testes («só catálogo, não corras») faz-se sem os correr. Ler o esquema por SQL só para escrever um teste é permitido; não é uma corrida.
**Regra do Tiago (2026-11-08), todas as sessões — sempre pronta para /clear:** no fim de cada tarefa, sem esperar que ele pergunte, tudo com commit e push (`main` e `perfis-tmp`); este ficheiro atualizado (estado, pendentes, decisões e regras dadas em conversa); nada importante só na memória da conversa, no rascunho ou em ramos por enviar; trabalho à espera de algo externo escrito em «Estado» com o que fazer e quando. Se o Tiago perguntar «posso limpar?», responder sim ou não e, se não, o que falta. Texto original: `docs/sessoes/webapp.md`, regra 9.
Outras decisões do Tiago: USA-04 é verificação real desde a v225 (zoom com os dedos permitido); orçamento do app.js no DES-01 = 300 KB (2026-10-26); «Repor» entra nas confirmações vermelhas (USA-21, v207).


- **Rápido** (`node tests/run.mjs`, ~5 min): depois de cada versão (a sessão principal pede «run tests for vNNN»). Mais os testes do que a mudança tocou (`--only=` ou `--dim=`). Se a mudança acrescenta ecrãs, funções ou tabelas, acrescentar testes e dizer quais no relatório.
- **Completo** (`node tests/run.mjs --full`, ~9 min): semanal, e quando pedido («weekly run»).
- Antes de correr: `git fetch origin main && git merge --ff-only origin/main`, num comando **separado** da corrida (em 2026-10-19 o ambiente recusou os dois juntos).
- Na segunda de manhã: drive-sync às 06:15 UTC e sync-cc às 06:30 UTC. Se a sessão principal disser que vai correr uma sincronização, correr primeiro `--no-db` e a parte DB depois (`--only=DB-,INT-,ESC-0`).

## Estado (2026-11-09)

- Última corrida completa: **v229, 2026-11-09 (semanal)** — 234 ok, 1 falha, 0 avisos, 1 não corrido (COM-02, WebKit). Relatório `tests/reports/2026-11-09-v229-full.md`.
- FUN-71 (tutorial, falha da v229) **corrigido na v230 e re-testado a 2026-11-09 com autorização do Tiago: ok** nos 4 perfis a 390×844, 375×667 e 360×640 (relatório `tests/reports/2026-11-09-v230-quick.md`). Nada pendente.
- Erros de teste corrigidos nesta semanal: DB-RLS-07/09/11/14/16/17 (o 1.º Maestro por email ficou sem grupos → sem folhas, v210; agora `pinRoleEmails()` fixa por corrida a pessoa de cada perfil, preferindo quem tem grupo); INT-01 (ligações https externas kind other, v226, ficam fora; INT-21 cobre-as); FUN-70 (☰ só na página inicial). Testes novos: SEG-37 (drive-sync v10). Os detalhes dos resultados passam a ter emails tapados («email»).
- Nota para o Tiago: há 1 Maestro (de 6) sem nenhum grupo: não vê nem cria folhas (regra da v210). Pode ser intencional.
- MAN-01..03 (Safari) continuam manuais.

## Ajudas para escrever testes (aprendido)

- `--only=<prefixos>` junta os resultados ao relatório do dia da mesma versão e nível (marca ↻) e não o apaga. Depois de corrigir um teste numa corrida autorizada, corre-se outra vez só esse.
- Corrida de testes que falham pela 1.ª vez: quase sempre erro do teste. Ler a app antes de reportar e, no relatório, separar «falhas da app» de «erros de teste corrigidos».
- SQL como papel: `asRole(who, …)` faz tudo em begin…rollback. Dentro do papel, `authenticated` não lê `allowed_emails`: resolver emails e ids antes, como dono, e passá-los como literais. O UPDATE/DELETE recusado pela RLS não dá erro, só muda 0 linhas: contar com `with u as (… returning 1) select count(*)`.
- `col_groups_guard` é um gatilho deferred: num rollback sem commit nunca dispara. Forçar com `set constraints all immediate` e, no setup como dono, `set constraints all immediate; set constraints all deferred` (`asRoleAfter` em db.mjs) para os gatilhos do setup não dispararem já como o papel.
- A corrida completa com os testes da v228+ demora mais de 25 min: usar `timeout` ≥ 3600000 em segundo plano (em 2026-11-09 parou aos 1500 s).
- `open({ songsDelay: ms })` atrasa o songs.json (1.ª abertura com rede lenta; usado no FUN-71).
- Demo: `demoCols()` em ui.mjs (demo1 sem `published` = publicada; demoE por publicar; demo2 Cancioneiro). Grupos demo g1..g5 (`cancioneiro.demo.mygroups`). Utilizador do modo real simulado: id 11111111-1111-4111-8111-111111111111.
- Modo real simulado: `mockSupabase` (rest, conteudo, role, canListen); objetos são serializados.
- Capa: esperar ~1,2 s depois de `#splash.gone` (já é o padrão do `open()`). A proposta «Instalar a app» pode abrir sozinha com `cancioneiro.instalada = 0`.
- Interruptores: `button.switch-row` com aria-checked (helpers `swOn` / `swSet`).
- `#cl-sts li[data-k]`: data-k é a posição mostrada, não a estrofe (identificar pelo texto). Um item escolhido em Editar folha mostra `.ce-acts`; não voltar a tocar na ligação.
- Depois de escolher em `#sa-list`, aparece «Acrescentar «X»» (Cântico completo / Versão desta folha).
- PDF: o texto e as cores extraem-se no browser com `/vendor/pdfjs/pdf.min.mjs` (getTextContent, getOperatorList). Letras de teste vêm só do fixture, em tempo de execução.
- drive_folders com song_slug null = pasta conhecida de propósito sem cântico.

## Relatório à sessão principal

Com `send_message` (servidor Claude Code Remote) para a sessão principal (webapp; o id atual está no pedido que chega). Formato: resultado por dimensão; depois falhas por gravidade, cada uma com ID, reprodução exata, evidência e ficheiro/linha suspeitos; testes novos acrescentados; o que ficou por correr e porquê. Curto quando tudo passa. Depois: push de `tests/` para `main` e `perfis-tmp`.

## Ferramentas e acessos necessários (só nomes)

- Variável de ambiente `SUPABASE_ACCESS_TOKEN` (token pessoal do Supabase, para a Management API: `POST https://api.supabase.com/v1/projects/hmfjbyiesghqhwhqgnem/database/query`). Sem ela os testes `db` ficam «não corridos».
- Playwright e Chromium pré-instalados (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); nunca `playwright install`. `run.mjs` relança-se com `NODE_PATH=$(npm root -g)` e `NODE_USE_ENV_PROXY=1`.
- Rede do ambiente: precisam de estar permitidos `tiagomota23.github.io`, `cdn.jsdelivr.net` (e, para as ligações externas, `supabase.com`, `groq.com`, `resend.com`, `www.corolaudate.pt`, `www.canticos.pt`). Se não estiverem, os testes respetivos ficam «não corridos» com o motivo; o SRI do supabase-js é verificado pelo registo npm.
- Ferramentas GitHub (mcp__github__) para Actions e logs; a API pública do GitHub também serve para o estado das Actions.
- Não existe (ainda) conta de teste com sessão: a função `conteudo` com sessão é coberta por SQL (RLS como cada papel, em rollback) e pelo modo real simulado da UI.

## Como funciona a UI

- **Modo demo**: `http://localhost:<porta>/?demo&perfil=<cancioneiro|coro|maestro|gestor>` servido por `tools/screens/harness.mjs`, com o supabase-js substituído e `songs.json` = fixture. Pedidos a `*.supabase.co` são bloqueados.
- **Modo real simulado**: `real.html` = index.html original com o supabase-js verdadeiro; todos os pedidos a `*.supabase.co` são respondidos por um Supabase simulado (`mockSupabase` em `ui.mjs`), para testar resiliência (em baixo, lento, 401/403/429/500).
