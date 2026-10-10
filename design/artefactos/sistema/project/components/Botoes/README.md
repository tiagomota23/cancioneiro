# Botões

Botões de ação: pílula, letra Lato, sem maiúsculas, em dois tamanhos e três cores.

- **Normal** — altura `--h-btn`, `--fs-ui` 400, espaço 0 18 px. Classes: `dialog form button`, `.edit-actions button`, `.info-actions button`, `.tour-next`, `.sn-gen-btn`.
- **Pequeno** — altura `--h-btn-sm`, `--fs-small` 700, espaço 0 14 px — **só em linhas densas**: listas da gestão, barra «por aprovar» (`.pend-bar`) e ações no título das listas verdes (`.col-edit`: contorno `--on-brand-outline`, texto `--on-brand`, toque de 44 px). No resto, sempre o botão de 40 px (`.edit-bar` incluída).
- **Cores** — destaque (cheio, `--accent` / `--on-accent`); secundário (`.ghost`: `--surface` com contorno e texto `--accent`); perigo (`.ghost.danger`, `.ghost-btn`, `.adm-no`, `.adm-del`: contorno `--danger-border`, texto `--danger`). Confirmar apagar: fundo `--danger`.
- Nunca em maiúsculas; nunca outro raio que não `--pill`. Exceção: o botão «Entrar com Google» segue as regras da Google.

A pré-visualização usa as classes e o CSS reais da app (secção COMPONENTES de styles.css).
