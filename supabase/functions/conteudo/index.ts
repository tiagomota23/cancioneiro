// Conteúdo protegido do Cancioneiro: letras (um cântico de cada vez), pesquisa na letra, identificação pelo som,
// gravação de edições e endereços temporários de ficheiros (livros: só as páginas do cântico).
// Só para emails autorizados, com limites por pessoa para impedir cópias em massa.
// Perfis (hierárquicos): cancioneiro (só cânticos do Cancioneiro, sem acordes nem ficheiros) < coro (tudo, sem editar)
// < maestro (edita e promove cânticos ao Cancioneiro) < gestor (gere os utilizadores). A app indica o perfil ativo
// (pode ser inferior ao da pessoa); vale sempre o menor dos dois.
const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const RESEND = Deno.env.get('RESEND_API_KEY');
const ADMIN = 'tiago.mota@gmail.com';
const ORIGINS = ['https://tiagomota23.github.io', 'http://localhost:8765'];
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
// limites por pessoa: cânticos/ficheiros diferentes por hora e por dia; pesquisas e identificações por hora e por dia
const LIMITS = { song: [80, 250], file: [80, 250], search: [400, 2000], match: [120, 600], save: [60, 200] };
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
async function who(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
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
async function limit(user, kind, key) {
  const [perHour, perDay] = LIMITS[kind];
  const since = new Date(Date.now() - 864e5).toISOString();
  const rows = await rest(`access_log?select=key,at&user_id=eq.${user.id}&kind=eq.${kind}&at=gte.${since}&order=at.desc&limit=5000`);
  const hourAgo = Date.now() - 3600e3;
  if (DISTINCT.has(kind)) {
    if (rows.some(r => r.key === key)) return true; // já visto nas últimas 24 h: não conta de novo
    const day = new Set(rows.map(r => r.key)), hour = new Set(rows.filter(r => Date.parse(r.at) > hourAgo).map(r => r.key));
    if (hour.size >= perHour || day.size >= perDay) { await alert(user, kind, day.size); return false; }
  } else {
    const hour = rows.filter(r => Date.parse(r.at) > hourAgo).length;
    if (hour >= perHour || rows.length >= perDay) { await alert(user, kind, rows.length); return false; }
  }
  await rest('access_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: user.id, email: user.email, kind, key }) });
  return true;
}
async function alert(user, kind, n) {
  const since = new Date(Date.now() - 864e5).toISOString();
  const sent = await rest(`access_log?select=id&user_id=eq.${user.id}&kind=eq.alerta&at=gte.${since}&limit=1`);
  if (sent.length) return;
  await rest('access_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: user.id, email: user.email, kind: 'alerta', key: kind }) });
  const what = { song: 'cânticos abertos', file: 'ficheiros (gravações/partituras)', search: 'pesquisas na letra', match: 'identificações pelo som', save: 'edições de letra' }[kind] || kind;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e3e3e3;border-radius:12px;overflow:hidden"><div style="background:#1ab07f;color:#fff;padding:16px 22px;font-size:20px;letter-spacing:4px">CANCIONEIRO</div><div style="padding:22px;color:#333;font-size:15px;line-height:1.5"><h2 style="margin:0 0 14px;font-size:18px;color:#12966a">Limite de uso atingido</h2><p>A conta <b>${user.email}</b> atingiu o limite de <b>${what}</b> (${n} nas últimas 24 horas). O acesso a mais conteúdo foi travado temporariamente.</p><p style="color:#777;font-size:13px">Se não foi uso normal, pode bloquear a conta retirando o email da lista de autorizados.</p></div></div>`;
  await mailGestores(`Cancioneiro: limite de uso atingido (${user.email})`, html);
}

// ---------- letras em memória (recarregadas quando há alterações) ----------
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`´]/g, "'");
const stripChords = l => l.replace(/\[[^\]]*\]/g, '');
const tok = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 1);
let cache = null, cacheStamp = '', checkedAt = 0;
async function songs() {
  if (cache && Date.now() - checkedAt < 30e3) return cache;
  const [a] = await rest('songs?select=updated_at&order=updated_at.desc.nullslast&limit=1');
  const [b] = await rest('songs?select=edited_at&order=edited_at.desc.nullslast&limit=1');
  const [c] = await rest('songs?select=number&order=number.desc&limit=1');
  // cânticos promovidos / retirados do Cancioneiro (mudam o número de cânticos do Cancioneiro)
  const r = await fetch(`${SB}/rest/v1/songs?select=slug&cancioneiro=eq.true`, { method: 'HEAD', headers: { ...HDR, Prefer: 'count=exact', Range: '0-0' } });
  const nc = (r.headers.get('content-range') || '').split('/')[1];
  const stamp = `${a?.updated_at}|${b?.edited_at}|${c?.number}|${nc}`;
  checkedAt = Date.now();
  if (cache && stamp === cacheStamp) return cache;
  const list = await all('songs?select=slug,cancioneiro,lyrics,lyrics_edit,translation&order=number.asc');
  for (const s of list) {
    s.eff = s.lyrics_edit || s.lyrics || [];
    s.lines = s.eff.flatMap(st => st.lines.map(stripChords)).concat((s.translation || []).flatMap(st => st.lines));
    s.nl = s.lines.map(norm);
  }
  cache = { list, bySlug: new Map(list.map(s => [s.slug, s])), idx: null };
  cacheStamp = stamp;
  return cache;
}

// pesquisa na letra: frase exata numa linha, ou todos os termos na letra (só o trecho de uma linha é devolvido)
function searchLyrics(c, q, ok) {
  const nq = norm(q).trim(); if (nq.length < 3) return [];
  const terms = nq.split(/\s+/), out = [];
  for (const s of c.list) {
    if (!ok(s)) continue;
    let li = s.nl.findIndex(l => l.includes(nq)), score = 20;
    if (li < 0 && terms.every(t => s.nl.some(l => l.includes(t)))) { li = s.nl.findIndex(l => l.includes(terms[0])); score = 8; }
    if (li >= 0) out.push({ slug: s.slug, score, snip: s.lines[li] });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 60);
}

// identificação pelo som: janelas de 3 linhas, palavras e pares de palavras pesados por raridade (como na app)
function buildIndex(c) {
  const df = new Map(), items = [];
  for (const s of c.list) {
    const sources = [s.eff.flatMap(st => st.lines.map(stripChords)), (s.translation || []).flatMap(st => st.lines)];
    const wins = [], seen = new Set();
    for (const lines of sources) {
      const lt = lines.map(tok);
      lt.forEach(ws => ws.forEach(w => seen.add(w)));
      for (let i = 0; i < lines.length; i++) {
        const words = new Set(), bigrams = new Set();
        for (let k = i; k < Math.min(i + 3, lines.length); k++) {
          const ws = lt[k];
          ws.forEach((w, j) => { words.add(w); if (j) bigrams.add(ws[j - 1] + ' ' + w); });
          if (k > i && lt[k - 1].length && ws.length) bigrams.add(lt[k - 1][lt[k - 1].length - 1] + ' ' + ws[0]);
        }
        if (words.size) wins.push({ words, bigrams, line: lines[i] });
      }
    }
    seen.forEach(w => df.set(w, (df.get(w) || 0) + 1));
    items.push({ slug: s.slug, wins });
  }
  const N = c.list.length;
  c.idx = { items, idf: w => Math.log((N + 1) / (1 + (df.get(w) || 0))) };
}
function match(c, text, ok) {
  if (!c.idx) buildIndex(c);
  const { items, idf } = c.idx;
  const q = tok(text), qset = [...new Set(q)], qbi = new Set(q.slice(1).map((w, i) => q[i] + ' ' + w));
  const total = qset.reduce((a, w) => a + idf(w), 0) + [...qbi].reduce((a, b) => a + 0.75 * b.split(' ').reduce((x, w) => x + idf(w), 0), 0);
  if (!total) return [];
  const out = [];
  for (const { slug, wins } of items) {
    if (!ok(c.bySlug.get(slug))) continue;
    let best = 0, bestLine = null;
    for (const win of wins) {
      let sc = 0;
      for (const w of qset) if (win.words.has(w)) sc += idf(w);
      for (const b of qbi) if (win.bigrams.has(b)) sc += 0.75 * b.split(' ').reduce((x, w) => x + idf(w), 0);
      if (sc > best) { best = sc; bestLine = win.line; }
    }
    if (best) out.push({ slug, score: best / total, snip: bestLine });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8).filter((r, i) => i === 0 ? r.score > 0.12 : r.score > 0.2);
}

// ---------- ficheiros ----------
async function sign(path) {
  const r = await fetch(`${SB}/storage/v1/object/sign/coro/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: HDR, body: JSON.stringify({ expiresIn: 3600 }) });
  const d = await r.json();
  if (!r.ok || !d.signedURL) throw new Error('ficheiro indisponível');
  return `${SB}/storage/v1${d.signedURL}`;
}
const BOOKS = { 'livros/songbook.pdf': 'livros/songbook', 'livros/canti2024.pdf': 'livros/canti2024' };
const pageFile = (dir, n) => `${dir}/p${String(n).padStart(3, '0')}.pdf`;

const noChords = v => (v || []).map(st => ({ ...st, lines: st.lines.map(stripChords) }));
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);
const validLyrics = v => Array.isArray(v) && v.length <= 80 && v.every(st => st && (st.type === 'verse' || st.type === 'chorus') && Array.isArray(st.lines) && st.lines.length <= 80 && st.lines.every(l => typeof l === 'string' && l.length <= 300));

Deno.serve(async (req) => {
  const H = { ...cors(req), 'Content-Type': 'application/json' };
  const out = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  try {
    const user = await who(req);
    if (!user) return out({ error: 'sem acesso' }, 403);
    const b = await req.json().catch(() => ({}));
    const op = b.op;
    // perfil ativo escolhido na app (nunca acima do da pessoa)
    const lvl = ROLES.includes(b.perfil) ? Math.min(user.rank, rank(b.perfil)) : user.rank;
    // perfil Cancioneiro: cânticos do Cancioneiro e os de coleções ativas para o Cancioneiro
    let colSet = new Set();
    if (lvl < 2 && ['song', 'search', 'match'].includes(op)) {
      const rows = await rest(`collection_songs?select=song_slug,collections!inner(audience,expires_at)&collections.audience=eq.cancioneiro&collections.expires_at=gt.${new Date().toISOString()}`).catch(() => []);
      colSet = new Set(rows.map(r => r.song_slug));
    }
    const visible = s => !!s && (lvl >= 2 || s.cancioneiro || colSet.has(s.slug));
    const denied = () => out({ error: 'sem permissão para este perfil' }, 403);
    const tooMany = () => out({ error: 'limite', message: 'Atingiu o limite de uso por agora. Tente de novo mais tarde.' }, 429);

    if (op === 'song') {
      const slug = String(b.slug || '');
      const c = await songs(); const s = c.bySlug.get(slug);
      if (!visible(s)) return out({ error: 'não encontrado' }, 404);
      if (!(await limit(user, 'song', slug))) return tooMany();
      // o perfil Cancioneiro não vê acordes
      return out({ slug, lyrics: lvl >= 2 ? s.eff : noChords(s.eff), translation: s.translation || null, edited: !!s.lyrics_edit });
    }
    if (op === 'search') {
      const q = String(b.q || '').slice(0, 120);
      if (norm(q).trim().length < 3) return out({ hits: [] });
      if (!(await limit(user, 'search', q))) return tooMany();
      return out({ hits: searchLyrics(await songs(), q, visible) });
    }
    if (op === 'match') {
      const text = String(b.text || '').slice(0, 1000);
      if (!(await limit(user, 'match', null))) return tooMany();
      return out({ matches: match(await songs(), text, visible) });
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
    if (op === 'promote') { // Maestro: pôr ou tirar um cântico do Cancioneiro (os do site original ficam sempre)
      if (lvl < 3) return denied();
      const slug = String(b.slug || ''), on = !!b.on;
      const [s] = await rest(`songs?slug=eq.${encodeURIComponent(slug)}&select=slug,sources:song_sources(source)`);
      if (!s) return out({ error: 'não encontrado' }, 404);
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
      const files = await rest(`song_files?select=path&path=eq.${encodeURIComponent(raw)}&limit=1`);
      const songPdf = !files.length && /^partituras\/[a-z0-9_.\-]+\.pdf$/.test(path) ? await rest(`songs?select=slug&pdf_url=eq.${encodeURIComponent(path)}&limit=1`) : [];
      if (!files.length && !songPdf.length) return out({ error: 'ficheiro desconhecido' }, 404);
      if (BOOKS[path]) {
        const p = +(frag.match(/(?:^|&)p=(\d+)/) || [])[1] || 1;
        const crop = (frag.match(/(?:^|&)c=([^&]+)/) || [])[1];
        const pages = crop ? [...new Set(crop.split('|').map(r => +r.split(':')[0]))] : [p, p + 1];
        const res = [];
        for (const n of pages) {
          if (!(await limit(user, 'file', `${path}#${n}`))) return tooMany();
          res.push({ n, url: await sign(pageFile(BOOKS[path], n)).catch(() => null) });
        }
        return out({ pages: res.filter(x => x.url) });
      }
      if (!(await limit(user, 'file', path))) return tooMany();
      return out({ url: await sign(path) });
    }
    return out({ error: 'operação desconhecida' }, 400);
  } catch (e) {
    return out({ error: String(e.message || e) }, 500);
  }
});
