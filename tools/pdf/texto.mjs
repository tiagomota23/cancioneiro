// Texto das partituras e das páginas dos livros, para a pesquisa e a identificação pelo som.
// Corre na GitHub Action «Texto dos PDF». Sem segredos: identifica-se à função pdf-texto do Supabase com o token OIDC
// do GitHub; a função dá a lista do que falta (com endereços de download de 1 hora) e guarda o texto (song_texts).
// Livros (Songbook, CANTI 2024): só o recorte do cântico em cada página. PDF com camada de texto: pdftotext; sem ela
// (digitalizados) e imagens: OCR (tesseract, pt/it/es/en/fr/la). Junta as sílabas cantadas («Glo - ri - a» → «Gloria»)
// e tira as linhas só de acordes e o lixo do OCR das notas. Pára aos 70 min; a corrida seguinte continua.
// Nos livros, a camada de texto nem sempre coincide com a imagem da página (ex.: o recorte de um cântico apanhava a
// letra do de cima): o recorte é sempre lido também por OCR e a camada de texto só se usa se disser o mesmo.
import { execFile } from 'node:child_process';
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
// comandos externos sem bloquear (4 cânticos em paralelo: a máquina do GitHub tem 4 processadores)
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 64e6, env: { ...process.env, OMP_THREAD_LIMIT: '1' } }, (e, out) => e ? rej(e) : res(String(out))));
const PAR = 4;
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ---------- limpeza do texto ----------
const CHORD = /^\(?(?:[A-G](?:#|b|♯|♭)?|Do|Dó|Re|Ré|Mi|Fa|Fá|Sol|La|Lá|Si)(?:m|maj|min|dim|aug|sus|add|M)?\d*(?:\/[A-G](?:#|b)?)?[-+°]?\)?$/;
const letters = s => (s.match(/\p{L}/gu) || []).length;
// palavras de uma letra que existem (a, e, o, é, y…); as outras letras soltas são restos das notas ou das pautas
const ONE = new Set([...'aeiouyàáâãéèêíóòôõúAEIOUYÀÁÉÈÍÓÚ']);
// símbolos das fontes de música (œ, Œ, ™, ∑…) e tokens sem letras
const NOISE = /^[^\p{L}]*$|[œŒ™∑ßð¢¶§»«]|^[bjnJV&]+$/u;
function clean(t) {
  const out = [];
  for (let l of String(t || '').replace(/\r/g, '').replace(/\f/g, '\n').split('\n')) {
    l = l.replace(/_+/g, ' ').replace(/[\t ]+/g, ' ').trim();
    // sílabas separadas por hífens com espaços: «Glo - ri - a», «Glo -ri -a» → «Gloria»
    let p; do { p = l; l = l.replace(/(\p{L})(?: +[-–—~]+ *| *[-–—~]+ +)(?=\p{L})/gu, '$1'); } while (l !== p);
    // tokens que não são palavras (símbolos de música, letras soltas que não são palavras)
    l = l.split(' ').filter(w => w && !NOISE.test(w) && !(letters(w) === 1 && w.replace(/[^\p{L}]/gu, '').length === 1 && !ONE.has(w.replace(/[^\p{L}]/gu, '')))).join(' ');
    if (!l || l.split(' ').every(w => CHORD.test(w))) continue;          // linhas só de acordes
    if (letters(l) < 3 || letters(l) / l.length < 0.6) continue;         // lixo do OCR (notas, pautas, números)
    out.push(l);
    // sílabas com hífen sem espaços («Ale-gra-te, Jeru-salém»): também a linha com as sílabas juntas, para se
    // encontrar «alegrate» e «jerusalém» (fica a original, por causa das palavras com hífen: «tende-nos»)
    if (/\p{L}-\p{L}/u.test(l)) out.push(l.replace(/(\p{L})-(?=\p{L})/gu, '$1'));
  }
  return out.join('\n').slice(0, 30000);
}

// ---------- extração ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-'));
const pages = new Map(); // cache das páginas descarregadas nesta corrida (vários cânticos por página): url -> Promise(ficheiro)
let seq = 0;
function download(url, name) {
  if (!pages.has(url)) pages.set(url, (async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error('download ' + r.status);
    const f = path.join(tmp, name);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    return f;
  })());
  return pages.get(url);
}
const size = async pdf => { const m = (await run('pdfinfo', ['-f', '1', '-l', '1', pdf])).match(/Page\s+1 size:\s+([\d.]+) x ([\d.]+)/) || (await run('pdfinfo', [pdf])).match(/Page size:\s+([\d.]+) x ([\d.]+)/); return [+m[1], +m[2]]; };
const npages = async pdf => +((await run('pdfinfo', [pdf])).match(/Pages:\s+(\d+)/) || [])[1] || 1;
const ocrImage = png => run('tesseract', [png, '-', '-l', LANGS, '--psm', '4']);
async function ocrPdf(pdf, page, box) { // box em frações da página [x0, y0, x1, y1]
  const [w, h] = await size(pdf), R = 300, k = R / 72, out = path.join(tmp, 'ocr' + (++seq));
  const args = ['-r', String(R), '-f', String(page), '-l', String(page), '-png', '-singlefile'];
  if (box) args.push('-x', String(Math.round(box[0] * w * k)), '-y', String(Math.round(box[1] * h * k)), '-W', String(Math.round((box[2] - box[0]) * w * k)), '-H', String(Math.round((box[3] - box[1]) * h * k)));
  await run('pdftoppm', [...args, pdf, out]);
  try { return await ocrImage(out + '.png'); } finally { fs.rmSync(out + '.png', { force: true }); }
}
async function textLayer(pdf, page, box) {
  const args = ['-q', '-enc', 'UTF-8', '-f', String(page), '-l', String(page)];
  if (box) { const [w, h] = await size(pdf); args.push('-r', '72', '-x', String(Math.floor(box[0] * w)), '-y', String(Math.floor(box[1] * h)), '-W', String(Math.ceil((box[2] - box[0]) * w)), '-H', String(Math.ceil((box[3] - box[1]) * h))); }
  return run('pdftotext', [...args, pdf, '-']);
}
// quanto dois textos dizem o mesmo: palavras de 4+ letras em comum / as do mais curto
const wordset = t => new Set(norm(t).match(/\p{L}{4,}/gu) || []);
function agree(a, b) { const A = wordset(a), B = wordset(b); if (!A.size || !B.size) return 0; let c = 0; for (const w of A) if (B.has(w)) c++; return c / Math.min(A.size, B.size); }
// página inteira (partituras soltas): camada de texto; se quase não tiver letras, OCR
async function page1(pdf, page) {
  const t = clean(await textLayer(pdf, page, null));
  if (letters(t) >= 40) return { text: t, method: 'text' };
  const o = clean(await ocrPdf(pdf, page, null));
  return letters(o) > letters(t) ? { text: o, method: 'ocr' } : { text: t, method: 'text' };
}
// recorte de um livro: a camada de texto só vale se coincidir com o que se vê (OCR do recorte)
async function crop(pdf, box) {
  const [t, o] = await Promise.all([textLayer(pdf, 1, box).then(clean), ocrPdf(pdf, 1, box).then(clean)]);
  if (letters(t) >= 40 && agree(t, o) >= 0.3) return { text: t, method: 'text' };
  if (letters(o) >= 10) return { text: o, method: 'ocr', mismatch: letters(t) >= 40 };
  return { text: '', method: 'none' };
}
async function extract(it) {
  const res = [];
  if (it.kind === 'crop') {
    for (const p of it.parts) {
      if (!p.url) throw new Error('sem endereço para ' + p.file);
      // nos ficheiros das páginas dos livros, a página é sempre a 1.ª
      res.push(await crop(await download(p.url, p.file.replace(/\W+/g, '_')), p.box));
    }
  } else {
    if (!it.url) throw new Error('sem endereço');
    const f = await download(it.url, 'f_' + it.key.replace(/\W+/g, '_'));
    if (/^image\//.test(it.mime || '') || /\.(jpe?g|png)$/i.test(it.key)) res.push({ text: clean(await ocrImage(f)), method: 'ocr' });
    else for (let p = 1, np = Math.min(await npages(f), 6); p <= np; p++) res.push(await page1(f, p));
    pages.delete(it.url); fs.rmSync(f, { force: true });
  }
  const text = res.map(r => r.text).filter(Boolean).join('\n');
  return { text, method: !letters(text) ? 'none' : res.some(r => r.method === 'ocr' && r.text) ? 'ocr' : 'text', mismatch: res.some(r => r.mismatch) };
}

// ---------- corrida ----------
const t0 = Date.now(), n = { text: 0, ocr: 0, none: 0, falhas: 0, desalinhados: 0 }, failed = new Set();
let pending = 0, stop = false;
async function one(it) {
  try {
    const r = await extract(it);
    await call('save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: it.key, text: r.text, method: r.method }) });
    n[r.method]++; if (r.mismatch) n.desalinhados++; pending--;
  } catch (e) { n.falhas++; failed.add(it.key); console.error(`✗ ${it.slug} (${it.key.split('#')[0]}): ${e.message}`); }
}
while (!stop) {
  const d = await call('list', {}, '&n=200');
  pending = d.pending;
  if (d.removed) console.log(`${d.removed} texto(s) de ficheiros que já não existem: retirados`);
  const items = d.items.filter(it => !failed.has(it.key));
  if (!items.length) break;
  console.log(`${pending} por tratar; lote de ${items.length}`);
  let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (i < items.length && !stop) {
      if (Date.now() - t0 > BUDGET) { stop = true; console.log('Tempo esgotado: a próxima corrida continua.'); break; }
      await one(items[i++]);
    }
  }));
  pages.clear(); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Feito em ${Math.round((Date.now() - t0) / 60e3)} min: ${n.text} com camada de texto, ${n.ocr} por OCR, ${n.none} sem texto legível (${n.desalinhados} recorte(s) com a camada de texto desalinhada: usado o OCR), ${n.falhas} falha(s); ${Math.max(0, pending)} por tratar.`);
if (n.falhas) process.exit(1); // a Action falha e o GitHub avisa por email
