# Catálogo de testes — Cancioneiro

Fonte única dos testes da app. Os automáticos correm com `node tests/run.mjs`; os manuais estão no fim, com o passo a passo.
Cada execução escreve um relatório datado em `tests/reports/AAAA-MM-DD-vNNN-<nível>.md` (e `.json`).

```
node tests/run.mjs --only=FUN-3,SHR       # só alguns testes (prefixos de ID)
node tests/run.mjs            # rápido: depois de cada versão (≈ 4 min)
node tests/run.mjs --full     # completo: semanal (≈ 8 min)
node tests/run.mjs --dim=seguranca        # só uma dimensão (funcionalidade, ligacoes, estabilidade, resiliencia,
                                          #   escalabilidade, usabilidade, seguranca, integridade, compatibilidade)
node tests/run.mjs --dim=static,live      # ou por suite: static, live, db, ui;  --no-ui / --no-db / --no-live
```

**Regras** — produção é real: os testes só leem. SQL de escrita só dentro de `begin … rollback` (o próprio `sql()` recusa o resto); nunca se chama `drive-sync`, `sync-songs`, `notify` (health/access/sync/decide válidos), nem `transcribe` com sessão; nunca se escreve no Drive do Coro; carga ≤ 3 pedidos seguidos. A UI corre no modo `?demo` em localhost com os dados fictícios de `tools/screens/fixture.mjs`, ou no «modo real» com o Supabase **simulado** (todos os pedidos a `*.supabase.co` são intercetados; nada sai para produção). Nenhuma letra real entra no repositório.

**Colunas** — *Como*: suite automática (`static` repositório · `live` produção sem sessão · `db` SQL pela Management API · `ui` Playwright/Chromium) ou `manual`. *Freq.*: **V** cada versão (`--quick`) · **S** semanal (`--full`) · **M** mensal (manual). *Estado*: resultado da última execução completa (✓ ok · ✗ falha · ! aviso · – não corrido · ☐ manual por fazer).

Última execução completa: **v158, 2026-10-10** — 156 ok · 0 falhas · 1 aviso (USA-04, decisão) · 1 não corrido (WebKit). Relatório `tests/reports/2026-10-10-v158-full.md` (SEG-34 corrigido no teste depois dessa execução).

---

## 1. Funcionalidade (interface, por perfil)

| ID | O que se verifica | Como | Grav. | Freq. | Estado |
|---|---|---|---|---|---|
| FUN-01.{gestor,maestro,coro,cancioneiro} | Arranque em cada perfil: índice com cânticos, sem erros JS | ui | alta | V | ✓ |
| FUN-02 | Pesquisa por título, autor e palavra da letra; botão limpar | ui | alta | V | ✓ |
| FUN-03 | Cântico: título, letra, botões original ↔ tradução | ui | alta | V | ✓ |
| FUN-04 | A−/A+ (limites 12–40 px) e escolha guardada depois de recarregar | ui | alta | V | ✓ |
| FUN-05 | Modo escuro: alterna e volta a seguir o sistema | ui | alta | V | ✓ |
| FUN-06 | Acordes: Coro mostra/esconde; Cancioneiro nunca recebe acordes | ui | alta | V | ✓ |
| FUN-07 | Preferidos: ☆ marca/desmarca, lista Preferidos atualiza | ui | alta | V | ✓ |
| FUN-07b | Estrela no Maestro/Gestor: sem .book, .on só nos Preferidos, aria-label «Coleções e folhas», abre #col-pick (v187) | ui | média | V | ☐ por correr |
| FUN-08 | Gaveta ☰: livros e folhas; fecha ao tocar fora | ui | alta | V | ✓ |
| FUN-09 | Folhas por perfil e público; expiradas só para Maestro | ui | alta | V | ✓ |
| FUN-10 | Folha publicada (Maestro): só leitura, partilhar e «Editar folha» (#col-mode) no fim da lista; sem body.col-editing (v164) | ui | alta | V | ☐ por correr |
| FUN-11 | Nova folha: público segmentado (#col-aud), «Criar» sem «Apagar», abre logo a edição (#col-ed); aparece na gaveta (v164/v165) | ui | alta | V | ☐ por correr |
| FUN-12 | Template só no diálogo «Nova folha» (#col-tpl-sel, «Criar ou mudar templates…»); a janela de edição não tem template (v164) | ui | média | V | ☐ por correr |
| FUN-13 | Novo cântico (Coro) fica «por aprovar» em Novos Cânticos («por aprovar» em .n, v177; sem número, v179) | ui | alta | V | ✓ |
| FUN-13b | Novo cântico de um Maestro também fica por aprovar (v165) | ui | média | V | ☐ por correr |
| FUN-13c | Apagar cântico novo aprovado só em «Editar cântico» (#sn-del, confirmação, volta a Novos Cânticos); #sn-del escondido nos outros (v166) | ui | média | V | ☐ por correr |
| FUN-14 | Editar letra (Maestro) e ver a edição | ui | alta | V | ✓ |
| FUN-15 | Gravações: mini-leitor abre e para | ui | alta | V | ✓ |
| FUN-16 | Partitura: pdf.js desenha, zoom +/−, Voltar | ui | alta | V | ✓ |
| FUN-17 | Partilhar cântico gera `#/p/<código>` | ui | alta | V | ✓ |
| FUN-17b | Partilhar letra: copia sempre; telemóvel «Partilhar letra» + navigator.share({title,text}); computador «Copiar letra» + aviso «Letra copiada» (v188) | ui | média | V | ☐ por correr |
| FUN-18 | Endereço partilhado sem conta: letra sem acordes | ui | alta | V | ✓ |
| FUN-19 | Endereço partilhado inválido/expirado: mensagem clara | ui | alta | V | ✓ |
| FUN-20 | Folha partilhada sem conta: secções e abrir cânticos | ui | alta | V | ✓ |
| FUN-21 | Gestão de utilizadores: Gestor vê utilizadores e pedidos; Coro não | ui | alta | V | ✓ |
| FUN-22 | Perfil: só perfis até ao da pessoa; perfil inferior esconde funções | ui | alta | V | ✓ |
| FUN-23 | Terminar sessão limpa a lista e volta à entrada | ui | alta | V | ✓ |
| FUN-24 | Ecrã de entrada: botão Google e ligação Privacidade | ui | alta | V | ✓ |
| FUN-24b | Regresso do Google (?code=): a capa fica ~2 s como numa abertura normal (v173) | ui | baixa | V | ☐ por correr |
| FUN-25 | Tutorial na 1.ª vez; «Saltar» não volta a mostrar | ui | média | V | ✓ |
| FUN-26 | Proposta de instalar (Perfil / Informação) | ui | baixa | V | ✓ |
| FUN-27 | Pesquisa por voz: janela «A ouvir», línguas, Cancelar (sem transcrever) | ui | média | V | ✓ |
| FUN-28 | Exportar PDF de uma folha (pdf-lib) | ui | média | S | ✓ |
| FUN-29 | Rotas desconhecidas, cânticos inexistentes e endereços mal codificados não partem a app | ui | média | S | ✓ |
| FUN-30 | Ligação direta a um cântico sobrevive a recarregar | ui | alta | S | ✓ |
| FUN-31 | Categorias e livros (latim, Songbook, Novos) | ui | média | S | ✓ |
| FUN-31b | Filtro de Novos Cânticos: Todos / Por aprovar / Só no Coro / No Cancioneiro, por esta ordem (v178/v180) | ui | baixa | S | ☐ por correr |
| FUN-32 | Aprovar cântico novo: «Aprovar para…»; Cancelar não aprova; aprovar põe sempre no Coro e, se Cancioneiro, também promove (v172); «Recusar» .danger-btn (v177); confirmação «Aprovar…» depois da escolha, Cancelar não aprova (v181) | ui | média | S | ☐ por correr |
| FUN-33 | Página inicial: títulos de secção só acima de categorias com cânticos; Cancioneiro sem título acima de «Todos os cânticos»; «Momentos da Missa»; nomes curtos nunca vazios (v151–v155) | ui | média | V | ✓ |
| FUN-34 | Páginas de categoria: antetítulo `.list-kicker` = secção (Coro+), ausente no perfil Cancioneiro (v151/v153) | ui | média | V | ✓ |
| FUN-35 | Menu ☰: Preferidos e Novos Cânticos no topo sem título; «Livros» e «Folhas»; vazias escondidas; Livros do Cancioneiro só com o Cancioneiro (v165); perfil Cancioneiro sem título «Livros» (v184) | ui | média | V | ☐ por correr |
| FUN-36 | Tutorial do Maestro chega ao passo «+ Nova folha» com o botão visível (v154) | ui | média | V | ✓ |
| SHR-01 | Folha partilhada: lista traz a letra de todos os cânticos, sem acordes, guardada em `cancioneiro.partilhados` (v150) | ui | alta | V | ✓ |
| SHR-02 | Folha partilhada: abrir cântico sem pedidos à rede e sem rede (v150) | ui | alta | V | ✓ |
| SHR-03 | Folha partilhada sem rede depois de recarregar (SW + armazenamento) (v150) | ui | média | V | ✓ |
| SHR-04 | Partilhas expiradas apagadas do armazenamento (v150) | ui | baixa | V | ✓ |
| SHR-05 | Cântico partilhado sozinho guardado e aberto sem rede (v150) | ui | média | V | ✓ |
| SHR-06 | Preferidos: letras descarregadas ao abrir (modo real simulado) (v150) | ui | média | V | ✓ |
| MAN-15 | Produção: abrir uma folha partilhada conta 1 abertura (views +1) e abrir cânticos não conta — só com uma folha de teste criada para isso | manual | média | por mudança | ☐ |
| FUN-37 | Folha por publicar invisível a Coro e Cancioneiro (gaveta e endereço); Maestro vê com o ícone de rascunho (svg.book-ic role=img, aria-label «Não publicada»), sem texto (v162) | ui | alta | V | ☐ por correr |
| FUN-38 | Editar folha numa cópia: nada grava até «Guardar» (#ce-save → por publicar); «Cancelar» com alterações confirma e deita fora; #col-pub só em folhas por publicar; folha vazia não se publica (v165); «Publicar» pede confirmação, Cancelar não publica (v181) | ui | alta | V | ☐ por correr |
| FUN-39 | Edição: .ce-acts (up/down/del/ok); Descer muda a ordem; Apagar pede confirmação; secção escolhida tem .ce-name (v165) | ui | alta | V | ☐ por correr |
| FUN-40 | Edição: «+ Adicionar cântico» por secção (Comunhão pré-preenchida, Saída vazia); «+ Adicionar secção» no fim (v164) | ui | média | V | ☐ por correr |
| FUN-42 | Edição: várias mudanças só gravam com «Guardar» (antes, nada muda); recarregar mostra todas, incluindo a ordem (v165) | ui | alta | V | ☐ por correr |
| MAN-10 | Entrada real com Google (telemóvel e computador/janela), pedido de acesso, email ao Gestor, autorizar pelo link | manual | crítica | M | ☐ |
| MAN-11 | Pesquisa por voz real (iPhone e Android): microfone, transcrição Groq, identifica o cântico | manual | alta | M | ☐ |
| MAN-12 | Gravar/enviar gravação e partitura real (Maestro), apagar ficheiro enviado | manual | alta | M | ☐ |
| MAN-13 | «Gerar de URL» e «Gerar de PDF» no Novo cântico | manual | média | M | ☐ |
| MAN-14 | Partilha nativa (menu Partilhar do sistema) no iPhone/Android | manual | média | M | ☐ |

## 2. Ligações e navegação

| ID | O que se verifica | Como | Grav. | Freq. | Estado |
|---|---|---|---|---|---|
| LNK-01 | Todos os href/src locais de index, admin, drive, privacidade existem | static | média | V | ✓ |
| LNK-02 | manifest.json: ícones existem; start_url/scope relativos | static | média | V | ✓ |
| LNK-03 | Ficheiros referidos pelo app.js (vendor, worker, sw) existem | static | média | V | ✓ |
| LNK-10 | Página publicada responde 200 | live | alta | V | ✓ |
| LNK-11 | Versão publicada = repositório (index ?v=, app.js, sw.js) | live | alta | V | ✓ |
| LNK-12 | Todos os recursos da página publicada respondem 200 | live | alta | V | ✓ |
| LNK-13 | privacidade, admin, drive, manifest, ícones, vendor publicados | live | alta | V | ✓ |
| LNK-14 | Endereço inexistente → 404 | live | baixa | V | ✓ |
| LNK-15 | Ligações externas (privacidade…) respondem | live | baixa | V | ✓ |
| LNK-16 | drive.html mostra o texto do endereço como texto e recusa iframe | live | alta | V | ✓ |
| LNK-20 | Todas as ligações `#/…` do índice, gaveta e cântico abrem um ecrã | ui | média | V | ✓ |

## 3. Estabilidade

| ID | O que se verifica | Como | Grav. | Freq. | Estado |
|---|---|---|---|---|---|
| EST-01 | APP_VERSION (app.js) = `?v=N` (index.html) = CACHE (sw.js) | static | alta | V | ✓ |
| EST-02 | Formato de APP_VERSION | static | alta | V | ✓ |
| EST-03 | Ficheiros do SHELL do sw.js existem | static | alta | V | ✓ |
| EST-04 | Versão do supabase-js igual no `<script>` e na CSP | static | alta | V | ✓ |
| EST-10 | Sessão longa (60/150 navegações): sem erros, memória e nós DOM estáveis | ui | alta | V/S | ✓ |
| EST-11 | Service worker ativo, abre sem rede | ui | alta | V | ✓ |
| EST-12 | Ao mudar de versão o SW apaga caches antigas (mantém cancioneiro-media) | ui | alta | V | ✓ |
| EST-13 | localStorage corrompido não impede abrir | ui | média | V | ✓ |
| (todos os ui) | Erros JS e rejeições não tratadas durante qualquer teste fazem-no falhar | ui | alta | V | ✓ |

## 4. Resiliência (modo real, Supabase simulado)

| ID | O que se verifica | Como | Grav. | Freq. | Estado |
|---|---|---|---|---|---|
| RES-01 | Supabase em baixo, com sessão guardada: capa sai, há mensagem | ui | alta | V | ✓ |
| RES-02 | Supabase lento (7 s/pedido): abre em ≤ 12 s | ui | média | V | ✓ |
| RES-03 | conteudo 500 ao abrir cântico: mensagem, sem erro JS | ui | alta | V | ✓ |
| RES-04 | 429 (limite): a mensagem chega à pessoa | ui | alta | V | ✓ |
| RES-05 | Sessão expirada e renovação recusada: sem ciclo de pedidos | ui | alta | V | ✓ |
| RES-06 | Partitura indisponível: mensagem | ui | alta | V | ✓ |
| RES-07 | Sem rede a meio de marcar preferido: repõe e avisa | ui | média | V | ✓ |
| RES-08 | Dados incompletos (sem autor/letra/ficheiros/número) | ui | média | V | ✓ |
| RES-09 | Lista do Supabase indisponível: mensagem em vez de ecrã vazio | ui | alta | S | ✓ |
| MAN-20 | Modo avião a meio de ouvir uma gravação / abrir partitura no telemóvel | manual | média | M | ☐ |

## 5. Escalabilidade e desempenho (medição; sem carga)

| ID | O que se verifica | Como | Grav. | Freq. | Estado |
|---|---|---|---|---|---|
| DES-01 | Tamanho de app.js / styles.css / theme.css / index.html dentro do orçamento | live | média | V | ✓ |
| DES-02 | Tempos de resposta (site, auth, função) — mediana de 3 | live | média | V | ✓ |
| DES-03 | Arranque a frio da função conteudo < 5 s | live | média | S | ✓ |
| ESC-01 | Chaves estrangeiras com índice (supabase/indices.sql, v156) | db | baixa | V | ✓ |
| ESC-02 | Plano da lista de cânticos (como pedida pela app) < 300 ms (82 ms em v156) | db | média | V | ✓ |
| ESC-03 | Limites do plano Supabase (BD, armazenamento, access_log) | db | média | V | ✓ |
| ESC-04 | Limites por pessoa usam o índice de access_log | db | média | S | ✓ |
| ESC-10 | Índice com 2000 cânticos abre em tempo razoável | ui | média | V | ✓ |
| ESC-11 | Pesquisa em 2000 cânticos < 400 ms por tecla | ui | média | V | ✓ |
| ESC-12 | FCP, LCP, CLS (local) | ui | baixa | V | ✓ |

## 6. Usabilidade e acessibilidade

| ID | O que se verifica | Como | Grav. | Freq. | Estado |
|---|---|---|---|---|---|
| USA-01 | `node tools/theme/build.mjs --check` passa (theme.css = design/tokens.json) | static | média | V | ✓ |
| USA-02 | styles.css sem cores fixas (só variáveis do tema) | static | baixa | V | ✓ |
| USA-03 | Botões só com ícone têm aria-label | static | média | V | ✓ |
| USA-04 | Viewport não bloqueia zoom (WCAG 1.4.4) — `maximum-scale=1` é decisão (zoom só nas partituras; A−/A+ na letra): fica como aviso | static | baixa | V | ! |
| USA-05 | Tokens: on-brand sobre brand e brand-deep ≥ 4.5:1 (v149) | static | média | V | ✓ |
| USA-17 | Livro no cântico: .col-pick[data-k] com aria-pressed/.on; original aria-disabled; retirar do Cancioneiro com confirmação; teclado (v165; sem a opção Coro desde a v174); svg.pick-ic antes do nome em cada opção (v186) | ui | média | V | ☐ por correr |
| USA-18 | Sobre a cor da marca: texto ≥ 4.5:1 e opaco, ícones ≥ 3:1 (índice, gaveta, folha publicada e em edição — topo branco em edição, v161) | ui | média | V | ☐ por correr |
| USA-19 | Campos obrigatórios: «*» (.req) e botão desativado até preencher (Novo cântico, Nova folha, Editar folha, Template, Gestão, caixa de texto com Enter) (v171) | ui | média | V | ☐ por correr |
| USA-20 | Botões lado a lado numa linha de ações com a mesma largura ±1 px (.edit-actions, .info-actions, .pend-bar, .edit-bar, .file-btns) (v175) | ui | baixa | V | ☐ por correr |
| USA-21 | Confirmações destrutivas (Apagar/Remover/Retirar/Recusar/Sair sem guardar) com #app-dlg-ok.danger-fill; caixas de texto sem (v176) | ui | baixa | V | ☐ por correr |
| USA-22 | Editar folha: rodapé em linha a 390/320 px (Apagar \| Cancelar \| Guardar) e .stack a ~260 px (Guardar, Cancelar, Apagar de cima para baixo) (v182/v185) | ui | baixa | V | ☐ por correr |
| USA-23 | Ação principal à direita em linha / em cima em coluna: OK, Fechar, Procurar, Publicar (também a 220 px), Aprovar (v185) | ui | baixa | V | ☐ por correr |
| USA-10 | Alvos de toque ≥ 44×44 px (conta a área alargada por `::after`; exceções decididas em `tests/baseline.json` → tapExceptions) | ui | média | V | ✓ |
| USA-11 | 320 px e paisagem: sem deslocamento horizontal; diálogos cabem | ui | média | V | ✓ |
| USA-12 | Contraste AA (4.5:1) claro e escuro | ui | média | V | ! |
| USA-13 | Teclado: Tab com foco visível; Escape fecha diálogos | ui | média | V | ✓ |
| USA-14 | Nomes acessíveis em botões/ligações; `lang="pt"` | ui | média | V | ✓ |
| USA-15 | Diálogos com título e botão de fechar | ui | baixa | V | ✓ |
| USA-16 | Cores efetivas = tokens do padrão de design | ui | baixa | S | ✓ |
| MAN-30 | VoiceOver (iPhone) e TalkBack: índice, cântico, gaveta, diálogos | manual | média | M | ☐ |
| MAN-31 | iPhone: área segura (notch), barra de estado, teclado sobre os campos, pull-to-refresh | manual | média | M | ☐ |

## 7. Segurança

| ID | O que se verifica | Como | Grav. | Freq. | Estado |
|---|---|---|---|---|---|
| SEG-01 | CSP em index/admin/drive: object-src none, base-uri, sem unsafe em script-src | static | alta | V | ✓ |
| SEG-02 | Hashes CSP dos scripts inline batem certo | static | alta | V | ✓ |
| SEG-03 | supabase-js com SRI, crossorigin e versão fixa | static | alta | V | ✓ |
| SEG-04 | Nenhum segredo no repositório (só a chave anon) | static | crítica | V | ✓ |
| SEG-05 | config.js só tem role=anon | static | crítica | V | ✓ |
| SEG-06 | Nenhuma letra versionada | static | alta | V | ✓ |
| SEG-07 | vendor (pdf.js, pdf-lib) iguais à referência (`tests/baseline.json`) | static | alta | V | ✓ |
| SEG-08 | CORS do conteudo; OIDC em backup/gravacoes (repo, ramo, workflow, RS256) | static | alta | V | ✓ |
| SEG-09 | Workflows: permissões mínimas, ações com versão | static | alta | V | ✓ |
| SEG-10 | novos.sql tem o filtro `approved` (compara com DB-RLS-05) | static | baixa | V | ✓ |
| SEG-11 | conteudo `shared` com songs:true: só os campos previstos, letra com noChords (v150) | static | alta | V | ✓ |
| SEG-12 | conteudo: folha por publicar → partilha «expirado», share 409, fora do colSet (v159) | static | alta | V | ☐ por correr |
| SEG-13 | conteudo addsong: todos os cânticos novos começam por aprovar (v165) | static | média | V | ☐ por correr |
| SEG-20 | SRI do supabase-js = ficheiro publicado (CDN ou registo npm) | live | crítica | V | ✓ |
| SEG-21 | Sem sessão: nenhuma tabela legível por REST | live | crítica | V | ✓ |
| SEG-22 | Sem sessão: RPC protegidas | live | crítica | V | ✓ |
| SEG-23 | Bucket `coro` privado (público e lista recusados) | live | crítica | V | ✓ |
| SEG-24 | Endereço assinado forjado recusado | live | alta | V | ✓ |
| SEG-25 | Auth só Google | live | alta | V | ✓ |
| SEG-26 | conteudo sem sessão → 403 em todas as operações | live | crítica | V | ✓ |
| SEG-27 | shared: token mal formado 400/WAF, desconhecido 410 | live | alta | V | ✓ |
| SEG-28 | conteudo não reflete origens estranhas (CORS) | live | alta | V | ✓ |
| SEG-29 | transcribe: CORS só para a origem do GitHub Pages (v156) | live | baixa | V | ✓ |
| SEG-30 | transcribe sem sessão → 403 (não chega ao Groq) | live | alta | V | ✓ |
| SEG-31 | backup/gravacoes: sem token / token OIDC forjado / chave anon → 401 | live | crítica | V | ✓ |
| SEG-32 | notify: tipos/ids inválidos → 400 (sem emails) | live | alta | V | ✓ |
| SEG-33 | Erros das funções sem detalhes internos | live | baixa | V | ✓ |
| SEG-34 | GitHub Pages: http→https, HSTS, content-type | live | baixa | V | ✓ |
| DB-RLS-01 | RLS ligada em todas as tabelas | db | crítica | V | ✓ |
| DB-RLS-02 | anon sem permissões em public | db | crítica | V | ✓ |
| DB-RLS-03 | authenticated: lista fechada de permissões | db | crítica | V | ✓ |
| DB-RLS-04 | songs: nunca lyrics/lyrics_edit/translation/source_hash para o browser | db | crítica | V | ✓ |
| DB-RLS-05 | Cânticos por aprovar invisíveis a outros (perfil Coro) | db | média | V | ✓ |
| DB-RLS-06 | Leitura por perfil (anon, sem acesso, Cancioneiro, Coro, Maestro, Gestor) | db | crítica | V | ✓ |
| DB-RLS-07 | Escrita por perfil (em rollback): coleções/templates só Maestro+; letra, emails, registos, partilhas, preferidos alheios nunca | db | crítica | V | ✓ |
| DB-RLS-08 | Preferidos de outros invisíveis | db | crítica | V | ✓ |
| DB-RLS-09 | Coleções: expiradas, público, cântico visível ao Cancioneiro por coleção | db | alta | V | ✓ |
| DB-RLS-11 | Folhas por publicar invisíveis a Coro/Cancioneiro (e os seus cânticos ao Cancioneiro); visíveis a Maestro+; novas começam por publicar (v159) | db | crítica | V | ☐ por correr |
| DB-RLS-10 | Máximo 10 cânticos por folha | db | baixa | V | ✓ |
| DB-FN-01 | SECURITY DEFINER com search_path e sem EXECUTE para anon | db | alta | V | ✓ |
| DB-FN-02 | my_rank()/my_role() por perfil | db | alta | V | ✓ |
| DB-FN-03 | Funções de backup e gatilhos fora do alcance de authenticated | db | alta | V | ✓ |
| DB-ST-01 | Bucket privado, tipos e tamanho limitados, sem políticas em storage | db | crítica | V | ✓ |
| DB-ST-02 | Tokens de partilha ≥ 16 caracteres e ≤ 24 h | db | alta | V | ✓ |
| SEG-40 | XSS por títulos, autores, letras, rótulos, etiquetas (lista, pesquisa, cântico, folha) | ui | crítica | V | ✓ |
| SEG-41 | XSS por nome de folha e secção | ui | crítica | V | ✓ |
| SEG-42 | Copiar/selecionar letra bloqueado | ui | baixa | V | ✓ |
| SEG-43 | `?demo` só em localhost | ui | alta | V | ✓ |
| SEG-44 | CSP não bloqueia a app (modo real simulado) | ui | alta | V | ✓ |
| MAN-40 | Revisão de código das funções a cada mudança em `supabase/functions/*` (SSRF do scrape incl. DNS rebinding, limites, validações) | manual | alta | por mudança | ☐ |
| MAN-41 | Limites por pessoa (conteudo 80/h, transcribe 150/h) com uma conta de teste — só se houver conta de teste (ver «Pendentes») | manual | média | M | ☐ |

## 8. Integridade dos dados e cópias

| ID | O que se verifica | Como | Grav. | Freq. | Estado |
|---|---|---|---|---|---|
| INT-01 | song_files → objeto no armazenamento | db | alta | V | ✓ |
| INT-02 | pdf_url internas → objeto no armazenamento | db | alta | V | ✓ |
| INT-03 | Objetos órfãos no armazenamento | db | baixa | V | ✓ |
| INT-04 | Número único, título, letra (ou partitura), fonte | db | alta | V | ✓ |
| INT-13 | Cânticos novos aprovados todos no Coro (coro_clu) (v174) | db | média | V | ☐ por correr |
| INT-05 | Cânticos do original todos no Cancioneiro | db | alta | V | ✓ |
| INT-06 | Folhas sem posições repetidas | db | baixa | V | ✓ |
| INT-07 | Limpezas automáticas (partilhas, coleções, convites, pedidos) | db | média | V | ✓ |
| INT-08 | 7 agendamentos pg_cron ativos e sem falhas | db | alta | V | ✓ |
| INT-09 | sync_log, drive_sync_log, health_log ≤ 8 dias e sem erro | db | alta | V | ✓ |
| INT-10 | Cópia de segurança semanal com sucesso ≤ 8 dias | db | alta | V | ✓ |
| INT-11 | Verificação semanal e conversão de gravações sem falhas | db | média | V | ✓ |
| INT-12 | Partituras externas (pdf_url http) respondem | db | baixa | S | ✓ |
| MAN-50 | Restauro de teste da cópia (docs/RECONSTRUIR.md) num projeto Supabase à parte | manual | alta | trimestral | ☐ |

## 9. Compatibilidade

| ID | O que se verifica | Como | Grav. | Freq. | Estado |
|---|---|---|---|---|---|
| COM-01 | Computador (1280×800, rato) | ui | média | V | ✓ |
| COM-02 | WebKit (Safari) com Playwright | ui | média | V | – sem WebKit |
| COM-03 | Manifest PWA válido | ui | média | V | ✓ |
| MAN-01 | iPhone Safari: abrir, entrar, instalar no ecrã principal, app instalada abre offline | manual | alta | M | ☐ |
| MAN-02 | Android Chrome: instalar (beforeinstallprompt), partilha, microfone | manual | alta | M | ☐ |
| MAN-03 | iPad / ecrã grande e Safari no Mac (janela de entrada Google) | manual | média | M | ☐ |

---

## Pendentes (precisam de algo que os testes não têm)

- **Rede deste ambiente**: resolvida a 2026-10-10 (Allowed domains: GitHub Pages, jsDelivr, supabase.com, groq.com, resend.com e os sites de partituras externas). O proxy só aceita HTTPS: o redireccionamento http→https não é verificável daqui.
- **WebKit** não está instalado (só Chromium em `/opt/pw-browsers`) → COM-02 e os testes Safari são manuais.
- **Conta de teste** (um email em `allowed_emails` só para testes, com sessão) permitiria testar a função `conteudo` com sessão real (perfis, limites, `file`, `search`) sem usar contas de pessoas. Sem ela, essas regras são verificadas por SQL (RLS) e por leitura do código.

## Manutenção

- Quando a app muda (ecrãs, funções, tabelas), acrescentar testes aqui e na suite certa; o relatório ao main diz quais foram acrescentados.
- Dados de teste só de `tools/screens/fixture.mjs` (fictícios / domínio público). Para atualizar a referência dos ficheiros vendor: `tests/baseline.json`.
