// Texto das partituras e das páginas dos livros, para a pesquisa e a identificação pelo som.
// Corre na GitHub Action «Texto dos PDF». Sem segredos: identifica-se à função pdf-texto do Supabase com o token OIDC
// do GitHub; a função dá a lista do que falta (com endereços de download de 1 hora) e guarda o texto (song_texts).
// Livros (Songbook, CANTI 2024): só o recorte do cântico em cada página. PDF com camada de texto: pdftotext; sem ela
// (digitalizados) e imagens: OCR (tesseract, pt/it/es/en/fr/la). Junta as sílabas cantadas («Glo - ri - a» → «Gloria»)
// e tira as linhas só de acordes e o lixo do OCR das notas. Pára aos 70 min; a corrida seguinte continua.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FN = 'https://hmfjbyiesghqhwhqgnem.supabase.co/functions/v1/pdf-texto';
const BUDGET = (+process.env.MINUTOS || 70) * 60e3, LANGS = 'por+ita+spa+eng+fra+lat';
const { ACTIONS_ID_TOKEN_REQUEST_URL: TURL, ACTIONS_ID_TOKEN_REQUEST_TOKEN: TTOK } = process.env;
if (!TURL) { console.error('Só corre na GitHub Action (precisa de permissions: id-token: write)'); process.exit(1); }
let oidc = null, oidcAt = 0;
async function token() { // o token do GitHub dura 5 min a 1 h: pede-se outro a cada 4 min
  if (!oidc || Date.now() - oidcAt > 4 * 60e3) { oidc = (await (await fetch(`${TURL}&audience=cancioneiro-pdf`, { headers: { Authorization: `Bearer ${TTOK}` } })).json()).value; oidcAt = Date.now(); }
  return oidc;
}
async function call(op, init = {}, q = '') {
  const r = await fetch(`${FN}?op=${op}${q}`, { ...init, headers: { Authorization: `Bearer ${await token()}`, ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${op} → ${r.status} ${d.error || ''}`);
  return d;
}
const run = (cmd, args) => execFileSync(cmd, args, { maxBuffer: 64e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString();

// ---------- limpeza do texto ----------
const CHORD = /^\(?(?:[A-G](?:#|b|♯|♭)?|Do|Dó|Re|Ré|Mi|Fa|Fá|Sol|La|Lá|Si)(?:m|maj|min|dim|aug|sus|add|M)?\d*(?:\/[A-G](?:#|b)?)?[-+°]?\)?$/;
const letters = s => (s.match(/\p{L}/gu) || []).length;
function clean(t) {
  return String(t || '').replace(/\r/g, '').replace(/\f/g, '\n').split('\n')
    .map(l => l.replace(/[\t ]+/g, ' ').trim())
    // sílabas separadas por hífens com espaços: «Glo - ri - a», «Glo -ri -a», «san__ to» → «Gloria», «santo»
    .map(l => { let p; do { p = l; l = l.replace(/(\p{L})(?: +[-–—_~]+ *| *[-–—_~]+ +|_{2,})(?=\p{L})/gu, '$1'); } while (l !== p); return l; })
    .filter(l => l && !l.split(' ').every(w => CHORD.test(w)))       // linhas só de acordes
    .filter(l => letters(l) >= 3 && letters(l) / l.length >= 0.55)     // lixo do OCR (notas, pautas, números)
    .join('\n').slice(0, 30000);
}

// ---------- extração ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-'));
const pages = new Map(); // cache das páginas descarregadas nesta corrida (vários cânticos por página)
async function download(url, name) {
  if (pages.has(url)) return pages.get(url);
  const r = await fetch(url);
  if (!r.ok) throw new Error('download ' + r.status);
  const f = path.join(tmp, name);
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  pages.set(url, f);
  return f;
}
const size = pdf => { const m = run('pdfinfo', ['-f', '1', '-l', '1', pdf]).match(/Page\s+1 size:\s+([\d.]+) x ([\d.]+)/) || run('pdfinfo', [pdf]).match(/Page size:\s+([\d.]+) x ([\d.]+)/); return [+m[1], +m[2]]; };
const npages = pdf => +(run('pdfinfo', [pdf]).match(/Pages:\s+(\d+)/) || [])[1] || 1;
function ocrImage(png) { return run('tesseract', [png, '-', '-l', LANGS, '--psm', '4']); }
function ocrPdf(pdf, page, box) { // box em frações da página [x0, y0, x1, y1]
  const [w, h] = size(pdf), R = 300, k = R / 72, out = path.join(tmp, 'ocr');
  const args = ['-r', String(R), '-f', String(page), '-l', String(page), '-png', '-singlefile'];
  if (box) args.push('-x', String(Math.round(box[0] * w * k)), '-y', String(Math.round(box[1] * h * k)), '-W', String(Math.round((box[2] - box[0]) * w * k)), '-H', String(Math.round((box[3] - box[1]) * h * k)));
  run('pdftoppm', [...args, pdf, out]);
  return ocrImage(out + '.png');
}
function textLayer(pdf, page, box) {
  const args = ['-q', '-enc', 'UTF-8', '-f', String(page), '-l', String(page)];
  if (box) { const [w, h] = size(pdf); args.push('-r', '72', '-x', String(Math.floor(box[0] * w)), '-y', String(Math.floor(box[1] * h)), '-W', String(Math.ceil((box[2] - box[0]) * w)), '-H', String(Math.ceil((box[3] - box[1]) * h))); }
  return run('pdftotext', [...args, pdf, '-']);
}
// uma parte (página inteira ou recorte): camada de texto; se quase não tiver letras, OCR
function part(pdf, page, box) {
  const t = clean(textLayer(pdf, page, box));
  if (letters(t) >= 40) return { text: t, method: 'text' };
  const o = clean(ocrPdf(pdf, page, box));
  return letters(o) > letters(t) ? { text: o, method: 'ocr' } : { text: t, method: 'text' };
}
async function extract(it) {
  const res = [];
  if (it.kind === 'crop') {
    for (const p of it.parts) {
      if (!p.url) throw new Error('sem endereço para ' + p.file);
      const pdf = await download(p.url, p.file.replace(/\W+/g, '_'));
      // nos ficheiros das páginas, a página é sempre a 1.ª
      res.push(part(pdf, 1, p.box));
    }
  } else {
    if (!it.url) throw new Error('sem endereço');
    const f = await download(it.url, 'f_' + it.key.replace(/\W+/g, '_'));
    if (/^image\//.test(it.mime || '') || /\.(jpe?g|png)$/i.test(it.key)) res.push({ text: clean(ocrImage(f)), method: 'ocr' });
    else for (let p = 1; p <= Math.min(npages(f), 6); p++) res.push(part(f, p, null));
    pages.delete(it.url); fs.rmSync(f, { force: true });
  }
  const text = res.map(r => r.text).filter(Boolean).join('\n');
  return { text, method: !letters(text) ? 'none' : res.some(r => r.method === 'ocr' && r.text) ? 'ocr' : 'text' };
}

// ---------- corrida ----------
const t0 = Date.now(), n = { text: 0, ocr: 0, none: 0, falhas: 0 }, failed = new Set();
let pending = 0;
fora: for (;;) {
  const d = await call('list', {}, '&n=150');
  pending = d.pending;
  if (d.removed) console.log(`${d.removed} texto(s) de ficheiros que já não existem: retirados`);
  const items = d.items.filter(it => !failed.has(it.key));
  if (!items.length) break;
  console.log(`${pending} por tratar; lote de ${items.length}`);
  for (const it of items) {
    if (Date.now() - t0 > BUDGET) { console.log('Tempo esgotado: a próxima corrida continua.'); break fora; }
    try {
      const r = await extract(it);
      await call('save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: it.key, text: r.text, method: r.method }) });
      n[r.method]++; pending--;
    } catch (e) { n.falhas++; failed.add(it.key); console.error(`✗ ${it.slug} (${it.key.split('#')[0]}): ${e.message}`); }
  }
  pages.clear(); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Feito em ${Math.round((Date.now() - t0) / 60e3)} min: ${n.text} com camada de texto, ${n.ocr} por OCR, ${n.none} sem texto legível, ${n.falhas} falha(s); ${Math.max(0, pending)} por tratar.`);
if (n.falhas) process.exit(1); // a Action falha e o GitHub avisa por email
