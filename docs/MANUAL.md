# Cancioneiro — manual da solução

Versão do manual: 9 out 2026 (app v141). Dono: Tiago Mota (tiago.mota@gmail.com).
Este manual descreve tudo o que compõe o Cancioneiro, como funciona, como se opera e como se recupera de uma perda.
Uma cópia atualizada fica todas as semanas no Google Drive, na pasta **Cancioneiro — cópia de segurança** (secção 11).

---

## 1. O que é

O Cancioneiro é uma app web instalável (PWA) para telemóvel e computador com os cânticos do Cancioneiro original
(cancioneiro.marriaga.com), do Coro CLU, do Songbook, do CANTI 2024 e cânticos acrescentados pelos utilizadores.
Mostra letras com acordes e tradução, gravações por voz, partituras e páginas dos livros; permite pesquisar por título,
autor ou letra, identificar um cântico pelo som, criar folhas (listas para uma Missa) e partilhar cânticos.

O acesso é reservado: só entram contas Google autorizadas, cada uma com um perfil (secção 4).
As letras e os ficheiros são protegidos por direitos de autor (uso privado) e nunca ficam no repositório, que é público.

Endereço: **https://tiagomota23.github.io/cancioneiro/**

---

## 2. Arquitetura

```
 Telemóvel / computador (app, GitHub Pages)
   │  login Google ──────────────► Supabase Auth (fornecedor Google)
   │  lista de cânticos (só títulos) ► Supabase REST (RLS)
   │  letra, ficheiros, pesquisa ───► função conteudo ──► base de dados + Storage (bucket privado "coro")
   │  identificar pelo som ─────────► função transcribe ──► Groq (Whisper)
   │
 Supabase (projeto hmfjbyiesghqhwhqgnem)
   ├─ Postgres: tabelas, RLS, funções SQL, gatilhos, pg_cron (agendamentos), pg_net
   ├─ Storage: bucket "coro" (gravações, partituras, páginas dos livros)
   ├─ Funções (Deno): conteudo, notify, sync-songs, drive-auth, drive-sync, transcribe, gravacoes, backup
   └─ Segredos: GOOGLE_CLIENT_ID/SECRET (Drive), GROQ_API_KEY, RESEND_API_KEY (+ os do próprio Supabase)
 GitHub (tiagomota23/cancioneiro, público)
   ├─ Pages: serve a app (ramo main)
   └─ Actions: verificação semanal, conversão de gravações, cópia de segurança
 Google: login (OAuth do Supabase), Drive do Coro CLU (só leitura, conta tiago.mota@gmail.com)
 Drive de destino da cópia de segurança (OUTRA conta Google; a app só vê e escreve os ficheiros que ela criou)
 Resend: emails para os Gestores (pedidos de acesso, alterações, problemas)
```

Princípios: a app nunca lê letras nem ficheiros diretamente; tudo o que é protegido passa por funções do servidor, um
cântico de cada vez, com limites por pessoa. Os agendamentos e as Actions não têm segredos partilhados: os agendamentos
deixam um pedido em `job_requests` (só a base de dados escreve lá) e as Actions identificam-se com o token OIDC do GitHub.

---

## 3. Componentes

### 3.1 A app (repositório, raiz)
| Ficheiro | Papel |
|---|---|
| `index.html` | página única; Content-Security-Policy (scripts só da app e do endereço exato do supabase-js, com SRI) |
| `app.js` | toda a lógica (listas, cântico, folhas, perfis, gestão, identificação pelo som, modo `?demo`) |
| `theme.css` | tema: todas as cores, letras, tamanhos e formas (também usado por admin.html, drive.html e privacidade.html); para mudar o aspeto, basta mudar este ficheiro |
| `styles.css` | disposição e mecânica do modo claro/escuro (sem cores próprias: usa os nomes de theme.css) |
| `config.js` | endereço do Supabase e chave pública (anon) |
| `sw.js` | service worker: funciona sem rede, cache por versão |
| `worker.js` | transcrição no telemóvel (Whisper em WebAssembly) quando a da nuvem falha |
| `manifest.json`, `icons/` | instalação como app |
| `admin.html` | página dos botões dos emails de pedido de acesso (autorizar/bloquear) |
| `drive.html` | página de resultado da autorização do Drive |
| `privacidade.html` | política de privacidade |
| `vendor/pdfjs`, `vendor/pdf-lib` | ver PDF e juntar fotografias em PDF |
| `mapa/` | páginas de cada ecrã com dados fictícios (para o Figma) |

**Versões:** cada mudança na app sobe a versão em três sítios: `APP_VERSION` em `app.js`, `?v=N` em `index.html`
e `CACHE` em `sw.js`. Faz-se push para `main` (publicado pelo GitHub Pages) e para `perfis-tmp` (mantido igual).

### 3.2 Base de dados (Supabase Postgres)
Principais tabelas:
- `songs` — um cântico por linha: `slug`, `number`, `title`, `author`, `language`, `lyrics` (jsonb: `[{type: verse|chorus, lines: ["texto com [Acorde]"]}]`),
  `translation`, `lyrics_edit` (letra editada, sobrepõe-se a `lyrics`), `cancioneiro` (está no Cancioneiro), `approved`, `rights`, `pdf_url`, `source_hash`, …
  O browser só pode ler as colunas sem letra (permissões por coluna).
- `song_sources` (original, coro_clu, songbook, canti2024, novos), `song_tags` (grupos: Coro CLU, momentos da Missa, Songbook, CANTI 2024, Categoria),
  `song_files` (gravações e partituras: caminho no bucket; páginas dos livros como `livros/<livro>.pdf#p=N&c=recortes`), `song_edits` (histórico de edições).
- `allowed_emails` (quem entra e com que perfil), `access_requests` (pedidos), `invites` (convites), `favorites`.
- `collections`, `collection_songs`, `collection_sections`, `collection_templates` (folhas).
- `song_shares` (endereços partilhados de 24 h), `access_log` (limites de uso), `job_requests` (pedidos dos agendamentos).
- `sync_log`, `health_log`, `drive_files`, `drive_folders`, `drive_state` (autorização do Drive), `drive_sync_log`.

Funções SQL: `my_role()`, `my_rank()`, `role_rank()`, `is_allowed()`, `in_cancioneiro_collection()` (usadas pela RLS),
`call_notify()` e gatilhos (pedido de acesso, novo utilizador, edição de letra, verificação semanal), `colecao_max_canticos()`
(máx. 10 por folha), `backup_schema()` e `backup_objects()` (cópia de segurança).
Os ficheiros SQL em `supabase/*.sql` documentam e aplicam cada parte; o esquema completo e atual é exportado
todas as semanas para a cópia de segurança (`base-de-dados/esquema.sql`).

### 3.3 Armazenamento
Bucket privado `coro` (sem políticas: só a chave de serviço lhe acede; a app recebe endereços assinados de 1 hora).
Aceita só PDF, JPEG, PNG e áudio, até 50 MB. Pastas: `<slug>/…` (gravações e partituras por cântico), `livros/songbook/pNNN.pdf`,
`livros/canti2024/pNNN.pdf` e os livros completos, `partituras/` (PDF do Cancioneiro original), `enviados/<slug>/…` (enviados pela app).
Gravações: sempre MP3 ou AAC (.m4a); outros formatos são convertidos pela Action «Converter gravações».

### 3.4 Funções do servidor (`supabase/functions/`)
| Função | Quem chama | O que faz |
|---|---|---|
| `conteudo` | app (sessão) | letra, pesquisa na letra, identificação, ficheiros, edição, folhas partilhadas, novos cânticos, gestão de utilizadores, convites; limites por pessoa |
| `notify` | gatilhos / admin.html / app | emails aos Gestores (pedido de acesso, alterações do site original, saúde), decisões dos botões do email, convites |
| `sync-songs` | agendamento | lê o site original e acrescenta/atualiza cânticos |
| `drive-auth` | o dono, uma vez | autorizações Google: `/drive-auth` = Drive do Coro, só leitura; `/drive-auth?para=copia` = Drive de destino da cópia, só ficheiros criados pela app |
| `drive-sync` | agendamento | lê a pasta do Coro CLU no Drive: importa gravações/partituras novas, avisa do resto |
| `transcribe` | app (sessão) | transcrição do som (Groq), com limite por pessoa |
| `gravacoes` | Action (OIDC) | lista e substitui gravações a converter |
| `backup` | Action (OIDC) | dados, esquema, ficheiros e acesso ao Drive de destino para a cópia de segurança |

Publicação de uma função: pela Management API do Supabase
(`POST /v1/projects/<ref>/functions/deploy?slug=<nome>` com `metadata={entrypoint_path, name, verify_jwt}` e o `index.ts`),
ou com a CLI `supabase functions deploy <nome>`. `verify_jwt`: true só em `notify` e `sync-songs`.

### 3.5 Tarefas automáticas
| Quando (UTC) | O quê | Onde |
|---|---|---|
| diário 04:30–04:55 | limpezas: folhas expiradas há 1 mês, partilhas, pedidos de agendamento, convites | pg_cron |
| segunda 05:00 | verificação do site original (`sync-songs`) | pg_cron |
| segunda 05:30 | saúde do Supabase (`notify` health) | pg_cron |
| segunda 06:00 | verificação independente (site, app, proteção, login, funções) | GitHub Action «Verificação semanal» |
| segunda 06:15 | Drive do Coro CLU (`drive-sync`) | pg_cron |
| diário 06:45 | conversão de gravações | GitHub Action «Converter gravações» |
| segunda 07:30 | cópia de segurança para o Drive | GitHub Action «Cópia de segurança» |

Falhas: as Actions enviam email ao dono do repositório; as funções enviam email aos Gestores (via Resend).

### 3.6 Serviços externos e contas
- **GitHub** `tiagomota23/cancioneiro` (público): código, Pages, Actions.
- **Supabase** projeto `hmfjbyiesghqhwhqgnem`: base de dados, login, armazenamento, funções.
- **Google Cloud**: (a) cliente OAuth do login, configurado no Supabase (Authentication → Providers → Google);
  (b) cliente OAuth «Cancioneiro Drive (sincronização)», segredos `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` das funções.
- **Resend**: envio de emails (remetente de teste `onboarding@resend.dev`, que só entrega ao dono da conta Resend;
  para outros Gestores receberem é preciso verificar um domínio). Segredo `RESEND_API_KEY`.
- **Groq**: transcrição. Segredo `GROQ_API_KEY`.
- **Claude Code**: sessões de desenvolvimento; uma sessão própria mantém o mapa visual da app (Design no claude.ai).

---

## 4. Perfis e permissões
Hierárquicos (cada um pode tudo o que os anteriores podem), guardados em `allowed_emails.role`:
1. **Cancioneiro** — só os cânticos do Cancioneiro (e os de folhas ativas para o Cancioneiro), sem acordes, gravações nem partituras.
2. **Coro** — todos os cânticos e livros, com acordes, gravações e partituras; pode acrescentar cânticos (ficam por aprovar).
3. **Maestro** — edita letras e ficheiros, aprova cânticos novos, promove ao Cancioneiro, cria folhas, muda perfis até Maestro.
4. **Gestor** — gestão de utilizadores completa; recebe os emails. Só o dono pode despromover outro Gestor.

A app deixa usar um perfil inferior ao da pessoa; o servidor usa sempre o menor dos dois. A RLS usa o perfil real.
Entrada: quem não está autorizado gera um pedido de acesso (email aos Gestores com botões por perfil); convites
(«Partilhar a app») indicam o perfil sugerido, mas a entrada continua a precisar de aprovação.

---

## 5. Fluxos principais
- **Entrar:** «Entrar com Google» → Supabase Auth (PKCE). No computador abre numa janela própria que se fecha sozinha
  (para separadores afixados); no telemóvel e na app instalada, na mesma página.
- **Abrir um cântico:** a lista vem da base de dados (sem letra); a letra vem de `conteudo` (`op: song`), conta para os limites
  (80/hora, 250/dia distintos) e fica no telemóvel (máx. 150, apagadas ao sair).
- **Ficheiros:** `conteudo` (`op: file`) devolve endereços assinados de 1 hora; dos livros só as páginas do cântico.
- **Folhas:** criadas por Maestro/Gestor, para Coro ou Cancioneiro, com duração (24 h a 1 mês), secções e templates; partilháveis.
- **Partilhar um cântico:** endereço de 24 h (máx. 300 aberturas) que mostra só a letra, sem conta.
- **Novos cânticos:** Coro e acima acrescentam (de um endereço, de um PDF ou à mão); os do Coro ficam por aprovar.
- **Identificar pelo som:** grava, transcreve (Groq; senão no telemóvel) e procura na letra.
- **Drive do Coro:** semanalmente, ficheiros novos em pastas já ligadas são importados; o resto vai por email para rever.

---

## 6. Segurança (resumo)
RLS em todas as tabelas; letras fora das colunas legíveis; bucket privado com tipos e tamanho limitados; endereços assinados
de 1 hora; limites por pessoa com aviso por email; só login Google; Content-Security-Policy estrita com SRI; funções agendadas
só com pedido em `job_requests`; Actions sem segredos (OIDC); leitura de páginas externas recusa endereços internos (incluindo por DNS).
Endurecimento da base de dados em `supabase/seguranca.sql`. Revisão completa feita a 9 out 2026.
Pendentes por decisão: partilhas mostram a letra a quem tiver o endereço (24 h); os botões do email de pedido de acesso podem dar
qualquer perfil — proteger as contas Google dos Gestores com verificação em dois passos.

---

## 7. Operação corrente
- **Letras nunca no repositório** (é público). Dados de exemplo só com textos de domínio público.
- **Mudar a app:** editar, subir a versão nos três sítios, push para `main` e `perfis-tmp`; confirmar que o Pages publicou.
- **Mudar a base de dados:** SQL idempotente em `supabase/<tema>.sql`, aplicado pelo SQL Editor ou pela Management API
  (`POST /v1/projects/<ref>/database/query`).
- **Acrescentar uma pessoa:** na app, perfil Gestor → Gestão de utilizadores, ou pelos botões do email de pedido de acesso.
- **Drive deixou de funcionar** (email «Google recusou a autorização»): abrir `https://hmfjbyiesghqhwhqgnem.supabase.co/functions/v1/drive-auth`
  com a conta tiago.mota@gmail.com e autorizar.
- **Correr uma Action a pedido:** GitHub → Actions → escolher → Run workflow.
- **Mapa visual da app:** gerador em `tools/screens/`; a sessão Claude «Cancioneiro — mapa da app» atualiza-o a cada versão.

---

## 8. Cópia de segurança

### 8.1 O que fica guardado
GitHub Action **Cópia de segurança** (`.github/workflows/backup.yml`, script `tools/backup/backup.mjs`), todas as segundas às 07:30 UTC
e a pedido. Escreve num Google Drive **à parte** (outra conta Google, definida em `drive_state` → `backup_target`), pasta **Cancioneiro — cópia de segurança**.
Nunca escreve no Drive do Coro CLU, que só é lido (autorização separada, só de leitura):

```
Cancioneiro — cópia de segurança/
  LEIA-ME — Manual do Cancioneiro   (este manual, Google Doc)   MANUAL.md   RECONSTRUIR.md
  canticos/
    0001 - Título/
      Título.txt                 ficha (número, autor, língua, fontes, etiquetas, direitos, livros), letra com acordes, tradução
      Soprano.m4a, Partitura.pdf, …   gravações e partituras
      Songbook, pág. 12          atalho para a página do livro
  livros/       Songbook/ e CANTI 2024/ (páginas) + os livros completos
  outros/       ficheiros do armazenamento que não pertencem a nenhum cântico
  base-de-dados/  dados.json (todas as tabelas, com letras originais e editadas), esquema.sql (estrutura completa)
  codigo/       cancioneiro.bundle (repositório git com todo o histórico), cancioneiro-codigo.zip (versão atual)
  removidos/    o que deixou de existir no Cancioneiro (nada é apagado)
  .estado.json  estado da cópia incremental (não mexer)
```

No fim de cada execução, a cópia faz um inventário de tudo o que criou no Drive e compara-o com a base de dados (pastas, textos,
ficheiros, base de dados, código); se faltar alguma coisa, a execução falha (e o GitHub avisa por email). Restos de execuções
interrompidas vão para `removidos/duplicados`. As partituras que estão em sites externos são também copiadas para a pasta do cântico.

É incremental: só envia o que mudou (impressão digital de cada ficheiro). Os ficheiros substituídos mantêm as versões
anteriores no Drive (Gerir versões, cerca de 30 dias). Não guarda segredos (chaves e palavras-passe): recriam-se na reconstrução.

### 8.2 Como funciona
A Action pede à função `backup` (identificando-se com o token OIDC do GitHub) os dados (`op=data`), o esquema (`op=schema`),
a lista de ficheiros (`op=objects`), endereços de download (`op=sign`) e um acesso de 1 hora ao Drive de destino (`op=google`, a partir
da autorização `backup_google` em `drive_state`). Essa autorização é só `drive.file`: a app não vê nada do resto dessa conta e só escreve
nos ficheiros que ela própria criou. A cópia recusa-se a correr se a autorização tiver outro âmbito.
Os registos da Action são públicos: só mostram contagens.

### 8.3 Verificar e correr
GitHub → Actions → Cópia de segurança: a última execução deve estar verde; o resumo mostra quantos ficheiros foram novos/atualizados.
No Drive, `.estado.json` tem a data da última cópia (`last.at`). Correr a pedido: Run workflow.
Se falhar com «autorizar de novo»: abrir `https://hmfjbyiesghqhwhqgnem.supabase.co/functions/v1/drive-auth?para=copia` e entrar com a conta de destino.
Mudar a conta de destino: atualizar `drive_state` → `backup_target` = `{"email": "…"}` e autorizar de novo; a cópia recomeça do zero na conta nova.

### 8.4 Usar a cópia sem a app
Cada pasta de cântico é legível diretamente no Drive (ficha + letra em texto, gravações, partituras, atalhos para as páginas dos livros).

---

## 9. Reconstrução
Ver **RECONSTRUIR.md** (na raiz da cópia e em `docs/` no repositório): passos para recriar tudo a partir da cópia,
com ou sem o GitHub e o Supabase atuais, e o texto a colar numa sessão nova do Claude Code.

---

## 10. Histórico e referências
- Repositório: https://github.com/tiagomota23/cancioneiro — o histórico de commits descreve cada mudança.
- `README.md`: resumo técnico por funcionalidade.
- `supabase/*.sql`: alterações à base de dados por tema.
