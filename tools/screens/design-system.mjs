// Ficheiros do Design System «Cancioneiro» (artefacto claude.ai) a partir do repositório:
//   design/tokens.json  → project/tokens.json (cópia, com meta.source)
//   styles.css (secção COMPONENTES) → project/components/bundle.css, para as pré-visualizações usarem o CSS real da app
//   + README (regras e exceções), um cartão por componente e a capa.
// Os valores vivem em design/tokens.json; este script só os espelha. Uso: node tools/screens/design-system.mjs [sha]
//   → out/design-system/project/…
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'out', 'design-system', 'project');
fs.rmSync(path.dirname(OUT), { recursive: true, force: true });
const w = (p, s) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const sha = process.argv[2] || '';

// ---------- tokens ----------
const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/tokens.json'), 'utf8'));
const version = (fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').match(/\bv(\d{3})\b/) || [])[1];
tokens.meta = { ...(tokens.meta || {}), source: 'github', repo: 'tiagomota23/cancioneiro', ref: `main${sha ? '@' + sha : ''}`, paths: { tokens: ['design/tokens.json'], css: ['theme.css (gerado)', 'styles.css'] }, synced: new Date().toISOString().slice(0, 10), app: version ? 'v' + version : undefined };
w('tokens.json', JSON.stringify(tokens, null, 1) + '\n');
const fs_ = Object.fromEntries(tokens.type.groups.flatMap(g => g.styles).map(s => [s.name, s.fontSize]));
const col = Object.fromEntries(tokens.color.tokens.map(t => [t.name, t.value]));
const light = n => typeof col[n] === 'string' ? col[n] : col[n].light;

// ---------- bundle.css: a ponte entre as variáveis do Design System e as da app + a secção COMPONENTES de styles.css ----------
const styles = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const i = styles.indexOf('COMPONENTES');
if (i < 0) throw new Error('styles.css sem a secção COMPONENTES');
const comp = styles.slice(styles.lastIndexOf('/*', i));
const alpha = tokens.alpha?.tokens || [];
const bridge = `/* Cancioneiro — ponte para as pré-visualizações (gerado por tools/screens/design-system.mjs; não editar aqui).
   As cores, raios, tamanhos e espaçamentos vêm de tokens.css (este Design System) com os mesmos nomes que a app usa.
   Os tamanhos de letra são fixados aqui a partir de tokens.json: uma mudança de tamanho no Design System
   aparece nestas pré-visualizações depois de chegar à app (ver README, «Como uma mudança chega à app»). */
:root {
  --sans: var(--font-sans); --serif: var(--font-serif);
${Object.entries(fs_).map(([k, v]) => `  --${k}: ${v};`).join('\n')}
  --light-accent: ${light('accent')};
${alpha.map(t => `  --a-${t.name}: var(--${t.name});`).join('\n')}
}
.ds { font-family: var(--sans); color: var(--text); }
${alpha.length ? `.ds { ${alpha.map(t => `--${t.name}: color-mix(in srgb, var(--${t.base}) var(--a-${t.name}), transparent);`).join(' ')} }` : ''}
:where(.ds) button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
.ds dialog { position: static; display: block; margin: 0; padding: 18px 20px; border: 0; border-radius: var(--radius-lg); background: var(--surface); color: var(--text); max-width: 100%; box-sizing: border-box; }
.ds .brand-bg { background: linear-gradient(180deg, var(--brand), var(--brand-deep)); color: var(--on-brand); padding: 14px; border-radius: var(--radius); }
.ds .row, .ds.row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.ds .col, .ds.col { display: flex; flex-direction: column; gap: 10px; }
.ds .lbl { font: 700 var(--fs-caps)/1 var(--sans); letter-spacing: var(--ls-caps); text-transform: uppercase; color: var(--text-faint); margin: 6px 0 2px; }
`;
// regras de componentes fora da secção COMPONENTES que os cartões também mostram
const EXTRA = ['.list-title .list-kicker'];
const extra = styles.split('\n').filter(l => EXTRA.some(x => l.startsWith(x + ' {'))).join('\n');
w('components/bundle.css', bridge + '\n' + comp + (extra ? '\n/* Fora da secção COMPONENTES */\n' + extra + '\n' : ''));

// ---------- componentes: guia + pré-visualização com as classes reais da app ----------
const x = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const pen = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
const share = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 13v7h14v-7"/></svg>';
const C = {
  Botoes: { group: 'Ações', h: 260, title: 'Botões',
    readme: `Botões de ação: pílula, letra Lato, sem maiúsculas, em dois tamanhos e três cores.

- **Normal** — altura \`--h-btn\`, \`--fs-ui\` 400, espaço 0 18 px. Classes: \`dialog form button\`, \`.edit-actions button\`, \`.info-actions button\`, \`.tour-next\`, \`.sn-gen-btn\`.
- **Pequeno** — altura \`--h-btn-sm\`, \`--fs-small\` 700, espaço 0 14 px — **só em linhas densas**: listas da gestão, barra «por aprovar» (\`.pend-bar\`) e ações no título das listas verdes (\`.col-edit\`: contorno \`--on-brand-outline\`, texto \`--on-brand\`, toque de 44 px). No resto, sempre o botão de 40 px (\`.edit-bar\` incluída).
- **Cores** — destaque (cheio, \`--accent\` / \`--on-accent\`); secundário (\`.ghost\`: \`--surface\` com contorno e texto \`--accent\`); perigo (\`.ghost.danger\`, \`.ghost-btn\`, \`.adm-no\`, \`.adm-del\`: contorno \`--danger-border\`, texto \`--danger\`). Confirmar apagar: fundo \`--danger\`.
- Nunca em maiúsculas; nunca outro raio que não \`--pill\`. Exceção: o botão «Entrar com Google» segue as regras da Google.`,
    html: `<div class="ds col"><dialog open><form class="row" onsubmit="return false"><button>Guardar</button><button class="ghost">Cancelar</button></form><div class="edit-actions row" style="margin-top:12px"><button class="ghost danger">Apagar</button></div></dialog>
<div class="pend-bar row"><button class="edit-btn">Aprovar</button><button class="ghost-btn">Recusar</button></div><div class="brand-bg row list-title" style="margin:0;font-size:inherit"><button class="col-edit" style="margin:0">Editar</button><button class="col-edit" style="margin:0">Template</button><button class="col-edit" style="margin:0">+ Cântico</button></div></div>` },
  BotoesSimbolo: { group: 'Ações', h: 150, title: 'Botões de símbolo',
    readme: `Botões só com símbolo: área de toque de \`--hit\` (44 px), pílula, símbolo de \`--icon\` com traço \`--stroke\`.

- Ativos na cor \`--accent\`; inativos (fechar, limpar) em \`--text-faint\`.
- O «×» de fechar é sempre o símbolo desenhado (M6 6l12 12M18 6L6 18), nunca um carácter. Classes: \`.dlg-x\`, \`.search .clear\`.
- O «i» de informação (\`.perfil-i\`) é Marcellus 24 px 700 itálico na cor de destaque — o mesmo na barra de topo e na janela Perfil.
- Sobre a cor da marca o símbolo é \`--on-brand\` (\`.col-share\`, botões do leitor \`.mini-btn\`).
- Exceção: as ações de deslizar (subir, descer, remover) são quadradas e da altura da linha.`,
    html: `<div class="ds row"><dialog open style="position:relative;width:220px;height:60px;padding:0"><button class="dlg-x" aria-label="Fechar">${x}</button><form onsubmit="return false" style="padding:8px"><button class="perfil-i" aria-label="Informação">i</button></form></dialog>
<span class="pick-star" aria-label="Preferido">★</span>
<div class="brand-bg row"><span class="mini-btn" aria-label="Pausa">❚❚</span></div></div>` },
  BotoesTexto: { group: 'Ações', h: 120, title: 'Botões de texto',
    readme: `Ações secundárias em texto, na cor de destaque.

- \`.install-line\` — \`--fs-ui\` 400, altura mínima \`--hit\`, com símbolo de \`--icon-sm\` à esquerda.
- \`.revert-link\` — \`--fs-small\`, sublinhado, sem maiúsculas (ex.: «Entrar no Cancioneiro» no rodapé da partilha).
- \`.tour-skip\` — \`--fs-ui\` em \`--text-faint\`.
- Todas as ligações \`<a>\` dentro de janelas são \`--accent\`.`,
    html: `<div class="ds row"><button class="install-line">Adicionar a app ao ecrã principal</button><button class="revert-link">Entrar no Cancioneiro</button><button class="tour-skip">Saltar</button></div>` },
  Etiquetas: { group: 'Etiquetas', h: 110, title: 'Etiquetas',
    readme: `Etiquetas: só informação, nunca se tocam — sem contorno e sem estado de toque.

- Pílula de \`--h-chip\`, \`--fs-caps\` 700 em maiúsculas com \`--ls-chip\`, fundo da própria cor a 12% (color-mix com currentColor).
- Neutra (\`.src-chip\`, \`.moments\`): \`--ink-soft\`. Destaque (\`.src-coro_clu\`, \`.lang-chip\` — idioma atual): \`--accent\`, também com fundo suave, nunca cheio.
- Estado (\`.pend\` «por aprovar»): cheio, \`--pending-bg\` / \`--pending-ink\`.
- Tudo o que se toca é Botão, Ligação, Interruptor ou Segmentado — nunca uma etiqueta.`,
    html: `<div class="ds row"><span class="src-chip">Cancioneiro</span><span class="src-chip">Songbook</span><span class="src-chip src-coro_clu">Coro</span><span class="lang-chip">Inglês</span><span class="moments">Nossa Senhora</span><span class="pend">por aprovar</span></div>` },
  Interruptor: { group: 'Formulários', h: 130, title: 'Interruptor',
    readme: `Interruptor: uma opção que se liga ou desliga (ex.: «Cancioneiro» e «Coro» na janela Folhas).

- Linha \`.switch-row\` (role="switch", aria-checked) com altura mínima \`--hit\`; o texto à esquerda, o interruptor à direita.
- Trilho 36 × 22 em pílula: \`--border\` desligado, \`--accent\` ligado; botão de 16 px em \`--surface\`.
- Fixo (ex.: cântico do Cancioneiro original): mostra-se ligado, sem esbater.
- Desligar algo com consequências pede confirmação: a linha passa a pílula vermelha «Confirmar: retirar» (\`.switch-row.armed\`).`,
    html: `<div class="ds"><dialog open><div class="col"><button class="switch-row on" role="switch" aria-checked="true"><span>Cancioneiro</span><span class="switch" aria-hidden="true"></span></button><button class="switch-row" role="switch" aria-checked="false"><span>Coro</span><span class="switch" aria-hidden="true"></span></button></div></dialog></div>` },
  Segmentado: { group: 'Formulários', h: 120, title: 'Segmentado',
    readme: `Segmentado: escolher uma de várias opções que se excluem (ex.: original / tradução, idioma no ecrã de ouvir).

- Altura \`--h-btn-sm\`, anel interior de 1 px \`--accent\`, pontas em pílula, \`--fs-small\` 700 sem maiúsculas; toque ≥ 44 px.
- Escolhido: cheio de \`--accent\` (texto \`--paper\` nas páginas dos cânticos, \`--on-accent\` no ecrã de ouvir).
- Classes: \`.lang-switch\`, \`.listen-langs\`.

**Partitura** (\`.scores .pdf\`): não é etiqueta nem segmentado — é uma ligação com o símbolo de página (\`--icon-sm\`), \`--fs-ui\`, \`--accent\`, altura mínima \`--hit\`.`,
    html: `<div class="ds row"><span class="lang-switch"><button class="on">Latim</button><button>Tradução · Português</button></span><div class="scores"><a class="pdf" href="#"><svg viewBox="0 0 24 24" aria-hidden="true" style="width:var(--icon-sm);height:var(--icon-sm);fill:none;stroke:currentColor;stroke-width:var(--stroke)"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6"/></svg>Songbook, pág. 12</a></div></div>` },
  Campos: { group: 'Formulários', h: 250, title: 'Campos',
    readme: `Campos de texto e de escolha: altura \`--h-field\`, raio \`--radius\`, contorno \`--border\`, \`--fs-field\` 400 (16 px evita o zoom do iPhone).

- Rótulo (\`.col-field\`, \`.sn-f\`, \`.sa-sec\`): \`--fs-caps\` 700 maiúsculas \`--ls-caps\` em \`--text-soft\` — sempre cinzento.
- Marcador (placeholder) em \`--text-faint\`, maiúsculas.
- Em foco: contorno de 2 px \`--accent\` (desvio −1) e borda \`--accent\`.
- Nas janelas os campos são sempre brancos (\`--surface\`); na página de gestão usam \`--paper\` / \`--ink\` para seguir o modo escuro.
- Sobre a cor da marca (\`.novos-filtro\`): contorno \`--on-brand-outline\`, altura \`--h-btn\`.`,
    html: `<div class="ds"><dialog open><label class="col-field">Título<input value="Missa de domingo"></label><label class="col-field">Público<select><option>Coro</option></select></label><label class="col-field">Autor<input placeholder="Por exemplo: John Newton"></label></dialog></div>` },
  LinhasOpcao: { group: 'Formulários', h: 330, title: 'Linhas de opção',
    readme: `Escolhas dentro das janelas: cartão com raio \`--radius\`, contorno \`--border\`, fundo \`--surface\`, espaço 12 × 14 px.

- Título \`--fs-ui\` 700 em maiúsculas com \`--ls-row\`; subtítulo \`--fs-small\` em \`--text-soft\`.
- Escolhida (\`.perfil-opt.on\`): cheia de \`--accent\`, texto \`--on-accent\`.
- Classes: \`.perfil-opt\`, \`.tpl-apply\`, \`.col-pick\`, \`.perfil-admin\`, \`.tpl-edit\`.
- «+ novo» (\`.col-pick-new\`): tracejado \`--border-dash\`, \`--fs-small\` 700 maiúsculas \`--ls-chip\` em \`--accent\` — o mesmo texto nas listas verdes («+ Nova folha», «+ Novo cântico»).`,
    html: `<div class="ds"><dialog open><div class="col"><button class="tpl-apply"><b>Copiar letra</b><small>Título e letra, sem acordes</small></button><button class="perfil-opt"><svg viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:var(--stroke)"><circle cx="12" cy="12" r="9"/></svg><span><b>Coro</b><small>Todos os cânticos e livros, com acordes</small></span></button><button class="perfil-opt on"><svg viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:var(--stroke)"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg><span><b>Gestor</b><small>Gerir os utilizadores e os seus perfis</small></span></button><button class="col-pick-new">+ Nova folha</button></div></dialog></div>` },
  Titulos: { group: 'Letra', h: 200, title: 'Títulos',
    readme: `Títulos de janelas e de páginas: \`--serif\` (Marcellus) 400, \`--fs-title\`, maiúsculas, espaçamento .06em.

- Nas janelas e na gestão: \`--brand-deep\`. Sobre a cor da marca (lista, menu): \`--on-brand\`.
- O nome da app usa \`--fs-display\` só na capa e na entrada; na barra de topo usa \`--fs-title\`.
- Marcellus só em títulos e no nome da app — nunca em botões, campos ou listas.
- Cabeçalhos de secção (CORO, ENTRADA) e rótulos: \`--fs-caps\` 700 maiúsculas \`--ls-caps\`.
- Antetítulo (\`.list-title .list-kicker\`): o nome da secção por cima do título de uma categoria (ex.: «CANCIONEIRO» / «EM LATIM») — o mesmo estilo dos cabeçalhos de secção (\`--fs-caps\` 700, \`--ls-caps\`, \`--on-brand\` opaco), 4 px acima do título.`,
    html: `<div class="ds col"><dialog open><h2>Nova folha</h2><p class="small">Um mês depois de expirar, a folha é apagada.</p></dialog><div class="brand-bg"><h2 class="list-title" style="margin:0"><small class="list-kicker">Cancioneiro</small>Em latim</h2></div></div>` },
  Listas: { group: 'Listas', h: 220, title: 'Linhas das listas',
    readme: `Linhas das listas.

- Listas verdes (início, menu, folhas): título \`--fs-small\` 400 maiúsculas \`--ls-chip\`; autor (itálico), número, página do livro e notas \`--fs-small\` sem espaçamento; separador \`--on-brand-line\`.
- Cabeçalho de secção (\`.cat-head\`, \`.sec-line\`): \`--fs-caps\` 700 \`--ls-caps\`, \`--on-brand\` a 75%.
- Listas claras (\`.adm-list\`, \`#sn-flist\`, \`#sa-list\`): separador só em baixo, \`--line\`, espaço 12 px.
- Gravações (\`.recs li\`): espaço 6 px (o botão de 40 px já dá ≥ 52 px) e separador \`--divider\`, que serve em claro e escuro.`,
    html: `<div class="ds col"><div class="brand-bg" style="padding:0"><ul class="rows" style="list-style:none;margin:0;padding:0"><li class="cat-head">Coro</li>${[['Amazing Grace', 'John Newton (1779)', '2'], ['Salve Regina', 'Antífona mariana', '1']].map(([t, a, n]) => `<li style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--on-brand-line)"><span><span style="display:block;font-size:var(--fs-small);text-transform:uppercase;letter-spacing:var(--ls-chip)">${t}</span><span style="display:block;font-size:var(--fs-small);font-style:italic">${a}</span></span><span style="font-size:var(--fs-small)">${n}</span></li>`).join('')}</ul></div>
<ul class="adm-list" style="list-style:none;margin:0;padding:0 4px;background:var(--surface);border-radius:var(--radius)"><li><span><b>Pessoa Nova</b><br><small style="color:var(--text-soft)">novo@exemplo.pt</small></span><span class="admin"><button>Autorizar</button></span></li></ul></div>` },
};
for (const [name, c] of Object.entries(C)) {
  w(`components/${name}/README.md`, `# ${c.title}\n\n${c.readme}\n\nA pré-visualização usa as classes e o CSS reais da app (secção COMPONENTES de styles.css).\n`);
  w(`components/${name}/preview.html`, `<!-- @dsCard group="${c.group}" height=${c.h} subtitle="${c.title}" -->\n<!doctype html>\n<html lang="pt"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:var(--paper)">\n${c.html}\n</body></html>\n`);
}

// ---------- README (o livro da marca) ----------
const t = (fam) => (tokens[fam]?.tokens || []).map(x => `\`${x.name}\` ${x.value}`).join(' · ');
w('README.md', `# Cancioneiro

O sistema de design da app Cancioneiro (PWA de cânticos de coro). Verde da marca em grandes superfícies, texto calmo em Lato, títulos em Marcellus, tudo o que se toca na cor de destaque. É a fonte das regras de estilo da app: os valores aqui são os que a app usa.

## Como uma mudança chega à app

1. Os valores vivem em \`design/tokens.json\` no repositório tiagomota23/cancioneiro; este Design System é o seu espelho e \`theme.css\` é gerado a partir dele (\`tools/theme/build.mjs\`, com \`--check\`).
2. Mudar um valor aqui (cor, tamanho, raio, espaçamento das maiúsculas, opacidade) é um pedido de mudança: a sessão do mapa compara com o repositório e envia a alteração exata (antes → depois, nome da variável) à sessão da app, que reconstrói \`theme.css\`, sobe a versão e publica. O mapa, o catálogo e este Design System são atualizados a seguir.
3. Mudanças de componente (forma, comportamento, um componente novo) descrevem-se aqui por palavras (comentário ou README): são confirmadas com o Tiago antes de chegarem à app.
4. Mudanças feitas no código chegam aqui pelo mesmo caminho, no sentido contrário.

Nomes: cada token tem o nome da variável CSS sem «--». Um par claro/escuro gera \`--light-X\` e \`--dark-X\`; as opacidades geram cores derivadas de \`base\` (color-mix).

## Princípios

- **Um estilo por tipo de elemento.** Botões, chips, campos, linhas de opção e listas têm uma só forma cada; uma variante nova no catálogo do mapa é um erro, não uma exceção.
- **A marca é superfície, o destaque é ação.** \`brand\` / \`brand-deep\` só em grandes fundos verdes (página inicial, menu, capa); tudo o que se toca usa \`accent\`.
- **Legível ao ensaiar.** Texto secundário nunca abaixo de \`fs-small\` (13 px); cinzentos com contraste ≥ 4,5:1 em branco (\`text-faint\` #767676).
- **A letra dos cânticos é sagrada.** Estrofes, acordes e o tamanho A−/A+ ficam fora da escala.

## Letra

Duas famílias: \`serif\` (Marcellus) só em títulos e no nome da app; \`sans\` (Lato) em tudo o resto. Seis tamanhos — ${Object.entries(fs_).map(([k, v]) => `\`${k}\` ${v}`).join(', ')} — e pesos 400 e 700.

- Títulos: serif 400, \`fs-title\`, maiúsculas, .06em. Nome da app na capa: \`fs-display\`, .14em.
- Maiúsculas, um espaçamento por função: ${t('tracking')}. Títulos de linhas de opção \`ls-row\`; chips, etiquetas e linhas das listas verdes \`ls-chip\`; cabeçalhos de secção e rótulos \`ls-caps\`.
- Botões nunca em maiúsculas.

## Cor

- Marca e destaque: \`brand\`, \`brand-deep\`, \`on-brand\`, \`accent\` (claro ${light('accent')} / escuro ${col.accent.dark}), \`on-accent\`, \`tint\`.
- Texto em superfícies claras: \`text\` (principal), \`text-soft\` (secundário), \`text-faint\` (dicas, marcadores, símbolos inativos).
- Contornos: \`border\` (campos, cartões, linhas de opção), \`border-dash\` («+ novo»), \`line\` (separadores em superfícies sempre claras), \`divider\` (separadores nas páginas dos cânticos, servem em claro e escuro).
- Páginas dos cânticos (pares claro/escuro): \`paper\`, \`ink\`, \`ink-soft\`, \`chord\`, \`title\`, \`pdf-bg\`, \`pdf-title\`.
- Estados: \`star\`, \`danger\` (+ \`danger-deep\`, \`danger-border\`), \`pending-*\`, \`warn-*\`.
- Opacidades derivadas: ${(tokens.alpha?.tokens || []).map(a => `\`${a.name}\` = \`${a.base}\` a ${a.value}`).join(', ')}.

## Forma e tamanho

- Raios: ${t('radius')}. Pílula em todos os botões e chips; \`radius\` em cartões, campos e linhas de opção; \`radius-lg\` nas janelas.
- Tamanhos: ${t('size')}.
- Símbolos: \`icon-sm\` no texto, botões pequenos, setas e pesquisa; \`icon\` em botões de símbolo e linhas de opção; \`icon-lg\` só no microfone a ouvir. Traço \`stroke\` em todos (exceção: a estrela cheia da pesquisa, 1.2).

## Regras

1. **Toque mínimo** — todo o botão de símbolo tem pelo menos \`hit\` × \`hit\` de área de toque.
2. **Foco** — \`:focus-visible\` com contorno de 2 px \`accent\`, afastado 2 px; sobre a cor da marca, \`on-brand\`. Campos: contorno 2 px \`accent\` com desvio −1 e borda \`accent\`.
3. **Botões sem maiúsculas**; as maiúsculas ficam para chips, etiquetas, cabeçalhos e títulos de linhas.
4. **Serif só em títulos.** O «i» de informação é sempre Marcellus 24 px 700 itálico, cor de destaque, num botão de 44 px.
5. **Nome da app** na barra de topo em \`fs-title\` (o \`fs-display\` não cabe entre os dois botões de 44 px).
6. **Ligações** sempre \`accent\`, também nas janelas.
7. **Texto sobre a cor da marca** sempre \`on-brand\` sem transparência (autores, números, cabeçalhos incluídos): branco a ≥ 4,5:1 em \`brand\` e \`brand-deep\`.
8. **Cores calculadas pelo JavaScript** (medidor do microfone: \`brand\`, \`meter-idle\`; PDF: \`accent\` claro) leem o tema ao abrir. Fora dos tokens só mudam à mão: icons/*.png, manifest.json e a meta theme-color.

## Exceções documentadas

- Etiqueta «VERSÃO TESTE»: 9,5 px 700 maiúsculas (11 px não cabe no espaço de 44 px).
- Botão «Entrar com Google»: regras da Google (branco, pílula, 16 px, sombra, «G» de 20 px).
- Ações de deslizar (subir, descer, remover, +): quadradas, da altura da linha (≈ 59 px).
- Letra dos cânticos: fora da escala, por desenho.
- Símbolos de texto (A−/A+ 19 e 24 px, «+» de deslizar 26 px, setas 18–20 px) só dentro de botões de símbolo.

## Não sincronizado (ainda)

- Escala de espaçamento: os espaços interiores ainda são valores escritos em styles.css (0 18, 12 14, 10 14, 6 0 px). Próxima ronda.
- Sombras (elevação) e movimento: sem tokens.
- Componentes: pré-visualizações estáticas com o CSS real da app (bundle.css = secção COMPONENTES de styles.css). Os tamanhos de letra nas pré-visualizações acompanham a app, não as edições aqui, até a mudança chegar à app.
- Ícones: os símbolos são desenhados no código (SVG inline), não são ficheiros; só o ícone da app está em Logos.
`);

// ---------- capa ----------
w('components/Cover/preview.html', `<!-- @dsCard height=300 -->
<!doctype html>
<html lang="pt"><head><meta charset="utf-8"><style>
body{margin:0;background:var(--surface)}
.wrap{position:relative;width:960px;height:300px;overflow:hidden}
svg{position:absolute;left:0;top:0}
.brand{fill:var(--brand)}.deep{fill:var(--brand-deep)}.acc{fill:var(--accent)}.tint{fill:var(--tint)}.star{fill:var(--star)}
.rule{stroke:var(--on-brand);stroke-opacity:.22;stroke-width:1}
.chip{fill:none;stroke:var(--on-brand);stroke-opacity:.7;stroke-width:1.5}
.name{position:absolute;left:40px;bottom:40px;width:440px;font-family:var(--font-serif);font-size:56px;line-height:.95;letter-spacing:.06em;text-transform:uppercase;color:var(--text);margin:0}
.tag{position:absolute;left:42px;bottom:16px;width:440px;font-family:var(--font-sans);font-size:13px;color:var(--text-soft);margin:0}
</style></head><body><div class="wrap">
<svg width="960" height="300" viewBox="0 0 960 300" aria-hidden="true">
<!-- blocos: brand (slab alto) + brand-deep + accent (pílula) + tint + star (pequeno); radius-lg 14, pill = metade do lado curto
     arranjo: um slab alto que sangra no topo e à direita, com satélites à esquerda
     padrão: «editorial, listas» → poucas linhas finas on-brand a 22% (o separador das listas verdes) e três chips em contorno on-brand 70%
     escalas: alturas de chip 24, linha de lista 48, raio 14 -->
<rect class="brand" x="640" y="-20" width="340" height="340" rx="14"/>
<rect class="deep" x="520" y="150" width="140" height="170" rx="14"/>
<rect class="tint" x="500" y="40" width="120" height="90" rx="14"/>
<rect class="acc" x="520" y="96" width="96" height="40" rx="20"/>
<rect class="star" x="900" y="250" width="40" height="24" rx="12"/>
<line class="rule" x1="660" y1="96" x2="960" y2="96"/><line class="rule" x1="660" y1="144" x2="960" y2="144"/><line class="rule" x1="660" y1="192" x2="960" y2="192"/><line class="rule" x1="660" y1="240" x2="960" y2="240"/>
<rect class="chip" x="668" y="40" width="72" height="24" rx="12"/><rect class="chip" x="750" y="40" width="88" height="24" rx="12"/><rect class="chip" x="848" y="40" width="64" height="24" rx="12"/>
</svg>
<h1 class="name">Cancioneiro</h1>
<p class="tag">Verde da marca, texto calmo, um estilo por elemento.</p>
</div></body></html>
`);
console.log('ok', OUT);
