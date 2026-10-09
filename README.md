# Cancioneiro

Webapp móvel (PWA) do cancioneiro: pesquisa por título, autor, número ou palavras da letra/tradução; acordes sobre a letra; tradução alternativa; tamanho de letra ajustável.

- Dados: tabela `songs` no Supabase (ver `schema.sql`). Só entram contas Google autorizadas (`allowed_emails`); o browser lê apenas o índice (títulos, autores, etiquetas).
- `parse.py` converte o HTML original em JSON; `seed.py` carrega-o no Supabase.
- Alojamento: GitHub Pages.

Formato da letra (`lyrics`/`translation`, jsonb): `[{ "type": "verse" | "chorus", "lines": ["Texto com [Acorde]sílaba", ...] }]`

## Perfis de utilizador
Cada email autorizado (`allowed_emails.role`) tem um perfil; os perfis são hierárquicos e cada um pode tudo o que os anteriores podem:
- **Cancioneiro** (círculo): só os cânticos do Cancioneiro (`songs.cancioneiro`: os do site original e os promovidos), sem acordes, partituras nem gravações, sem copiar a letra; preferidos.
- **Coro** (círculo com C): todos os cânticos e livros, com acordes, partituras e gravações; não edita.
- **Maestro** (círculo com M): edita letras, promove cânticos ao Cancioneiro (ou retira os promovidos) e, na Gestão de utilizadores, muda perfis entre Cancioneiro e Maestro (não vê os Gestores).
- **Gestor** (círculo cheio): página "Gestão de utilizadores" (`#/gestao`): acrescentar/retirar pessoas, mudar perfis, decidir pedidos de acesso; recebe os emails dos pedidos, que têm um botão para cada perfil.

O símbolo no canto superior direito mostra o perfil ativo; tocando nele escolhe-se outro perfil até ao da pessoa. As regras valem também
no servidor: RLS (`my_rank()`) na lista de cânticos e ficheiros, e a função `conteudo` usa o menor entre o perfil ativo e o da pessoa.
SQL em `supabase/perfis.sql`. Os emails para os Gestores usam o remetente de teste do Resend, que só entrega ao dono da conta Resend;
para outros Gestores receberem é preciso verificar um domínio no Resend.

## Coleções
Um Maestro (ou Gestor) cria coleções no menu ☰ (Livros → "+ Nova coleção"): título, público (Coro ou Cancioneiro) e duração
(24 h, 48 h, 1 semana, 1 mês). Em cada cântico há "Adicionar a uma coleção"; na lista da coleção, deslizar para a esquerda
mostra Remover / ↑ / ↓ (no computador, botão ⋯), e "Editar" muda as propriedades (a duração conta a partir de quando se guarda).
Qualquer cântico pode entrar numa coleção do Cancioneiro: enquanto a coleção durar, o perfil Cancioneiro vê-o (RLS e função
`conteudo`). As coleções expiradas desaparecem para os outros perfis e são apagadas 1 mês depois (pg_cron
`cancioneiro-colecoes-limpeza`). SQL em `supabase/colecoes.sql`.

## Proteção do conteúdo
A letra, as gravações e as partituras nunca são lidas diretamente da base de dados: passam pela função `supabase/functions/conteudo`
(`song`, `search`, `match`, `save`, `file`), um cântico de cada vez, com limites por conta registados em `access_log`
(cânticos: 80/hora e 250/dia distintos; ficheiros idem; pesquisas 400/2000; identificação pelo som 120/600; edições 60/200).
Ao atingir um limite, o administrador recebe um email. Os ficheiros são entregues por URLs assinados de 1 hora; os livros
(Songbook e CANTI 2024) estão divididos em páginas (`livros/<livro>/pNNN.pdf`) e só são entregues as páginas do cântico.
A app guarda no telemóvel no máximo 150 letras recentes, apagadas ao terminar a sessão. pdf.js está em `vendor/pdfjs/`;
supabase-js tem verificação SRI; as páginas têm Content-Security-Policy. Os links de autorização enviados por email expiram ao fim de 30 dias.

## Verificação semanal
A função `supabase/functions/sync-songs` (agendada com pg_cron às segundas, 05:00 UTC) lê https://cancioneiro.marriaga.com/index.html,
acrescenta cânticos novos e atualiza os que mudaram (comparando a impressão digital `source_hash` de cada bloco). Cânticos apagados na origem não são apagados aqui.
Cada execução fica registada na tabela `sync_log` e aparece no ecrã ⓘ da app.

## Fontes e Coro CLU
Cada cântico tem uma ou mais fontes (`song_sources`): `original` (site cancioneiro.marriaga.com) e `coro_clu` (Drive do Coro CLU).
No ecrã ⓘ, "Mostrar cânticos de" permite voltar a ver só o Cancioneiro original, tal como era.
Os cânticos do Coro CLU têm etiquetas (`song_tags`: para a Missa / para Gestos / momentos da Missa) e ficheiros (`song_files`):
gravações por voz (AAC) e partituras, guardados no bucket privado `coro` do Supabase Storage.
Os scripts de importação ficam em `drive-coro-clu/` (fora do git). A antiga função `coro-import` foi removida (as atualizações vêm agora do Drive).

## Drive do Coro (verificação semanal)
A função `supabase/functions/drive-sync` (pg_cron `cancioneiro-drive-semanal`, segundas 06:15 UTC) lê a pasta do Coro CLU no Google Drive
com a autorização (só leitura) dada uma vez em `…/functions/v1/drive-auth` (cliente OAuth "Cancioneiro Drive (sincronização)", segredos
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Gravações e partituras novas em pastas de cânticos já existentes (`drive_folders`) são
acrescentadas automaticamente; pastas novas, ficheiros alterados (ex.: o Word "Músicas Coro") e apagados são enviados por email para rever.
Nada é apagado no Cancioneiro. Estado em `drive_files` / `drive_sync_log` (só service_role).

## Mapa visual da app
`tools/screens/capture.mjs` abre cada ecrã da app no modo `?demo` (dados fictícios de `tools/screens/fixture.mjs`: só textos de
domínio público, nunca letras da base de dados) e guarda em `tools/screens/out/` (fora do git) uma imagem por ecrã (`png/`,
telemóvel 390 px) e o HTML de cada ecrã (`html/`, para importar no Figma com o plugin html.to.design).
O supabase-js é substituído por `tools/screens/supabase-stub.js` (o modo de demonstração não usa a base de dados).
Uso: `NODE_PATH=$(npm root -g) node tools/screens/capture.mjs [ecrã ...]` (precisa do Playwright com o Chromium).
As imagens alimentam o Design «Cancioneiro — mapa da app» no claude.ai: a cada nova versão da app, gerar de novo e atualizar o Design.
Ecrãs novos ou mudados: acrescentar a `SCREENS` em `capture.mjs`.
