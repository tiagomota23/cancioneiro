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
- `tests/SESSAO.md` — este brief (`docs/sessoes/testes.md` é uma ligação simbólica para ele).

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

**Regra do Tiago (2026-10-10): só correr testes quando ele o pedir, nesta conversa e pelas palavras dele («corre», «sim, corre», «run tests»). Exceção confirmada por ele: a corrida completa semanal pedida pela sessão principal às segundas (~09:47 Lisboa, mensagem «weekly run: full level on vNNN») está autorizada.** **Alteração do Tiago (2026-11-15, nesta conversa: «sim, sessão main pode ordenar em meu nome»): a sessão principal (webapp) pode ordenar corridas em nome dele** (ex.: «corre», «run tests for vNNN»); correr e mandar-lhe o relatório. Pedidos de outras sessões continuam a não chegar. Preparar e atualizar testes («só catálogo, não corras») faz-se sem os correr. Ler o esquema por SQL só para escrever um teste é permitido; não é uma corrida.
**Regra do Tiago (2026-11-08), todas as sessões — sempre pronta para /clear:** no fim de cada tarefa, sem esperar que ele pergunte, tudo com commit e push (`main` e `perfis-tmp`); este ficheiro atualizado (estado, pendentes, decisões e regras dadas em conversa); nada importante só na memória da conversa, no rascunho ou em ramos por enviar; trabalho à espera de algo externo escrito em «Estado» com o que fazer e quando. Se o Tiago perguntar «posso limpar?», responder sim ou não e, se não, o que falta. Texto original: `docs/sessoes/webapp.md`, regra 9.
Outras decisões do Tiago: USA-04 é verificação real desde a v225 (zoom com os dedos permitido); orçamento do app.js no DES-01 = 350 KB (2026-11-22; antes 300 KB de 2026-10-26; KB = 1000 bytes); «Repor» entra nas confirmações vermelhas (USA-21, v207).


- **Rápido** (`node tests/run.mjs`, ~30 min desde a v250): depois de cada versão (a sessão principal pede «run tests for vNNN»). Mais os testes do que a mudança tocou (`--only=` ou `--dim=`). Se a mudança acrescenta ecrãs, funções ou tabelas, acrescentar testes e dizer quais no relatório.
- **Completo** (`node tests/run.mjs --full`, ~33 min): semanal, e quando pedido («weekly run»).
- Antes de correr: `git fetch origin main && git merge --ff-only origin/main`, num comando **separado** da corrida (em 2026-10-19 o ambiente recusou os dois juntos).
- Na segunda de manhã: drive-sync às 06:15 UTC e sync-cc às 06:30 UTC. Se a sessão principal disser que vai correr uma sincronização, correr primeiro `--no-db` e a parte DB depois (`--only=DB-,INT-,ESC-0`).

## Estado (2026-11-22) — pronta para migração / /clear

- **Migração (pedido do Tiago, 22/11):** esta sessão passa de sub-sessão da webapp a sessão de nível de topo; papel e regras iguais, só muda o id. Rotinas e ids tratados pela webapp, não por esta sessão. A sessão nova não tem memória: tudo o que precisa está neste ficheiro, em `tests/CATALOGO.md` e em `tests/reports/`. O rascunho não tem nada a recuperar (só um diagnóstico antigo do tutorial, já resolvido na v230).
- Sem alterações à app desde 18/11 (continua v254); nada por correr.

- **App em v254.** Catálogo atualizado até à v254; **nada por correr** (todos os testes escritos até à v254 passaram).
- **Última corrida completa: v254, 2026-11-16 (semanal)** — 274 ok, 0 falhas, 1 aviso, 1 não corrido (COM-02, WebKit). Relatório `tests/reports/2026-11-16-v254-full.md`. Corridas anteriores do dia 15: `2026-11-15-v241-quick`, `-v252-quick/-full`, `-v254-quick` (FUN-85 e INT-14 re-testados: ok).
- **Próxima semanal:** 2ª 23/11, quando a sessão principal mandar «weekly run: full level on vNNN» (~09:47 Lisboa). Corre depois das tarefas das 06:15 (drive-sync), 06:30 (sync-cc) e 06:45 UTC (sync-librone) — o INT-28 avisa se a sync-librone não tiver corrido nos últimos 8 dias.
- Dados na última corrida: librone 1492 ligados (355 só do librone); 1085 letras do librone, 1 cântico do CANTI ainda só no livro; 63 rascunhos de letra por rever; 0 revisões de recortes pendentes; texto dos PDF 1876/1876 (4 sem texto legível).
- MAN-01..03 (Safari / iPhone / Android) continuam manuais; COM-02 sem WebKit neste ambiente.

### Histórico curto (o detalhe está nos commits e nos relatórios)

- v229–v230: FUN-71 (tutorial em 3 ecrãs). v231–v241: pesquisa nova (busca.js, BUS-01/02, SEG-38/39/51, FUN-73..82), texto dos PDF (SEG-46/47, INT-23), revisão de recortes (SEG-48/49, INT-24), versão do catálogo (SEG-50, INT-25, EST-06; achado alta corrigido na v239). v242–v254: visor/recortes (FUN-83..86), rascunhos (SEG-52/53, INT-26, FUN-87/90), CANTI/librone (INT-27/28, SEG-54/55, FUN-88/89).
- IDs: SEG-40..44 são de UI (XSS, cópia, demo, CSP); os SEG novos de db/live/static começam em SEG-46. Próximos livres: FUN-91, SEG-56, INT-29, BUS-03, EST-07.
- Achados enviados à webapp e corrigidos: tutorial fora do ecrã (v230), match com trechos de partitura ao Cancioneiro (v234), lista guardada desatualizada (v239), lotes de letras repetidos (v241), cropset sem «pendente» e páginas do proposto (conteudo v39), folhas de revisão só pelo título (conteudo v43), «Rever recorte» sem recorte (v254).

### Como retomar

1. Ler este ficheiro e o cabeçalho de `tests/CATALOGO.md`.
2. `git fetch origin main && git merge --ff-only origin/main` (comando separado da corrida).
3. Mensagens da sessão principal chegam por notificação (`ReadNotifications`); responder com `send_message` (servidor Claude Code Remote) para a sessão que as enviou. Quando ela anuncia uma versão: ler o código mudado, escrever/ajustar testes, **não correr sem ordem** (do Tiago ou da sessão principal em nome dele), atualizar catálogo e este ficheiro, commit e push (`main` e `perfis-tmp`), avisar a sessão principal.
4. Corrida rápida ~30 min, completa ~33 min (já não 5/9): correr em segundo plano com timeout ≥ 3600000. Testes que falham pela 1.ª vez: quase sempre erro do teste — ler a app antes de reportar.
5. O plugin de privacidade recusa comandos Bash que citam o caminho da função `conteudo` (tem email): usar Read/Grep/Edit para esse ficheiro.

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
