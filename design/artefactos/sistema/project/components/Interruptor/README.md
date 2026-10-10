# Interruptor

Interruptor: uma opção que se liga ou desliga (ex.: «Cancioneiro» e «Coro» na janela Folhas).

- Linha `.switch-row` (role="switch", aria-checked) com altura mínima `--hit`; o texto à esquerda, o interruptor à direita.
- Trilho 36 × 22 em pílula: `--border` desligado, `--accent` ligado; botão de 16 px em `--surface`.
- Fixo (ex.: cântico do Cancioneiro original): mostra-se ligado, sem esbater.
- Desligar algo com consequências pede confirmação: a linha passa a pílula vermelha «Confirmar: retirar» (`.switch-row.armed`).

A pré-visualização usa as classes e o CSS reais da app (secção COMPONENTES de styles.css).
