# Ambiente de desenvolvimento do Cancioneiro

O Cancioneiro é mantido por quatro sessões do Claude Code na nuvem (claude.ai/code), cada uma com um papel. Este ficheiro
diz como recriar esse ambiente do zero; as instruções de cada sessão estão em `docs/sessoes/`. A cópia de segurança semanal
leva este ficheiro e `docs/sessoes/*.md` para a pasta `ambiente/` do Drive (e o repositório inteiro em `codigo/`).
Para reconstruir a app e os dados, ver RECONSTRUIR.md; este ficheiro trata só das sessões.

## 1. Ambiente (claude.ai/code → ambientes)
- **Nome:** Cancioneiro · tipo: nuvem da Anthropic · repositório: `tiagomota23/cancioneiro` (ramo `main`).
- **Variável de ambiente:** `SUPABASE_ACCESS_TOKEN`: token pessoal da Management API do Supabase (supabase.com →
  Account → Access Tokens). Dá SQL e publicação de funções às sessões. Nunca vai para o repositório.
- **Acesso à rede:** as sessões falam com api.supabase.com, hmfjbyiesghqhwhqgnem.supabase.co, GitHub e as APIs Google.
- **Conectores do claude.ai usados:** GitHub (todas as sessões), Google Drive (backup: ler a pasta da cópia).
- **Modo de permissões:** auto.

## 2. Sessões
| Sessão | Papel | Instruções |
|---|---|---|
| webapp (cloud) | A app: código, base de dados, funções, segurança, versões. Coordena as outras. | docs/sessoes/webapp.md |
| design (cloud) | Sistema de design e mapa da app (artefactos no claude.ai) e tokens do tema. | docs/sessoes/design.md |
| testes (cloud) | Baterias de testes (UI e servidor), catálogo de testes, corrida semanal. | docs/sessoes/testes.md |
| backup (cloud) | Cópia de segurança semanal para o Drive e guias de reconstrução. | docs/sessoes/backup.md |

Ids atuais (mudam quando se recriam; atualizar aqui e nas instruções de cada sessão):
webapp `session_013HL3hqPrAue5YNg8Hq44sg`, design `session_01GWkEx3J14wmMHpvf4WYAM9`,
testes `session_01MbBa3QkGyoxxLSRFoyRJmX`, backup `session_01BKazgpooLjc3L4evvmL8vy`.
As sessões falam entre si com send_message (ferramentas claude-code-remote), sempre pelo id.

## 3. Rotinas (claude.ai/code → Routines)
| Rotina | Quando | Acorda | O que faz |
|---|---|---|---|
| Cancioneiro — testes semanais | segunda 09:47 Europe/Lisbon | webapp | Pede à sessão testes a corrida completa na versão atual; corrige o que for confirmado e devolve para novo teste. |
| Verificação diária do sistema de design | todos os dias 06:52 Europe/Lisbon | design | Compara tokens do sistema de design com design/tokens.json, comentários por responder, versão da app vs. mapa. |
| Verificação da cópia de segurança | segunda, depois das 07:30 UTC | backup | Confirma que a Action «Cópia de segurança» passou; se falhou, corrige e volta a correr. |

A Action «Cópia de segurança» (GitHub, segunda 07:30 UTC) e as outras Actions do repositório não dependem de nenhuma sessão.

## 4. Artefactos no claude.ai (da sessão design)
- **Cancioneiro** (tipo Design System): https://claude.ai/artifact/GkMK5e8ZDXmd3JRAYTcSuC
- **Cancioneiro — mapa da app** (tipo Design): https://claude.ai/artifact/XSy9co1TGzzPDxUGSzjgxT

As fontes de ambos estão no repositório (ver docs/sessoes/design.md); se se perderem, a sessão design reconstrói-os a partir dele.

## 5. Recriar tudo do zero
1. Reconstruir a app e os dados (RECONSTRUIR.md). No fim o repositório está no GitHub com todos os ramos.
2. Criar o ambiente «Cancioneiro» (secção 1), com o repositório e o `SUPABASE_ACCESS_TOKEN`; ligar os conectores.
3. Criar as sessões por esta ordem: webapp, design, testes, backup. Cada uma começa com o texto da sua instrução em
   `docs/sessoes/<nome>.md`. Depois de as criar, atualizar os ids na secção 2 (e nas instruções) e fazer push.
4. Cada sessão recria as suas rotinas (secção 3) e a design recria os artefactos (secção 4) se se perderam; as ligações
   novas vão para docs/sessoes/design.md e para esta secção.
5. A sessão backup corre a Action «Cópia de segurança» e confirma que ambiente/ aparece no Drive.

Atalho: numa só sessão nova, cole
```
Recria o ambiente de desenvolvimento do Cancioneiro. Lê docs/AMBIENTE.md e docs/sessoes/*.md no repositório
tiagomota23/cancioneiro. Cria as sessões webapp, design, testes e backup no ambiente «Cancioneiro» (create_session), cada uma
com o texto da sua instrução; atualiza os ids em docs/AMBIENTE.md e nas instruções; pede a cada sessão que recrie as suas
rotinas e, à design, que confirme os artefactos. Diz-me o que tiver de ser eu a fazer (contas, tokens, autorizações).
```
