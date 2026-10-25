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

## Coordenação com as outras sessões (send_message do Claude Code Remote)
| Sessão | id | O que faz | Quando a avisar |
|---|---|---|---|
| Mapa da app / design | `session_01GWkEx3J14wmMHpvf4WYAM9` | mapa visual (`mapa/`, `tools/screens/`), catálogo, quadro «Padrão de design», artefacto «Design System» (https://claude.ai/artifact/GkMK5e8ZDXmd3JRAYTcSuC) | **a cada subida de versão** (pedido do Tiago: todas as mudanças na interface, por pequenas que sejam; versões sem mudança visível também se dizem): o que mudou visualmente, componentes novos, tokens novos/renomeados, textos e ids |
| Testes | `session_01MbBa3QkGyoxxLSRFoyRJmX` | catálogo de testes (`tests/CATALOGO.md`), `node tests/run.mjs`, relatórios | **a cada subida de versão** (nível rápido + o que a mudança toca) e pela rotina semanal |
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
  e conversão de gravações (diária); pg_cron no Supabase (ver `supabase/*.sql` e `cron.job`).

## Ambiente e ferramentas
- Variável de ambiente: `SUPABASE_ACCESS_TOKEN` (token de gestão, restrito a este projeto: não cria projetos novos).
- SQL em produção: `POST https://api.supabase.com/v1/projects/hmfjbyiesghqhwhqgnem/database/query` com
  `{"query": "..."}` (um script `q.sh "sql"` / `q.sh -f ficheiro` no rascunho da sessão ajuda).
- Publicar uma função: `POST /v1/projects/hmfjbyiesghqhwhqgnem/functions/deploy?slug=<nome>` (multipart: `metadata`
  com `entrypoint_path`, `name`, `verify_jwt` + `file=@index.ts`). `verify_jwt`: true só em `notify` e `sync-songs`.
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
- Reconhecimento de cânticos (microfone): só para contas com `allowed_emails.can_listen` (a família do Tiago: tiago,
  catarina, beatriz, leonor, constança, teresa — `supabase/reconhecimento.sql`). A app pergunta `can_listen()` e esconde
  o botão e a ajuda (`body.can-listen`); a função `transcribe` recusa as outras contas.
- Supabase, desde 30/out/2026: tabelas novas em `public` não recebem acesso automático — dar os `grant` no mesmo script
  que as cria (como já se faz por coluna em `songs`).
- Campos obrigatórios em toda a app: `*` vermelho (`.req`) a seguir ao nome do campo e o botão de guardar desativado até
  estarem preenchidos (`reqGate` em app.js; `appPrompt` com caixa de texto obrigatória salvo `optional`).
- Folhas e Preferidos são descarregados ao abrir a app; os endereços públicos de folhas trazem todas as letras num só
  pedido e ficam guardados no telemóvel até expirarem.

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
