# Reconstruir o Cancioneiro a partir da cópia de segurança

Para usar se o GitHub, o Supabase ou ambos se perderem. Tudo o que é preciso está na pasta do Google Drive
**Cancioneiro — cópia de segurança** (ver MANUAL.md, secção 8). Os segredos não estão na cópia: recriam-se (passo 4).

## O que tem de ter à mão
- A pasta da cópia (descarregada do Drive: «Transferir» na pasta inteira dá um ZIP).
- Contas: GitHub, Supabase, Google (tiago.mota@gmail.com), Resend, Groq.

## Pela via mais simples: uma sessão nova do Claude Code
1. Crie um repositório vazio no GitHub (ou use o existente) e abra uma sessão do Claude Code com ele.
2. Carregue para a sessão: `codigo/cancioneiro.bundle`, `base-de-dados/esquema.sql`, `base-de-dados/dados.json`, `MANUAL.md` e este ficheiro.
   (Os ficheiros de `canticos/`, `livros/` e `outros/` também, se o armazenamento do Supabase se perdeu; são grandes.)
3. Dê ao Claude acesso ao Supabase (variável `SUPABASE_ACCESS_TOKEN` no ambiente) e cole o texto abaixo.

```
Reconstrói o Cancioneiro a partir da cópia de segurança que carreguei. Lê primeiro MANUAL.md e RECONSTRUIR.md.
1. Repositório: `git clone cancioneiro.bundle` e faz push de todos os ramos para o repositório desta sessão; ativa o GitHub Pages
   no ramo main (raiz). Se o nome do utilizador ou do repositório mudou, atualiza os endereços (procura "tiagomota23").
2. Supabase: se o projeto hmfjbyiesghqhwhqgnem já não existe, cria um projeto novo e atualiza `config.js`, as funções e o SQL
   com o novo endereço e a nova chave pública. Aplica `esquema.sql` (pela Management API: POST /v1/projects/<ref>/database/query);
   se alguma instrução falhar por já existir, continua. Os agendamentos pg_cron usam o endereço das funções: corrige-o se mudou.
3. Dados: `node tools/backup/restaurar-dados.mjs dados.json > dados.sql` e aplica dados.sql (uma só transação; respeita as
   colunas geradas e de identidade; favorites só entram para utilizadores que já existam em auth.users — depois de os
   utilizadores entrarem, volta a correr só essa tabela com `--tabela=favorites`). Se o pedido for grande demais para a
   Management API, gera e aplica uma tabela de cada vez com `--tabela=<nome>`, pela ordem do script.
4. Segredos das funções: pede-me GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (cliente OAuth do Drive), GROQ_API_KEY e RESEND_API_KEY
   e guarda-os no Supabase. Configura o login Google (Authentication → Providers → Google) com o cliente OAuth do login, o
   Site URL e a lista de redireccionamentos (só o endereço da app). Guia-me passo a passo no que tiver de ser eu.
5. Funções: publica todas as de supabase/functions com o verify_jwt indicado no MANUAL.md (secção 3.4).
6. Armazenamento: se o bucket "coro" está vazio, recria-o (privado; tipos e tamanho do esquema) e envia os ficheiros da cópia
   para os caminhos de song_files/pdf_url (as pastas de canticos/ têm os nomes das gravações; livros/ tem as páginas pNNN.pdf).
   Faz um script que cruze song_files com os ficheiros da cópia e mostra-me o que não encontrar.
7. Drive: dá-me as duas ligações para autorizar de novo: drive-auth (Drive do Coro, só leitura, conta tiago.mota@gmail.com) e
   drive-auth?para=copia (destino da cópia, outra conta, definida em drive_state → backup_target).
8. Verifica: corre as Actions (verificação semanal, cópia de segurança), abre a app, entra com a minha conta e abre um cântico.
Regras: nunca ponhas letras no repositório (é público); sobe a versão da app nos três sítios quando a mudares.
```

## À mão (resumo dos mesmos passos)
1. **Código:** `git clone cancioneiro.bundle cancioneiro` → push para o GitHub → Settings → Pages → ramo `main`, pasta raiz.
2. **Base de dados:** projeto Supabase → SQL Editor → colar `esquema.sql` → Run. Importar `dados.json`:
   `node tools/backup/restaurar-dados.mjs dados.json > dados.sql` e correr dados.sql (psql ou SQL Editor).
3. **Login:** Google Cloud → cliente OAuth (Web) com redirect `https://<ref>.supabase.co/auth/v1/callback`; Supabase →
   Authentication → Providers → Google (client id/secret); URL Configuration → Site URL e Redirect URLs = endereço da app.
4. **Segredos das funções:** Supabase → Edge Functions → Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (cliente OAuth do Drive,
   com redirect `https://<ref>.supabase.co/functions/v1/drive-auth`), `GROQ_API_KEY`, `RESEND_API_KEY`.
5. **Funções:** `supabase functions deploy <nome>` para cada pasta de `supabase/functions` (`--no-verify-jwt` em todas menos `notify` e `sync-songs`).
6. **Ficheiros:** recriar o bucket `coro` e enviar os ficheiros (ver o passo 6 do texto acima).
7. **Drive:** abrir `https://<ref>.supabase.co/functions/v1/drive-auth` (Drive do Coro, só leitura, conta do dono) e
   `…/drive-auth?para=copia` (destino da cópia, outra conta; antes definir `drive_state` → `backup_target` = `{"email": "…"}`).
8. **Verificar:** abrir a app, entrar, abrir cânticos e ficheiros; correr as Actions.

## Se só a app ou só uma parte se perdeu
- Só o GitHub: passo 1 (o Supabase continua a funcionar; confirme que o endereço da app é o mesmo).
- Só os ficheiros: passo 6. Só uma letra: está em `dados.json` e na pasta do cântico.
- Um cântico apagado por engano: os dados estão em `dados.json` da cópia anterior (o Drive guarda versões de cada ficheiro).
