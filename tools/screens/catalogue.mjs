// Catálogo de elementos de design: percorre os ecrãs do mapa (modo ?demo, tema claro) e recolhe cada variante
// diferente de botão, campo, linha de lista, etiqueta, barra, caixa/menu, estilo de texto, ícone e cor.
// Duas peças são "a mesma variante" quando o estilo calculado coincide (letra, cor, fundo, borda, raio, espaçamento, altura).
//   out/catalogo/<id>.png  — recorte de um exemplo de cada variante (2x)
//   out/catalogo/catalogo.json — variantes por grupo, com especificação, n.º de ocorrências e ecrãs onde aparecem
// Uso: NODE_PATH=$(npm root -g) NODE_USE_ENV_PROXY=1 node tools/screens/catalogue.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium, HERE, H, SCREENS, server, sleep, openScreen } from './harness.mjs';

const OUT = path.join(HERE, 'out', 'catalogo');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const click = (page, sel) => page.locator(sel).first().click();
// estados que só existem depois de um toque (diálogos e avisos que os ecrãs do mapa não mostram)
const EXTRA = [
  { id: 'x-partilhar', title: 'Partilhar cântico', hash: '#/cantico/salve_regina', act: async p => { await click(p, '#btn-share'); await sleep(500); } },
  { id: 'x-aviso', title: 'Aviso «Letra copiada»', hash: '#/cantico/salve_regina', act: async p => { await click(p, '#btn-share'); await sleep(400); await click(p, '#app-dlg-list button'); await sleep(250); } },
  { id: 'x-partilhar-folha', title: 'Partilhar folha', hash: '#/lista/colecao-demo1', act: async p => { await click(p, '#col-share'); await sleep(500); } },
  { id: 'x-folha-edicao', title: 'Folha em edição', hash: '#/lista/colecao-demo1', act: async p => { await click(p, '#col-mode'); await sleep(2100); } },
  { id: 'x-nova-seccao', title: 'Nova secção', hash: '#/lista/colecao-demo1', act: async p => { await click(p, '#col-mode'); await sleep(2100); await click(p, '#col-add-sec'); await sleep(500); } },
  { id: 'x-acrescentar', title: 'Adicionar cântico à secção', hash: '#/lista/colecao-demo1', act: async p => { await click(p, '#col-mode'); await sleep(2100); await click(p, 'li.col-add button[data-sec]'); await sleep(400); await p.fill('#sa-q', 'a'); await sleep(500); } },
  { id: 'x-item-folha', title: 'Ações de um cântico da folha', hash: '#/lista/colecao-demo1', act: async p => { await click(p, '#col-mode'); await sleep(2100); await click(p, '#rows li[data-key] > a'); await sleep(500); } },
  { id: 'x-definicoes', title: 'Definições da folha', hash: '#/lista/colecao-demo1', act: async p => { await click(p, '#col-mode'); await sleep(2100); await click(p, '#col-set'); await sleep(500); } },
];

// corre dentro da página: devolve as peças visíveis ainda não vistas, com categoria e assinatura de estilo
function harvest() {
  const seen = window.__catSeen || (window.__catSeen = new WeakSet());
  const VW = innerWidth, VH = innerHeight;
  const rgb = c => {
    let m = c.match(/rgba?\(([^)]+)\)/), k = 1;
    if (!m) { m = c.match(/color\(srgb ([^)]+)\)/); k = 255; } // color-mix() dá color(srgb r g b / a), com valores de 0 a 1
    if (!m) return c;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number).map((x, i) => i < 3 ? x * k : x);
    if (+a === 0) return 'transparente';
    const hex = '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
    return +a < 1 ? `${hex} ${Math.round(a * 100)}%` : hex;
  };
  const px = v => Math.round(parseFloat(v) || 0);
  const fam = f => f.split(',')[0].replace(/["']/g, '').trim();
  const onTop = (el, r) => {
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + Math.min(8, r.width / 2), r.top + Math.min(8, r.height / 2)]];
    return pts.some(([x, y]) => { if (x < 0 || y < 0 || x >= VW || y >= VH) return false; const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t) || t.contains(el) && el.tagName === 'svg'); });
  };
  const visible = el => {
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return null;
    if (r.right <= 0 || r.left >= VW || r.bottom <= 0 || r.top >= VH) return null;
    return onTop(el, r) ? r : null;
  };
  const border = cs => {
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map(s => px(cs[`border${s}Width`]) && cs[`border${s}Style`] !== 'none' ? `${px(cs[`border${s}Width`])}px ${cs[`border${s}Style`]} ${rgb(cs[`border${s}Color`])}` : '');
    if (sides.every(s => !s)) return 'sem borda';
    if (sides.every(s => s === sides[0])) return sides[0];
    return ['cima', 'direita', 'baixo', 'esquerda'].map((n, i) => sides[i] && `${n} ${sides[i]}`).filter(Boolean).join(' · ');
  };
  const pad = cs => { const v = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px); return v[0] === v[2] && v[1] === v[3] ? (v[0] === v[1] ? `${v[0]}` : `${v[0]} ${v[1]}`) : v.join(' '); };
  const type = cs => `${fam(cs.fontFamily)} ${px(cs.fontSize)}px ${cs.fontWeight}${cs.fontStyle === 'italic' ? ' itálico' : ''}${cs.textTransform !== 'none' ? ' ' + cs.textTransform : ''}${cs.letterSpacing !== 'normal' && px(cs.letterSpacing) ? ' esp. ' + cs.letterSpacing : ''}`;
  const box = (el, r) => {
    const cs = getComputedStyle(el);
    return { letra: type(cs), cor: rgb(cs.color), fundo: rgb(cs.backgroundColor) + (cs.backgroundImage !== 'none' ? ' + imagem' : ''), borda: border(cs),
      raio: px(cs.borderTopLeftRadius) >= Math.floor(r.height / 2) && r.height < 60 ? 'pílula' : px(cs.borderTopLeftRadius) + 'px',
      espaco: pad(cs), altura: Math.round(r.height) + 'px', sombra: cs.boxShadow !== 'none' ? 'sim' : 'não' };
  };
  const label = el => (el.getAttribute('aria-label') || el.textContent || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const out = [];
  const add = (cat, el, r, spec, extra = {}) => { seen.add(el); out.push({ cat, el: desc(el), label: label(el), rect: { x: r.left, y: r.top, w: r.width, h: r.height }, spec, ...extra }); };

  // caixas e menus (inteiros) e barras
  const CONT = 'dialog[open], .drawer.open .drawer-panel, .toast.on';
  for (const el of document.querySelectorAll(CONT)) {
    if (seen.has(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 2) continue;
    const variant = [...el.querySelectorAll('input, ul, .tpl-apply')].filter(x => x.getBoundingClientRect().width).map(x => x.tagName).join('');
    add('caixas', el, r, box(el, r), { key: desc(el) + '|' + variant });
  }
  const BARS = '.topbar, .songbar, .pdfbar, .edit-bar, .pend-bar, .searchrow, .edit-actions, .listen, .mini-info, .lang-switch';
  for (const el of document.querySelectorAll(BARS)) {
    if (seen.has(el)) continue; const r = visible(el); if (!r) continue;
    add('barras', el, r, box(el, r), { key: desc(el) });
  }
  // botões e ligações
  for (const el of document.querySelectorAll('button, a[href], input[type=button], input[type=submit], summary, [role=button]')) {
    if (seen.has(el)) continue; const r = visible(el); if (!r) continue;
    const li = el.closest('li'); if (li && li.getBoundingClientRect().height <= 140 && r.width >= 0.8 * li.getBoundingClientRect().width) continue; // a linha inteira: vai para «linhas de lista»
    const cs = getComputedStyle(el), t = (el.textContent || el.value || '').trim();
    const plain = rgb(cs.backgroundColor) === 'transparente' && cs.backgroundImage === 'none' && border(cs) === 'sem borda';
    const kind = !/[\p{L}\p{N}]/u.test(t) || t.length <= 2 && !/\s/.test(t) && !el.closest('li') ? 'botões de ícone' : plain ? 'ligações e botões de texto' : 'botões';
    const spec = box(el, r); if (kind !== 'botões') delete spec.espaco;
    add(kind, el, r, spec);
  }
  // campos
  for (const el of document.querySelectorAll('input:not([type=button]):not([type=submit]):not([type=hidden]), select, textarea')) {
    if (seen.has(el)) continue; const r = visible(el); if (!r) continue;
    add(/checkbox|radio/.test(el.type) ? 'escolhas' : 'campos', el, r, box(el, r));
  }
  // linhas de lista
  for (const el of document.querySelectorAll('li')) {
    if (seen.has(el)) continue; const r = visible(el); if (!r || r.height > 140) continue;
    const a = [...el.children].find(c => c.matches('a, button') && c.getBoundingClientRect().width >= 0.8 * r.width);
    const spec = a ? box(a, a.getBoundingClientRect()) : box(el, r); if (a) spec.elemento = a.tagName.toLowerCase();
    add('linhas de lista', el, r, spec);
  }
  // etiquetas: texto curto com fundo ou borda, que não é botão nem campo
  for (const el of document.querySelectorAll('span, small, b, em, div, p, label')) {
    if (seen.has(el) || el.closest('button, a, dialog:not([open])')) continue;
    const cs = getComputedStyle(el); const t = el.textContent.trim(); if (!t || t.length > 40) continue;
    if (rgb(cs.backgroundColor) === 'transparente' && border(cs) === 'sem borda') continue;
    const r = visible(el); if (!r || r.height > 48) continue;
    add('etiquetas', el, r, box(el, r));
  }
  // ícones
  for (const el of document.querySelectorAll('svg')) {
    if (seen.has(el)) continue; const r = visible(el); if (!r || r.width > 80) continue;
    const cs = getComputedStyle(el);
    add('ícones', el, r, { tamanho: `${Math.round(r.width)}×${Math.round(r.height)}px`, traço: rgb(cs.stroke) + (cs.stroke !== 'none' ? ' ' + cs.strokeWidth : ''), preenchimento: rgb(cs.fill), cor: rgb(cs.color) });
  }
  // estilos de texto: cada elemento com texto próprio
  for (const el of document.querySelectorAll('body *')) {
    if (/^(SCRIPT|STYLE|svg|path|OPTION)$/i.test(el.tagName)) continue;
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
    if (!own) continue;
    if (el.__catText) continue; const r = visible(el); if (!r) continue; el.__catText = 1;
    const cs = getComputedStyle(el);
    out.push({ cat: 'texto', el: desc(el), label: own.slice(0, 50), rect: { x: r.left, y: r.top, w: Math.min(r.width, VW), h: Math.min(r.height, 60) },
      spec: { letra: type(cs), entrelinha: cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight) + 'px' }, key: type(cs) + '|' + (cs.lineHeight === 'normal' ? 'n' : px(cs.lineHeight)), color: rgb(cs.color) });
  }
  // cores em uso
  const colors = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > VH || r.right < 0 || r.left > VW) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own) colors.push(['texto', rgb(cs.color)]);
    if (rgb(cs.backgroundColor) !== 'transparente') colors.push(['fundo', rgb(cs.backgroundColor)]);
    if (border(cs) !== 'sem borda') colors.push(['borda', rgb(cs.borderBottomColor !== 'rgba(0, 0, 0, 0)' && px(cs.borderBottomWidth) ? cs.borderBottomColor : cs.borderTopColor)]);
    if (el.tagName === 'svg' || el.closest('svg')) { if (cs.stroke !== 'none') colors.push(['ícone', rgb(cs.stroke)]); if (cs.fill !== 'none' && el.tagName !== 'svg') colors.push(['ícone', rgb(cs.fill)]); }
  }
  return { items: out, colors };
}

const browser = await chromium.launch();
const variants = new Map(); // grupo|assinatura → variante
const colors = new Map();
let n = 0;
const screens = [...SCREENS.filter(s => (s.scheme || 'light') === 'light'), ...EXTRA];
for (const s of screens) {
  let ctx;
  try {
    let page; ({ ctx, page } = await openScreen(browser, s));
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    const stops = [0]; if (s.full) for (let y = 500; y < docH - H + 500; y += 500) stops.push(Math.min(y, docH - H));
    let found = 0;
    for (const y of [...new Set(stops)]) {
      if (y) { await page.evaluate(y => scrollTo(0, y), y); await sleep(250); }
      const { items, colors: cols } = await page.evaluate(harvest);
      for (const [role, c] of cols) { const k = c; const e = colors.get(k) || { cor: c, usos: {}, ecras: new Set() }; e.usos[role] = (e.usos[role] || 0) + 1; e.ecras.add(s.id); colors.set(k, e); }
      for (const it of items) {
        const sig = it.cat + '|' + (it.key || JSON.stringify(it.spec));
        let v = variants.get(sig);
        if (!v) {
          v = { id: `v${String(++n).padStart(3, '0')}`, grupo: it.cat, spec: it.spec, exemplo: it.label, elemento: it.el, ecra: s.id, usos: 0, ecras: new Set(), elementos: new Set(), cores: new Set() };
          const pd = it.cat === 'caixas' ? 0 : it.cat === 'barras' ? 0 : 6;
          const x = Math.max(0, it.rect.x - pd), yy = Math.max(0, it.rect.y - pd);
          const clip = { x, y: yy, width: Math.min(390 - x, it.rect.w + 2 * pd), height: Math.min(H - yy, it.rect.h + 2 * pd) };
          if (clip.width < 2 || clip.height < 2) continue;
          await page.screenshot({ path: path.join(OUT, v.id + '.png'), clip });
          v.w = Math.round(clip.width); v.h = Math.round(clip.height);
          variants.set(sig, v); found++;
        }
        v.usos++; v.ecras.add(s.id); v.elementos.add(it.el); if (it.color) v.cores.add(it.color);
      }
    }
    console.log(`${s.id.padEnd(22)} +${found}`);
  } catch (e) { console.log(`${s.id.padEnd(22)} FALHOU: ${e.message.split('\n')[0]}`); }
  await ctx?.close();
}
await browser.close(); server.close();

const ORDER = ['botões', 'botões de ícone', 'ligações e botões de texto', 'campos', 'escolhas', 'linhas de lista', 'etiquetas', 'barras', 'caixas', 'texto', 'ícones'];
const titles = Object.fromEntries([...SCREENS, ...EXTRA].map(s => [s.id, s.title]));
const ser = v => ({ ...v, ecras: [...v.ecras], elementos: [...v.elementos].slice(0, 6), cores: [...v.cores] });
const grupos = ORDER.map(g => ({ grupo: g, variantes: [...variants.values()].filter(v => v.grupo === g).map(ser) })).filter(g => g.variantes.length);
const cores = [...colors.values()].map(c => ({ ...c, total: Object.values(c.usos).reduce((a, b) => a + b, 0), ecras: [...c.ecras] })).sort((a, b) => b.total - a.total);
fs.writeFileSync(path.join(OUT, 'catalogo.json'), JSON.stringify({ ecras: titles, grupos, cores }, null, 1));
for (const g of grupos) console.log(`${g.grupo}: ${g.variantes.length}`);
console.log(`cores: ${cores.length}`);
