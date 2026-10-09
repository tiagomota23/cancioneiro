// Cópia de segurança do Cancioneiro para o Google Drive (corre na GitHub Action «Cópia de segurança», .github/workflows/backup.yml).
// Pede tudo à função backup do Supabase (identifica-se com o token OIDC do GitHub) e escreve no Drive de DESTINO (uma conta Google
// à parte, nunca o Drive do Coro), na pasta «Cancioneiro — cópia de segurança» (a autorização drive.file só deixa ver e mexer
// nos ficheiros que a própria app criou nessa conta):
//   LEIA-ME — Manual do Cancioneiro (Google Doc) + MANUAL.md + RECONSTRUIR.md
//   canticos/NNNN - Título/   Título.txt (ficha, letra com acordes, tradução), gravações, partituras e atalhos para as páginas dos livros
//   livros/                   os livros completos e as páginas (songbook/, canti2024/)
//   outros/                   ficheiros do armazenamento que não pertencem a nenhum cântico
//   base-de-dados/            dados.json (todas as tabelas), esquema.sql (estrutura completa para reconstruir)
//   codigo/                   cancioneiro.bundle (repositório git completo) e cancioneiro-codigo.zip
//   removidos/                o que deixou de existir no Cancioneiro (nada é apagado)
// É incremental: o estado (o que já foi copiado e com que impressão digital) fica em .estado.json na pasta da cópia.
// Os registos da Action são públicos (repositório público): só se escrevem contagens, nunca letras nem tokens.
import fs from 'node:fs';
import crypto from 'node:crypto';

const FN = 'https://hmfjbyiesghqhwhqgnem.supabase.co/functions/v1/backup';
const ROOT_NAME = 'Cancioneiro — cópia de segurança';
const FOLDER = 'application/vnd.google-apps.folder', SHORTCUT = 'application/vnd.google-apps.shortcut';
const { ACTIONS_ID_TOKEN_REQUEST_URL: TURL, ACTIONS_ID_TOKEN_REQUEST_TOKEN: TTOK } = process.env;
const FILES = { bundle: process.argv[2], zip: process.argv[3], manual: 'docs/MANUAL.md', rebuild: 'docs/RECONSTRUIR.md' };
if (!TURL) { console.error('Só corre na GitHub Action (permissions: id-token: write)'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 32);

// ---------- função backup (Supabase) ----------
async function fn(op, body) {
  const oidc = (await (await fetch(`${TURL}&audience=cancioneiro-backup`, { headers: { Authorization: `Bearer ${TTOK}` } })).json()).value;
  const r = await fetch(`${FN}?op=${op}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${oidc}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`backup ${op} → ${r.status} ${d.error || ''}`);
  return d;
}

// ---------- Google Drive ----------
let gtok = null, gAt = 0;
async function token() {
  if (!gtok || Date.now() - gAt > 45 * 60e3) {
    const t = await fn('google');
    if (/drive\.readonly|auth\/drive( |$)/.test(t.scope || '') || !/drive\.file/.test(t.scope || '')) throw new Error('A autorização do destino tem de ser só drive.file: autorizar de novo em /functions/v1/drive-auth?para=copia');
    gtok = t.access_token; gAt = Date.now(); console.log(`::add-mask::${gtok}`);
  }
  return gtok;
}
let calls = 0;
async function g(method, url, { json, body, headers = {}, raw = false } = {}) {
  for (let i = 0; ; i++) {
    calls++;
    const r = await fetch(url.startsWith('http') ? url : 'https://www.googleapis.com/drive/v3/' + url, {
      method, headers: { Authorization: `Bearer ${await token()}`, ...(json ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}), ...headers },
      body: json ? JSON.stringify(json) : body });
    if (r.ok) return raw ? r : (r.status === 204 ? null : r.json());
    const t = await r.text();
    if ((r.status === 429 || r.status >= 500 || (r.status === 403 && /rate|quota/i.test(t))) && i < 6) { await sleep(2 ** i * 1000 + Math.random() * 500); continue; }
    if (r.status === 401 && i < 1) { gtok = null; continue; }
    throw new Error(`Drive ${method} ${url.split('?')[0].slice(0, 60)} → ${r.status} ${t.slice(0, 200)}`);
  }
}
const q = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
async function mkFolder(name, parent) { return (await g('POST', 'files?fields=id', { json: { name, mimeType: FOLDER, parents: [parent] } })).id; }
async function upload(name, parent, mime, buf, id) { // id: substitui o conteúdo (o Drive guarda as versões anteriores)
  const meta = id ? { name } : { name, parents: [parent] };
  const start = await g(id ? 'PATCH' : 'POST', `https://www.googleapis.com/upload/drive/v3/files${id ? '/' + id : ''}?uploadType=resumable&fields=id`,
    { json: meta, headers: { 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(buf.length) }, raw: true });
  const loc = start.headers.get('location');
  for (let i = 0; ; i++) {
    const r = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': mime }, body: buf });
    if (r.ok) return (await r.json()).id;
    if (i < 4 && (r.status >= 500 || r.status === 429)) { await sleep(2 ** i * 1500); continue; }
    throw new Error(`upload ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
}
const move = (id, from, to, name) => from === to ? g('PATCH', `files/${id}?fields=id`, { json: { name } })
  : g('PATCH', `files/${id}?addParents=${to}&removeParents=${from}&fields=id`, { json: name ? { name } : {} });
async function pool(items, n, f) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await f(items[k], k); } })); }

// ---------- nomes e texto ----------
const clean = s => String(s ?? '').replace(/[\/\\:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'sem título';
const LANG = { pt: 'português', la: 'latim', it: 'italiano', en: 'inglês', es: 'espanhol', fr: 'francês', de: 'alemão', gl: 'galego', ru: 'russo', sw: 'suaíli', ln: 'lingala', cu: 'eslavo eclesiástico', nap: 'napolitano', fur: 'friulano', xx: 'outra' };
function stanzas(v) { return (v || []).map(st => (st.type === 'chorus' ? 'Refrão:\n' : '') + st.lines.join('\n')).join('\n\n'); }
function songText(s, extra) {
  const L = [s.title.toUpperCase(), s.author ? s.author : null, ''];
  L.push(`Número: ${s.number}`, `Língua: ${LANG[s.language] || s.language || '—'}`);
  if (extra.sources.length) L.push(`Fontes: ${extra.sources.join(', ')}`);
  if (s.cancioneiro) L.push('No Cancioneiro: sim');
  if (extra.tags.length) L.push(`Etiquetas: ${extra.tags.join(' · ')}`);
  if (s.rights) L.push(`Direitos: ${s.rights}`);
  if (s.approved === false) L.push('Estado: por aprovar');
  if (s.lyrics_edit) L.push(`Letra editada por ${s.edited_by || '?'}${s.edited_at ? ' em ' + s.edited_at.slice(0, 10) : ''} (abaixo a versão editada; a original está em base-de-dados/dados.json)`);
  if (extra.books.length) L.push(`Livros: ${extra.books.join('; ')}`);
  L.push('', '— LETRA —' + (s.has_chords ? ' (acordes entre [ ], antes da sílaba)' : ''), '', stanzas(s.lyrics_edit || s.lyrics));
  if (s.translation) L.push('', `— TRADUÇÃO (${LANG[s.translation_language] || s.translation_language || ''}) —`, '', stanzas(s.translation));
  return L.filter(x => x !== null).join('\n') + '\n';
}
const extOf = (path, mime) => (path.match(/\.([a-z0-9]{2,4})$/i) || [])[1]?.toLowerCase() || ({ 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[mime] || 'bin');

// ---------- programa ----------
const t0 = Date.now();
const st = { counts: {} };
const count = k => { st.counts[k] = (st.counts[k] || 0) + 1; };
// pasta da cópia (procurada pelo nome: com drive.file só se veem os ficheiros criados por esta app)
const found = await g('GET', `files?q=${encodeURIComponent(`name='${q(ROOT_NAME)}' and mimeType='${FOLDER}' and 'root' in parents and trashed=false`)}&fields=files(id)`);
const root = found.files[0]?.id || await mkFolder(ROOT_NAME, 'root');
const stateFile = (await g('GET', `files?q=${encodeURIComponent(`name='.estado.json' and '${root}' in parents and trashed=false`)}&fields=files(id)`)).files[0];
const S = stateFile ? await (await g('GET', `files/${stateFile.id}?alt=media`, { raw: true })).json() : { folders: {}, songs: {}, files: {} };
S.folders ||= {}; S.songs ||= {}; S.files ||= {};
for (const f of ['canticos', 'livros', 'outros', 'base-de-dados', 'codigo', 'removidos']) S.folders[f] ||= await mkFolder(f, root);
// guarda o estado de tempos a tempos (se a Action parar a meio, a próxima continua daí)
let dirty = 0, saving = Promise.resolve();
function saveState(force) { // um de cada vez (os envios correm em paralelo)
  if (!force && ++dirty % 200) return saving;
  saving = saving.then(async () => { S.stateId = await upload('.estado.json', root, 'application/json', Buffer.from(JSON.stringify(S)), S.stateId || stateFile?.id); });
  return saving;
}
// ficheiro com impressão digital: só envia se mudou
async function put(key, name, parent, mime, buf, hash = sha(buf)) {
  const cur = S.files[key];
  if (cur && cur.hash === hash && cur.parent === parent && cur.name === name) return cur.id;
  let id;
  if (cur && cur.parent === parent) { id = await upload(name, parent, mime, buf, cur.id); count('atualizados'); }
  else { if (cur) await move(cur.id, cur.parent, S.folders.removidos).catch(() => {}); id = await upload(name, parent, mime, buf); count('novos'); }
  S.files[key] = { id, hash, parent, name }; await saveState();
  return id;
}

console.log('A ler a base de dados…');
const data = await fn('data');
const { objects } = await fn('objects');
const { sql } = await fn('schema');
const objMap = new Map(objects.map(o => [o.name, o]));
console.log(`${data.songs.length} cânticos, ${objects.length} ficheiros no armazenamento`);

// endereços de download, em lotes, quando são precisos
const signed = new Map(); // caminho → { url, at } (os endereços valem 2 horas; renovam-se ao fim de 90 minutos)
const fresh = p => signed.has(p) && Date.now() - signed.get(p).at < 90 * 60e3;
async function sign(path) {
  const need = [path, ...[...objMap.keys()].filter(p => p !== path && !fresh(p)).slice(0, 399)];
  const at = Date.now();
  for (const u of (await fn('sign', { paths: need })).urls) if (u.url) signed.set(u.path, { url: u.url, at });
}
async function bytesOf(path) {
  for (let i = 0; ; i++) {
    if (!fresh(path) || i === 2) await sign(path);
    const r = await fetch(signed.get(path)?.url || 'about:blank').catch(() => null);
    if (r && r.ok) return Buffer.from(await r.arrayBuffer());
    if (i < 3) { await sleep(2000); continue; }
    throw new Error(`download ${r ? r.status : 'falhou'}`);
  }
}
const objHash = o => `${o.etag || ''}:${o.size}`;
async function putObject(key, name, parent, path) {
  const o = objMap.get(path); if (!o) return null;
  const cur = S.files[key];
  if (cur && cur.hash === objHash(o) && cur.parent === parent && cur.name === name) return cur.id;
  return put(key, name, parent, o.mimetype || 'application/octet-stream', await bytesOf(path), objHash(o));
}
const used = new Set();

// 1) livros: completos e páginas
const BOOKS = { songbook: 'Songbook', canti2024: 'CANTI 2024' };
for (const [b, label] of Object.entries(BOOKS)) {
  S.folders['livro:' + b] ||= await mkFolder(label, S.folders.livros);
  if (objMap.has(`livros/${b}.pdf`)) { await putObject(`obj:livros/${b}.pdf`, `${label} (livro completo).pdf`, S.folders.livros, `livros/${b}.pdf`); used.add(`livros/${b}.pdf`); }
  const pages = objects.filter(o => o.name.startsWith(`livros/${b}/`));
  await pool(pages, 4, async o => { await putObject('obj:' + o.name, o.name.split('/').pop(), S.folders['livro:' + b], o.name); used.add(o.name); });
}
console.log(`livros: ${Object.values(st.counts).reduce((a, b) => a + b, 0)} enviados`);

// 2) cânticos: uma pasta cada
const by = (rows, k) => rows.reduce((m, r) => (m.get(r[k]) || m.set(r[k], []).get(r[k])).push(r) && m, new Map());
const srcBy = by(data.song_sources, 'song_slug'), tagBy = by(data.song_tags, 'song_slug'), fileBy = by(data.song_files, 'song_slug');
const SRC = { original: 'Cancioneiro original', coro_clu: 'Coro CLU', songbook: 'Songbook', canti2024: 'CANTI 2024', novos: 'Novos Cânticos' };
const live = new Set();
await pool(data.songs, 4, async s => {
  live.add(s.slug);
  const name = `${String(s.number).padStart(4, '0')} - ${clean(s.title)}`;
  let f = S.songs[s.slug];
  if (!f) { f = S.songs[s.slug] = { id: await mkFolder(name, S.folders.canticos), name }; count('pastas'); }
  else if (f.name !== name || f.removed) { await move(f.id, f.removed ? S.folders.removidos : S.folders.canticos, S.folders.canticos, name); f.name = name; delete f.removed; }
  const files = fileBy.get(s.slug) || [];
  const books = [], shortcuts = [];
  for (const x of files.filter(x => x.path.startsWith('livros/'))) {
    const m = x.path.match(/^livros\/(\w+)\.pdf#(.*)$/); if (!m) continue;
    const p = +(m[2].match(/(?:^|&)p=(\d+)/) || [])[1] || 1, c = (m[2].match(/(?:^|&)c=([^&]+)/) || [])[1];
    const pages = c ? [...new Set(c.split('|').map(r => +r.split(':')[0]))] : [p];
    books.push(`${BOOKS[m[1]] || m[1]}, pág. ${pages.join(', ')}`);
    for (const n of pages) shortcuts.push({ book: m[1], n });
  }
  const extra = { sources: (srcBy.get(s.slug) || []).map(x => SRC[x.source] || x.source), tags: (tagBy.get(s.slug) || []).map(t => `${t.grp}: ${t.tag}`), books };
  await put(`txt:${s.slug}`, `${clean(s.title)}.txt`, f.id, 'text/plain; charset=UTF-8', Buffer.from(songText(s, extra)));
  // gravações e partituras (nomes como na app; repetidos ficam numerados)
  const seen = new Map();
  const own = files.filter(x => !x.path.startsWith('livros/'));
  if (s.pdf_url && objMap.has(s.pdf_url)) own.push({ path: s.pdf_url, label: 'Partitura (Cancioneiro original)', mime: 'application/pdf' });
  for (const x of own) {
    if (!objMap.has(x.path)) continue;
    let base = clean(x.label || (x.kind === 'score' ? 'Partitura' : 'Gravação'));
    const k = base.toLowerCase(); seen.set(k, (seen.get(k) || 0) + 1); if (seen.get(k) > 1) base += ` (${seen.get(k)})`;
    await putObject(`obj:${x.path}@${s.slug}`, `${base}.${extOf(x.path, x.mime)}`, f.id, x.path); used.add(x.path);
  }
  // atalhos para as páginas dos livros (sem duplicar os PDF)
  for (const { book, n } of shortcuts) {
    const page = `livros/${book}/p${String(n).padStart(3, '0')}.pdf`, target = S.files['obj:' + page]?.id; used.add(page);
    if (!target) continue;
    const key = `lnk:${s.slug}:${page}`, nm = `${BOOKS[book] || book}, pág. ${n}`;
    if (S.files[key]?.parent === f.id && S.files[key]?.target === target) continue;
    const id = (await g('POST', 'files?fields=id', { json: { name: nm, mimeType: SHORTCUT, parents: [f.id], shortcutDetails: { targetId: target } } })).id;
    S.files[key] = { id, parent: f.id, target, name: nm }; count('atalhos'); await saveState();
  }
});
// cânticos que deixaram de existir: a pasta vai para removidos/ (nada é apagado)
for (const [slug, f] of Object.entries(S.songs)) if (!live.has(slug) && !f.removed) { await move(f.id, S.folders.canticos, S.folders.removidos).catch(() => {}); f.removed = true; count('cânticos removidos'); }
console.log(`cânticos: ${live.size}`);

// 3) ficheiros do armazenamento que não ficaram em nenhum cântico
const rest = objects.filter(o => !used.has(o.name));
await pool(rest, 4, async o => { await putObject('obj:' + o.name, o.name.replace(/\//g, ' — '), S.folders.outros, o.name); });
console.log(`outros: ${rest.length}`);

// 4) base de dados, código e manual
const today = new Date().toISOString().slice(0, 10);
await put('db:dados', 'dados.json', S.folders['base-de-dados'], 'application/json', Buffer.from(JSON.stringify({ gerado: new Date().toISOString(), ...data }, null, 1)));
await put('db:esquema', 'esquema.sql', S.folders['base-de-dados'], 'text/plain; charset=UTF-8', Buffer.from(sql));
if (FILES.bundle && fs.existsSync(FILES.bundle)) await put('code:bundle', 'cancioneiro.bundle', S.folders.codigo, 'application/octet-stream', fs.readFileSync(FILES.bundle));
if (FILES.zip && fs.existsSync(FILES.zip)) await put('code:zip', 'cancioneiro-codigo.zip', S.folders.codigo, 'application/zip', fs.readFileSync(FILES.zip));
for (const [k, path, name] of [['doc:manual', FILES.manual, 'MANUAL.md'], ['doc:rebuild', FILES.rebuild, 'RECONSTRUIR.md']])
  if (fs.existsSync(path)) await put(k, name, root, 'text/markdown; charset=UTF-8', fs.readFileSync(path));
// manual também como Google Doc (legível no telemóvel); se o Drive não converter Markdown, fica só o .md
if (fs.existsSync(FILES.manual)) {
  const buf = fs.readFileSync(FILES.manual), h = sha(buf);
  if (S.files['doc:gdoc']?.hash !== h) {
    try {
      if (S.files['doc:gdoc']) await g('DELETE', `files/${S.files['doc:gdoc'].id}`).catch(() => {});
      const start = await g('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
        { json: { name: 'LEIA-ME — Manual do Cancioneiro', parents: [root], mimeType: 'application/vnd.google-apps.document' }, headers: { 'X-Upload-Content-Type': 'text/markdown' }, raw: true });
      const r = await fetch(start.headers.get('location'), { method: 'PUT', headers: { 'Content-Type': 'text/markdown' }, body: buf });
      if (r.ok) { S.files['doc:gdoc'] = { id: (await r.json()).id, hash: h }; count('manual (Google Doc)'); } else console.log('Manual como Google Doc: o Drive não converteu (fica o MANUAL.md)');
    } catch (e) { console.log('Manual como Google Doc: ' + e.message.slice(0, 120)); }
  }
}
S.last = { at: new Date().toISOString(), songs: data.songs.length, objects: objects.length, counts: st.counts };
await saveState(true);
console.log(`Feito em ${Math.round((Date.now() - t0) / 1000)} s · ${calls} pedidos ao Drive · ${JSON.stringify(st.counts)} · ${today}`);
