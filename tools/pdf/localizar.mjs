// Localiza cânticos nas páginas dos livros, para corrigir recortes errados (song_files.path com #p=…&c=…).
// Corre na GitHub Action «Texto dos PDF» com modo=localizar e a lista de slugs. Para cada cântico, lê por OCR as páginas
// à volta do recorte atual (p−1 … p+1) e procura onde estão as palavras da sua letra. O registo (público) só tem slugs,
// páginas e coordenadas — nunca texto.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FN = 'https://hmfjbyiesghqhwhqgnem.supabase.co/functions/v1/pdf-texto';
const LANGS = 'por+ita+spa+eng+fra+lat';
const { ACTIONS_ID_TOKEN_REQUEST_URL: TURL, ACTIONS_ID_TOKEN_REQUEST_TOKEN: TTOK, SLUGS = '' } = process.env;
if (!TURL) { console.error('Só corre na GitHub Action (precisa de permissions: id-token: write)'); process.exit(1); }
const token = async () => (await (await fetch(`${TURL}&audience=cancioneiro-pdf`, { headers: { Authorization: `Bearer ${TTOK}` } })).json()).value;
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 64e6 }, (e, out) => e ? rej(e) : res(String(out))));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const w4 = s => norm(s).match(/[a-z]{4,}/g) || [];

const slugs = SLUGS.split(/[\s,]+/).filter(Boolean);
const r = await fetch(`${FN}?op=locate`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ slugs }) });
const { items = [], error } = await r.json().catch(() => ({}));
if (!r.ok) { console.error('locate', r.status, error); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-'));

// linhas de uma página por OCR: [{ y0, y1, x (centro), words: [palavras normalizadas] }], em frações da página
const pageCache = new Map();
async function lines(url, file) {
  if (pageCache.has(file)) return pageCache.get(file);
  const pdf = path.join(tmp, file.replace(/\W+/g, '_'));
  fs.writeFileSync(pdf, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const png = pdf + '-img';
  await run('pdftoppm', ['-r', '200', '-f', '1', '-l', '1', '-png', '-singlefile', pdf, png]);
  const tsv = await run('tesseract', [png + '.png', '-', '-l', LANGS, '--psm', '3', 'tsv']);
  const rows = tsv.trim().split('\n').slice(1).map(l => l.split('\t'));
  const pg = rows.find(c => c[0] === '1'); const W = +pg[8], H = +pg[9];
  const by = new Map();
  for (const c of rows) {
    if (c[0] !== '5' || !c[11]?.trim()) continue;
    const k = c.slice(2, 5).join('.'), x = (+c[6] + +c[8] / 2) / W, y0 = +c[7] / H, y1 = (+c[7] + +c[9]) / H;
    const l = by.get(k) || { y0: 1, y1: 0, xs: [], text: '' };
    l.y0 = Math.min(l.y0, y0); l.y1 = Math.max(l.y1, y1); l.xs.push(x); l.text += ' ' + c[11];
    by.set(k, l);
  }
  const out = [...by.values()].map(l => ({ y0: l.y0, y1: l.y1, x: l.xs.reduce((a, b) => a + b, 0) / l.xs.length, words: w4(l.text) })).filter(l => l.words.length);
  pageCache.set(file, out);
  return out;
}
const f3 = n => n.toFixed(3);
for (const it of items) {
  const set = new Set(it.words), tw = new Set(w4(it.title.replace(/\(.*?\)/g, '')));
  const atual = it.parts.map(p => `p${p.page} ${p.box.map(f3).join(',')}`).join(' + ');
  const cands = [];
  for (const pg of it.pages) {
    let ls;
    try { ls = await lines(pg.url, pg.file); } catch (e) { console.log(`  ${it.slug}: página ${pg.page} ilegível (${e.message})`); continue; }
    for (const col of [0, 1]) {
      const cl = ls.filter(l => (l.x < 0.5 ? 0 : 1) === col).sort((a, b) => a.y0 - b.y0);
      const hit = l => { const m = l.words.filter(w => set.has(w)).length; return m >= 2 || (l.words.length >= 1 && m / l.words.length >= 0.5 && m >= 1); };
      // grupos de linhas com palavras da letra (falhas até 6% da página)
      let g = null;
      const flush = () => { if (g && g.hits >= 3) cands.push(g); g = null; };
      for (const l of cl) {
        if (!hit(l)) { if (g && l.y0 - g.y1 > 0.06) flush(); continue; }
        if (g && l.y0 - g.y1 <= 0.06) { g.y1 = l.y1; g.hits++; } else { flush(); g = { page: pg.page, col, y0: l.y0, y1: l.y1, hits: 1 }; }
      }
      flush();
      // título logo acima de cada grupo (até 8% da página)
      for (const c of cands.filter(c => c.page === pg.page && c.col === col && c.title === undefined)) {
        const t = cl.filter(l => l.y1 <= c.y0 + 0.005 && c.y0 - l.y1 < 0.08 && tw.size && l.words.filter(w => tw.has(w)).length / tw.size >= 0.5).pop();
        c.title = t ? t.y0 : null;
        c.lines = cl.filter(l => l.y0 >= c.y0 && l.y1 <= c.y1).length;
      }
    }
  }
  cands.sort((a, b) => b.hits - a.hits);
  console.log(`${it.slug}\n  atual: ${atual}\n  encontrado: ${cands.slice(0, 4).map(c => `p${c.page} col${c.col} y ${f3(c.y0)}–${f3(c.y1)} (${c.hits}/${c.lines} linhas${c.title != null ? `, título em ${f3(c.title)}` : ''})`).join(' · ') || 'nada'}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
