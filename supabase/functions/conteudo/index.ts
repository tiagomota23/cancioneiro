// Conteúdo protegido do Cancioneiro: letras (um cântico de cada vez), pesquisa na letra, identificação pelo som,
// gravação de edições e endereços temporários de ficheiros (livros: só as páginas do cântico).
// Só para emails autorizados, com limites por pessoa para impedir cópias em massa.
// Perfis (hierárquicos): cancioneiro (só cânticos do Cancioneiro, sem acordes nem ficheiros) < coro (tudo, sem editar)
// < maestro (edita e promove cânticos ao Cancioneiro) < gestor (gere os utilizadores). A app indica o perfil ativo
// (pode ser inferior ao da pessoa); vale sempre o menor dos dois.
// Motor de pesquisa partilhado com a app (busca.js na raiz do repositório; publicado ao lado deste ficheiro)
import './busca.js';
const Busca = (globalThis as any).Busca;
const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const RESEND = Deno.env.get('RESEND_API_KEY');
const ADMIN = 'tiago.mota@gmail.com';
const ORIGINS = ['https://tiagomota23.github.io'];
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
// limites por pessoa: cânticos/ficheiros diferentes por hora e por dia; pesquisas e identificações por hora e por dia
const LIMITS = { song: [80, 250], file: [80, 250], search: [200, 1000], match: [200, 1000], save: [60, 200], share: [30, 100] };
const MAX_HITS = 40; // resultados por pesquisa na letra (cada um só com um trecho curto)
const SHARE_HOURS = 24, SHARE_VIEWS = 300, SHARE_COL_VIEWS = 3000; // endereços partilhados: validade e máximo de aberturas (coleções: lista e cânticos)
const DISTINCT = new Set(['song', 'file']);
const ROLES = ['cancioneiro', 'coro', 'maestro', 'gestor'];
const rank = r => ROLES.indexOf(r) + 1;

const cors = (req) => {
  const o = req.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
};
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function all(path) { const out = []; for (let i = 0; ; i += 1000) { const p = await rest(path, { headers: { Range: `${i}-${i + 999}` } }); out.push(...p); if (p.length < 1000) return out; } }

// ---------- utilizador ----------
// a mesma sessão durante 60 s (numa sala, muitos pedidos seguidos de cada pessoa)
const whoCache = new Map();
async function who(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const hit = whoCache.get(auth);
  if (hit && Date.now() - hit.at < 60e3) return hit.user;
  const user = await whoFresh(auth);
  if (whoCache.size > 2000) whoCache.clear();
  if (user) whoCache.set(auth, { user, at: Date.now() });
  return user;
}
async function whoFresh(auth) {
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SK, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  const email = (u.email || '').toLowerCase();
  if (!email) return null;
  const [a] = await rest(`allowed_emails?select=role&email=eq.${encodeURIComponent(email)}`);
  return a ? { id: u.id, email, role: a.role, rank: rank(a.role) } : null;
}

// ---------- emails para os Gestores ----------
const gestores = async () => (await rest('allowed_emails?select=email&role=eq.gestor')).map(x => x.email);
async function mailGestores(subject, html) {
  if (!RESEND) return;
  const send = to => fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Cancioneiro <onboarding@resend.dev>', to, subject, html }) });
  const to = await gestores().catch(() => []);
  // o remetente de teste do Resend só entrega ao dono da conta: se recusar a lista, envia só para o administrador
  const r = await send(to.length ? to : [ADMIN]).catch(() => null);
  if ((!r || !r.ok) && !(to.length === 1 && to[0] === ADMIN)) await send([ADMIN]).catch(() => {});
}

// ---------- limites ----------
// O registo de uso de cada pessoa (últimas 24 h) fica 60 s em memória e é acrescentado aqui: num evento, cada pessoa faz
// muitos pedidos seguidos e não é preciso ler a base de dados em cada um (noutra instância da função conta-se à parte
// durante esse minuto — tolerância aceitável para limites que são contra cópias em massa).
const logCache = new Map();
async function logRows(user, kind) {
  const k = user.id + ':' + kind, h = logCache.get(k);
  if (h && Date.now() - h.at < 60e3) return h.rows;
  const since = new Date(Date.now() - 864e5).toISOString();
  const rows = await rest(`access_log?select=key,at&user_id=eq.${user.id}&kind=eq.${kind}&at=gte.${since}&order=at.desc&limit=5000`);
  if (logCache.size > 5000) logCache.clear();
  logCache.set(k, { rows, at: Date.now() });
  return rows;
}
// regista sem atrasar a resposta (termina depois dela, quando o ambiente o permite)
function logWrite(user, kind, keys) {
  const now = new Date().toISOString(), h = logCache.get(user.id + ':' + kind);
  if (h) for (const key of keys) h.rows.unshift({ key, at: now });
  const w = rest('access_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(keys.map(key => ({ user_id: user.id, email: user.email, kind, key }))) }).catch(e => console.error('access_log', e));
  const er = (globalThis as any).EdgeRuntime;
  return er?.waitUntil ? (er.waitUntil(w), Promise.resolve()) : w;
}
async function limit(user, kind, key) {
  return (await limitMany(user, kind, [key])).length === 1;
}
// várias chaves de uma vez (folhas: letras e ficheiros de todos os cânticos num só pedido): devolve as permitidas
async function limitMany(user, kind, keys) {
  const [perHour, perDay] = LIMITS[kind];
  const rows = await logRows(user, kind), hourAgo = Date.now() - 3600e3, ok = [], fresh = [];
  if (DISTINCT.has(kind)) {
    const day = new Set(rows.map(r => r.key)), hour = new Set(rows.filter(r => Date.parse(r.at) > hourAgo).map(r => r.key));
    for (const key of keys) {
      if (day.has(key)) { ok.push(key); continue; } // já visto nas últimas 24 h: não conta de novo
      if (hour.size >= perHour || day.size >= perDay) continue;
      day.add(key); hour.add(key); ok.push(key); fresh.push(key);
    }
    if (ok.length < keys.length) await alert(user, kind, day.size);
  } else {
    let hour = rows.filter(r => Date.parse(r.at) > hourAgo).length, day = rows.length;
    for (const key of keys) { if (hour >= perHour || day >= perDay) break; hour++; day++; ok.push(key); fresh.push(key); }
    if (ok.length < keys.length) await alert(user, kind, day);
  }
  if (fresh.length) await logWrite(user, kind, fresh);
  return ok;
}
async function alert(user, kind, n) {
  const since = new Date(Date.now() - 864e5).toISOString();
  const sent = await rest(`access_log?select=id&user_id=eq.${user.id}&kind=eq.alerta&at=gte.${since}&limit=1`);
  if (sent.length) return;
  await rest('access_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: user.id, email: user.email, kind: 'alerta', key: kind }) });
  const what = { song: 'cânticos abertos', file: 'ficheiros (gravações/partituras)', search: 'pesquisas na letra', match: 'identificações pelo som', save: 'edições de letra', share: 'endereços partilhados' }[kind] || kind;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e3e3e3;border-radius:12px;overflow:hidden"><div style="background:#1ab07f;color:#fff;padding:16px 22px;font-size:20px;letter-spacing:4px">CANCIONEIRO</div><div style="padding:22px;color:#333;font-size:15px;line-height:1.5"><h2 style="margin:0 0 14px;font-size:18px;color:#12966a">Limite de uso atingido</h2><p>A conta <b>${user.email}</b> atingiu o limite de <b>${what}</b> (${n} nas últimas 24 horas). O acesso a mais conteúdo foi travado temporariamente.</p><p style="color:#777;font-size:13px">Se não foi uso normal, pode bloquear a conta retirando o email da lista de autorizados.</p></div></div>`;
  await mailGestores(`Cancioneiro: limite de uso atingido (${user.email})`, html);
}

// ---------- letras em memória (recarregadas quando há alterações) ----------
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`´]/g, "'");
const stripChords = l => l.replace(/\[[^\]]*\]/g, '');
let cache = null, cacheStamp = '', checkedAt = 0;
async function songs() {
  if (cache && Date.now() - checkedAt < 30e3) return cache;
  const [a] = await rest('songs?select=updated_at&order=updated_at.desc.nullslast&limit=1');
  const [b] = await rest('songs?select=edited_at&order=edited_at.desc.nullslast&limit=1');
  const [c] = await rest('songs?select=number&order=number.desc&limit=1');
  // cânticos promovidos / retirados do Cancioneiro (mudam o número de cânticos do Cancioneiro)
  const r = await fetch(`${SB}/rest/v1/songs?select=slug&cancioneiro=eq.true`, { method: 'HEAD', headers: { ...HDR, Prefer: 'count=exact', Range: '0-0' } });
  const nc = (r.headers.get('content-range') || '').split('/')[1];
  // texto das partituras (song_texts, Action «Texto dos PDF»): quando chega texto novo, o índice é refeito
  const [t] = await rest('song_texts?select=extracted_at&order=extracted_at.desc&limit=1').catch(() => []);
  // versão do catálogo (sobe com qualquer mudança em songs, mesmo sem updated_at — ex.: letras corrigidas por SQL)
  const [cv] = await rest('catalog_version?select=v').catch(() => []);
  const stamp = `${a?.updated_at}|${b?.edited_at}|${c?.number}|${nc}|${t?.extracted_at}|${cv?.v}`;
  checkedAt = Date.now();
  if (cache && stamp === cacheStamp) return cache;
  const list = await all('songs?select=slug,title,author,cancioneiro,approved,added_by,lyrics,lyrics_edit,translation&order=number.asc');
  for (const s of list) {
    s.eff = s.lyrics_edit || s.lyrics || [];
    s.lines = s.eff.flatMap(st => st.lines.map(stripChords)).concat((s.translation || []).flatMap(st => st.lines));
    s.lset = new Set(s.eff.flatMap(st => st.lines).map(cleanLine).filter(l => l.length >= 12));
    s.nt = cleanLine(s.title);
  }
  const pdf = new Map();
  for (const x of await all('song_texts?select=song_slug,text&chars=gt.0').catch(() => [])) {
    const a = pdf.get(x.song_slug) || []; a.push(x.text); pdf.set(x.song_slug, a);
  }
  for (const s of list) s.pdf = pdfLines(s, pdf.get(s.slug) || []);
  cache = { list, bySlug: new Map(list.map(s => [s.slug, s])), ix: null, results: new Map() };
  cacheStamp = stamp;
  return cache;
}

// texto das partituras de um cântico, só o que é dele. Os recortes dos livros às vezes apanham o fim do cântico de
// cima ou outro cântico: fica só a partir da linha com o título; e, se o cântico tem letra, só se coincidir com ela
// (≥30% das palavras). Sem letra e sem o título no recorte, não se usa (não se pode confirmar).
const wset = (s, k) => new Set((norm(s).match(/[a-z]+/g) || []).filter(x => x.length >= k));
function pdfLines(s, texts) {
  const lyr = wset(s.lines.join(' '), 4), real = lyr.size >= 15;
  const tw = wset(String(s.title).replace(/\(.*?\)/g, ''), 3);
  const out = [];
  for (const t of texts) {
    let lines = t.split('\n');
    if (tw.size) {
      const i = lines.findIndex(l => { const lw = wset(l, 3); let c = 0; for (const x of tw) if (lw.has(x)) c++; return c / tw.size >= 0.5; });
      if (i >= 0) lines = lines.slice(i); else if (!real) continue;
    }
    if (real) { const pw = wset(lines.join(' '), 4); let c = 0; for (const x of pw) if (lyr.has(x)) c++; if (!pw.size || c / pw.size < 0.3) continue; }
    out.push(...lines);
  }
  return out;
}

// ---------- pesquisa e identificação pelo som (busca.js) ----------
// índice construído na primeira pesquisa depois de as letras mudarem; os resultados devolvem só trechos de ≤7 palavras
const index = c => c.ix || (c.ix = Busca.build(c.list.map(s => ({ slug: s.slug, title: s.title, author: s.author, lines: s.lines, pdf: s.pdf }))));
// resultados partilhados entre pessoas: numa sala, muitas pessoas pesquisam o mesmo ao mesmo tempo. Guarda-se a lista
// completa por ordem (sem o filtro do perfil, que se aplica depois a cada pessoa) durante 60 s.
function cached(c, key, run) {
  const r = c.results.get(key);
  if (r && Date.now() - r.at < 60e3) return r.v;
  const v = run();
  if (c.results.size >= 500) c.results.delete(c.results.keys().next().value);
  c.results.set(key, { v, at: Date.now() });
  return v;
}

// ---------- cânticos parecidos (para avisar antes de acrescentar um cântico novo) ----------
const cleanLine = l => norm(stripChords(String(l || ''))).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const words = t => new Set(t.split(' ').filter(w => w.length > 2));
function findSimilar(c, title, lines, ok) {
  const nt = cleanLine(title), tw = words(nt);
  const ll = new Set(lines.map(cleanLine).filter(l => l.length >= 12));
  const out = [];
  for (const s of c.list) {
    if (!ok(s)) continue;
    const sw = words(s.nt), inter = [...tw].filter(w => sw.has(w)).length;
    const tSim = !!nt && (s.nt === nt || (nt.length >= 6 && s.nt.length >= 6 && (s.nt.includes(nt) || nt.includes(s.nt))) ||
      (tw.size >= 2 && sw.size >= 2 && inter / new Set([...tw, ...sw]).size >= 0.6));
    let common = 0; for (const l of ll) if (s.lset.has(l)) common++;
    const lSim = common >= 2 || (ll.size >= 2 && common / ll.size >= 0.3);
    if (tSim || lSim) out.push({ slug: s.slug, title: s.title, author: s.author || null, why: tSim && lSim ? 'título e letra' : tSim ? 'título' : 'letra', w: (tSim ? 1 : 0) + (lSim ? 2 : 0) + common / 100 });
  }
  return out.sort((a, b) => b.w - a.w).slice(0, 5).map(({ w, ...x }) => x);
}
// ---------- ficheiros ----------
async function sign(path) {
  const r = await fetch(`${SB}/storage/v1/object/sign/coro/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: HDR, body: JSON.stringify({ expiresIn: 3600 }) });
  const d = await r.json();
  if (!r.ok || !d.signedURL) throw new Error('ficheiro indisponível');
  return `${SB}/storage/v1${d.signedURL}`;
}
// vários endereços de uma vez (um só pedido ao Storage): caminho -> endereço
async function signMany(paths) {
  const out = new Map();
  for (let i = 0; i < paths.length; i += 100) {
    const r = await fetch(`${SB}/storage/v1/object/sign/coro`, { method: 'POST', headers: HDR, body: JSON.stringify({ expiresIn: 3600, paths: paths.slice(i, i + 100) }) });
    if (!r.ok) continue;
    for (const x of await r.json()) if (x.signedURL) out.set(x.path, `${SB}/storage/v1${x.signedURL}`);
  }
  return out;
}
const BOOKS = { 'livros/songbook.pdf': 'livros/songbook', 'livros/canti2024.pdf': 'livros/canti2024' };
const pageFile = (dir, n) => `${dir}/p${String(n).padStart(3, '0')}.pdf`;

// ---------- ler uma página com a letra de um cântico ----------
// só endereços públicos http(s) (nunca endereços internos), no máximo 1,5 MB, 3 redireccionamentos e 10 s
function publicUrl(u) {
  let x; try { x = new URL(u); } catch (e) { throw new Error('Endereço inválido.'); }
  if (!/^https?:$/.test(x.protocol)) throw new Error('O endereço tem de começar por http:// ou https://');
  const h = x.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes('.') || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h) || /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h) || h.includes(':') || /supabase\.(co|in|net)$/.test(h))
    throw new Error('Esse endereço não é permitido.');
  return x;
}
// o nome também não pode apontar para um endereço interno (ex.: 127.0.0.1.nip.io): resolve-se e verifica-se cada IP
const privateIp = ip => {
  ip = ip.toLowerCase();
  const m = ip.match(/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  return ip === '::' || ip === '::1' || /^(fc|fd|fe[89ab]|ff)/.test(ip) || ip.startsWith('64:ff9b:') || ip.startsWith('::ffff:');
};
async function publicHost(x) {
  const ips = [];
  for (const t of ['A', 'AAAA']) ips.push(...await Deno.resolveDns(x.hostname, t).catch(() => []));
  if (!ips.length) throw new Error('Não foi possível encontrar esse endereço.');
  if (ips.some(privateIp)) throw new Error('Esse endereço não é permitido.');
  return x;
}
const decodeEnt = t => t.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|ldquo|rdquo|hellip|ndash|mdash);/gi, (m, e) => {
  const k = e.toLowerCase(); const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—' };
  if (k[0] === '#') { const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return n ? String.fromCodePoint(n) : m; }
  return map[k] ?? m;
});
const htmlText = h => decodeEnt(h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n\n').replace(/<[^>]+>/g, '')).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
async function scrape(raw) {
  let url = await publicHost(publicUrl(raw.trim())), r;
  for (let i = 0; ; i++) {
    r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 (Cancioneiro)', Accept: 'text/html,*/*' } }).catch(() => null);
    if (!r) throw new Error('Não foi possível abrir esse endereço.');
    if (r.status >= 300 && r.status < 400 && r.headers.get('location') && i < 3) { url = await publicHost(publicUrl(new URL(r.headers.get('location'), url).href)); continue; }
    break;
  }
  if (!r.ok) throw new Error(`O endereço respondeu com erro (HTTP ${r.status}).`);
  if (!/text\/html|application\/xhtml|text\/plain/.test(r.headers.get('content-type') || '')) throw new Error('Esse endereço não é uma página de texto.');
  const reader = r.body.getReader(); const parts = []; let n = 0;
  while (n < 1.5e6) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; }
  reader.cancel().catch(() => {});
  const html = new TextDecoder().decode(new Uint8Array(parts.flatMap(p => [...p]))).replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');
  const meta = k => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)`, 'i')) || [])[1];
  let title = decodeEnt(meta('og:title') || (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, '') || (html.match(/<title>([^<]*)/i) || [])[1] || '').trim();
  let author = decodeEnt(meta('music:musician') || meta('author') || '').trim();
  // letra: dados estruturados ou o bloco com mais quebras de linha (preferindo classes como lyrics / letra / testo / paroles)
  let text = '';
  for (const m of html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { const j = JSON.stringify(JSON.parse(m[1])); const t = (j.match(/"lyrics":\{[^}]*"text":"((?:[^"\\]|\\.)*)"/) || [])[1]; if (t) text = JSON.parse('"' + t + '"'); } catch (e) {} }
  if (!text) {
    let best = null;
    const re = /<(pre|div|p|section|article|span|td)\b([^>]*)>/gi; let m;
    while ((m = re.exec(html))) {
      const start = m.index + m[0].length, end = html.indexOf('</' + m[1], start); if (end < 0) continue;
      const inner = html.slice(start, end); if (inner.length > 20000) continue;
      const brs = (inner.match(/<br\s*\/?>|\n/gi) || []).length + (m[1] === 'pre' ? 5 : 0);
      const score = brs * (/(lyric|letra|testo|paroles|songtext|song-text|cifra|letter|tekst)/i.test(m[2]) ? 3 : 1);
      if (brs >= 4 && (!best || score > best.score)) best = { score, inner };
    }
    if (best) text = htmlText(best.inner);
  }
  text = text.replace(/\r/g, '').trim();
  if (text.split('\n').filter(l => l.trim()).length < 3) throw new Error('Não foi possível encontrar a letra nessa página. Pode copiá-la e colá-la no formulário.');
  // o "autor" de algumas páginas é o próprio site: não serve
  const host = url.hostname.replace(/^www\./, '').split('.')[0];
  if (/\.(com|org|net|it|pt|es|fr)\b/i.test(author) || norm(author).replace(/[^a-z]/g, '').includes(norm(host).replace(/[^a-z]/g, ''))) author = '';
  // «Título – Autor», «Título — Testo e accordi», «Título | Site» nos títulos das páginas
  const WORDS = /\b(letra|letras|lyrics|testo|testi|accordi|chords|cifra|cifras|paroles|songtext|e|and|y|et)\b/ig;
  const tparts = title.split(/\s[-–—|]\s/).map(x => x.trim()).filter(x => x && x.replace(WORDS, '').trim() && !norm(x).includes(norm(host)));
  if (tparts.length) { title = tparts[0]; if (!author && tparts.length > 1) author = tparts[tparts.length - 1].replace(WORDS, '').trim(); }
  return { title: title.slice(0, 120), author: author.slice(0, 120), text: text.slice(0, 20000), url: url.href };
}
// apagar um ficheiro do Storage (a API só apaga com a lista de caminhos)
const removeObject = path => fetch(`${SB}/storage/v1/object/coro`, { method: 'DELETE', headers: HDR, body: JSON.stringify({ prefixes: [path] }) }).catch(() => {});
// assinaturas dos tipos aceites (primeiros bytes do ficheiro)
function fileOk(b, mime) {
  const at = (i, ...v) => v.every((x, k) => b[i + k] === x), str = (i, t) => [...t].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (mime === 'application/pdf') return str(0, '%PDF');
  if (mime === 'image/jpeg') return at(0, 0xff, 0xd8, 0xff);
  if (mime === 'image/png') return at(0, 0x89, 0x50, 0x4e, 0x47);
  if (mime === 'audio/mpeg') return str(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
  if (/^audio\/(mp4|x-m4a|m4a)$/.test(mime)) return str(4, 'ftyp');
  if (mime === 'audio/aac') return str(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) || str(4, 'ftyp');
  if (/^audio\/(x-)?wav$/.test(mime)) return str(0, 'RIFF') && str(8, 'WAVE');
  if (mime === 'audio/ogg') return str(0, 'OggS');
  if (mime === 'audio/webm') return at(0, 0x1a, 0x45, 0xdf, 0xa3);
  return false;
}
const noChords = v => (v || []).map(st => ({ ...st, lines: st.lines.map(stripChords) }));
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);
const validLyrics = v => Array.isArray(v) && v.length <= 80 && v.every(st => st && (st.type === 'verse' || st.type === 'chorus') && Array.isArray(st.lines) && st.lines.length <= 80 && st.lines.every(l => typeof l === 'string' && l.length <= 300));

// grupos da pessoa e se uma folha é para ela (sem grupos na folha = todos os grupos; pessoa sem grupo = nenhuma)
const groupsCache = new Map();
const myGroups = async user => {
  const h = groupsCache.get(user.id);
  if (h && Date.now() - h.at < 60e3) return h.v;
  const v = await myGroupsFresh(user);
  if (groupsCache.size > 2000) groupsCache.clear();
  groupsCache.set(user.id, { v, at: Date.now() });
  return v;
};
const myGroupsFresh = async user => new Set((await rest(`user_groups?email=eq.${encodeURIComponent(user.email)}&select=group_id`).catch(() => [])).map(x => x.group_id));
const groupOk = (mine, cg) => !mine || (mine.size > 0 && (!(cg || []).length || cg.some(x => mine.has(x.group_id))));

// cânticos das folhas ativas: 30 s de cache (mudam pouco e são precisos em cada pesquisa)
const sheetsCache = new Map();
async function activeSheets(aud) {
  const h = sheetsCache.get(aud);
  if (h && Date.now() - h.at < 30e3) return h.v;
  const v = await rest(`collection_songs?select=song_slug,collections!inner(audience,expires_at,published,collection_groups(group_id))${aud}&collections.published=is.true&collections.expires_at=gt.${new Date().toISOString()}`).catch(() => null);
  if (!v) return h ? h.v : [];
  sheetsCache.set(aud, { v, at: Date.now() });
  return v;
}

Deno.serve(async (req) => {
  const H = { ...cors(req), 'Content-Type': 'application/json' };
  const out = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  try {
    const b = await req.json().catch(() => ({}));
    const op = b.op;
    if (op === 'shared') { // endereço partilhado: sem conta, só letra e tradução (como no perfil Cancioneiro), durante 24 h
      const token = String(b.token || '');
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return out({ error: 'endereço inválido' }, 400);
      const [sh] = await rest(`song_shares?token=eq.${token}&select=song_slug,collection_id,expires_at,views`);
      // coleção: vale enquanto a coleção existir e não expirar
      const col = sh?.collection_id ? (await rest(`collections?id=eq.${sh.collection_id}&select=id,title,audience,expires_at,published,songs:collection_songs(song_slug,position),sections:collection_sections(title,position)`))[0] : null;
      const until = col ? col.expires_at : sh?.expires_at;
      // folha em edição (ainda não publicada): como se não existisse
      if (!sh || (sh.collection_id && (!col || col.published === false)) || Date.parse(until) <= Date.now()) return out({ error: 'expirado', message: sh?.collection_id ? 'Esta coleção já não está disponível.' : 'Este endereço já não é válido (os endereços partilhados duram 24 horas).' }, 410);
      if (sh.views >= (col ? SHARE_COL_VIEWS : SHARE_VIEWS)) return out({ error: 'limite', message: 'Este endereço foi aberto demasiadas vezes.' }, 429);
      await rest(`song_shares?token=eq.${token}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ views: sh.views + 1 }) });
      const c = await songs();
      // letras só desta folha (substituem a original na folha partilhada)
      const own = col ? new Map((await rest(`collection_lyrics?collection_id=eq.${col.id}&select=song_slug,lyrics`)).map(x => [x.song_slug, x.lyrics])) : new Map();
      const effOf = (slug, s) => own.get(slug) || s.eff;
      if (col && !b.slug) { // lista da coleção: secções e títulos
        const meta = new Map((await rest(`songs?slug=in.(${col.songs.map(x => `"${x.song_slug}"`).join(',') || '""'})&select=slug,title,author,number,language,translation_language`)).map(x => [x.slug, x]));
        const items = [...col.sections.map(x => ({ k: 'sec', title: x.title, pos: x.position })),
          ...col.songs.filter(x => meta.has(x.song_slug)).map(x => { const m = meta.get(x.song_slug); return { k: 'song', slug: m.slug, title: m.title, author: m.author, number: m.number, pos: x.position }; })]
          .sort((a, b) => a.pos - b.pos || (a.k === 'sec' ? -1 : 1))
          .filter((it, i, all) => it.k !== 'sec' || all[i + 1]?.k === 'song'); // só secções com cânticos
        // com songs: true, devolve também a letra de todos os cânticos (a página guarda-os: abrem logo e sem rede; conta como uma abertura)
        const full = b.songs ? items.filter(it => it.k === 'song' && c.bySlug.has(it.slug)).map(it => {
          const s = c.bySlug.get(it.slug), m = meta.get(it.slug);
          return { slug: it.slug, title: m.title, author: m.author, number: m.number, language: m.language, translation_language: m.translation_language,
            lyrics: noChords(effOf(it.slug, s)), translation: s.translation || null };
        }) : undefined;
        return out({ collection: { id: col.id, title: col.title, audience: col.audience }, items, expires_at: until, songs: full });
      }
      const slug = col ? String(b.slug) : sh.song_slug;
      if (col && !col.songs.some(x => x.song_slug === slug)) return out({ error: 'não encontrado' }, 404);
      const [m] = await rest(`songs?slug=eq.${encodeURIComponent(slug)}&select=slug,title,author,language,translation_language,number`);
      const s = c.bySlug.get(slug);
      if (!m || !s) return out({ error: 'não encontrado' }, 404);
      return out({ ...m, lyrics: noChords(effOf(slug, s)), translation: s.translation || null, expires_at: until, collection: col ? { id: col.id, title: col.title } : undefined });
    }
    const user = await who(req);
    if (!user) return out({ error: 'sem acesso' }, 403);
    // perfil ativo escolhido na app (nunca acima do da pessoa)
    const lvl = ROLES.includes(b.perfil) ? Math.min(user.rank, rank(b.perfil)) : user.rank;
    // perfil Cancioneiro: cânticos do Cancioneiro e os de coleções ativas para o Cancioneiro
    // cânticos de coleções ativas que esta pessoa vê: o perfil Cancioneiro passa a vê-los, e não contam para os limites
    // (a app descarrega-os ao abrir, para estarem logo disponíveis)
    let colSet = new Set();
    if (['song', 'songs', 'search', 'match', 'file', 'files', 'share'].includes(op)) {
      const aud = lvl < 2 ? '&collections.audience=eq.cancioneiro' : '';
      const rows = await activeSheets(aud);
      // grupos (abaixo de Gestor): só as folhas para todos os grupos ou de um dos seus; sem grupo, nenhuma
      const mine = lvl >= 4 ? null : await myGroups(user);
      colSet = new Set(rows.filter(r => groupOk(mine, r.collections.collection_groups)).map(r => r.song_slug));
    }
    // sem limite só para quem não cria coleções: um Maestro / Gestor não as pode usar para contornar os limites
    const free = user.rank >= 3 ? new Set() : colSet;
    // cânticos novos ainda por aprovar: só para quem os acrescentou e para Maestro / Gestor
    const visible = s => !!s && (lvl >= 2 || s.cancioneiro || colSet.has(s.slug)) && (s.approved !== false || lvl >= 3 || s.added_by === user.email);
    const denied = () => out({ error: 'sem permissão para este perfil' }, 403);
    const tooMany = () => out({ error: 'limite', message: 'Atingiu o limite de uso por agora. Tente de novo mais tarde.' }, 429);

    if (op === 'song') {
      const slug = String(b.slug || '');
      const c = await songs(); const s = c.bySlug.get(slug);
      if (!visible(s)) return out({ error: 'não encontrado' }, 404);
      if (!free.has(slug) && !(await limit(user, 'song', slug))) return tooMany();
      // com collection: a letra deste cântico só nessa folha (se a pessoa vê a folha e há versão da folha)
      let eff = s.eff, folha = false;
      if (b.collection) {
        const id = String(b.collection);
        if (!/^[0-9a-f-]{36}$/.test(id)) return out({ error: 'coleção inválida' }, 400);
        const [o] = await rest(`collection_lyrics?collection_id=eq.${id}&song_slug=eq.${encodeURIComponent(slug)}&select=lyrics`);
        const [c] = o ? await rest(`collections?id=eq.${id}&select=audience,expires_at,published,collection_groups(group_id)`) : [];
        const gOk = async () => groupOk(await myGroups(user), c.collection_groups);
        if (o && c && (lvl >= 4 || (lvl >= 3 && await gOk()) || (c.published && Date.parse(c.expires_at) > Date.now() && (c.audience === 'cancioneiro' || lvl >= 2) && await gOk()))) { eff = o.lyrics; folha = true; }
      }
      // o perfil Cancioneiro não vê acordes
      return out({ slug, lyrics: lvl >= 2 ? eff : noChords(eff), translation: s.translation || null, edited: !!s.lyrics_edit, folha });
    }
    // várias letras num só pedido (a app descarrega assim as folhas ativas e os Preferidos ao abrir): os mesmos
    // limites e regras do op song, mas uma só leitura do registo e uma só escrita
    if (op === 'songs') {
      const c = await songs();
      const want = [...new Set((Array.isArray(b.slugs) ? b.slugs : []).map(String))].slice(0, 60).filter(sl => visible(c.bySlug.get(sl)));
      const ok = new Set([...want.filter(sl => free.has(sl)), ...await limitMany(user, 'song', want.filter(sl => !free.has(sl)))]);
      const res = {};
      for (const sl of want) if (ok.has(sl)) { const s = c.bySlug.get(sl); res[sl] = { lyrics: lvl >= 2 ? s.eff : noChords(s.eff), translation: s.translation || null, edited: !!s.lyrics_edit }; }
      return out({ songs: res, refused: want.filter(sl => !ok.has(sl)) });
    }
    // vários ficheiros num só pedido: endereços de 1 hora (livros: as páginas do recorte), como o op file
    if (op === 'files') {
      if (lvl < 2) return denied();
      const raw = [...new Set((Array.isArray(b.paths) ? b.paths : []).map(String))].slice(0, 60);
      if (!raw.length) return out({ files: {}, refused: [] });
      const known = await rest(`song_files?select=path,song_slug&path=in.(${raw.map(p => '"' + encodeURIComponent(p.replace(/"/g, '')) + '"').join(',')})`);
      const items = known.map(f => {
        const [path, frag = ''] = f.path.split('#');
        if (!BOOKS[path]) return { key: f.path, slug: f.song_slug, objs: [{ n: 0, obj: path }] };
        const p = +(frag.match(/(?:^|&)p=(\d+)/) || [])[1] || 1, crop = (frag.match(/(?:^|&)c=([^&]+)/) || [])[1];
        const ns = crop ? [...new Set(crop.split('|').map(r => +r.split(':')[0]))] : [p, p + 1];
        return { key: f.path, slug: f.song_slug, book: path, objs: ns.map(n => ({ n, obj: pageFile(BOOKS[path], n) })) };
      });
      // limites por ficheiro / página (cânticos de folhas ativas sem limite, como no op file)
      const lkey = (it, o) => it.book ? `${it.book}#${o.n}` : o.obj;
      const need = items.filter(it => !free.has(it.slug)).flatMap(it => it.objs.map(o => lkey(it, o)));
      const allowed = new Set(await limitMany(user, 'file', need));
      const okItems = items.filter(it => free.has(it.slug) || it.objs.every(o => allowed.has(lkey(it, o))));
      const urls = await signMany(okItems.flatMap(it => it.objs.map(o => o.obj)));
      const files = {};
      for (const it of okItems) {
        if (it.book) files[it.key] = { pages: it.objs.map(o => ({ n: o.n, url: urls.get(o.obj) })).filter(x => x.url) };
        else if (urls.get(it.objs[0].obj)) files[it.key] = { url: urls.get(it.objs[0].obj) };
      }
      return out({ files, refused: raw.filter(p => !files[p]) });
    }
    if (op === 'collyrics') { // Maestro: letra de um cântico só numa folha (lyrics: null volta à letra original)
      if (lvl < 3) return denied();
      const id = String(b.collection || ''), slug = String(b.slug || ''), v = b.lyrics ?? null;
      if (!/^[0-9a-f-]{36}$/.test(id)) return out({ error: 'coleção inválida' }, 400);
      if (v !== null && !validLyrics(v)) return out({ error: 'letra inválida' }, 400);
      if (!(await limit(user, 'save', 'col:' + id + ':' + slug))) return tooMany();
      const [cs] = await rest(`collection_songs?collection_id=eq.${id}&song_slug=eq.${encodeURIComponent(slug)}&select=song_slug,collections(collection_groups(group_id))`);
      if (!cs) return out({ error: 'O cântico não está nesta folha.' }, 404);
      // o Maestro só mexe nas folhas dos seus grupos (o Gestor em todas)
      if (lvl < 4 && !groupOk(await myGroups(user), cs.collections?.collection_groups)) return denied();
      const key = `collection_lyrics?collection_id=eq.${id}&song_slug=eq.${encodeURIComponent(slug)}`;
      if (v === null) { await rest(key, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); return out({ ok: true, edited_at: null }); }
      const [r] = await rest('collection_lyrics?on_conflict=collection_id,song_slug', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ collection_id: id, song_slug: slug, lyrics: v, edited_by: user.email, edited_at: new Date().toISOString() }) });
      return out({ ok: true, edited_at: r?.edited_at || null });
    }
    // recortes dos livros a rever (Maestro / Gestor): lista dos pendentes, e decisão (manter, ou um recorte novo)
    if (op === 'crops') {
      if (lvl < 3) return denied();
      const rows = await rest('crop_reviews?select=id,song_slug,proposed,previous,note,f:song_files(path)&status=eq.pendente&order=id.asc');
      return out({ reviews: rows.map(r => ({ id: r.id, slug: r.song_slug, current: r.f?.path || null, proposed: r.proposed, previous: r.previous, note: r.note })) });
    }
    if (op === 'croppages') { // páginas para a revisão: as dos recortes atual, anterior e proposto, e uma de cada lado
      if (lvl < 3) return denied();
      const [r] = await rest(`crop_reviews?select=id,proposed,previous,f:song_files(path)&id=eq.${+b.id || 0}&status=eq.pendente`);
      if (!r || !r.f) return out({ error: 'Esta revisão já não está pendente.' }, 404);
      const base = String(r.f.path).split('#')[0];
      if (!BOOKS[base]) return out({ error: 'não é um livro' }, 400);
      const nums = [...new Set([r.f.path, r.previous || '', r.proposed || ''].flatMap(x => [...x.matchAll(/(\d+):/g)].map(y => +y[1])).flatMap(n => [n - 1, n, n + 1]).filter(n => n >= 1))].sort((x, y) => x - y);
      const res = [];
      for (const n of nums) {
        if (!(await limit(user, 'file', `${base}#${n}`))) return tooMany();
        res.push({ n, url: await sign(pageFile(BOOKS[base], n)).catch(() => null) });
      }
      return out({ pages: res.filter(x => x.url) });
    }
    if (op === 'cropset') {
      if (lvl < 3) return denied();
      const id = +b.id || 0;
      const [r] = await rest(`crop_reviews?select=id,song_slug,song_file_id,status,previous,proposed,f:song_files(path)&id=eq.${id}`);
      if (!r || r.status !== 'pendente' || !r.f) return out({ error: 'Esta revisão já não está pendente.' }, 404);
      if (!(await limit(user, 'save', 'crop:' + id))) return tooMany();
      if (b.path) {
        // o mesmo livro e o mesmo cântico; 1 a 4 partes, páginas perto das do recorte atual (ou anterior), frações válidas
        const path = String(b.path), cur = String(r.f.path);
        const m = path.match(/^(livros\/(?:songbook|canti2024)\.pdf)#p=(\d+)&c=([0-9.:,|]+)&s=([a-z0-9_]+)$/);
        if (!m || m[1] !== cur.split('#')[0] || m[4] !== r.song_slug) return out({ error: 'Recorte inválido.' }, 400);
        const parts = m[3].split('|').map(x => { const [pg, bx] = x.split(':'); return [+pg, ...String(bx).split(',').map(Number)]; });
        const pagesNear = new Set([cur, r.previous || '', r.proposed || ''].flatMap(x => [...x.matchAll(/(\d+):/g)].map(y => +y[1])).flatMap(n => [n - 1, n, n + 1]));
        const ok = parts.length >= 1 && parts.length <= 4 && +m[2] === parts[0][0] && parts.every(([pg, x0, y0, x1, y1]) =>
          pagesNear.has(pg) && [x0, y0, x1, y1].every(v => v >= 0 && v <= 1) && x1 - x0 >= 0.05 && y1 - y0 >= 0.02);
        if (!ok) return out({ error: 'Recorte inválido.' }, 400);
      }
      // a decisão fica de quem a marcar primeiro (só se ainda estiver pendente); só depois muda o recorte
      const claimed = await rest(`crop_reviews?id=eq.${id}&status=eq.pendente`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'feito', decided_by: user.email, decided_at: new Date().toISOString() }) });
      if (!claimed.length) return out({ error: 'Esta revisão já foi decidida por outra pessoa.' }, 409);
      if (b.path && b.path !== r.f.path) await rest(`song_files?id=eq.${r.song_file_id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ path: String(b.path) }) });
      return out({ ok: true, path: b.path || r.f.path });
    }
    if (op === 'invite') { // "Partilhar a app": convite para um perfil até ao de quem convida (o acesso continua a precisar de aprovação)
      const role = String(b.role || 'cancioneiro');
      if (!ROLES.includes(role) || rank(role) > user.rank) return denied();
      if (!(await limit(user, 'share', 'invite:' + role))) return tooMany();
      const [me] = await rest(`allowed_emails?select=name&email=eq.${encodeURIComponent(user.email)}`);
      const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, '-').replace(/\//g, '_');
      await rest('invites', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ token, role, invited_by: user.email, inviter_name: me?.name || null, expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }) });
      return out({ token, role });
    }
    if (op === 'share' && b.collection) { // endereço de uma coleção (só Maestro e Gestor; expira com a coleção)
      if (lvl < 3) return denied();
      const id = String(b.collection);
      if (!/^[0-9a-f-]{36}$/.test(id)) return out({ error: 'coleção inválida' }, 400);
      const [col] = await rest(`collections?id=eq.${id}&select=id,audience,expires_at,published`);
      if (!col || Date.parse(col.expires_at) <= Date.now()) return out({ error: 'Esta coleção já não está disponível.' }, 404);
      if (col.published === false) return out({ error: 'Publique a folha antes de a partilhar.' }, 409);
      if (!(await limit(user, 'share', 'col:' + id))) return tooMany();
      const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, '-').replace(/\//g, '_');
      await rest('song_shares', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ token, collection_id: id, created_by: user.email, expires_at: col.expires_at }) });
      return out({ token, expires_at: col.expires_at });
    }
    if (op === 'share') { // criar um endereço partilhado (válido 24 h) para um cântico que esta pessoa vê
      const slug = String(b.slug || '');
      const c = await songs(); const s = c.bySlug.get(slug);
      if (!visible(s)) return out({ error: 'não encontrado' }, 404);
      if (!(await limit(user, 'share', slug))) return tooMany();
      const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, '-').replace(/\//g, '_');
      const expires_at = new Date(Date.now() + SHARE_HOURS * 3600e3).toISOString();
      await rest('song_shares', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ token, song_slug: slug, created_by: user.email, expires_at }) });
      return out({ token, expires_at });
    }
    if (op === 'search') {
      const q = String(b.q || '').slice(0, 120), nq = Busca.toks(q).join(' ');
      // números (cântico, página) e pesquisas muito curtas resolvem-se na app
      if (nq.replace(/ /g, '').length < 3 || /^[\d ]+$/.test(nq)) return out({ hits: [] });
      if (!(await limit(user, 'search', nq))) return tooMany();
      const c = await songs();
      const all = cached(c, 's:' + nq, () => Busca.search(index(c), q, null, 400));
      // o perfil Cancioneiro não vê partituras: sem trechos delas
      return out({ hits: all.filter(h => visible(c.bySlug.get(h.slug)) && (lvl >= 2 || h.field !== 'pdf')).slice(0, MAX_HITS) });
    }
    if (op === 'match') {
      const text = String(b.text || '').slice(0, 1000);
      if (!(await limit(user, 'match', null))) return tooMany();
      const c = await songs();
      const all = cached(c, 'm:' + Busca.toks(text).join(' '), () => Busca.match(index(c), text, null, true));
      // como na pesquisa: o perfil Cancioneiro não recebe trechos de partituras
      return out({ matches: Busca.pick(all.filter(h => visible(c.bySlug.get(h.slug)) && (lvl >= 2 || h.field !== 'pdf'))) });
    }
    if (op === 'save') {
      if (lvl < 3) return denied();
      const slug = String(b.slug || ''); const v = b.lyrics_edit ?? null;
      if (v !== null && !validLyrics(v)) return out({ error: 'letra inválida' }, 400);
      if (!(await limit(user, 'save', slug))) return tooMany();
      const r = await rest(`songs?slug=eq.${encodeURIComponent(slug)}&select=edited_by,edited_at,is_edited`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ lyrics_edit: v, edited_by: v ? user.email : null }) });
      if (!r.length) return out({ error: 'não encontrado' }, 404);
      cache = null;
      return out(r[0]);
    }
    if (op === 'delfile') { // Maestro: apagar um ficheiro enviado pela app (os importados não se apagam)
      if (lvl < 3) return denied();
      const path = String(b.path || '');
      if (!/^enviados\/[a-z0-9_]+\/\d+-[0-9a-f]{8}\.[a-z0-9]+$/.test(path)) return out({ error: 'Só se podem apagar ficheiros enviados pela app.' }, 400);
      if (!(await limit(user, 'save', 'del:' + path))) return tooMany();
      await rest(`song_files?path=eq.${encodeURIComponent(path)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      await removeObject(path);
      return out({ ok: true });
    }
    if (op === 'upload' || op === 'addfile') { // Maestro: acrescentar gravações e partituras; Coro: só aos cânticos novos que acrescentou
      const slug = String(b.slug || ''), kind = String(b.kind || '');
      if (lvl < 3) {
        const [mine] = lvl >= 2 ? await rest(`songs?slug=eq.${encodeURIComponent(slug)}&added_by=eq.${encodeURIComponent(user.email)}&select=slug`) : [];
        if (!mine) return denied();
      }
      const mime = String(b.mime || '').toLowerCase(), size = +b.size || 0;
      const okMime = kind === 'recording' ? /^audio\/(mpeg|mp4|x-m4a|m4a|aac|wav|x-wav|ogg|webm)$/.test(mime) : /^(application\/pdf|image\/(jpeg|png))$/.test(mime);
      if (!['recording', 'score'].includes(kind) || !okMime) return out({ error: 'Tipo de ficheiro não aceite.' }, 400);
      if (!size || size > 40e6) return out({ error: 'O ficheiro é demasiado grande (máximo 40 MB).' }, 400);
      const [s] = await rest(`songs?slug=eq.${encodeURIComponent(slug)}&select=slug`);
      if (!s) return out({ error: 'não encontrado' }, 404);
      if (op === 'upload') {
        if (!(await limit(user, 'save', 'upload:' + slug + ':' + Date.now()))) return tooMany();
        const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/aac': 'aac' }[mime] || 'm4a';
        const path = `enviados/${slug}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const r = await fetch(`${SB}/storage/v1/object/upload/sign/coro/${path}`, { method: 'POST', headers: HDR, body: '{}' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.url) return out({ error: 'Não foi possível preparar o envio.' }, 500);
        return out({ path, url: `${SB}/storage/v1${d.url}` });
      }
      const path = String(b.path || ''), label = String(b.label || '').trim().slice(0, 80) || (kind === 'score' ? 'Partitura' : 'Gravação');
      if (!new RegExp(`^enviados/${slug.replace(/[^a-z0-9_]/g, '')}/\\d+-[0-9a-f]{8}\\.[a-z0-9]+$`).test(path)) return out({ error: 'ficheiro inválido' }, 400);
      // o conteúdo tem de ser mesmo o que diz ser (assinatura no início do ficheiro) e não passar de 40 MB
      const obj = `${SB}/storage/v1/object/coro/${path}`;
      const head = await fetch(obj, { headers: { ...HDR, Range: 'bytes=0-15' } }).catch(() => null);
      if (!head || !(head.ok || head.status === 206)) return out({ error: 'O ficheiro não chegou ao servidor.' }, 400);
      const sig = new Uint8Array(await head.arrayBuffer());
      const total = +((head.headers.get('content-range') || '').split('/')[1] || head.headers.get('content-length') || 0);
      if (!fileOk(sig, mime) || !total || total > 40e6) {
        await removeObject(path);
        return out({ error: total > 40e6 ? 'O ficheiro é demasiado grande (máximo 40 MB).' : 'O conteúdo do ficheiro não corresponde ao tipo indicado.' }, 400);
      }
      const [last] = await rest(`song_files?song_slug=eq.${encodeURIComponent(slug)}&kind=eq.${kind}&select=sort&order=sort.desc&limit=1`);
      const [row] = await rest('song_files?select=kind,label,path,mime,sort', { method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ song_slug: slug, kind, label, path, mime, size: total, sort: (last?.sort ?? 0) + 1 }) });
      return out(row);
    }
    if (op === 'similar') { // antes de acrescentar: cânticos com título ou letra parecidos
      if (lvl < 2) return denied();
      if (!(await limit(user, 'search', 'similar:' + String(b.title || '').slice(0, 60)))) return tooMany();
      const lines = Array.isArray(b.lines) ? b.lines.slice(0, 400).map(x => String(x).slice(0, 300)) : [];
      return out({ similar: findSimilar(await songs(), String(b.title || '').slice(0, 120), lines, visible) });
    }
    if (op === 'addsong') { // Novos Cânticos: Coro para cima; do Coro fica pendente até um Maestro aprovar
      if (lvl < 2) return denied();
      const title = String(b.title || '').trim().slice(0, 120), author = String(b.author || '').trim().slice(0, 120) || null;
      const language = /^[a-z]{2}$/.test(b.language || '') ? b.language : 'pt';
      const lyrics = b.lyrics;
      if (!title) return out({ error: 'Falta o título.' }, 400);
      if (!validLyrics(lyrics) || (!lyrics.length && !b.hasPdf)) return out({ error: 'Falta a letra (ou a letra é inválida).' }, 400);
      if (!(await limit(user, 'save', 'addsong:' + title))) return tooMany();
      const base = norm(title + (author ? ' ' + author : '')).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'cantico';
      let slug = base;
      for (let i = 2; (await rest(`songs?slug=eq.${slug}&select=slug`)).length; i++) slug = base + '_' + i;
      const [mx] = await rest('songs?select=number&order=number.desc&limit=1');
      const ok = false, now = new Date().toISOString(); // todos os cânticos novos começam por aprovar (também os de um Maestro)
      // parecidos com cânticos que já existem: fica registado para quem aprova
      const similar = findSimilar(await songs(), title, lyrics.flatMap(st => st.lines), x => x.approved !== false);
      await rest('songs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
        slug, number: (mx?.number || 0) + 1, title, author, language, lyrics, has_chords: lyrics.some(st => st.lines.some(l => l.includes('['))),
        cancioneiro: false, approved: ok, added_by: user.email, added_at: now, approved_by: ok ? user.email : null, parecidos: similar.length ? similar : null }) });
      await rest('song_sources', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ song_slug: slug, source: 'novos' }) });
      // categoria (as de língua vêm do idioma): etiqueta de um grupo conhecido (Coro, momentos, Songbook, CANTI) ou própria ("Categoria")
      const grp = String(b.tag?.grp || ''), tag = String(b.tag?.tag || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (tag && ['Categoria', 'Coro CLU', 'Coro CLU — momento', 'Songbook', 'CANTI 2024'].includes(grp))
        await rest('song_tags', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ song_slug: slug, grp, tag }) });
      cache = null;
      return out({ slug, approved: ok });
    }
    if (op === 'scrape') { // ler título, autor e letra de uma página pública (para preencher o formulário)
      if (lvl < 2) return denied();
      if (!(await limit(user, 'save', 'scrape:' + Date.now()))) return tooMany();
      try { return out(await scrape(String(b.url || ''))); }
      catch (e) { return out({ error: String(e.message || e) }, 400); }
    }
    if (op === 'coro') { // Maestro: pôr / tirar um cântico novo (já aprovado) do livro do Coro
      if (lvl < 3) return denied();
      const slug = String(b.slug || ''), on = !!b.on;
      const [sg] = await rest(`songs?slug=eq.${encodeURIComponent(slug)}&select=slug,approved,sources:song_sources(source)`);
      if (!sg) return out({ error: 'não encontrado' }, 404);
      if (!sg.sources.some(x => x.source === 'novos')) return out({ error: 'Só os cânticos novos podem ser postos ou tirados do Coro.' }, 400);
      if (on && sg.approved === false) return out({ error: 'Aprove primeiro o cântico novo.' }, 400);
      if (!(await limit(user, 'save', 'coro:' + slug))) return tooMany();
      if (on) await rest('song_sources', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ song_slug: slug, source: 'coro_clu' }) });
      else await rest(`song_sources?song_slug=eq.${encodeURIComponent(slug)}&source=eq.coro_clu`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      cache = null;
      return out({ ok: true });
    }
    if (op === 'editsong') { // Maestro: título, autor, idioma e categoria de um cântico (a letra vai por "save")
      if (lvl < 3) return denied();
      const slug = String(b.slug || ''), title = String(b.title || '').trim().slice(0, 120), author = String(b.author || '').trim().slice(0, 120) || null;
      const language = /^[a-z]{2,3}$/.test(b.language || '') ? b.language : null;
      if (!title || !language) return out({ error: 'Faltam o título ou o idioma.' }, 400);
      if (!(await limit(user, 'save', 'edit:' + slug))) return tooMany();
      const r = await rest(`songs?slug=eq.${encodeURIComponent(slug)}&select=slug`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ title, author, language }) });
      if (!r.length) return out({ error: 'não encontrado' }, 404);
      const GRPS = ['Categoria', 'Coro CLU', 'Coro CLU — momento', 'Songbook', 'CANTI 2024'];
      const tg = x => x && GRPS.includes(String(x.grp)) && String(x.tag || '').trim() ? { grp: String(x.grp), tag: String(x.tag).replace(/\s+/g, ' ').trim().slice(0, 60) } : null;
      const rm = tg(b.removeTag), add = tg(b.addTag);
      if (rm) await rest(`song_tags?song_slug=eq.${encodeURIComponent(slug)}&grp=eq.${encodeURIComponent(rm.grp)}&tag=eq.${encodeURIComponent(rm.tag)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      if (add) await rest('song_tags', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ song_slug: slug, ...add }) });
      cache = null;
      return out({ ok: true });
    }
    if (op === 'unlinkfile') { // Maestro: tirar um ficheiro de um cântico (os enviados pela app são apagados; os importados só deixam de estar ligados)
      if (lvl < 3) return denied();
      const slug = String(b.slug || ''), path = String(b.path || '');
      if (!(await limit(user, 'save', 'unlink:' + path))) return tooMany();
      const r = await rest(`song_files?song_slug=eq.${encodeURIComponent(slug)}&path=eq.${encodeURIComponent(path)}&select=path`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      if (!r.length) return out({ error: 'não encontrado' }, 404);
      if (/^enviados\//.test(path)) await removeObject(path);
      return out({ ok: true });
    }
    if (op === 'approvesong') { // Maestro: aprovar um cântico novo
      if (lvl < 3) return denied();
      const slug = String(b.slug || '');
      const r = await rest(`songs?slug=eq.${encodeURIComponent(slug)}&approved=eq.false&select=slug`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ approved: true, approved_by: user.email }) });
      if (!r.length) return out({ error: 'não encontrado' }, 404);
      cache = null;
      return out({ ok: true });
    }
    if (op === 'delsong') { // Maestro: recusar / apagar um cântico novo (por aprovar ou já aprovado)
      if (lvl < 3) return denied();
      const slug = String(b.slug || '');
      const [sg] = await rest(`songs?slug=eq.${encodeURIComponent(slug)}&select=slug,sources:song_sources(source)`);
      if (!sg) return out({ error: 'não encontrado' }, 404);
      if (!sg.sources.some(x => x.source === 'novos')) return out({ error: 'Só se podem apagar cânticos novos.' }, 400);
      for (const f of await rest(`song_files?song_slug=eq.${encodeURIComponent(slug)}&select=path`)) if (/^enviados\//.test(f.path)) await removeObject(f.path);
      await rest(`songs?slug=eq.${encodeURIComponent(slug)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      cache = null;
      return out({ ok: true });
    }
    if (op === 'promote') { // Maestro: pôr ou tirar um cântico do Cancioneiro (os do site original ficam sempre)
      if (lvl < 3) return denied();
      const slug = String(b.slug || ''), on = !!b.on;
      const [s] = await rest(`songs?slug=eq.${encodeURIComponent(slug)}&select=slug,approved,sources:song_sources(source)`);
      if (!s) return out({ error: 'não encontrado' }, 404);
      if (on && s.approved === false) return out({ error: 'Aprove primeiro o cântico novo.' }, 400);
      if (!on && s.sources.some(x => x.source === 'original')) return out({ error: 'Este cântico é do Cancioneiro original e não pode ser retirado.' }, 400);
      if (!(await limit(user, 'save', 'promote:' + slug))) return tooMany();
      const r = await rest(`songs?slug=eq.${encodeURIComponent(slug)}&select=cancioneiro,promoted_by,promoted_at`, { method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ cancioneiro: on, promoted_by: on ? user.email : null, promoted_at: on ? new Date().toISOString() : null }) });
      cache = null;
      return out(r[0]);
    }
    if (op === 'users') { // Gestor: lista de utilizadores e pedidos de acesso pendentes; Maestro: só quem não é Gestor
      if (lvl < 3) return denied();
      const [list, reqs, au] = await Promise.all([
        rest('allowed_emails?select=email,name,role,added_at,added_by&order=email'),
        rest('access_requests?select=id,email,name,created_at,status&status=eq.pendente&order=created_at.desc'),
        fetch(`${SB}/auth/v1/admin/users?per_page=1000`, { headers: HDR }).then(r => r.json()).catch(() => ({})),
      ]);
      const seen = new Map((au.users || []).map(u => [String(u.email || '').toLowerCase(), u]));
      // nome e apelido dados pelo Google ao entrar (guardados como nome da pessoa)
      const gname = u => { const m = u?.user_metadata || {}, id = (u?.identities || [])[0]?.identity_data || {};
        const gf = [m.given_name || id.given_name, m.family_name || id.family_name].filter(Boolean).join(' ');
        return (gf || m.full_name || m.name || id.full_name || id.name || '').trim() || null; };
      for (const x of list) {
        const g = gname(seen.get(x.email));
        if (g && g !== x.name) { x.name = g; await rest(`allowed_emails?email=eq.${encodeURIComponent(x.email)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name: g }) }); }
      }
      const pending = lvl >= 4 ? reqs.filter(q => !list.some(x => x.email === q.email)) : [];
      return out({
        me: user.email, owner: user.email === ADMIN,
        users: list.filter(x => lvl >= 4 || x.role !== 'gestor').map(x => { const u = seen.get(x.email); return { ...x, google_name: gname(u), last_sign_in_at: u?.last_sign_in_at || null }; }),
        requests: pending,
      });
    }
    if (op === 'user') { // Gestor: acrescentar / alterar perfil / retirar acesso. Maestro: só mudar perfis entre Cancioneiro e Maestro
      if (lvl < 3) return denied();
      const email = String(b.email || '').trim().toLowerCase();
      if (!validEmail(email)) return out({ error: 'email inválido' }, 400);
      const role = b.remove ? null : String(b.role || '');
      if (role !== null && !ROLES.includes(role)) return out({ error: 'perfil inválido' }, 400);
      const [cur] = await rest(`allowed_emails?select=role&email=eq.${encodeURIComponent(email)}`);
      if (lvl < 4) {
        if (!cur || cur.role === 'gestor' || role === null || rank(role) > 3 || b.name !== undefined) return denied();
      }
      // só o administrador (dono) pode despromover ou retirar outro Gestor
      if (cur && cur.role === 'gestor' && role !== 'gestor' && email !== user.email && user.email !== ADMIN) return out({ error: 'Só o administrador pode mudar o perfil de outro Gestor.' }, 403);
      if (role !== 'gestor') { // nunca ficar sem nenhum Gestor
        const g = await gestores();
        if (g.length === 1 && g[0] === email) return out({ error: 'Tem de haver pelo menos um Gestor.' }, 400);
      }
      if (!(await limit(user, 'save', 'user:' + email))) return tooMany();
      if (role === null) {
        await rest(`allowed_emails?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      } else {
        const name = b.name === undefined ? undefined : String(b.name || '').trim().slice(0, 80) || null;
        const [ex] = await rest(`allowed_emails?select=email&email=eq.${encodeURIComponent(email)}`);
        if (ex) await rest(`allowed_emails?email=eq.${encodeURIComponent(email)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(name === undefined ? { role } : { role, name }) });
        else await rest('allowed_emails', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ email, role, name: name ?? null, added_by: user.email }) });
        // um pedido pendente desta pessoa fica resolvido; se a conta tinha sido bloqueada, é desbloqueada
        const reqs = await rest(`access_requests?email=eq.${encodeURIComponent(email)}&select=user_id,status`);
        for (const q of reqs) if (q.user_id && q.status === 'bloqueado') await fetch(`${SB}/auth/v1/admin/users/${q.user_id}`, { method: 'PUT', headers: HDR, body: JSON.stringify({ ban_duration: 'none' }) });
        if (reqs.length) await rest(`access_requests?email=eq.${encodeURIComponent(email)}&status=neq.autorizado`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'autorizado', decided_at: new Date().toISOString() }) });
      }
      return out({ ok: true });
    }
    if (op === 'reject') { // Gestor: recusar um pedido de acesso (a conta fica bloqueada)
      if (lvl < 4) return denied();
      const id = String(b.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return out({ error: 'pedido inválido' }, 400);
      const [q] = await rest(`access_requests?id=eq.${id}&select=user_id,status`);
      if (!q || q.status !== 'pendente') return out({ error: 'pedido já decidido' }, 400);
      if (q.user_id) await fetch(`${SB}/auth/v1/admin/users/${q.user_id}`, { method: 'PUT', headers: HDR, body: JSON.stringify({ ban_duration: '876000h' }) });
      await rest(`access_requests?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'bloqueado', decided_at: new Date().toISOString() }) });
      return out({ ok: true });
    }
    if (op === 'file') {
      if (lvl < 2) return denied();
      const raw = String(b.path || '');
      const [path, frag = ''] = raw.split('#');
      const files = await rest(`song_files?select=path,song_slug&path=eq.${encodeURIComponent(raw)}&limit=1`);
      const songPdf = !files.length && /^partituras\/[a-z0-9_.\-]+\.pdf$/.test(path) ? await rest(`songs?select=slug&pdf_url=eq.${encodeURIComponent(path)}&limit=1`) : [];
      if (!files.length && !songPdf.length) return out({ error: 'ficheiro desconhecido' }, 404);
      const inCol = free.has(files.length ? files[0].song_slug : songPdf[0].slug); // ficheiros de coleções: sem limite
      if (BOOKS[path]) {
        const p = +(frag.match(/(?:^|&)p=(\d+)/) || [])[1] || 1;
        const crop = (frag.match(/(?:^|&)c=([^&]+)/) || [])[1];
        const pages = crop ? [...new Set(crop.split('|').map(r => +r.split(':')[0]))] : [p, p + 1];
        const res = [];
        for (const n of pages) {
          if (!inCol && !(await limit(user, 'file', `${path}#${n}`))) return tooMany();
          res.push({ n, url: await sign(pageFile(BOOKS[path], n)).catch(() => null) });
        }
        return out({ pages: res.filter(x => x.url) });
      }
      if (!inCol && !(await limit(user, 'file', path))) return tooMany();
      return out({ url: await sign(path) });
    }
    return out({ error: 'operação desconhecida' }, 400);
  } catch (e) {
    return out({ error: String(e.message || e) }, 500);
  }
});
