# Cancioneiro

O sistema de design da app Cancioneiro (PWA de cânticos de coro). Verde da marca em grandes superfícies, texto calmo em Lato, títulos em Marcellus, tudo o que se toca na cor de destaque. É a fonte das regras de estilo da app: os valores aqui são os que a app usa.

## Como uma mudança chega à app

1. Os valores vivem em `design/tokens.json` no repositório tiagomota23/cancioneiro; este Design System é o seu espelho e `theme.css` é gerado a partir dele (`tools/theme/build.mjs`, com `--check`).
2. Mudar um valor aqui (cor, tamanho, raio, espaçamento das maiúsculas, opacidade) é um pedido de mudança: a sessão do mapa compara com o repositório e envia a alteração exata (antes → depois, nome da variável) à sessão da app, que reconstrói `theme.css`, sobe a versão e publica. O mapa, o catálogo e este Design System são atualizados a seguir.
3. Mudanças de componente (forma, comportamento, um componente novo) descrevem-se aqui por palavras (comentário ou README): são confirmadas com o Tiago antes de chegarem à app.
4. Mudanças feitas no código chegam aqui pelo mesmo caminho, no sentido contrário.

Nomes: cada token tem o nome da variável CSS sem «--». Um par claro/escuro gera `--light-X` e `--dark-X`; as opacidades geram cores derivadas de `base` (color-mix).

## Princípios

- **Um estilo por tipo de elemento.** Botões, chips, campos, linhas de opção e listas têm uma só forma cada; uma variante nova no catálogo do mapa é um erro, não uma exceção.
- **A marca é superfície, o destaque é ação.** `brand` / `brand-deep` só em grandes fundos verdes (página inicial, menu, capa); tudo o que se toca usa `accent`.
- **Legível ao ensaiar.** Texto secundário nunca abaixo de `fs-small` (13 px); cinzentos com contraste ≥ 4,5:1 em branco (`text-faint` #767676).
- **A letra dos cânticos é sagrada.** Estrofes, acordes e o tamanho A−/A+ ficam fora da escala.

## Letra

Duas famílias: `serif` (Marcellus) só em títulos e no nome da app; `sans` (Lato) em tudo o resto. Sete tamanhos — `fs-caps` 11px, `fs-small` 13px, `fs-ui` 15px, `fs-field` 16px, `fs-section` 19px, `fs-title` 22px, `fs-display` 35px — e pesos 400 e 700.

- Títulos: serif 400, `fs-title`, maiúsculas, .06em. Nome da app na capa: `fs-display`, .14em.
- Maiúsculas, um espaçamento por função: `ls-caps` .12em · `ls-chip` .08em · `ls-row` .05em. Títulos de linhas de opção `ls-row`; títulos de secção (serif, `fs-section`), chips, etiquetas e linhas das listas verdes `ls-chip`; rótulos dos campos e antetítulos `ls-caps`.
- Botões nunca em maiúsculas.

## Cor

- Marca e destaque: `brand`, `brand-deep`, `on-brand`, `accent` (claro #0e7f58 / escuro #5fcf90), `on-accent`, `tint`.
- Texto em superfícies claras: `text` (principal), `text-soft` (secundário), `text-faint` (dicas, marcadores, símbolos inativos).
- Contornos: `border` (campos, cartões, linhas de opção), `border-dash` («+ novo»), `line` (separadores em superfícies sempre claras), `divider` (separadores nas páginas dos cânticos, servem em claro e escuro).
- Páginas dos cânticos (pares claro/escuro): `paper`, `ink`, `ink-soft`, `chord`, `title`, `pdf-bg`, `pdf-title`.
- Estados: `star`, `danger` (+ `danger-deep`, `danger-border`), `pending-*`, `warn-*`.
- Opacidades derivadas: `on-brand-line` = `on-brand` a 22%, `on-brand-outline` = `on-brand` a 70%, `scrim` = `shadow` a 45%.

## Forma e tamanho

- Raios: `radius-sm` 6px · `radius` 10px · `radius-lg` 14px · `pill` 999px. Pílula em todos os botões e chips; `radius` em cartões, campos e linhas de opção; `radius-lg` nas janelas.
- Tamanhos: `h-btn` 40px · `h-btn-sm` 32px · `h-field` 44px · `h-chip` 24px · `hit` 44px · `icon` 22px · `icon-sm` 16px · `icon-lg` 32px · `stroke` 1.8.
- Símbolos: `icon-sm` no texto, botões pequenos, setas e pesquisa; `icon` em botões de símbolo e linhas de opção; `icon-lg` só no microfone a ouvir. Traço `stroke` em todos (exceção: a estrela cheia da pesquisa, 1.2).
- Folhas no menu: folha publicada = página simples (`ICON_PAGE`); por publicar = página com lápis no canto (`ICON_PAGE_DRAFT`), mesma classe `.book-ic.outline` (`--icon-sm`, traço `--stroke`), `role="img"` e nome «Não publicada». Só Maestro e Gestor veem folhas por publicar.

## Regras

1. **Toque mínimo** — todo o botão de símbolo tem pelo menos `hit` × `hit` de área de toque.
2. **Foco** — `:focus-visible` com contorno de 2 px `accent`, afastado 2 px; sobre a cor da marca, `on-brand`. Campos: contorno 2 px `accent` com desvio −1 e borda `accent`.
3. **Botões sem maiúsculas**; as maiúsculas ficam para chips, etiquetas, cabeçalhos e títulos de linhas.
4. **Serif só em títulos.** O «i» de informação é sempre Marcellus 24 px 700 itálico, cor de destaque, num botão de 44 px.
5. **Nome da app** na barra de topo em `fs-title` (o `fs-display` não cabe entre os dois botões de 44 px).
6. **Ligações** sempre `accent`, também nas janelas.
7. **Texto sobre a cor da marca** sempre `on-brand` sem transparência (autores, números, cabeçalhos incluídos): branco a ≥ 4,5:1 em `brand` e `brand-deep`.
8. **Cores calculadas pelo JavaScript** (medidor do microfone: `brand`, `meter-idle`; PDF: `accent` claro) leem o tema ao abrir. Fora dos tokens só mudam à mão: icons/*.png, manifest.json e a meta theme-color.
9. **Contorno dos botões cheios** — quando a cor do botão é diferente do fundo da página ou da janela, o contorno de 1 px é da própria cor do botão (`accent`, `danger`, `on-brand`), para que todos os botões, cheios e de contorno, tenham a mesma altura (`box-sizing: border-box`).
10. **Campos obrigatórios** — «*» a seguir ao rótulo (`span.req`: `danger`, 700, 3 px de margem); o botão de guardar fica desativado (opacidade .5) até estarem preenchidos. Sem rótulo (Acrescentar utilizador), o «*» fica dentro do campo, à direita. Nas janelas de texto, OK desativado com a caixa vazia (exceto quando o valor pode ficar vazio).
11. **Botões lado a lado** — numa linha de ações (rodapés das janelas `.edit-actions`, `.info-actions` com dois botões, `.edit-bar` com dois botões, `.file-btns`, `.listen-actions`, `.sn-gen`) os botões têm a mesma largura e ocupam a linha (`flex: 1 1 0`). Exceção: na caixa «por aprovar» (`.pend-bar`) Aprovar e Recusar ficam à direita, com a mesma largura (largura do texto). Ficam de fora os botões sozinhos e os da Gestão ao lado de um seletor. Todos os botões de 40 px em letra 400.

## Exceções documentadas

- Etiqueta «VERSÃO TESTE»: 9,5 px 700 maiúsculas (11 px não cabe no espaço de 44 px).
- Ações de item na janela Editar folha (`.ce-acts`): quadrados de 38 px com `radius-sm`, não pílula (área de toque de 44 px mantida).
- Botão «Entrar com Google»: regras da Google (branco, pílula, 16 px, sombra, «G» de 20 px).
- Letra dos cânticos: fora da escala, por desenho.
- Símbolos de texto (A−/A+ 19 e 24 px, setas 18–20 px) só dentro de botões de símbolo.

## Não sincronizado (ainda)

- Escala de espaçamento: os espaços interiores ainda são valores escritos em styles.css (0 18, 12 14, 10 14, 6 0 px). Próxima ronda.
- Sombras (elevação) e movimento: sem tokens.
- Componentes: pré-visualizações estáticas com o CSS real da app (bundle.css = secção COMPONENTES de styles.css). Os tamanhos de letra nas pré-visualizações acompanham a app, não as edições aqui, até a mudança chegar à app.
- Ícones: os símbolos são desenhados no código (SVG inline), não são ficheiros; só o ícone da app está em Logos.
