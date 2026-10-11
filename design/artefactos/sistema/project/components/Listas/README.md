# Linhas das listas

Linhas das listas.

- Listas verdes (início, menu, folhas): título `--fs-small` 400 maiúsculas `--ls-chip`; autor (itálico), número, página do livro e notas `--fs-small` sem espaçamento; separador `--on-brand-line`.
- Título de secção (`.rows .cat-head`, `.col-sec .sec-line`, `.az .cat-head` no menu): `--serif` 400 `--fs-section` maiúsculas `--ls-chip`, espaço 28 px acima e 8 px abaixo, traço de 1 px `--on-brand` por baixo. As linhas por baixo ficam em Lato: a diferença de letra separa a secção dos itens. Igual na página inicial, nas folhas e no menu (secções «Os meus cânticos», «Livros», «Folhas»; secções vazias não aparecem).
- Editar folha (`#col-ed`, janela por cima como «Editar cântico»): lista `#ce-rows` em fundo claro — títulos de secção `--brand-deep` com traço `--brand-deep`, linhas `--text`, separador `--line`. «+ Adicionar cântico» (`li.col-add`) no fim de cada secção: `--accent`, `--fs-small` 700 maiúsculas `--ls-chip`, 44 px. «+ Adicionar secção» no fim: tracejado `--border-dash`, `--radius`. Tocar num item: realce `--tint-soft` e botões ↑ ↓ 🗑 ✓ (`.ce-acts`): quadrados de 38 px com `--radius-sm`, contorno `--accent` (caixote `--danger-border`; ✓ cheio, fecha), área de toque de 44 px; numa secção ficam por cima do nome e o lápis (`.ce-name`) à esquerda. Ações: Apagar / Cancelar / Guardar; a janela trabalha numa cópia. A página da folha é só de leitura.
- Listas claras (`.adm-list`, `#sn-flist`, `#sa-list`): separador só em baixo, `--line`, espaço 12 px.
- Gravações (`.recs li`): espaço 6 px (o botão de 40 px já dá ≥ 52 px) e separador `--divider`, que serve em claro e escuro.

A pré-visualização usa as classes e o CSS reais da app (secção COMPONENTES de styles.css).
