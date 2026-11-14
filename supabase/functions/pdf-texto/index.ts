// Texto das partituras e das páginas dos livros: a GitHub Action «Texto dos PDF» pede a lista do que falta (op=list),
// extrai o texto (camada de texto do PDF, ou OCR) e devolve-o (op=save). O texto fica em song_texts (só o servidor lê).
// Sem segredos partilhados: a Action identifica-se com o token OIDC do GitHub, que só é aceite se vier do repositório
// tiagomota23/cancioneiro, ramo main, workflow texto-pdf.yml.
const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const HDR = { apikey: SK, Authorization: `Bearer ${SK}` };
const ISS = 'https://token.actions.githubusercontent.com';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
// livros: o PDF inteiro não se descarrega; cada página está num ficheiro (livros/<livro>/pNNN.pdf)
const BOOKS = { 'livros/songbook.pdf': 'livros/songbook', 'livros/canti2024.pdf': 'livros/canti2024' };
const pageFile = (dir, n) => `${dir}/p${String(n).padStart(3, '0')}.pdf`;

const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
let jwks = null, jwksAt = 0;
async function githubOk(req) {
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const [h, p, s] = tok.split('.');
  if (!s) return false;
  const head = JSON.parse(new TextDecoder().decode(b64u(h))), claims = JSON.parse(new TextDecoder().decode(b64u(p)));
  if (head.alg !== 'RS256') return false;
  if (!jwks || Date.now() - jwksAt > 3600e3) { jwks = (await (await fetch(`${ISS}/.well-known/jwks`)).json()).keys; jwksAt = Date.now(); }
  const jwk = jwks.find(k => k.kid === head.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(`${h}.${p}`)))) return false;
  const now = Date.now() / 1000;
  return claims.iss === ISS && claims.aud === 'cancioneiro-pdf' && claims.exp > now && claims.nbf <= now + 60 &&
    claims.repository === 'tiagomota23/cancioneiro' && claims.ref === 'refs/heads/main' &&
    String(claims.workflow_ref || '').startsWith('tiagomota23/cancioneiro/.github/workflows/texto-pdf.yml@');
}
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function all(path) { const out = []; for (let i = 0; ; i += 1000) { const p = await rest(path, { headers: { Range: `${i}-${i + 999}` } }); out.push(...p); if (p.length < 1000) return out; } }
// endereços de download (1 hora), vários de uma vez
async function signMany(paths) {
  const out = new Map();
  for (let i = 0; i < paths.length; i += 200) {
    const r = await fetch(`${SB}/storage/v1/object/sign/coro`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600, paths: paths.slice(i, i + 200) }) });
    if (!r.ok) throw new Error('sign ' + r.status);
    for (const x of await r.json()) if (x.signedURL) out.set(x.path, SB + '/storage/v1' + x.signedURL);
  }
  return out;
}
// livros/x.pdf#p=12&c=12:0.0,0.1,0.5,0.9|13:…  →  [{ file, page, box }]
function cropParts(path) {
  const [base, frag = ''] = path.split('#'), dir = BOOKS[base];
  if (!dir) return null;
  const c = (frag.match(/(?:^|&)c=([^&]+)/) || [])[1], p = +(frag.match(/(?:^|&)p=(\d+)/) || [])[1] || 1;
  if (!c) return [{ file: pageFile(dir, p), page: p, box: [0, 0, 1, 1] }];
  return c.split('|').map(r => { const [n, b] = r.split(':'); return { file: pageFile(dir, +n), page: +n, box: b.split(',').map(Number) }; });
}

Deno.serve(async req => {
  try {
    if (!(await githubOk(req).catch(() => false))) return json({ error: 'não autorizado' }, 401);
    const u = new URL(req.url), op = u.searchParams.get('op');
    if (op === 'list') {
      const n = Math.min(500, Math.max(1, +u.searchParams.get('n') || 200));
      const files = await all('song_files?select=song_slug,path,mime&kind=eq.score&order=id.asc');
      const done = new Set((await all('song_texts?select=file_key')).map(x => x.file_key));
      // ficheiros que já não existem: o texto sai também
      const paths = new Set(files.map(f => f.path));
      const gone = [...done].filter(k => !paths.has(k));
      for (const k of gone) await rest(`song_texts?file_key=eq.${encodeURIComponent(k)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      // primeiro as páginas dos livros (muitos destes cânticos só têm a letra no livro), depois as partituras
      const todo = files.filter(f => !done.has(f.path) && !/^https?:/.test(f.path))
        .sort((a, b) => (BOOKS[b.path.split('#')[0]] ? 1 : 0) - (BOOKS[a.path.split('#')[0]] ? 1 : 0)).slice(0, n);
      const items = todo.map(f => { const parts = cropParts(f.path); return parts ? { key: f.path, slug: f.song_slug, kind: 'crop', parts } : { key: f.path, slug: f.song_slug, kind: 'file', mime: f.mime, file: f.path }; });
      const urls = await signMany([...new Set(items.flatMap(it => it.kind === 'crop' ? it.parts.map(p => p.file) : [it.file]))]);
      for (const it of items) { if (it.kind === 'crop') it.parts.forEach(p => { p.url = urls.get(p.file) || null; }); else it.url = urls.get(it.file) || null; }
      return json({ items, pending: files.filter(f => !done.has(f.path)).length, removed: gone.length });
    }
    // localizar cânticos nas páginas dos livros (para corrigir recortes errados): para cada slug, os recortes atuais,
    // as páginas à volta (p−1 … p+1, com endereços) e só a lista das palavras da letra (4+ letras, sem ordem)
    if (op === 'locate' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const slugs = (Array.isArray(b.slugs) ? b.slugs : []).map(String).filter(x => /^[a-z0-9_]+$/.test(x)).slice(0, 60);
      if (!slugs.length) return json({ items: [] });
      const files = await rest(`song_files?select=song_slug,path&kind=eq.score&song_slug=in.(${slugs.join(',')})&path=like.livros/*`);
      const songs = await rest(`songs?select=slug,title,lyrics,lyrics_edit&slug=in.(${slugs.join(',')})`);
      const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const wordsOf = s => [...new Set((norm((s.lyrics_edit || s.lyrics || []).flatMap(st => st.lines).join(' ').replace(/\[[^\]]*\]/g, '')).match(/[a-z]{4,}/g) || []))];
      const items = files.map(f => {
        const parts = cropParts(f.path), s = songs.find(x => x.slug === f.song_slug);
        const dir = BOOKS[f.path.split('#')[0]];
        const nums = [...new Set(parts.flatMap(p => [p.page - 1, p.page, p.page + 1]).filter(n => n >= 1))];
        return { slug: f.song_slug, key: f.path, parts, title: s?.title || '', words: s ? wordsOf(s) : [], pages: nums.map(n => ({ page: n, file: pageFile(dir, n) })) };
      });
      const urls = await signMany([...new Set(items.flatMap(it => it.pages.map(p => p.file)))]);
      for (const it of items) it.pages = it.pages.filter(p => urls.has(p.file)).map(p => ({ ...p, url: urls.get(p.file) }));
      return json({ items });
    }
    if (op === 'save' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const key = String(b.key || ''), method = String(b.method || ''), text = String(b.text || '').slice(0, 30000);
      if (!['text', 'ocr', 'none'].includes(method)) return json({ error: 'método inválido' }, 400);
      const [f] = await rest(`song_files?select=song_slug&kind=eq.score&path=eq.${encodeURIComponent(key)}`);
      if (!f) return json({ error: 'ficheiro não encontrado' }, 404);
      await rest('song_texts?on_conflict=file_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ file_key: key, song_slug: f.song_slug, text, method, chars: text.length, extracted_at: new Date().toISOString() }) });
      return json({ ok: true });
    }
    return json({ error: 'op' }, 400);
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
});
