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

Última execução completa: **v204, 2026-10-24** — 201 ok · 0 falhas · 1 aviso (USA-04, decisão) · 1 não corrido (WebKit). Relatório `tests/reports/2026-10-24-v204-full.md` (SEG-11, FUN-39, FUN-52 e USA-16 falharam por erro do teste depois da v203/v204; corrigidos e corridos de novo na mesma execução).

---

## 1. Funcionalidade (interface, por perfil)

| ID | O que se verifica | Como | Grav. | Freq. | Estado |
|---|---|---|---|---|---|
| FUN-01.{gestor,maestro,coro,cancioneiro} | Arranque em cada perfil: índice com cânticos, sem erros JS | ui | alta | V | ✓ |
| FUN-02 | Pesquisa por título, autor e palavra da letra; botão limpar | ui | alta | V | ✓ |
| FUN-03 | Cântico: título, letra, botões original ↔ tradução | ui | alta | V | ✓ |
| FUN-03b | Versão noutra língua: botão «Espanhol» (sem «Tradução ·») e nota «Versão em espanhol»; pt mantém «Tradução · Português» (v192) | ui | média | V | ✓ |
| FUN-47 | Versões do mesmo cântico: fora de listas/pesquisa, botões v:<slug> no principal, nota «Versão em …», redireção da versão, perfil Cancioneiro só vê as suas (v193) | ui | alta | V | ✓ |
| FUN-48 | Versões e Cancioneiro: perfil Cancioneiro só vê versões do Cancioneiro; #ver-promo Acrescentar/Retirar com confirmação; versões do original sem botão (v196) | ui | média | V | ✓ |
| FUN-49 | Ficheiros herdados de uma versão só com essa versão escolhida (frere_jacques: Francês sem a.pdf; Inglês com Partitura que abre) (v197) | ui | média | V | ✓ |
| FUN-50 | Descarregar partitura (#pdf-download) em todas as partituras: PDF como está (título.pdf); página de livro junta num PDF (pdf-lib); mudar de partitura muda o ficheiro; erro de rede → #app-dlg; telemóvel → navigator.share com o ficheiro (v199) | ui | média | V | ✓ |
| FUN-51 | Microfone só com can_listen (v201): sem permissão #btn-mic e .listen-only escondidos e tutorial sem o passo do microfone; com permissão aparecem; valor guardado em cancioneiro.listen.*; ?demo sempre ativo (modo real simulado, rpc/can_listen) | ui | média | V | ✓ |
| FUN-52 | Editar nesta folha (v204): ✎ → #cl-ed (caixa por estrofe, Guardar desativado sem estrofes, Cancelar com confirmação, «Editar texto», Repor com confirmação .danger-fill desde v207); fica na cópia e grava com «Guardar» da folha; igual ao original = sem versão | ui | alta | V | ☐ por correr |
| FUN-53 | Cântico aberto da folha (v204–v206): todas as ligações /folha/<id>; .col-edited só no editado; nota «Na folha «título»» (+ « · letra desta folha»), sem ligações; sem #btn-edit, #btn-add-rec, #btn-add-score, aprovar/recusar, #ver-promo; #/cantico/<slug> volta ao original; Cancioneiro sem acordes | ui | média | V | ☐ por correr |
| FUN-54 | PDF da folha (v204): um só «Gerar PDF» → #pdf-o-chords / #pdf-o-scores (switch, aria-checked desde v205) (ligadas na folha Coro, desligadas na Cancioneiro); nome -coro / -acordes / -partituras / sem sufixo (v216: 4 linhas, as 2 de email desligadas e sem fechar a janela) | ui | média | V | ☐ por correr |
| FUN-55 | PDF da folha usa a versão da folha (v204): estrofe retirada não aparece no PDF, as outras aparecem (texto extraído com vendor/pdfjs) | ui | média | V | ☐ por correr |
| FUN-56 | Acordes e partituras por cântico na folha (v206): #cl-chords/#cl-scores só em folha Coro e se o cântico os tem; Cancelar com mudança pede confirmação; marca «· sem acordes / · sem partituras»; grava no_chords/no_scores com «Guardar» da folha; aberto da folha sem .ch/#btn-chords e sem .scores a; Repor volta a false | ui | média | V | ☐ por correr |
| FUN-57 | PDF da folha respeita no_chords/no_scores (v206): folha Coro amazing_grace + santa_lucia; no_chords num → menos acordes no texto mas o outro mantém; no_scores num → menos páginas (texto com vendor/pdfjs) | ui | média | V | ☐ por correr |
| FUN-58 | Editar folha (v208): .col-edit-bar 1.ª linha; depois de #sa-list, «Acrescentar «X»» com «Cântico completo» / «Versão desta folha» (abre #cl-ed); Cancelar no #cl-ed deixa o cântico completo | ui | média | V | ☐ por correr |
| FUN-59 | Grupos na 1.ª abertura (v209, ?grupos): «Os seus grupos», g1..g5, Guardar sem Cancelar; grava e não volta a perguntar | ui | média | V | ☐ por correr |
| FUN-60 | Grupos no Perfil (v209): #perfis-groups (h3, interruptores, muda logo), .grp-none sem grupo e sem folhas; Cancioneiro solo em #info-groups | ui | média | V | ☐ por correr |
| FUN-61 | Visibilidade por grupos no ?demo (v209/v210): folha de g1 invisível a Coro e Maestro em g2 ou sem grupo, visível em g1; Gestor vê sempre; folha sem grupos para quem tem grupo | ui | alta | V | ☐ por correr |
| FUN-62 | Publicar com grupos (v209/v212): «Todos» + grupos visíveis e ligados; desligar «Todos» desliga todos e desativa OK; todos ligados liga «Todos»; um grupo → publica só para ele; .col-meta «Coro · até …» + «Grupos: Liceus»; #ce-groups; sem .pend-top; sem «Partilhar» por publicar (v215) | ui | média | V | ☐ por correr |
| FUN-63 | Gestão e grupos (v209, Gestor): .adm-groups; li[data-group] com .grp-ren/.grp-del; #grp-add obrigatório e único (maiúsculas); Retirar pede destinos sem o próprio | ui | média | V | ☐ por correr |
| FUN-64 | Maestro só com os seus grupos (v210, g2+g3): Publicar e #ce-groups só Liceus/CLU, sem «Todos» (v212), OK desativado sem grupo; folha nova com g2+g3 | ui | alta | V | ☐ por correr |
| FUN-65 | Folha para todos / vários grupos (v212): .col-meta «Grupos: Todos» / «Grupos: Liceus, CLU» (ordem dos grupos); #col-aud e #ce-aud Cancioneiro antes de Coro; #ce-groups «Todos» | ui | baixa | V | ☐ por correr |
| FUN-66 | Estado da folha em Editar folha (v213/v217): #ce-state «Publicada · Despublicar» / «Por publicar»; #ce-unpub com confirmação despublica logo e fecha a edição (v218); com alterações «Guardar e despublicar» / «Descartar e despublicar», Cancelar não muda nada; Guardar nunca muda published («Folha guardada — continua publicada») | ui | média | V | ☐ por correr |
| FUN-67 | Cor do PDF da folha pelo público (v214): Coro #1f6aa8, Cancioneiro #0e7f58, em qualquer perfil que gera PDF (Maestro, Gestor, cores de perfil diferentes); a outra cor ausente (pdfjs getOperatorList) | ui | baixa | V | ☐ por correr |
| FUN-04 | A−/A+ (limites 12–40 px) e escolha guardada depois de recarregar | ui | alta | V | ✓ |
| FUN-05 | Modo escuro: alterna e volta a seguir o sistema | ui | alta | V | ✓ |
| FUN-06 | Acordes: Coro mostra/esconde; Cancioneiro nunca recebe acordes | ui | alta | V | ✓ |
| FUN-07 | Preferidos: ☆ marca/desmarca, lista Preferidos atualiza | ui | alta | V | ✓ |
| FUN-07b | Estrela no Maestro/Gestor: sem .book, .on só nos Preferidos, aria-label «Coleções e folhas», abre #col-pick (v187) | ui | média | V | ✓ |
| FUN-08 | Gaveta ☰: livros e folhas; fecha ao tocar fora | ui | alta | V | ✓ |
| FUN-09 | Folhas por perfil e público; expiradas só para Maestro | ui | alta | V | ✓ |
| FUN-10 | Folha publicada (Maestro): só leitura; .col-edit-bar na 1.ª linha (v208) com «Editar folha» e «Partilhar» (button.edit-btn.col-share à direita, fora do título, v215) | ui | alta | V | ☐ por correr |
| FUN-11 | Nova folha: público segmentado (#col-aud), «Criar» sem «Apagar», abre logo a edição (#col-ed); aparece na gaveta (v164/v165) | ui | alta | V | ✓ |
| FUN-12 | Template só no diálogo «Nova folha» (#col-tpl-sel, «Criar ou mudar templates…»); a janela de edição não tem template (v164) | ui | média | V | ✓ |
| FUN-13 | Novo cântico (Coro) fica «por aprovar» em Novos Cânticos («por aprovar» em .n, v177; sem número, v179) | ui | alta | V | ✓ |
| FUN-13b | Novo cântico de um Maestro também fica por aprovar (v165) | ui | média | V | ✓ |
| FUN-13c | Apagar cântico novo aprovado só em «Editar cântico» (#sn-del, confirmação, volta a Novos Cânticos); #sn-del escondido nos outros (v166) | ui | média | V | ✓ |
| FUN-14 | Editar letra (Maestro) e ver a edição | ui | alta | V | ✓ |
| FUN-15 | Gravações: mini-leitor abre e para | ui | alta | V | ✓ |
| FUN-16 | Partitura: pdf.js desenha, zoom +/−, Voltar | ui | alta | V | ✓ |
| FUN-17 | Partilhar cântico gera `#/p/<código>` | ui | alta | V | ✓ |
| FUN-17b | Partilhar letra: copia sempre; telemóvel «Partilhar letra» + navigator.share({title,text}); computador «Copiar letra» + aviso «Letra copiada» (v188) | ui | média | V | ✓ |
| FUN-18 | Endereço partilhado sem conta: letra sem acordes | ui | alta | V | ✓ |
| FUN-19 | Endereço partilhado inválido/expirado: mensagem clara | ui | alta | V | ✓ |
| FUN-20 | Folha partilhada sem conta: secções e abrir cânticos | ui | alta | V | ✓ |
| FUN-21 | Gestão de utilizadores: Gestor vê utilizadores e pedidos; Coro não | ui | alta | V | ✓ |
| FUN-22 | Perfil: só perfis até ao da pessoa; perfil inferior esconde funções | ui | alta | V | ✓ |
| FUN-23 | Terminar sessão limpa a lista e volta à entrada | ui | alta | V | ✓ |
| FUN-24 | Ecrã de entrada: botão Google e ligação Privacidade | ui | alta | V | ✓ |
| FUN-24b | Regresso do Google (?code=): a capa fica ~2 s como numa abertura normal (v173) | ui | baixa | V | ✓ |
| FUN-25 | Tutorial na 1.ª vez; «Saltar» não volta a mostrar | ui | média | V | ✓ |
| FUN-26 | Proposta de instalar (Perfil / Informação) | ui | baixa | V | ✓ |
| FUN-27 | Pesquisa por voz: janela «A ouvir», línguas, Cancelar (sem transcrever) | ui | média | V | ✓ |
| FUN-28 | Exportar PDF de uma folha (pdf-lib) (v204: passa pelas opções do PDF) | ui | média | S | ☐ por correr |
| FUN-29 | Rotas desconhecidas, cânticos inexistentes e endereços mal codificados não partem a app | ui | média | S | ✓ |
| FUN-30 | Ligação direta a um cântico sobrevive a recarregar | ui | alta | S | ✓ |
| FUN-31 | Categorias e livros (latim, Songbook, Novos) | ui | média | S | ✓ |
| FUN-31b | Filtro de Novos Cânticos: Todos / Por aprovar / Só no Coro / No Cancioneiro, por esta ordem (v178/v180) | ui | baixa | S | ✓ |
| FUN-32 | Aprovar cântico novo: «Aprovar para…»; Cancelar não aprova; aprovar põe sempre no Coro e, se Cancioneiro, também promove (v172); «Recusar» .danger-btn (v177); confirmação «Aprovar…» depois da escolha, Cancelar não aprova (v181) | ui | média | S | ✓ |
| FUN-33 | Página inicial: títulos de secção só acima de categorias com cânticos; Cancioneiro sem título acima de «Todos os cânticos»; «Momentos da Missa»; nomes curtos nunca vazios (v151–v155) | ui | média | V | ✓ |
| FUN-45 | Secção Cancioneiro (Coro+): categorias só com cânticos do Cancioneiro (v189) | ui | média | V | ✓ |
| FUN-46 | «Todos os cânticos» (Coro+) no fim da página inicial com tema-*; ausente no perfil Cancioneiro, no menu ☰ e no seletor de categoria (v190; 7 categorias com Gestos, v191) | ui | média | V | ✓ |
| FUN-34 | Páginas de categoria: antetítulo `.list-kicker` = secção (Coro+), ausente no perfil Cancioneiro (v151/v153) | ui | média | V | ✓ |
| FUN-35 | Menu ☰: Preferidos e Novos Cânticos no topo sem título; «Livros» e «Folhas»; vazias escondidas; Livros do Cancioneiro só com o Cancioneiro (v165); perfil Cancioneiro sem título «Livros» (v184) | ui | média | V | ✓ |
| FUN-36 | Tutorial do Maestro chega ao passo «+ Nova folha» com o botão visível (v154) | ui | média | V | ✓ |
| SHR-01 | Folha partilhada: lista traz a letra de todos os cânticos, sem acordes, guardada em `cancioneiro.partilhados` (v150) | ui | alta | V | ✓ |
| SHR-02 | Folha partilhada: abrir cântico sem pedidos à rede e sem rede (v150) | ui | alta | V | ✓ |
| SHR-03 | Folha partilhada sem rede depois de recarregar (SW + armazenamento) (v150) | ui | média | V | ✓ |
| SHR-04 | Partilhas expiradas apagadas do armazenamento (v150) | ui | baixa | V | ✓ |
| SHR-05 | Cântico partilhado sozinho guardado e aberto sem rede (v150) | ui | média | V | ✓ |
| SHR-06 | Preferidos: letras descarregadas ao abrir (modo real simulado) (v150) | ui | média | V | ✓ |
| MAN-15 | Produção: abrir uma folha partilhada conta 1 abertura (views +1) e abrir cânticos não conta — só com uma folha de teste criada para isso | manual | média | por mudança | ☐ |
| FUN-37 | Folha por publicar invisível a Coro e Cancioneiro (gaveta e endereço); Maestro vê com o ícone de rascunho (svg.book-ic role=img, aria-label «Não publicada»), sem texto (v162) | ui | alta | V | ✓ |
| FUN-38 | Editar folha numa cópia: nada grava até «Guardar» (#ce-save → por publicar); «Cancelar» com alterações confirma e deita fora; #col-pub só em folhas por publicar; folha vazia não se publica (v165); «Publicar» pede confirmação, Cancelar não publica (v181) (v217: Guardar não muda published; despublicar com #ce-unpub) | ui | alta | V | ☐ por correr |
| FUN-39 | Edição: .ce-acts (up/down/del/ok); Descer muda a ordem; Apagar pede confirmação; secção escolhida tem .ce-name (v165) | ui | alta | V | ✓ |
| FUN-40 | Edição: «+ Adicionar cântico» por secção (Comunhão pré-preenchida, Saída vazia); «+ Adicionar secção» no fim (v164) | ui | média | V | ✓ |
| FUN-42 | Edição: várias mudanças só gravam com «Guardar» (antes, nada muda); recarregar mostra todas, incluindo a ordem (v165) | ui | alta | V | ✓ |
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
| RES-10 | Voltar à app depois de > 5 min recarrega cânticos, preferidos e folhas (e atualiza o SW); antes dos 5 min não (v194) | ui | média | V | ✓ |
| RES-11 | Lista recusada pelo servidor (42501) com cópia guardada: aviso «Não foi possível atualizar a lista…» (v195) | ui | alta | V | ✓ |
| RES-12 | Guardar a folha falha (v218, modo real simulado, rpc save_collection → 500): em «Guardar» e «Guardar e despublicar» #col-ed fica aberto com erro em #ce-msg e sem update de collections | ui | média | S | ☐ por correr |
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
| USA-05 | Tokens: on-brand sobre brand/brand-deep; accent e chord sobre paper (claro e escuro); danger sobre surface; ≥ 4.5:1 na base e nos 4 perfis (v203) | static | média | V | ✓ |
| USA-17 | Livro no cântico: .col-pick[data-k] com aria-pressed/.on; original aria-disabled; retirar do Cancioneiro com confirmação; teclado (v165; sem a opção Coro desde a v174); svg.pick-ic antes do nome em cada opção (v186) | ui | média | V | ✓ |
| USA-18 | Texto e ícones sobre a cor da marca (texto ≥ 4.5:1 opaco, ícones ≥ 3:1): índice e gaveta nos 4 perfis, folha, edição (v203) | ui | média | V | ✓ |
| USA-19 | Campos obrigatórios: «*» (.req) e botão desativado até preencher (Novo cântico, Nova folha, Editar folha, Template, Gestão, caixa de texto com Enter) (v171) | ui | média | V | ✓ |
| USA-20 | Botões lado a lado numa linha de ações com a mesma largura ±1 px (.edit-actions, .info-actions, .pend-bar, .edit-bar, .file-btns) (v175) | ui | baixa | V | ✓ |
| USA-21 | Confirmações destrutivas (Apagar/Remover/Retirar/Recusar/Repor/Sair sem guardar) com #app-dlg-ok.danger-fill; caixas de texto sem (v176; Repor desde v207) | ui | baixa | V | ☐ por correr |
| USA-22 | Editar folha: rodapé em linha a 390/320 px (Apagar \| Cancelar \| Guardar) e .stack a ~260 px (Guardar, Cancelar, Apagar de cima para baixo) (v182/v185) | ui | baixa | V | ✓ |
| USA-23 | Ação principal à direita em linha / em cima em coluna: OK, Fechar, Procurar, Publicar (também a 220 px), Aprovar (v185) | ui | baixa | V | ✓ |
| USA-24 | Cores por perfil (v203): <html>/<body> só com .perfil-X ativo; mudar de perfil troca a classe e --brand; capa sempre --app-brand #10835c; dialog h2 em --accent ≥ 4.5:1 (4 perfis × claro/escuro) | ui | média | V | ✓ |
| USA-10 | Alvos de toque ≥ 44×44 px (conta a área alargada por `::after`; exceções decididas em `tests/baseline.json` → tapExceptions) | ui | média | V | ✓ |
| USA-11 | 320 px e paisagem: sem deslocamento horizontal; diálogos cabem | ui | média | V | ✓ |
| USA-12 | Contraste de texto (WCAG AA) no índice e no cântico nos 4 perfis, claro e escuro; folha e edição (v203: cores por perfil) | ui | média | V | ✓ |
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
| SEG-12 | conteudo: folha por publicar → partilha «expirado», share 409, fora do colSet (v159) | static | alta | V | ✓ |
| SEG-13 | conteudo addsong: todos os cânticos novos começam por aprovar (v165) | static | média | V | ✓ |
| SEG-14 | transcribe só para contas com can_listen: chama rpc/can_listen com o token da pessoa, 403 se não for true, sem is_allowed; reconhecimento.sql revoga EXECUTE a anon (v201) | static | média | V | ✓ |
| SEG-15 | conteudo «Editar nesta folha» (v204): collyrics só Maestro+, valida coleção/letra, exige o cântico na folha, com limite; song+collection só a quem vê a folha e sem acordes no Cancioneiro; shared usa a versão da folha | static | alta | V | ✓ |
| SEG-16 | conteudo e grupos (v209/v210): colSet e song+collection com groupOk; bypass só Gestor (lvl ≥ 4); collyrics recusa Maestro fora dos grupos; email em minúsculas (who()), falha → vazio | static | alta | V | ☐ por correr |
| SEG-20 | SRI do supabase-js = ficheiro publicado (CDN ou registo npm) | live | crítica | V | ✓ |
| SEG-21 | Sem sessão: nenhuma tabela legível por REST | live | crítica | V | ✓ |
| SEG-22 | Sem sessão: RPC protegidas (inclui can_listen desde v201) (+ RPC de grupos desde v209) | live | crítica | V | ☐ por correr |
| SEG-23 | Bucket `coro` privado (público e lista recusados) | live | crítica | V | ✓ |
| SEG-24 | Endereço assinado forjado recusado | live | alta | V | ✓ |
| SEG-25 | Auth só Google | live | alta | V | ✓ |
| SEG-26 | conteudo sem sessão → 403 em todas as operações (inclui collyrics desde v204) | live | crítica | V | ✓ |
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
| DB-RLS-03 | authenticated: lista fechada de permissões (v209: groups, user_groups, collection_groups) | db | crítica | V | ☐ por correr |
| DB-RLS-04 | songs: nunca lyrics/lyrics_edit/translation/source_hash para o browser | db | crítica | V | ✓ |
| DB-RLS-12 | Todas as colunas pedidas pela app (fetchSongs e .from().select() em app.js) têm SELECT para authenticated (falha real da v193: version_of) | db | crítica | V | ✓ |
| DB-RLS-13 | collection_lyrics (v204): RLS; anon nada; authenticated só SELECT collection_id/song_slug/edited_at; lyrics e edited_by recusados; sem escrita pelo browser; só linhas de folhas visíveis | db | alta | V | ✓ |
| DB-RLS-14 | collection_songs.no_chords/no_scores (v206): authenticated com SELECT/INSERT/UPDATE nessas colunas; Coro não muda (RLS), Maestro muda (em rollback) | db | média | V | ☐ por correr |
| DB-RLS-15 | Grupos (v209): RLS nas 3 tabelas; anon nada; Coro só os seus user_groups, sem escrita em collection_groups; Maestro lê todos; group_save/group_remove só Gestor (nome único, maiúsculas); set_user_groups só Maestro+; set_my_groups recusa sem acesso | db | alta | V | ☐ por correr |
| DB-RLS-16 | Folhas por grupo (v209/v210, em rollback): Coro sem grupo não vê; folha de outro grupo invisível ao Coro e ao Maestro, visível ao Gestor; com grupo do Coro visível; sem grupos visível | db | alta | V | ☐ por correr |
| DB-RLS-17 | Maestro e grupos (v210, em rollback, Maestro só em G1): folha só G2 invisível e sem update; G1+G2 visível, apaga só o link G1; v211 col_groups_guard: Maestro sem todos os grupos não deixa folha publicada sem grupos (último link, criar publicada); rascunho e Maestro em todos passam; set_collection_groups (v213): invoker, só authenticated, [G1] ok, {} guarda, [G2]/Coro recusados; v217: guarda só ao publicar; save_collection invoker e atómica, Coro recusado | db | média | V | ☐ por correr |
| DB-RLS-05 | Cânticos por aprovar invisíveis a outros (perfil Coro) | db | média | V | ✓ |
| DB-RLS-06 | Leitura por perfil (anon, sem acesso, Cancioneiro, Coro, Maestro, Gestor) | db | crítica | V | ✓ |
| DB-RLS-07 | Escrita por perfil (em rollback): coleções/templates só Maestro+; letra, emails, registos, partilhas, preferidos alheios nunca | db | crítica | V | ✓ |
| DB-RLS-08 | Preferidos de outros invisíveis | db | crítica | V | ✓ |
| DB-RLS-09 | Coleções: expiradas, público, cântico visível ao Cancioneiro por coleção | db | alta | V | ✓ |
| DB-RLS-11 | Folhas por publicar invisíveis a Coro/Cancioneiro (e os seus cânticos ao Cancioneiro); visíveis a Maestro+; novas começam por publicar (v159) | db | crítica | V | ✓ |
| DB-RLS-10 | Máximo 10 cânticos por folha | db | baixa | V | ✓ |
| DB-FN-01 | SECURITY DEFINER com search_path e sem EXECUTE para anon | db | alta | V | ✓ |
| DB-FN-02 | my_rank()/my_role() por perfil | db | alta | V | ✓ |
| DB-FN-03 | Funções de backup e gatilhos fora do alcance de authenticated | db | alta | V | ✓ |
| DB-FN-04 | can_listen(): anon sem EXECUTE; sem acesso → false; cada perfil → allowed_emails.can_listen; SECURITY DEFINER com search_path (v201) | db | média | S | ✓ |
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
| INT-13 | Cânticos novos aprovados todos no Coro (coro_clu) (v174) | db | média | V | ✓ |
| INT-14 | «Todos os cânticos»: zero cânticos sem categoria (consulta de docs/sessoes/webapp.md; aviso, não falha) (v190) | db | baixa | V | ✓ |
| INT-15 | Etiquetas «Tema» só com os 7 nomes das categorias (sem «Infantis e de gestos») (v191) | db | baixa | V | ✓ |
| INT-16 | os_crocodilos (só original, sem tradução) e dos_cocodrilos como versão es/songbook fora do Cancioneiro, com página do Songbook (v196) | db | baixa | V | ✓ |
| INT-17 | Versões: principal existe e não é versão; sem versões de si próprias; cânticos juntados apagados (v193) | db | média | V | ✓ |
| INT-18 | Versões de folha (v204): cântico na folha, letra não vazia e bem formada, diferente do original | db | baixa | S | ✓ |
| INT-19 | Grupos (v209): nomes únicos (maiúsculas); contas Coro/Cancioneiro sem grupo assinaladas (aviso) | db | baixa | S | ☐ por correr |
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
