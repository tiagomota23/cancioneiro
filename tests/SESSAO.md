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

## Estado (2026-11-15)

- Última corrida completa: **v229, 2026-11-09 (semanal)** — 234 ok, 1 falha, 0 avisos, 1 não corrido (COM-02, WebKit). Relatório `tests/reports/2026-11-09-v229-full.md`.
- FUN-71 (tutorial, falha da v229) **corrigido na v230 e re-testado a 2026-11-09 com autorização do Tiago: ok** nos 4 perfis a 390×844, 375×667 e 360×640 (relatório `tests/reports/2026-11-09-v230-quick.md`).
- **v231 (a829cc7, pesquisa por página com as vizinhas):** FUN-73 escrito, por correr — aguarda autorização do Tiago (`--only=FUN-73`, ~1 min); senão corre na semanal de 2ª.
- **v232 (d238e6b, pesquisa nova: busca.js + conteudo v33):** escritos BUS-01 (motor em Node com o fixture), EST-05 e SEG-38 (static), FUN-74 (?demo: erros e visibilidade por perfil), FUN-75 (modo real simulado: números sem servidor, cache, sem rede). Por correr — aguardam autorização do Tiago (`--only=FUN-73,FUN-74,FUN-75,BUS-01,EST-05,SEG-38`, ~3 min); senão na semanal de 2ª. A pesquisa com sessão real em produção não é testável sem conta de teste (ver Pendentes no catálogo).
- **v233 (f217afa, texto dos PDF: song_texts, pdf-texto, conteudo v34):** escritos BUS-02, SEG-39 (static), SEG-46 (db), SEG-47 (live, só 401), INT-23 (db), FUN-76 (modo real simulado). Por correr com os da v231/v232 — aguardam autorização do Tiago (`--only=FUN-73,FUN-74,FUN-75,FUN-76,BUS-,EST-05,SEG-38,SEG-39,SEG-46,SEG-47,INT-23`, ~4 min); senão na semanal de 2ª. Achado da `op match` (trechos de partituras ao perfil Cancioneiro) corrigido pela webapp na v234 (340144a, conteudo v36); SEG-39 e BUS-02 verificam a correção.
- **v235 (0066596, «A procurar…» na pesquisa):** FUN-77 escrito (modo real simulado com `searchDelay`), por correr com os anteriores — `--only=FUN-73,FUN-74,FUN-75,FUN-76,FUN-77,FUN-78,BUS-,EST-05,SEG-38,SEG-39,SEG-46,SEG-47,INT-23` (~6 min) quando o Tiago autorizar; senão na semanal de 2ª.
- **v236 (55664e6, texto ao vivo no som; conteudo v37):** FUN-78 escrito (browser próprio com `--use-fake-device-for-media-stream`; `mockSupabase` simula `transcribe` com `mode.transcribe`), por correr com os anteriores.
- **v237 (db2c2d9, revisão de recortes dos livros; conteudo v38):** escritos SEG-48 (static), SEG-49 e INT-24 (db), FUN-79 (?demo); SEG-47 passa a cobrir pdf-texto op=locate. Todos os por correr: `--only=FUN-73,FUN-74,FUN-75,FUN-76,FUN-77,FUN-78,FUN-79,FUN-80,BUS-,EST-0,SEG-38,SEG-39,SEG-46,SEG-47,SEG-48,SEG-49,SEG-50,SEG-51,INT-23,INT-24,INT-25` (~8 min) quando o Tiago autorizar; senão na semanal de 2ª. As ops cropset com sessão real não se testam em produção (sem conta de teste e escreveriam): SEG-48 cobre a validação por leitura do código.
- **v238 (9db862c, versão do catálogo + ops songs/files; conteudo v40):** escritos SEG-51, EST-06 (static), SEG-50, INT-25 (db), FUN-80 (modo real simulado). **Achado por leitura (alta), enviado à webapp:** a lista guardada depende do perfil e, no Cancioneiro, das folhas ativas (in_cancioneiro_collection), mas a versão só sobe com cânticos/fontes/etiquetas/ficheiros → lista desatualizada após mudança de perfil ou folha nova do Cancioneiro. Corrigido na v239 (f4d6c2e): listKey = versão | conta | perfil | folhas ativas do Cancioneiro; recheckList depois das folhas e da mudança de perfil; EST-06 verifica.
- **v240 (ded6e1c, warmSheet e pré-descarga 1 s depois):** FUN-81 escrito (mock: op songs devolve as letras do fixture e regista os slugs em calls «songs:a,b,c»). Por correr com os anteriores; acrescentar FUN-81 ao `--only` (~9 min no total).
- **v241 (e150c17, songsBatch sem lotes repetidos):** FUN-82 escrito (mock `songsDelay`). Por correr com os anteriores; `--only` dos por correr: FUN-73..82 (`FUN-7,FUN-80,FUN-81,FUN-82` apanha também FUN-70..72, já ✓), BUS-, EST-05, EST-06, SEG-38..45, INT-23..25.
- **Corrida de 2026-11-15 (v241, autorizada pelo Tiago): os 25 testes escritos de v231 a v241 passam** (`tests/reports/2026-11-15-v241-quick.md`). Erros de teste corrigidos nesta corrida: IDs repetidos (os SEG novos de db/live/static passaram a SEG-46..51; SEG-40..44 continuam a ser os de UI); consultas com «insert/update» em has_table_privilege só dentro de begin…rollback (o sql() recusa-as); SEG-38 aceita o filtro de pdf; FUN-73 sem versões (ficam fora das listas); FUN-79 sem caixa «atual» na demo; FUN-82 como Gestor (sem grupo, Coro e Maestro não veem folhas). Dados: texto dos PDF 1882/1882 (10 sem texto); 27 revisões de recortes pendentes. A semanal de 2ª corre tudo.
- **v242 (60fbaf0, contorno do recorte na página inteira do livro):** FUN-83 escrito, por correr (`--only=FUN-83`, ~30 s) quando o Tiago autorizar; senão na semanal.
- **v243 (eb20d91, zoom na revisão de recortes):** FUN-84 escrito (cliques e beliscão sintéticos: MouseEvent/TouchEvent com clientX/Y). Por correr com FUN-83 (`--only=FUN-83,FUN-84`, ~1 min) quando o Tiago autorizar; senão na semanal.
- **v244 (ff8c8c8):** só aparência (− / + do zoom da revisão passam a .icon-btn 44×44, seletores [data-z] iguais); sem teste novo — FUN-84 continua válido.
- Erros de teste corrigidos nesta semanal: DB-RLS-07/09/11/14/16/17 (o 1.º Maestro por email ficou sem grupos → sem folhas, v210; agora `pinRoleEmails()` fixa por corrida a pessoa de cada perfil, preferindo quem tem grupo); INT-01 (ligações https externas kind other, v226, ficam fora; INT-21 cobre-as); FUN-70 (☰ só na página inicial). Testes novos: SEG-37 (drive-sync v10). Os detalhes dos resultados passam a ter emails tapados («email»).
- Maestro sem grupo: resolvido a 2026-11-15 (a pedido do Tiago, acrescentado aos 5 grupos). pinRoleEmails() continua a preferir quem tem grupo; a pessoa escolhida para o perfil Maestro pode mudar, sem efeito nos testes.
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
