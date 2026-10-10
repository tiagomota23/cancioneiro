// Base comum do mapa visual e do catálogo: servidor local do modo ?demo, dados de exemplo e lista de ecrãs.
// openScreen(browser, s) abre o ecrã s (de SCREENS) já com a ação feita e devolve { ctx, page, errs }.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fixture from './fixture.mjs';
// playwright pode estar instalado só globalmente (NODE_PATH=$(npm root -g))
export const { chromium } = createRequire(import.meta.url)('playwright');

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const W = 390, H = 844;

// ---------- ficheiros de exemplo: partitura (PDF de 1 página) e gravação (WAV em silêncio) ----------
function demoPdf(title) {
  const lines = [0, 1, 2, 3, 4].flatMap(st => [0, 1, 2, 3, 4].map(l => { const y = 700 - st * 120 - l * 8; return `60 ${y} m 535 ${y} l S`; })).join('\n');
  const content = `BT /F1 22 Tf 60 770 Td (${title}) Tj ET\nBT /F1 11 Tf 60 750 Td (Partitura de exemplo) Tj ET\n0.6 w\n${lines}`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>'];
  let pdf = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
function silentWav(seconds = 95, rate = 8000) {
  const n = seconds * rate, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44);
  return b;
}
const WAV = silentWav();

// ---------- servidor local (o modo ?demo só funciona em localhost) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.wasm': 'application/wasm' };
export const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/songs.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(fixture)); }
  if (p.startsWith('/drive-coro-clu/out/')) {
    if (p.endsWith('.pdf')) { res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end(demoPdf(path.basename(p, '.pdf').replace(/[-_]/g, ' '))); }
    res.writeHead(200, { 'Content-Type': 'audio/wav' }); return res.end(WAV);
  }
  if (p === '/' || p === '/index.html') {
    // sem a política de segurança (CSP) e com o substituto do supabase-js (o CDN não é preciso no modo ?demo)
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
      .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^>]*><\/script>/, '<script src="tools/screens/supabase-stub.js"></script>');
    res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(html);
  }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`;

// ---------- ecrãs ----------
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = (page, sel) => page.locator(sel).first().click();
const swipeLeft = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); el && el.classList.add('sw-open'); }, sel);
const demoCols = () => {
  const exp = new Date(Date.now() + 7 * 864e5).toISOString();
  return [{ id: 'demo1', title: 'Missa de domingo', audience: 'coro', duration: '1w', expires_at: exp, created_by: 'demo@localhost',
    sections: [{ id: 's1', title: 'Entrada', position: 0 }, { id: 's2', title: 'Comunhão', position: 2 }, { id: 's3', title: 'Nossa Senhora', position: 5 }],
    songs: [{ song_slug: 'veni_creator_spiritus', position: 1 }, { song_slug: 'adoro_te_devote', position: 3 }, { song_slug: 'ave_verum_corpus', position: 4 }, { song_slug: 'salve_regina', position: 6 }] },
  { id: 'demo2', title: 'Encontro de jovens', audience: 'cancioneiro', duration: '48h', expires_at: exp, created_by: 'demo@localhost', sections: [],
    songs: [{ song_slug: 'amazing_grace', position: 0 }, { song_slug: 'de_colores', position: 1 }] }];
};

// grupo, título, endereço, perfil, tema, ação antes da imagem, página inteira?
export const SCREENS = [
  { id: 'login', group: 'Entrada', title: 'Entrar com Google', q: 'semconta', wait: '#view-login:not([hidden])' },
  { id: 'indice', group: 'Listas', title: 'Índice (Gestor)', full: true },
  { id: 'indice-cancioneiro', group: 'Listas', title: 'Índice (perfil Cancioneiro)', perfil: 'cancioneiro', full: true },
  { id: 'pesquisa', group: 'Listas', title: 'Pesquisa', act: async p => { await p.fill('#search', 'grace'); await sleep(900); } },
  { id: 'categoria', group: 'Listas', title: 'Categoria — latim', hash: '#/lista/la' },
  { id: 'preferidos', group: 'Listas', title: 'Preferidos', hash: '#/lista/favoritos' },
  { id: 'novos', group: 'Listas', title: 'Novos Cânticos', hash: '#/lista/livro-novos' },
  { id: 'livro', group: 'Listas', title: 'Livro — Songbook', hash: '#/lista/livro-songbook' },
  { id: 'gaveta', group: 'Navegação', title: 'Menu ☰ — livros e folhas', act: async p => { await click(p, '#btn-menu'); await sleep(600); } },
  { id: 'perfis', group: 'Navegação', title: 'Perfil', act: async p => { await click(p, '#btn-perfil'); await sleep(500); } },
  { id: 'info', group: 'Navegação', title: 'ⓘ Informação', perfil: 'cancioneiro', act: async p => { await click(p, '#btn-perfil'); await sleep(500); } },
  { id: 'tutorial', group: 'Navegação', title: 'Tutorial (1.º passo)', tour: true, act: async () => { await sleep(1200); } },
  { id: 'folha', group: 'Folhas', title: 'Folha com secções', hash: '#/lista/colecao-demo1', full: true },
  { id: 'folha-acoes', group: 'Folhas', title: 'Folha — remover / subir / descer', hash: '#/lista/colecao-demo1', act: async p => { await p.evaluate(() => document.querySelectorAll('#rows li.swipe')[1]?.classList.add('open')); await sleep(300); } },
  { id: 'folha-nova', group: 'Folhas', title: 'Nova folha', act: async p => { await click(p, '#btn-menu'); await sleep(500); await click(p, '.col-new'); await sleep(500); } },
  { id: 'folha-adicionar', group: 'Folhas', title: 'Adicionar a uma folha', hash: '#/cantico/amazing_grace', act: async p => { await click(p, '#btn-fav'); await sleep(600); } },
  { id: 'cantico-acordes', group: 'Cântico', title: 'Cântico com acordes', hash: '#/cantico/amazing_grace', full: true },
  { id: 'cantico-traducao', group: 'Cântico', title: 'Cântico com tradução, gravações e partitura', hash: '#/cantico/salve_regina', full: true },
  { id: 'cantico-cancioneiro', group: 'Cântico', title: 'Cântico (perfil Cancioneiro)', perfil: 'cancioneiro', hash: '#/cantico/salve_regina', full: true },
  { id: 'cantico-escuro', group: 'Cântico', title: 'Cântico — modo escuro', scheme: 'dark', hash: '#/cantico/salve_regina' },
  { id: 'cantico-novo', group: 'Cântico', title: 'Cântico novo por aprovar', hash: '#/cantico/novo_por_aprovar', full: true },
  { id: 'gravacao', group: 'Cântico', title: 'A ouvir uma gravação', hash: '#/cantico/salve_regina', act: async p => { await p.evaluate(() => document.querySelector('#song .rec button, #song [data-rec], #song .recs button')?.click()); await sleep(900); } },
  { id: 'partitura', group: 'Cântico', title: 'Partitura', hash: '#/cantico/adoro_te_devote/partitura', act: async () => { await sleep(1800); } },
  { id: 'editor', group: 'Edição', title: 'Editar a letra', hash: '#/cantico/amazing_grace', act: async p => { await click(p, '#btn-edit'); await sleep(700); } },
  { id: 'novo-cantico', group: 'Edição', title: 'Acrescentar um cântico', hash: '#/lista/livro-novos', act: async p => { await click(p, '#novo-cantico'); await sleep(600); } },
  { id: 'gestao', group: 'Gestão', title: 'Gestão de utilizadores', hash: '#/gestao', full: true },
  { id: 'partilhado', group: 'Partilha', title: 'Cântico partilhado (sem conta)', q: 'semconta', hash: '#/p/demo_salve_regina', wait: '#song h1', full: true },
  { id: 'indice-escuro', group: 'Listas', title: 'Índice — modo escuro', scheme: 'dark' },
];

// o browser fica sem proxy (o servidor local é localhost); os pedidos externos (supabase-js, fontes) passam pelo Node, com cache
const ext = new Map();
async function external(route) {
  const url = route.request().url();
  if (!ext.has(url)) ext.set(url, fetch(url).then(async r => ({ status: r.status, contentType: r.headers.get('content-type') || '', body: Buffer.from(await r.arrayBuffer()) })).catch(() => null));
  const r = await ext.get(url);
  return r ? route.fulfill({ status: r.status, contentType: r.contentType, body: r.body, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
}
export async function openScreen(browser, s) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    colorScheme: s.scheme || 'light', locale: 'pt-PT', timezoneId: 'Europe/Lisbon' });
  await ctx.addInitScript(({ cols, tour }) => {
    if (sessionStorage.getItem('mapa.init')) return; sessionStorage.setItem('mapa.init', '1');
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    if (!tour) set('cancioneiro.tutorial', 1);
    set('cancioneiro.instalada', 1);
    set('cancioneiro.favs.demo', ['salve_regina', 'amazing_grace', 'santa_lucia']);
    set('cancioneiro.demo.cols', cols);
  }, { cols: demoCols(), tour: !!s.tour });
  await ctx.route(/^https:\/\//, external);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const url = `${BASE}?demo&perfil=${s.perfil || 'gestor'}${s.q ? '&' + s.q : ''}${s.hash || '#/'}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector(s.wait || '#splash.gone', { state: 'attached', timeout: 15000 }).catch(() => {});
  await sleep(700);
  if (s.act) await s.act(page);
  await sleep(300);
  return { ctx, page, errs };
}
