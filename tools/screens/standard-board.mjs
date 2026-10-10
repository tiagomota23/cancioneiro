// Quadro «Padrão de design» do canvas: as regras de estilo da app, com os valores lidos de theme.css (a fonte de verdade).
// As amostras são desenhadas aqui com esses valores; os recortes reais de cada elemento estão nos quadros do catálogo.
// Uso: NODE_PATH=$(npm root -g) node tools/screens/standard-board.mjs   → out/catalogo/Padrao.dc.html (+ altura em quadros-padrao.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'out', 'catalogo');
fs.mkdirSync(OUT, { recursive: true });
const theme = fs.readFileSync(path.join(ROOT, 'theme.css'), 'utf8');
const root = theme.slice(theme.indexOf(':root'), theme.indexOf('}', theme.indexOf(':root')));
const T = {}; // --nome → { v, nota }
for (const m of root.matchAll(/(--[\w-]+):\s*([^;]+);[ \t]*(?:\/\*\s*([^*]*?)\s*\*\/)?/g)) T[m[1]] = { v: m[2].trim(), nota: (m[3] || '').trim() };
const v = k => { if (!T[k]) throw new Error(`theme.css sem ${k}`); return T[k].v; };
const version = (fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').match(/v(\d{3})\b/) || [])[1];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const W = 2400;
const C = { ink: '#1d2b25', soft: '#4a5a53', faint: '#7d8f87', green: '#0f7a57', card: '#ffffff', line: '#dfe6e2' };
const SANS = "Lato, 'Helvetica Neue', sans-serif", SERIF = 'Marcellus, Georgia, serif';
const h2 = (t, sub) => `<div style="display: flex; flex-direction: column; gap: 6px"><h2 style="margin: 0; font-family: ${SERIF}; font-weight: 400; font-size: 30px; letter-spacing: 2px; color: ${C.green}">${t}</h2>${sub ? `<p style="margin: 0; font-size: 15px; line-height: 22px; color: ${C.soft}; max-width: 1400px">${sub}</p>` : ''}</div>`;
const card = (inner, w = 'auto') => `<div style="background: ${C.card}; border: 1px solid ${C.line}; border-radius: 12px; padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; ${w !== 'auto' ? `width: ${w}px; box-sizing: border-box;` : ''}">${inner}</div>`;
const tok = k => `<code style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: ${C.green}">${k}</code>`;
const note = t => `<p style="margin: 0; font-size: 14px; line-height: 21px; color: ${C.soft}">${t}</p>`;
const label = t => `<p style="margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: ${C.faint}">${t}</p>`;
const section = (title, sub, body) => `<section style="display: flex; flex-direction: column; gap: 20px">${h2(title, sub)}${body}</section>`;
const grid = (cols, items, gap = 20) => `<div style="display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: ${gap}px; align-items: start">${items.join('\n')}</div>`;
const rule = (n, title, text) => `<div style="display: flex; gap: 14px"><span style="flex: none; width: 30px; height: 30px; border-radius: 15px; background: ${C.green}; color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center">${n}</span><p style="margin: 0; font-size: 15px; line-height: 23px; color: ${C.ink}"><b>${title}</b> — ${text}</p></div>`;

// ---------- 1. Letra ----------
const typeRows = [
  ['--fs-display', SERIF, 400, 'none', '.14em', 'CANCIONEIRO', 'Nome da app — só na capa (splash) e na entrada'],
  ['--fs-title', SERIF, 400, 'uppercase', '.06em', 'Nova folha', 'Títulos de janelas e de páginas; nome da app na barra de topo'],
  ['--fs-field', SANS, 400, 'none', '0', 'Amazing Grace', 'Texto escrito nos campos (16 px evita o zoom do iPhone)'],
  ['--fs-ui', SANS, 400, 'none', '0', 'Guardar', 'Botões, linhas de opção, texto das janelas'],
  ['--fs-small', SANS, 400, 'none', '0', 'John Newton (1779) · 27', 'Texto secundário: autores, números, notas, botões pequenos (700)'],
  ['--fs-caps', SANS, 700, 'uppercase', 'var(--ls-chip)', 'por aprovar', 'Etiquetas e chips, sempre negrito e em maiúsculas'],
];
const typeCard = typeRows.map(([k, fam, w, tr, ls, sample, use]) => {
  const lsv = ls.startsWith('var') ? v(ls.slice(4, -1)) : ls;
  return `<div style="display: grid; grid-template-columns: 220px 1fr 560px; gap: 20px; align-items: baseline; padding: 14px 0; border-bottom: 1px solid ${C.line}">
<p style="margin: 0; font-size: 14px; line-height: 20px">${tok(k)}<br><span style="color: ${C.soft}">${v(k)} · ${w}${tr === 'uppercase' ? ' · maiúsculas' : ''}${lsv !== '0' ? ' · ' + lsv : ''}</span></p>
<p style="margin: 0; font-family: ${fam}; font-weight: ${w}; font-size: ${v(k)}; text-transform: ${tr}; letter-spacing: ${lsv}; color: #333; line-height: 1.2">${sample}</p>
${note(use)}</div>`;
}).join('');
const tracking = [
  ['--ls-caps', 'Cabeçalhos de secção (CORO, ENTRADA), rótulos dos campos, títulos das gravações', 'Cânticos em latim'],
  ['--ls-chip', 'Chips, etiquetas, títulos das linhas das listas verdes, linhas «+ novo», momentos, rodapé de partilha', 'Songbook, pág. 12'],
  ['--ls-row', 'Títulos das linhas de opção, nomes de ficheiros, título da partitura, primeira linha da barra «por aprovar»', 'Copiar endereço'],
].map(([k, use, s]) => card(`${label(k + ' · ' + v(k))}<p style="margin: 0; font-family: ${SANS}; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: ${v(k)}; color: #333">${s}</p>${note(use)}`));
tracking.push(card(`${label('Serif e nome da app')}<p style="margin: 0; font-family: ${SERIF}; font-size: 20px; text-transform: uppercase; letter-spacing: .06em; color: #333">Títulos · .06em</p>${note('Títulos em serif: .06em. O nome da app em tamanho de capa: .14em.')}`));
const sLetra = section('Letra', `Duas letras: ${tok('--serif')} (Marcellus) só para títulos e para o nome da app; ${tok('--sans')} (Lato) para tudo o resto. Seis tamanhos, pesos 400 e 700. A letra dos cânticos (estrofes, acordes, tamanho A−/A+) fica fora desta escala.`,
  card(typeCard) + label('Espaçamento das maiúsculas — um valor por função') + grid(4, tracking));

// ---------- 2. Cor ----------
const sw = (k, dark) => { const val = v(k); return `<div style="display: flex; flex-direction: column; gap: 8px"><div style="height: 56px; border-radius: 10px; border: 1px solid ${C.line}; background: ${val}${dark ? '' : ''}"></div><p style="margin: 0; font-size: 13px; line-height: 18px">${tok(k)}<br><b>${esc(val)}</b><br><span style="color: ${C.soft}">${esc(T[k].nota)}</span></p></div>`; };
const group = (title, keys, cols = 6) => card(label(title) + grid(cols, keys.map(k => sw(k)), 16));
const sCor = section('Cor', `Todas as cores vêm de theme.css. A cor da marca só em grandes superfícies verdes (página inicial, menu, capa); tudo o que se toca usa ${tok('--light-accent')}. Cinzentos: três para texto, três para contornos.`,
  [group('Marca e destaque', ['--brand', '--brand-deep', '--on-brand', '--light-accent', '--on-accent', '--tint']),
   group('Texto e contornos (janelas, cartões, campos)', ['--surface', '--text', '--text-soft', '--text-faint', '--border', '--border-dash', '--line', '--divider'], 8),
   group('Páginas dos cânticos — claro', ['--light-paper', '--light-ink', '--light-ink-soft', '--light-chord', '--light-title', '--light-pdf-bg']),
   group('Páginas dos cânticos — escuro', ['--dark-paper', '--dark-ink', '--dark-ink-soft', '--dark-chord', '--dark-title', '--dark-pdf-bg']),
   group('Estados', ['--star', '--danger', '--danger-border', '--pending-bg', '--warn-bg', '--warn-border', '--toast-bg'], 7),
  ].join('\n') + card(note(`<b>Separadores:</b> ${tok('--divider')} nas páginas dos cânticos (serve em claro e em escuro); ${tok('--line')} só em superfícies sempre claras (janelas, gestão, editor).`)));

// ---------- 3. Forma e tamanho ----------
const box = (r, wd, ht, lbl, k) => `<div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-start"><div style="width: ${wd}px; height: ${ht}px; border-radius: ${r}; background: ${v('--tint')}; border: 1px solid ${v('--light-accent')}"></div><p style="margin: 0; font-size: 13px; line-height: 18px">${tok(k)} <b>${v(k)}</b><br><span style="color: ${C.soft}">${lbl}</span></p></div>`;
const sForma = section('Forma e tamanho', 'Três raios e a pílula; alturas fixas por tipo de elemento; três tamanhos de símbolo com o mesmo traço.',
  grid(3, [
    card(label('Raios') + `<div style="display: flex; gap: 28px; flex-wrap: wrap">${box(v('--radius-sm'), 72, 48, 'progresso, letras A–Z', '--radius-sm')}${box(v('--radius'), 72, 48, 'cartões, campos, linhas de opção', '--radius')}${box(v('--radius-lg'), 72, 48, 'janelas', '--radius-lg')}${box('999px', 96, 40, 'botões e chips', '--pill')}</div>`),
    card(label('Alturas') + `<div style="display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap">${[['--h-chip', 'chip'], ['--h-btn-sm', 'botão pequeno'], ['--h-btn', 'botão'], ['--h-field', 'campo'], ['--hit', 'toque mínimo']].map(([k, l]) => `<div style="display: flex; flex-direction: column; gap: 8px"><div style="width: 56px; height: ${v(k)}; border-radius: 6px; background: ${v('--tint')}; border: 1px solid ${v('--light-accent')}"></div><p style="margin: 0; font-size: 13px; line-height: 18px">${tok(k)}<br><b>${v(k)}</b> ${l}</p></div>`).join('')}</div>`),
    card(label('Símbolos · traço ' + v('--stroke')) + `<div style="display: flex; gap: 28px; align-items: flex-end">${[['--icon-sm', 'no texto, botões pequenos, setas, pesquisa, play'], ['--icon', 'botões de símbolo, linhas de opção, fechar ×'], ['--icon-lg', 'microfone a ouvir (só aí)']].map(([k, l]) => `<div style="display: flex; flex-direction: column; gap: 8px; width: 150px"><svg width="${parseInt(v(k))}" height="${parseInt(v(k))}" viewBox="0 0 24 24" fill="none" stroke="${v('--light-accent')}" stroke-width="${v('--stroke')}" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg><p style="margin: 0; font-size: 13px; line-height: 18px">${tok(k)} <b>${v(k)}</b><br><span style="color: ${C.soft}">${l}</span></p></div>`).join('')}</div>${note('Única exceção: a estrela cheia da barra de pesquisa mantém contorno de 1.2.')}`),
  ]));

// ---------- 4. Componentes (amostras com os valores do tema) ----------
const A = v('--light-accent'), D = v('--danger');
const btn = (t, kind, sm) => {
  const h = sm ? v('--h-btn-sm') : v('--h-btn'), fs = sm ? v('--fs-small') : v('--fs-ui'), fw = sm ? 700 : 400, pad = sm ? '0 14px' : '0 18px';
  const st = kind === 'primary' ? `background: ${A}; color: #fff; border: 1px solid ${A}` : kind === 'danger' ? `background: #fff; color: ${D}; border: 1px solid ${v('--danger-border')}` : `background: #fff; color: ${A}; border: 1px solid ${A}`;
  return `<span style="display: inline-flex; align-items: center; height: ${h}; box-sizing: border-box; padding: ${pad}; border-radius: 999px; font-family: ${SANS}; font-size: ${fs}; font-weight: ${fw}; ${st}">${t}</span>`;
};
const chip = (t, on, onBrand) => `<span style="display: inline-flex; align-items: center; height: ${v('--h-chip')}; box-sizing: border-box; padding: 0 10px; border-radius: 999px; font-family: ${SANS}; font-size: ${v('--fs-caps')}; font-weight: 700; text-transform: uppercase; letter-spacing: ${v('--ls-chip')}; ${on ? `background: ${A}; color: #fff; border: 1px solid ${A}` : onBrand ? 'color: #fff; border: 1px solid rgba(255,255,255,.7)' : `color: ${v('--text-faint')}; border: 1px solid ${v('--text-faint')}`}">${t}</span>`;
const field = (t, ph) => `<div style="display: flex; flex-direction: column; gap: 6px; width: 300px"><span style="font-family: ${SANS}; font-size: ${v('--fs-caps')}; font-weight: 700; text-transform: uppercase; letter-spacing: ${v('--ls-caps')}; color: ${v('--text-soft')}">${t}</span><span style="display: flex; align-items: center; height: ${v('--h-field')}; box-sizing: border-box; padding: 0 12px; border-radius: ${v('--radius')}; border: 1px solid ${v('--border')}; background: #fff; font-family: ${SANS}; font-size: ${v('--fs-field')}; color: ${ph ? v('--text-faint') : v('--text')}">${ph || 'Missa de domingo'}</span></div>`;
const optRow = (t, s, on) => `<div style="width: 320px; box-sizing: border-box; padding: 12px 14px; border-radius: ${v('--radius')}; border: 1px solid ${on ? A : v('--border')}; background: ${on ? A : '#fff'}; font-family: ${SANS}; color: ${on ? '#fff' : v('--text')}"><span style="display: block; font-size: ${v('--fs-ui')}; font-weight: 700; text-transform: uppercase; letter-spacing: ${v('--ls-row')}">${t}</span><span style="display: block; font-size: ${v('--fs-small')}; color: ${on ? '#fff' : v('--text-soft')}">${s}</span></div>`;
const iconBtn = (d, color = A, bg = 'transparent') => `<span style="display: inline-flex; align-items: center; justify-content: center; width: ${v('--hit')}; height: ${v('--hit')}; border-radius: 999px; background: ${bg}; outline: 1px dashed ${C.line}"><svg width="${parseInt(v('--icon'))}" height="${parseInt(v('--icon'))}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${v('--stroke')}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"></path></svg></span>`;
const brandBg = `background: linear-gradient(180deg, ${v('--brand')}, ${v('--brand-deep')})`;
const comp = [
  card(label('Botões — pílula, sem maiúsculas') + `<div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center">${btn('Guardar', 'primary')}${btn('Cancelar', 'secondary')}${btn('Apagar', 'danger')}</div><div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center">${btn('Editar cântico', 'primary', 1)}${btn('Autorizar', 'secondary', 1)}${btn('Recusar', 'danger', 1)}</div>` +
    note(`${tok('--h-btn')} ${v('--h-btn')}, ${v('--fs-ui')} 400, espaço 0 18 px · pequeno ${tok('--h-btn-sm')} ${v('--h-btn-sm')}, ${v('--fs-small')} 700, 0 14 px. Três cores: destaque (cheio), contorno, perigo. Confirmar apagar: fundo ${tok('--danger')}.`)),
  card(label('Botões de símbolo') + `<div style="display: flex; gap: 12px; align-items: center">${iconBtn('M15 18l-6-6 6-6')}${iconBtn('M6 6l12 12M18 6L6 18', v('--text-faint'))}${iconBtn('M12 3v12M8 11l4 4 4-4M5 21h14')}<span style="display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 999px; border: 1px solid ${A}"><svg width="16" height="16" viewBox="0 0 24 24" fill="${A}" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg></span></div>` +
    note(`Área de toque ${tok('--hit')} ${v('--hit')}, pílula, símbolo ${tok('--icon')}. Inativos em ${tok('--text-faint')}. O «×» de fechar é um símbolo desenhado, nunca um carácter. O botão de gravação (.rec) é um círculo de ${v('--h-btn')} com o play cheio de ${v('--icon-sm')}; fica cheio enquanto toca.`)),
  card(label('Chips — 24 px, maiúsculas') + `<div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center">${chip('Cancioneiro')}${chip('Inglês', 1)}${chip('Songbook, pág. 12')}</div><div style="display: flex; gap: 10px; padding: 10px; border-radius: 10px; ${brandBg}">${chip('Editar', 0, 1)}${chip('Template', 0, 1)}${chip('+ Cântico', 0, 1)}</div>` +
    note(`${tok('--h-chip')} ${v('--h-chip')}, ${v('--fs-caps')} 700, ${tok('--ls-chip')}, contorno da cor do texto; escolhido = cheio de destaque. Sobre verde: contorno branco a 70%. O seletor de idioma (.lang-switch) é um chip segmentado de 24 px: anel exterior desenhado por dentro (box-shadow inset 1 px), raio interior 0.`)),
  card(label('Campos — 44 px, raio 10') + `<div style="display: flex; gap: 16px; flex-wrap: wrap">${field('Título')}${field('Autor', 'Por exemplo: John Newton')}</div>` +
    note(`${tok('--h-field')} ${v('--h-field')}, ${v('--fs-field')} 400, espaço 0 12 px, contorno ${tok('--border')}. Rótulos: ${v('--fs-caps')} 700 maiúsculas ${tok('--ls-caps')} em ${tok('--text-soft')} — todos cinzentos. Em foco: contorno de 2 px na cor de destaque (desvio −1) e borda de destaque. Na página de gestão os campos usam ${tok('--paper')}/${tok('--ink')} para seguir o modo escuro; nas janelas são sempre brancos.`)),
  card(label('Linhas de opção') + `<div style="display: flex; gap: 12px; flex-wrap: wrap">${optRow('Copiar letra', 'Título e letra, sem acordes')}${optRow('Gestor', 'Gerir os utilizadores e os seus perfis', 1)}</div><div style="width: 320px; box-sizing: border-box; height: 44px; padding: 0 14px; display: flex; align-items: center; border-radius: ${v('--radius')}; border: 1px dashed ${v('--border-dash')}; color: ${A}; font-family: ${SANS}; font-size: ${v('--fs-small')}; font-weight: 700; text-transform: uppercase; letter-spacing: ${v('--ls-chip')}">+ Nova folha</div>` +
    note(`Raio ${tok('--radius')}, contorno ${tok('--border')}, fundo branco, espaço 12 14 px; título ${v('--fs-ui')} 700 maiúsculas ${tok('--ls-row')}, subtítulo ${v('--fs-small')} em ${tok('--text-soft')}; escolhida = cheia de destaque. «+ novo»: tracejado ${tok('--border-dash')}, ${v('--fs-small')} 700 maiúsculas ${tok('--ls-chip')} — o mesmo nas listas verdes.`)),
  card(label('Linhas das listas') + `<div style="border-radius: 10px; overflow: hidden; ${brandBg}; font-family: ${SANS}; color: #fff">${[['Amazing Grace', 'John Newton (1779)', '2'], ['Salve Regina', 'Antífona mariana', '1']].map(([t, a, n]) => `<div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,.22)"><span><span style="display: block; font-size: 13px; text-transform: uppercase; letter-spacing: ${v('--ls-chip')}">${t}</span><span style="display: block; font-size: 13px; font-style: italic">${a}</span></span><span style="font-size: 13px">${n}</span></div>`).join('')}</div>` +
    note(`Listas verdes (início e menu): título ${v('--fs-small')} 400 maiúsculas ${tok('--ls-chip')}; autor (itálico), número, página do livro e notas ${v('--fs-small')} 400 sem espaçamento; separador branco a 22%. Listas claras: separador só em baixo, ${tok('--line')}, espaço 12 px. Gravações: espaço 6 px (o botão de 40 px já dá ≥ 52 px) e separador ${tok('--divider')}.`)),
];
const sComp = section('Componentes', 'Um só estilo por tipo de elemento (styles.css, secção COMPONENTES). As amostras abaixo são desenhadas com os valores de theme.css; os recortes reais estão nos quadros do catálogo.', grid(2, comp));

// ---------- 5. Regras ----------
const rules = [
  ['Toque mínimo', `todo o botão de símbolo tem pelo menos ${v('--hit')} × ${v('--hit')} de área de toque, mesmo que o desenho seja menor.`],
  ['Foco', `${':focus-visible'} em todo o lado: contorno de 2 px na cor de destaque, afastado 2 px. Sobre superfícies da marca (barra de topo, pesquisa, listas verdes, menu, título da lista) o contorno é branco (${tok('--on-brand')}).`],
  ['Botões sem maiúsculas', 'botões em texto normal; as maiúsculas ficam para chips, etiquetas, cabeçalhos e títulos de linhas.'],
  ['Serif só em títulos', 'Marcellus apenas em títulos e no nome da app — nunca em botões, campos ou listas. O «i» de informação (barra de topo e janela Perfil) é sempre Marcellus 24 px 700 itálico, na cor de destaque, num botão de 44 px.'],
  ['Nome da app', `na barra de topo usa ${tok('--fs-title')} (${v('--fs-title')}) — ${v('--fs-display')} não cabe entre os dois botões de 44 px. ${tok('--fs-display')} só na capa e na entrada.`],
  ['Ligações', `sempre na cor de destaque, também dentro das janelas. A ligação «Entrar no Cancioneiro» no rodapé da partilha é texto (${v('--fs-small')}, sublinhado, sem maiúsculas); o rodapé em si é etiqueta (${v('--fs-caps')} 700 maiúsculas).`],
  ['Texto sobre a cor da marca', `sempre ${tok('--on-brand')} sem transparência — autores, números e cabeçalhos incluídos. Branco a ≥ 4,5:1 sobre ${tok('--brand')} e ${tok('--brand-deep')}.`],
  ['Cores calculadas pelo JavaScript', `leem o tema ao abrir: o medidor do microfone usa ${tok('--brand')} e ${tok('--meter-idle')}; os PDF usam ${tok('--light-accent')}. Mudar theme.css chega também a eles. Fora de theme.css só mudam à mão: icons/*.png, manifest.json e ${esc('<meta name="theme-color">')}.`],
];
const sRegras = section('Regras', null, card(rules.map(([t, x], i) => rule(i + 1, t, x)).join('\n')));

// ---------- 6. Exceções documentadas ----------
const exc = [
  ['Etiqueta «VERSÃO TESTE»', '9,5 px 700 maiúsculas — a única exceção à escala de seis tamanhos (11 px não cabe no espaço de 44 px).'],
  ['Botão «Entrar com Google»', 'segue as regras da Google: branco, pílula, 16 px, sombra, «G» de 20 px.'],
  ['Ações de deslizar', 'Subir, Descer, Remover e + nas linhas da folha: quadradas e da altura da linha (≈ 59 px). Ocupam a linha toda, por isso não são pílula nem seguem a regra dos 44 px.'],
  ['Letra dos cânticos', 'estrofes, acordes, tamanho A−/A+ (--fs), peso 300 das estrofes e nota de direitos ficam fora da escala, por desenho.'],
  ['Símbolos de texto em botões', 'A−/A+ (19 e 24 px), o «+» de deslizar (26 px) e as setas (18–20 px) só são permitidos dentro de botões de símbolo.'],
];
const sExc = section('Exceções documentadas', 'Desvios deliberados, mantidos de propósito. Tudo o resto segue as regras acima; um desvio novo no catálogo é um erro, não uma exceção.',
  grid(5, exc.map(([t, x]) => card(`<p style="margin: 0; font-size: 15px; font-weight: 700; color: ${C.ink}">${t}</p>${note(x)}`))));

const page = HGT => `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>Padrão de design</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&amp;family=Lato:ital,wght@0,400;0,700;1,400&amp;display=swap">
<style>
body{margin:0}
a{color:#0f7a57}a:hover{color:#0a5a40}
</style>
</helmet>
<div style="width: ${W}px; height: ${HGT}px; box-sizing: border-box; padding: 64px; background: #f3f5f4; color: ${C.ink}; font-family: ${SANS}; display: flex; flex-direction: column; gap: 64px">
<div style="display: flex; flex-direction: column; gap: 10px; max-width: 1600px">
<h1 style="margin: 0; font-family: ${SERIF}; font-weight: 400; font-size: 44px; letter-spacing: 3px; color: ${C.green}">Padrão de design</h1>
<p style="margin: 0; font-size: 17px; line-height: 26px; color: ${C.soft}">As regras de estilo da app${version ? ` (versão ${version})` : ''}. Os valores vêm de <b>theme.css</b>, a fonte de verdade: este quadro é gerado a partir dele e atualizado com o mapa. Cada elemento novo usa estes nomes (${tok('--…')}) e um dos componentes abaixo; o catálogo de elementos mostra o que a app tem de facto e serve para encontrar desvios.</p>
<p style="margin: 0; font-size: 17px; line-height: 26px; color: ${C.soft}"><b>Para mudar um valor:</b> edite-o no sistema de design <a href="https://claude.ai/artifact/GkMK5e8ZDXmd3JRAYTcSuC">Cancioneiro</a> — a mudança segue para design/tokens.json, a app (nova versão) e este quadro.</p>
</div>
${sLetra}
${sCor}
${sForma}
${sComp}
${sRegras}
${sExc}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${W},"height":${HGT}}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
`;

const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: W, height: 1000 } });
const tmp = path.join(OUT, '_medir.html');
fs.writeFileSync(tmp, page(8000));
await pg.goto('file://' + tmp); await pg.waitForTimeout(300);
const h = await pg.evaluate(() => { const r = document.querySelector('x-dc > div'); return Math.ceil(r.lastElementChild.getBoundingClientRect().bottom - r.getBoundingClientRect().top + 64); });
await pg.screenshot({ path: path.join(OUT, 'Padrao.png'), fullPage: true });
await browser.close(); fs.rmSync(tmp);
const HGT = Math.min(Math.ceil(h * 1.06), 8000); // folga: aqui sem as fontes Lato/Marcellus
fs.writeFileSync(path.join(OUT, 'Padrao.dc.html'), page(HGT));
fs.writeFileSync(path.join(OUT, 'quadros-padrao.json'), JSON.stringify({ file: 'Padrao.dc.html', title: 'Padrão de design', w: W, h: HGT }));
console.log(`Padrao.dc.html ${W}×${HGT}${h > 8000 ? ' AVISO: mais de 8000 px' : ''}`);
