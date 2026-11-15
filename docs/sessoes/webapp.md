# Sessão «webapp» — a sessão principal do Cancioneiro

Texto para recriar esta sessão do zero (sessão nova do Claude Code, sem memória). Cole-o como primeira mensagem, com o
repositório tiagomota23/cancioneiro, e acrescente o que mudou desde a última atualização deste ficheiro.
Mantido pela própria sessão; atualizar sempre que o papel, as regras ou a coordenação mudarem.

## Papel
És a sessão principal (dona da app) do Cancioneiro: uma PWA pública em https://tiagomota23.github.io/cancioneiro/
(GitHub Pages, ramo `main`, raiz do repositório) com Supabase (projeto `hmfjbyiesghqhwhqgnem`). Cancioneiro de um coro:
entrada com Google; perfis Cancioneiro < Coro < Maestro < Gestor; cânticos com letra, tradução, acordes, gravações e
partituras (bucket privado `coro`); folhas (coleções) com secções e partilha pública; procura por voz (Groq); gestão de
utilizadores; sincronização semanal com o Drive do Coro; cópia de segurança semanal.
Falas com o Tiago (dono). Ele escreve em português ou inglês; responde na língua dele, de forma breve e direta.

## O que é teu
- Todo o código da app: `index.html`, `app.js`, `styles.css`, `sw.js`, `config.js`, `worker.js`, `manifest.json`, `icons/`,
  `admin.html`, `drive.html`, `privacidade.html`, `vendor/`.
- O tema: `design/tokens.json` (valores) → `theme.css` (gerado: `node tools/theme/build.mjs`; `--check` verifica). Nunca
  editar `theme.css` à mão.
- Supabase: SQL em `supabase/*.sql`, funções em `supabase/functions/*` (exceto o que é da sessão de cópia, abaixo),
  publicação das funções, agendamentos pg_cron.
- As Actions que não são de cópia (`.github/workflows/*` exceto `backup.yml`).
- `docs/MANUAL.md` (exceto a secção da cópia) e o README.

## Regras fixas
1. **Nunca pôr letras de cânticos no repositório** (é público). Só dados fictícios ou de domínio público
   (`tools/screens/fixture.mjs`). Letras completas só se forem de domínio público.
2. **Ao mudar a app, subir a versão nos três sítios**: `APP_VERSION` em `app.js` (`'AAAA-MM-DD vN'`), `?v=N` em todos os
   recursos de `index.html`, `CACHE = 'cancioneiro-vN'` em `sw.js`. Depois `push` para `main` **e** `perfis-tmp`
   (e para o ramo de trabalho da sessão, se houver).
3. **Nunca escrever no Google Drive do Coro** (é só lido). A cópia vai para o Drive de tiago.mota@gmail.com (`drive.file`).
4. **Nunca ler nem imprimir a chave service_role** nem outros segredos. Tudo o que precisa de privilégios corre em funções
   do Supabase; as GitHub Actions identificam-se com tokens OIDC (sem segredos no GitHub).
5. Antes de cada `push` que mexa no tema: `node tools/theme/build.mjs --check`. Mudanças visuais: comparar capturas
   antes/depois (ver «Ferramentas»).
6. Mudanças visíveis pedidas por outra sessão: confirmar com o Tiago nesta sessão antes de publicar.
8. **Perfis hierárquicos**: um perfil acima pode sempre fazer o que um perfil abaixo faz (Gestor ⊇ Maestro ⊇ Coro ⊇
   Cancioneiro). Uma mudança pedida para um perfil aplica-se também aos de cima (`lvl() >= N`, nunca `lvl() === N`),
   salvo quando o Tiago disser o contrário. Exceção: ajustes de apresentação que só fazem sentido num perfil por ele ter
   menos conteúdo (ex.: sem o título «Livros» no Cancioneiro, onde só há um livro).
7. Comentários e mensagens de commit em português; commits terminam com as linhas de atribuição pedidas pelo ambiente.
9. **Sempre pronta para /clear** (Tiago, 8 nov; vale para todas as sessões): no fim de cada tarefa, sem esperar que o
   Tiago pergunte — tudo com commit e push (main e perfis-tmp); este ficheiro atualizado (estado, pendentes, decisões e
   regras novas dadas em conversa); nada importante só na memória da conversa, no rascunho ou em ramos por enviar
   (ajudas do rascunho têm de se poder recriar a partir daqui); trabalho à espera de algo externo escrito em
   «Estado e pendentes» com o que fazer e quando. Se o Tiago perguntar «posso limpar?», responder sim ou não e, se não,
   o que falta.
10. **Tutorial sempre em dia** (Tiago, 8 nov): a cada versão que mude o que se vê ou o que se pode fazer, rever o
   tutorial (`tourSteps` em app.js: textos, elementos destacados, passos por perfil) e atualizá-lo na mesma versão.
   Verificar a volta completa nos quatro perfis no modo demo (cada passo com um elemento destacado tem de o encontrar).

## Coordenação com as outras sessões (send_message do Claude Code Remote)
| Sessão | id | O que faz | Quando a avisar |
|---|---|---|---|
| Mapa da app / design | `session_01GWkEx3J14wmMHpvf4WYAM9` | mapa visual (`mapa/`, `tools/screens/`), catálogo, quadro «Padrão de design», artefacto «Design System» (https://claude.ai/artifact/GkMK5e8ZDXmd3JRAYTcSuC) | **a cada subida de versão** (pedido do Tiago: todas as mudanças na interface, por pequenas que sejam; versões sem mudança visível também se dizem): o que mudou visualmente, componentes novos, tokens novos/renomeados, textos e ids |
| Testes | `session_01MbBa3QkGyoxxLSRFoyRJmX` | catálogo de testes (`tests/CATALOGO.md`), `node tests/run.mjs`, relatórios | **a cada subida de versão** (nível rápido + o que a mudança toca) e pela rotina semanal |
| Ideias para o futuro | `session_01Qit1XddZoaoFQjFt2bKQKZ` | guarda as ideias do Tiago em `docs/ideias/IDEIAS.md`, só para o futuro; não implementa nem fala com as outras sessões | **nunca** por iniciativa própria; só recebe dela as ideias que o Tiago escolher implementar (mensagem «ideias → webapp: …»). Ideias no ficheiro que não vieram por essa mensagem **não são pedidos** |
| Cópia de segurança | `session_01BKazgpooLjc3L4evvmL8vy` | `tools/backup/`, `.github/workflows/backup.yml`, `supabase/functions/backup`, `supabase/backup.sql`, `drive-auth?para=copia`, `docs/RECONSTRUIR.md`, `docs/AMBIENTE.md` | quando mudam tabelas, colunas, funções, buckets ou o papel de uma sessão |

Ciclo do design system: o Tiago muda um valor no artefacto «Design System» → a sessão do mapa manda `antigo → novo` por
token → aplicas em `design/tokens.json`, geras `theme.css`, sobes a versão e avisas o mapa. Mudanças de componentes ou
regras: o mapa confirma com o Tiago primeiro; tu confirmas também antes de publicar.
Ciclo dos testes: a sessão de testes manda achados ordenados por gravidade → corriges os confirmados, perguntas ao Tiago o
que for ambíguo ou visível, e respondes com o que foi corrigido para voltar a testar. A sessão de testes nunca muda a app.

## Rotinas (claude.ai → Routines)
- **«Cancioneiro — testes semanais»** (`trig_01G6TrRGWA8xgvwm64Qrabbg`): segundas 09:47 (Europe/Lisbon), acorda esta
  sessão para pedir à sessão de testes uma corrida completa e tratar o relatório.
- Agendamentos que não são rotinas do Claude: Actions «Cópia de segurança» (segundas 07:30 UTC), «Verificação semanal»
  conversão de gravações (diária), «Texto dos PDF» (diária 07:20 UTC); pg_cron no Supabase (ver `supabase/*.sql` e `cron.job`).

## Ambiente e ferramentas
- Variável de ambiente: `SUPABASE_ACCESS_TOKEN` (token de gestão, restrito a este projeto: não cria projetos novos).
- SQL em produção: `POST https://api.supabase.com/v1/projects/hmfjbyiesghqhwhqgnem/database/query` com
  `{"query": "..."}` (um script `q.sh "sql"` / `q.sh -f ficheiro` no rascunho da sessão ajuda).
- Publicar uma função: `POST /v1/projects/hmfjbyiesghqhwhqgnem/functions/deploy?slug=<nome>` (multipart: `metadata`
  com `entrypoint_path`, `name`, `verify_jwt` + `file=@index.ts`; para `conteudo` também `file=@busca.js` da raiz).
  `verify_jwt`: true só em `notify` e `sync-songs`.
- Conectores usados: GitHub (MCP), Google Drive (ler a pasta da cópia), Gmail (verificar emails do Resend), Claude Code
  Remote (sessões, rotinas, send_message).
- Capturas da app: `NODE_PATH=$(npm root -g) NODE_USE_ENV_PROXY=1 node tools/screens/capture.mjs [ids]` (modo `?demo`,
  dados fictícios). Para comparar antes/depois, copiar `tools/screens/out/png` e comparar píxeis (Pillow). A captura
  reescreve `mapa/*.html`: fazer `git checkout -- mapa` depois (o mapa é da sessão do mapa).
- Playwright/Chromium já instalados (`/opt/pw-browsers`); nunca `playwright install`. Docker não funciona neste ambiente
  (limites de pull); para testes de base de dados usar PostgreSQL local com stubs do Supabase.

## Coisas que não estão no código
- Configuração do Supabase, Google Cloud, GitHub Pages, Resend e Groq: ver `docs/AMBIENTE.md` (sessão de cópia).
- O Tiago aprovou: design system como fonte única (tokens), verde da marca #10835c/#0b6b4b (contraste 4,5:1, texto opaco
  sobre a marca), chips separados por função (etiqueta / interruptor / segmentado), botões pequenos só em linhas densas,
  maiúsculas mantidas como estão, nomes curtos das categorias na página inicial («Todos os cânticos» por extenso).
- Folhas: dois estados guardados (`collections.published`): por publicar (só Maestro/Gestor a vê; etiqueta amarela
  «Por publicar» por cima do título e botão branco «Publicar» ao lado de «Editar folha»; uma folha sem cânticos não se
  publica) e publicada. A página da folha é sempre só leitura (só secções com cânticos), com «Editar folha» no fim (como
  «Editar cântico»). A edição é uma janela por cima (`#col-ed`) que trabalha numa cópia: Coro/Cancioneiro em segmentado,
  título, duração, cânticos e secções (tocar num item mostra ↑ ↓ 🗑 ✓ com contorno, por cima da linha à direita; numa
  secção, o nome com lápis à esquerda abre a mudança de nome; apagar pede confirmação). «Guardar» grava tudo de uma vez e
  põe a folha por publicar; «Cancelar» pede confirmação se houver alterações; «Apagar» (vermelho) pede confirmação.
  Folhas novas abrem logo a edição; o template só se escolhe ao criar.
- Livro no cântico (Maestro): «Coleções» (Cancioneiro, Preferidos; o Coro não se escolhe aqui) e «Folhas», linhas cheias
  quando o cântico lá está; Cancioneiro original fica cheio e fixo, com a explicação.
- Cânticos novos começam sempre por aprovar, também os de um Maestro (função `conteudo`, op `addsong`); ao aprovar,
  vai sempre para o livro do Coro (op `coro`) e,
  se o Maestro escolher Cancioneiro, também para o Cancioneiro (op `promote`). Etiqueta amarela
  «por aprovar» por cima do nome na página do cântico; nas listas, na linha do nome, à direita, por cima do número.
  Na caixa amarela, Aprovar e Recusar (vermelho cheio) à direita, com a mesma largura.
- Menu Coleções: Preferidos e Novos Cânticos no topo, sem título; depois «Livros» e «Folhas». No perfil Cancioneiro
  não há título «Livros» (só o Cancioneiro, logo a seguir aos Preferidos).
- Botões lado a lado numa linha de ações: o principal primeiro — em linha, primeiro = à direita (Apagar | Cancelar |
  Guardar; Cancelar | OK; Editar folha | Publicar; Recusar | Aprovar; Terminar sessão | Fechar); em coluna, primeiro = em
  cima (Guardar, Cancelar, Apagar; Publicar, Editar folha). A mesma largura, a ocupar a linha (rodapés das janelas,
  Editar folha/Publicar, Terminar sessão/Fechar; Aprovar/Recusar à direita com a mesma largura); botões de 40 px sempre
  com letra normal (400). Confirmações que apagam ou deitam fora (Apagar, Remover, Retirar, Recusar, Sair sem guardar):
  botão vermelho cheio.
- Página inicial (Coro e acima): a secção «Cancioneiro» só conta e lista cânticos do Cancioneiro (`catSongs`). No fim, a
  secção «Todos os cânticos» (`TEMAS` em app.js, não aparece no menu Coleções nem se escolhe em «Editar cântico») junta
  todos os cânticos de todas as fontes em 7 categorias fixas, aprovadas pelo Tiago (um cântico pode estar em várias):
  Liturgia e Missa · Espirituais e gospel · Cânticos do Movimento · Infantis · Gestos · Populares e tradicionais ·
  Pop, rock e canções de autor. Vêm das etiquetas dos livros (regras em `TEMAS`) e, para os cânticos sem nenhuma dessas,
  de uma etiqueta `song_tags` com `grp = 'Tema'` atribuída por esta sessão (507 classificados em 2026-10-11). **Tarefa
  contínua**: quando entram cânticos novos ou de novas fontes, classificar os que ficam sem categoria (consulta abaixo) e
  inserir a etiqueta «Tema» na base de dados. Os cânticos sem nenhuma categoria são os que não cumprem as regras de
  `TEMAS` nem têm etiqueta «Tema» (consulta no fim deste ficheiro).
- Versões do mesmo cântico (`songs.version_of` → slug do principal; `supabase/versoes.sql`): a versão sai das listas e
  aparece no seletor de língua do principal (língua; ou o título, se a língua já estiver ocupada); o principal herda as
  fontes, etiquetas e ficheiros das versões; o endereço de uma versão abre o principal com ela escolhida. Desfaz-se pondo
  `version_of` a null. Em 2026-10-11 ligadas 35 versões (traduções do Songbook com «(p. N)», traduções rítmicas de cânticos
  do Movimento, hinos e cânticos de Natal em várias línguas). Duplicados na mesma língua que eram só a página do CANTI
  foram juntados e apagados. «Dos cocodrilos» é versão (Songbook) de «Os crocodilos».
  No perfil Cancioneiro só aparecem as versões que estão no Cancioneiro (`cancioneiro = true`); uma versão cujo principal
  não está no Cancioneiro aparece sozinha nas listas (`folded`). O Maestro / Gestor, com a versão escolhida, tem
  «Acrescentar esta versão ao Cancioneiro» / «Retirar…» (op `promote` da função `conteudo`; as do site original ficam).
  O principal herda fontes, etiquetas e ficheiros das versões, menos a fonte «original».
- Cores por perfil (v203): família `perfis` em `design/tokens.json` → `:root.perfil-<id>` em theme.css (a app põe a
  classe no `<html>`, para --accent e afins a apanharem). Cancioneiro = família color. A capa usa `--app-brand…` (sempre
  verde). Títulos das janelas em --accent. Apagar (--danger) em âmbar escuro em todos os perfis.
- Folhas (v204): «Editar nesta folha» (✎ nas ações de um cântico em Editar folha) guarda a letra só dessa folha em
  `collection_lyrics` (`supabase/folhas-letras.sql`; a letra só pela função `conteudo`: op `collyrics` para gravar, op
  `song` com `collection` para ler, e a folha partilhada já a usa). A app só lê `edited_at`, embutido em
  `collection_songs(…, edit:collection_lyrics(edited_at))` → `c.edits`. Sem chave direta para `collections` (o PostgREST
  ficaria com duas ligações collections → collection_songs). O cântico aberto da folha: `#/cantico/<slug>/folha/<id>`.
  PDF da folha: uma só opção com interruptores Acordes / Partituras (ligados por omissão numa folha do Coro).
  v205: todos os cânticos da página da folha abrem com `/folha/<id>`; assim aberto, o cântico não mostra edições do
  original (Editar cântico, ficheiros, aprovar, versões). Maestro vê «abrir fora da folha para editar». As ações do item
  escolhido em Editar folha ficam numa linha por baixo dele.
  v206: nota «Na folha «<título>»» (· letra desta folha), sem ligações. Interruptores Acordes / Partituras por cântico
  em «Editar nesta folha» (só folha do Coro e só se o cântico os tem) → `collection_songs.no_chords / no_scores`
  (grants por coluna). No PDF, um cântico leva acordes / partituras só com o seu interruptor e o de «Gerar PDF».
  Indicador: «editado nesta folha · sem acordes · sem partituras» (`editLabel`).
- Grupos (v209, `supabase/grupos.sql`; arranque em `grupos-inicio.sql`, já corrido: 5 grupos e todas as contas em todos):
  `groups`, `user_groups` (por email), `collection_groups`; `allowed_emails.groups_asked`. Cada pessoa escolhe os seus
  (`set_my_groups`; Perfil → Grupos, ou a janela de informação no perfil só Cancioneiro; e a pergunta da 1.ª abertura).
  Sem grupo não recebe folhas; folha sem grupos = todos os grupos; Maestro/Gestor veem todas. A RLS de `collections`
  usa `col_group_ok(id)`; a função `conteudo` também filtra (colSet e versão da folha). Publicar e Editar folha escolhem
  os grupos. Gestão: grupos de cada utilizador (`set_user_groups`), e o Gestor gere a lista (`group_save`,
  `group_remove`: as folhas que ficam sem grupo passam a por publicar).
  v210 (`grupos-maestro.sql`): o Maestro também só vê / gere / publica folhas dos seus grupos (RLS de collections,
  collection_songs, collection_sections, collection_groups; `my_group(gid)`; conteudo: bypass só com lvl ≥ 4). Ao publicar
  só escolhe grupos seus, e «Todos os grupos» só se estiver em todos. O Maestro só põe/tira os seus grupos numa folha.
  Folha nova de um Maestro que não está em todos os grupos nasce com os grupos dele. O Gestor vê e gere todas.
- Por fazer (adiado pelo Tiago, 24 out): no menu Partilhar da folha, enviar por email o endereço ou o PDF a todos os
  utilizadores dos grupos da folha. Destinatários: membros dos grupos da folha (todos, se a folha é para todos os
  grupos) que veem o público da folha; sem grupo, nada. Ligação abre a folha na app; PDF com a escolha Acordes /
  Partituras. Bloqueio: o Resend só tem o remetente de teste (só entrega ao Tiago); é preciso um domínio verificado no
  Resend (ou Gmail com palavra-passe de app) antes de implementar.
- v217: guardar em Editar folha já não despublica (só «Despublicar»). Tudo numa só transação: RPC
  `save_collection(cid, p)` (`supabase/folhas-guardar.sql`, security invoker); as versões da letra (collyrics) vão depois,
  pela função conteudo. O gatilho col_groups_guard só atua ao criar publicada, ao publicar ou ao tirar o último grupo.
- Drive do Coro → app (regras do Tiago, 26 out):
  - **Nunca tirar cânticos nem ficheiros da app** por terem desaparecido do Drive. O drive-sync só marca drive_files
    como «removed» e o email diz «mantidos no Cancioneiro». Nada se apaga em songs nem em song_files.
  - **Pastas novas sem cântico**: verificar sempre se correspondem a um cântico que já existe com outro nome (título,
    autor, ficheiros). Se sim, ligar em drive_folders. Se não, criar o cântico (Coro, `coro_clu`/`missa`, «Para a Missa»,
    Tema), ligar a pasta e apagar as linhas desses ficheiros em drive_files para a sincronização seguinte os importar.
    A letra só vai para a base de dados (nunca para o repo). Se a partitura for digitalizada e não der para ler com
    certeza, fica «(letra por transcrever …)», sem inventar.
  - drive_folders aceita também o caminho de um ficheiro (pasta com vários cânticos, ex.: «Hinos laudes»).
  - **Só leitura, sempre** (Tiago, 8 nov): nada se escreve no Drive do Coro. **Seguir os atalhos**: o drive-sync trata um
    atalho para pasta como pasta (caminho do atalho, conteúdo do destino) e um atalho para ficheiro como esse ficheiro
    (descarregado do destino). Atalhos já registados («Sicut cervus - Palestrina», em missa/) são tratados como novos
    na primeira vez que se seguem.
- Livro «Coros & Companhia» (v226, `supabase/coros-companhia.sql`): repertório do grupo (https://listacorosecompanhia.netlify.app/,
  folha Google publicada em CSV). Fonte `coros_companhia` (song_sources.ref = título na lista), momentos em song_tags
  (grp «Coros & Companhia»), gravações só por ligação em song_files kind 'other' (path = URL; secção «Ouvir» no cântico;
  os MP3 deles não se copiam). Importados 104 (17 já existiam, 87 novos «por transcrever», 1873–1959). Atualização
  semanal: função `sync-cc` (pg_cron segunda 06:30 UTC; log em cc_sync_log) acrescenta momentos e ligações dos já
  ligados e comunica por email os títulos novos (a webapp verifica correspondências antes de criar) e os que saíram (nunca
  se apagam). Rede do ambiente: listacorosecompanhia.netlify.app, docs.google.com, doc-0s-0s-sheets.googleusercontent.com.
- Letras do Coros & Companhia (7 nov): 53 MP3 do Drive do grupo transcritos (função pontual `cc-transcribe`, Whisper
  da Groq; texto em cc_transcripts). 37 ficaram com rascunho «(rascunho transcrito automaticamente da gravação — a
  rever)» e 13 partes fixas da Missa (Santo/Sanctus, Cordeiro, Kyrie, Senhor tende piedade) com o texto litúrgico
  oficial. 37 continuam «por transcrever» (só YouTube, ou transcrição fraca). A pesquisa na web não encontrou estas
  letras (repertório de folhas de paróquia).
- Reconhecimento de cânticos (microfone): só para contas com `allowed_emails.can_listen` (a família do Tiago: tiago,
  catarina, beatriz, leonor, constança, teresa — `supabase/reconhecimento.sql`). A app pergunta `can_listen()` e esconde
  o botão e a ajuda (`body.can-listen`); a função `transcribe` recusa as outras contas.
- Supabase, desde 30/out/2026: tabelas novas em `public` não recebem acesso automático — dar os `grant` no mesmo script
  que as cria (como já se faz por coluna em `songs`).
- Campos obrigatórios em toda a app: `*` vermelho (`.req`) a seguir ao nome do campo e o botão de guardar desativado até
  estarem preenchidos (`reqGate` em app.js; `appPrompt` com caixa de texto obrigatória salvo `optional`).
- Folhas e Preferidos são descarregados ao abrir a app; os endereços públicos de folhas trazem todas as letras num só
  pedido e ficam guardados no telemóvel até expirarem.

## Estado e pendentes (15 nov 2026, v246)
- v228: templates de folha por ordem Missa → Missa completa → restantes (alfabética); tutorial atualizado (grupos,
  Coros & Companhia, «Todos os cânticos», seletor de língua, folhas por publicar/grupos) e corrigido (esperava pela lista
  de cânticos: na 1.ª abertura os passos do cântico ficavam de fora).
- v229 (9 nov): arrumação de tokens pedida pelo design, sem mudança visível — em styles.css os tamanhos 11/13/15/16px
  passaram a var(--fs-caps/-small/-ui/-field) e o raio 26px do botão «Entrar com Google» (`.google-btn`; o design
  chamou-lhe «aviso flutuante») passou a var(--pill). Ficam como exceções: 19px e 24px do A−/A+, «i» 24px, etiqueta
  teste 9.5px, mark 2px, pdfbar 22px. Captura do botão antes/depois idêntica ao píxel (44 px de altura: 26px já era
  meio-círculo).
- v230 (9 nov, semanal v229: 234 ok, 1 falha FUN-71): tutorial — a caixa usava 190 px fixos para a sua altura e, no
  passo «+ Nova folha» (Maestro/Gestor), saía do ecrã e escondia «Seguinte»/«Saltar». place() mede agora a caixa:
  por baixo do destaque, senão por cima, senão no fundo, sempre dentro do ecrã; se o elemento estiver fora do ecrã,
  é trazido ao centro primeiro. Verificado no ?demo a 390×844, 375×667 e 360×640, nos 4 perfis: todos os passos até
  «Terminar». O passo das coleções (destaque = painel inteiro) continua com a caixa por cima do painel, como antes.
- 11 nov: «Converter gravações» falhou (DNS de security.ubuntu.com no runner do GitHub, 1 h presa a instalar o ffmpeg;
  não era código nosso). Re-corrida a pedido do Tiago. Workflow endurecido: job com limite de 30 min, instalação do
  ffmpeg com limite de 10 min, 3 tentativas e Acquire::Retries/Timeout no apt.
- v231 (14 nov, pedido do Tiago): pesquisa por número de página mostra também os cânticos das páginas antes e depois
  (logo a seguir aos da página pedida; a anterior primeiro). Só em `search()` na app (book_page já vem na lista).
- **Pesquisa nova (14 nov, pedido do Tiago; A na v232, B na v233, C na v236).** Dados: 1923 cânticos, 1,3 MB de
  letras → índice em memória na função `conteudo` (não precisa de Postgres). Motor único em `busca.js` (raiz do repo),
  usado pela função (publicada com `busca.js` ao lado: `import './busca.js'`) e pela app (modo demo e funções de
  tolerância a erros). Camadas: palavra exata 1 · variante ortográfica PT/IT/LA/ES (ph/f, th/t, y/i, j/i, k/c, h mudo,
  letras dobradas) 0,9 · início de palavra 0,75 · erro de 1–2 letras 0,6 (Levenshtein); frase exata +0,5; termos pesados
  por raridade; trechos de ≤7 palavras com `marks` (palavras a realçar). Identificação pelo som: palavras ouvidas
  corrigidas para as do índice antes da correspondência. Medido com os dados reais: índice 150 ms, pesquisa 3–19 ms.
  Muitas pessoas ao mesmo tempo (pedido do Tiago): títulos, números e páginas resolvem-se no telemóvel (sem servidor);
  no servidor, resultados partilhados 60 s por pesquisa (filtro do perfil depois), cache de sessão (60 s), grupos (60 s)
  e folhas ativas (30 s), registo do limite sem atrasar a resposta. Limite de pesquisa 200/h, 1000/dia; números e
  pesquisas < 3 letras não vão ao servidor. Sem rede: aviso «a pesquisa só procura nos títulos, autores, números e páginas».
  B (v233): texto dos PDF em `song_texts` (`supabase/texto-pdf.sql`; RLS sem políticas, só a chave de serviço lê),
  uma linha por song_files.path (nos livros, o recorte `#p=…&c=…`). Função `pdf-texto` (OIDC do GitHub, audiência
  `cancioneiro-pdf`, só do workflow `texto-pdf.yml`; op list / save; retira textos de ficheiros que já não existem).
  Action «Texto dos PDF» (`tools/pdf/texto.mjs`, diária 07:20 UTC e a pedido com «minutos»): livros primeiro;
  pdftotext no recorte, OCR tesseract (por/ita/spa/eng/fra/lat) quando quase não há texto; limpeza de símbolos de
  música, acordes e letras soltas; sílabas com hífen guardadas também juntas. Pára aos 70 min e continua no dia
  seguinte. A `conteudo` junta este texto ao índice (linhas `pdf`, depois da letra; field 'pdf' nos resultados, a app
  mostra «Na partitura: …»; o perfil Cancioneiro não recebe trechos de partituras) e refaz o índice quando chega texto.
  Verificação (14 nov): a camada de texto dos livros nem sempre coincide com a imagem (o recorte de «Non Nobis»
  apanhava a Salve Regina): cada recorte é lido também por OCR e a camada de texto só vale se disser o mesmo. Alguns
  recortes guardados em song_files estão mesmo errados (mostram outro cântico, ex.: «Father and Son» mostra
  «Everybody needs somebody»): a `conteudo` só usa o texto a partir da linha com o título e, se o cântico tem letra,
  só se coincidir com ela (≥30%); sem letra e sem título no recorte, não usa.
  Valor: 761 cânticos (sobretudo CANTI e Songbook) só tinham um marcador em vez da letra.
  Primeira extração completa (14 nov, 25 min): 1882 ficheiros — 1709 recortes com camada de texto, 41 por OCR
  (camada desalinhada), 10 sem texto legível; 122 partituras soltas. 779 dos 784 cânticos sem letra passaram a ter
  texto pesquisável. Índice com PDF: 273 ms a construir, 36 mil palavras; pesquisas 2–90 ms.
  Ferramenta (14 nov): Action «Texto dos PDF» com a entrada «localizar» = slugs → `tools/pdf/localizar.mjs` (op
  `locate` da pdf-texto) lê por OCR as páginas p−1…p+1 e regista só coordenadas dos grupos de linhas com palavras da
  letra (e do título). Corrida de 14 nov (run 43649599980): erros claros — padre_claudio_chieffo (p80: coluna errada,
  letra em col1 0,076–0,670, título 0,036), minha_luz (p399: título 0,218, letra 0,257–0,554; o recorte começa em
  0,299 e vai a 0,954), la_smortina (p100: letra 0,277–0,347, recorte 0,382–0,570), vero_amor_e_gesu (p35 CANTI:
  letra 0,471–0,552, recorte 0,659–0,787); vários parecem bem (a letra está dentro do recorte: outra língua/versão);
  os de inglês com palavras comuns (father_and_son, all_of_me) são ambíguos só com coordenadas. Não se corrigiu nada às
  cegas: à espera do Tiago (revisão visual — ex.: ecrã de Maestro com a página, o recorte atual e o proposto).
  **Revisão dos recortes (v237, 15 nov, decisão do Tiago: ecrã de revisão + corrigir os claros + folha para Maestros):**
  tabela `crop_reviews` (`supabase/recortes.sql`; só service_role): 27 recortes (os 26 + vero_amor_e_gesu CANTI p35),
  com `proposed` (father_and_son, vorrei p277) e `previous` (os corrigidos). Corrigidos e confirmados pelo texto:
  padre_claudio_chieffo (p80, coluna errada; 60% da letra) e minha_luz (p399; título no recorte). Tentados e repostos
  (0% da letra — o localizador engana-se com palavras comuns): la_smortina p100, vero_amor_e_gesu p35.
  Ops da conteudo (lvl ≥ 3): `crops` (pendentes), `croppages` (páginas atual/anterior/proposto ±1, conta no limite
  file), `cropset` {id, path?} (valida livro, slug, 1–4 partes, páginas perto das atuais, frações; muda
  song_files.path; marca feito). Na app: caixa amarela «Recorte do livro a rever» na página do cântico (Maestro+),
  diálogo com as páginas (atual laranja tracejado, proposto verde --app-brand, anterior pontilhado, desenhado na cor do
  perfil; dois toques por parte, até 4): Manter / Usar o proposto / Repor o anterior / Usar o desenhado. Demo: exemplo
  no Amazing Grace. Folhas por publicar (só Maestro/Gestor) «Rever recortes dos livros (1/3, 2/3, 3/3)» com os 24
  cânticos (máx. 10 por folha), até 15 dez. Recorte mudado → o texto do PDF é refeito pela Action seguinte.
  Lista original dos suspeitos:
  alguns são outra versão/língua (legítimos), outros mostram mesmo outro cântico (ex.: father_and_son). A app mostra
  esses recortes como «Partitura». Lista (slug, livro, página):
    ave_regina_coelorum_gregoriano (songbook p.196); gloria (canti2024 p.68); lauda_sion_salvatorem_gregoriano
    (songbook p.191); magnificat_monjas_trapistas_vitorchiano_silva (canti2024 p.43);
    minha_luz_maria_teresa_noronha (canti2024 p.399); o_sanctissima_canto_siciliano (canti2024 p.38);
    padre_claudio_chieffo (canti2024 p.80); rock_my_soul_espiritual_negro (songbook p.48);
    sigh_no_more_mumford_sons (canti2024 p.343); timoneiro_paulinho_viola (canti2024 p.331);
    vent_fin_musica_tradicional_francesa (songbook p.265); vero_amor_e_gesu (songbook p.203); viva_la_compani
    (songbook p.238); viva_la_compani (canti2024 p.163); vorrei_francesco_guccini (canti2024 p.88);
    vorrei_francesco_guccini (canti2024 p.277); vuestra_soy_teresa_avila_canto_venezuelano (songbook p.285);
    old_time_religion (songbook p.47); alecrim_popular_portuguesa (canti2024 p.52); all_of_me (songbook p.82);
    an_austrian_went_yodeling (songbook p.85); father_and_son (songbook p.102); gs_cha_cha_cha (songbook p.216);
    miserere (canti2024 p.48); adios_con_el_corazon (songbook p.266); la_smortina (canti2024 p.100) Os livros têm camada de texto
  (rápido); as partituras soltas são mais ruidosas (vozes separadas por sílabas).
  C (v236): texto ao vivo na identificação pelo som (só na nuvem; poucas pessoas têm o reconhecimento, os limites do
  Groq não preocupam): o áudio ouvido até ao momento vai ao Groq aos 2 s e depois a cada 2 s (um pedido de cada vez),
  até 15 s; o texto aparece logo em #listen-text (antes da correspondência) e o estado diz «A ouvir… parece «Título»»
  (score ≥ 0,2); pára quando um cântico se destaca (regra de antes). Com o modelo do telemóvel fica o ritmo antigo
  (8 s e 10 s). Limite da op match na conteudo: 200/h, 1000/dia (eram 30/150; cada audição faz até ~7).
- Publicar `conteudo`: enviar `index.ts` **e** `busca.js` (da raiz) no mesmo deploy (ver «Ambiente e ferramentas»).
- v234 (achado da sessão de testes, SEG-39): a identificação pelo som também não dá trechos de partituras ao perfil
  Cancioneiro (busca.match devolve field 'pdf'|'lyrics'; a conteudo filtra como na pesquisa).
- v235 (pedido do Tiago): enquanto se espera pelo servidor, o título da pesquisa diz «A procurar…» em vez do número
  de resultados (a lista mostra já o que o telemóvel encontrou); o número aparece quando o servidor responde. Números,
  pesquisas curtas, sem rede ou com o servidor em erro: o número aparece logo (`searchLyricsRemote` devolve se espera;
  `lyricFailed` guarda as que falharam, limpo ao voltar a rede e ao mudar de perfil).
- **Eventos (v238, pedido do Tiago, 15 nov): muitas pessoas a abrir, pesquisar e descarregar o mesmo ao mesmo tempo.**
  Lista de cânticos (~1,1 MB, refeita pela base de dados a cada abertura e a cada regresso à app depois de 5 min): agora
  `catalog_version` (`supabase/catalogo-versao.sql`; uma linha, gatilhos por instrução em songs, song_sources,
  song_tags e song_files sobem `v`); a app lê só esse número e só descarrega a lista se mudou (`cancioneiro.songs.v2.versao`).
  Folhas ativas e Preferidos ao abrir: ops novas da conteudo `songs` {slugs ≤60} (letras) e `files` {paths ≤60}
  (endereços de 1 h; livros por página), com as regras dos ops song/file (cânticos de folhas ativas sem limite);
  ~25 pedidos por telemóvel passam a 2–3. Limites: registo de uso de cada pessoa 60 s em memória por instância
  (`logRows`), escrita em lote sem atrasar a resposta (`limitMany`). (A espera de 3–23 s ao acaso antes da pré-descarga foi
  retirada na v240 a pedido do Tiago: não pode parecer que a app está lenta durante um evento.) Já existiam: cache de resultados de pesquisa 60 s, títulos/números/páginas no telemóvel, caches de sessão,
  grupos e folhas na conteudo. Testado com a função a correr localmente (Deno, `npx deno`) contra um Supabase falso.
- v239 (achado alto da sessão de testes, EST-06): a lista de /rest/v1/songs depende de quem pede (RLS «leitura
  familia»: perfil da conta; no perfil Cancioneiro, os cânticos das folhas ativas para o Cancioneiro). A chave guardada
  com a lista (`cancioneiro.songs.v2.versao`) passa a ser versão | conta | perfil da conta | (perfil Cancioneiro) folhas
  ativas para o Cancioneiro com os seus cânticos (`listKey`); `recheckList()` volta a pedir a lista quando a chave muda
  depois de atualizar as folhas (ao abrir e ao voltar à app) ou quando o perfil da conta muda.
- v240 (Tiago, 15 nov: nada de esperas propositadas — num evento o coro já está a cantar): pré-descarga 1 s depois
  de carregar as folhas (sem espera ao acaso); ao abrir uma folha, as letras dos seus cânticos que faltam vêm logo num
  só pedido (`warmSheet`, op songs). **Regra: nunca atrasar de propósito o que a pessoa vê para poupar o servidor.**
- v241 (nota da sessão de testes): letras em lote só por `songsBatch` (pré-descarga e folha aberta), que não volta a
  pedir cânticos que já estão a vir noutro lote (`batching`) ou num op song (`pending`).
- v242 (Tiago, 15 nov): nas páginas inteiras de um livro («Ver a página inteira» / «Ver as páginas inteiras»), contorno
  na cor --accent à volta das partes que são a «letra do cântico» (os recortes dessa página; `outlineCrops`); na vista
  de um só livro, botão «Ver só a letra do cântico» para voltar ao recorte.
- v243 (Tiago, 15 nov): zoom no diálogo «Rever recorte» — dois dedos ou − / + (100–400%); a zona das páginas
  (.crop-pages, máx. 58dvh) desliza nos dois sentidos e tem `touch-action: pan-x pan-y` (o zoom é dela, não da página);
  mantém o ponto entre os dedos; redesenha as páginas com mais resolução 300 ms depois (máx. 2400 px de largura); os
  dedos a levantar no fim do gesto não contam como canto (400 ms). Testado no ?demo (botões, desenho a 225% com as
  frações certas, beliscão simulado com TouchEvent).
- v244 (desvio apontado pelo design): os − / + do zoom passam a ser o botão de símbolo existente (.icon-btn, --hit ×
  --hit, sem contorno, --accent, fs-ui 700), como A− / A+. Decisões do Tiago (15 nov) sobre a caixa «Recorte do
  livro a rever»: verde fixo do proposto aprovado; maiúsculas → seguir/definir no design system (pedido ao design; à
  espera da especificação dele para aplicar).
- v245 (Tiago, 15 nov): contorno da «letra do cântico» nas páginas inteiras em verde (--app-brand, fixo); quando a letra
  continua noutra coluna/página, a linha de baixo da parte fica tracejada e a de cima da continuação também. No visor
  de partituras, Maestro/Gestor com o cântico em revisão: «Rever recorte» por baixo das páginas (`addCropReview`);
  depois de decidir, o visor fecha (mostrava o recorte antigo).
- v246 (Tiago, 15 nov): cropset — quando o cântico deixa de ter recortes por rever, a conteudo tira-o das folhas
  «Rever recortes dos livros*» e apaga a folha que fique vazia (devolve songDone, removedFrom, deleted); a app, se o
  cântico foi aberto de uma dessas folhas, volta a ela (ou à seguinte, se ficou vazia; sem nenhuma, à página inicial).
  A caixa «Recorte do livro a rever» aparece também com o cântico aberto dentro de uma folha. Os 2 já confirmados antes
  (adios_con_el_corazon, alecrim_popular_portuguesa) foram tirados das folhas por SQL.
- Tudo publicado até à v246 (conteudo versão 42, pdf-texto versão 3, cc-transcribe com gravações do bucket); design, testes e cópia avisados. FUN-71 re-testado na v230: ok (4 perfis × 3 tamanhos). Última corrida completa:
  v229 (234 ok, 1 falha corrigida na v230; COM-02 WebKit por correr).
- Letras (15 nov, Tiago: «faz o que puderes»): os 13 «por transcrever» do Coro — 12 com rascunho em songs.lyrics
  (1.ª linha diz a origem; «(?)» = palavras incertas): Kyrie e Santo (1) com o texto litúrgico; hinos de Laudes de
  domingo e quinta-feira transcritos inteiros, de segunda e sexta só a 1.ª estrofe (é o que está na gravação); Jesus,
  meu Rei (gravação + partitura); Eu não vim para ser servido (gravação + partitura, 1 Cor 13, partes incertas);
  Conta-me outra vez, La fiesta, Os bravos (trechos). Si los hombres fica «por transcrever» com a identificação
  («Si los hombres han llegado hasta la luna», Gilberto Santa Rosa — canção comercial, não se copiou de sites de
  letras). Aleluia (Chepponis): sem gravação nem partitura. Transcrições em cc_transcripts (função `cc-transcribe`,
  agora também com { slug, path } para gravações do bucket; pedido em job_requests 'cc-transcribe').
  Coros & Companhia: os 37 rascunhos continuam a rever (tirada uma linha «Aplausos»); os 37 «por transcrever» só têm
  ligações externas (YouTube / Drive deles) — não há nada que se possa transcrever aqui.
  `conteudo`: a marca do cache das letras inclui catalog_version.v (letras mudadas por SQL sem updated_at ficavam por
  ver até a função reiniciar).
- Joana Paulo Pardal (Maestro) estava sem grupos; acrescentada a todos os 5 grupos a pedido do Tiago (15 nov).
- À espera do Tiago: nada. Adiado: envio de folhas por email (falta domínio verificado no Resend; ver acima).
- **Segunda 9 nov, depois do drive-sync (06:15 UTC)**: drive-sync v10 (8 nov) segue atalhos; o atalho «Sicut cervus -
  Palestrina» (missa/) deve vir no email como pasta nova. Ver em drive_files para onde aponta e o que tem, verificar se
  corresponde a um cântico existente; se não, criar o cântico (regras «Drive do Coro → app»; texto de domínio público).
- Permissão desta máquina: `.claude/settings.json` (fora do repo) deixa passar o `curl` de publicação de funções; numa
  máquina nova volta a ser preciso pedir ao Tiago.
- A sessão de cópia só aceita autorizações do Tiago dadas diretamente a ela (as reencaminhadas daqui não contam).
- Ajudas da sessão que não estão no repo: `q.sh` no rascunho (ver «Ambiente e ferramentas»: recriar com o curl da API).
- Regras dadas em conversa e já fixadas aqui: perfis hierárquicos (8); avisar o design de toda a mudança de interface;
  nunca tirar cânticos/ficheiros da app; verificar sempre correspondências antes de criar cânticos; o Gestor vê todas as
  folhas; testes só com ordem do Tiago (exceto a semanal).

## Primeira tarefa de uma sessão recriada
Ler este ficheiro, `docs/MANUAL.md`, `docs/AMBIENTE.md` e o histórico recente (`git log -30`); confirmar com
`node tools/theme/build.mjs --check`; mandar uma mensagem curta às três sessões acima (ou recriá-las a partir de
`docs/sessoes/`) a dizer que és a nova sessão principal e o teu id; responder ao Tiago com o estado.

## Consulta: cânticos sem categoria em «Todos os cânticos»
```sql
select s.slug, s.title, s.language from songs s
where s.approved is not false and s.language <> 'la' and s.version_of is null
  and not exists (select 1 from song_tags t where t.song_slug = s.slug and (
    t.grp = 'Tema' or t.grp = 'Coro CLU — momento'
    or (t.grp = 'Coro CLU' and t.tag in ('Para a Missa', 'Para Gestos'))
    or (t.grp = 'CANTI 2024' and t.tag in ('Canti per la liturgia', 'Canti della nostra storia', 'Canti per bambini',
        'Canti popolari regionali', 'Canti di montagna', 'Canzoni italiane'))
    or (t.grp = 'Songbook' and t.tag in ('Hymns', 'Latin songs', 'Spirituals', 'Italian folk songs', 'Troubadour-songs',
        'African songs', 'Brasilian songs', 'Rock – pop – folk'))))
order by s.title;
```
