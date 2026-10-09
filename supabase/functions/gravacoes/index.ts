// Gravações em formatos que nem todos os telemóveis tocam (ogg, webm, wav…): a GitHub Action «Converter gravações»
// pede a lista (op=list), converte com ffmpeg para AAC (.m4a) e devolve o ficheiro (op=replace).
// Sem segredos partilhados: a Action identifica-se com o token OIDC do GitHub (assinado pelo GitHub), que só é aceite
// se vier do repositório tiagomota23/cancioneiro, ramo main, workflow converter-gravacoes.yml.
const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const HDR = { apikey: SK, Authorization: `Bearer ${SK}` };
const ISS = 'https://token.actions.githubusercontent.com';
const OK = ['audio/mpeg', 'audio/mp4', 'audio/aac'];
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

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
  return claims.iss === ISS && claims.aud === 'cancioneiro-gravacoes' && claims.exp > now && claims.nbf <= now + 60 &&
    claims.repository === 'tiagomota23/cancioneiro' && claims.ref === 'refs/heads/main' &&
    String(claims.workflow_ref || '').startsWith('tiagomota23/cancioneiro/.github/workflows/converter-gravacoes.yml@');
}
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

Deno.serve(async req => {
  try {
    if (!(await githubOk(req).catch(() => false))) return json({ error: 'não autorizado' }, 401);
    const u = new URL(req.url), op = u.searchParams.get('op');
    if (op === 'list') {
      const rows = await rest(`song_files?select=id,song_slug,label,path,mime&kind=eq.recording&mime=not.in.(${OK.join(',')})`);
      for (const f of rows) {
        const r = await fetch(`${SB}/storage/v1/object/sign/coro/${f.path}`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }) });
        f.url = r.ok ? SB + '/storage/v1' + (await r.json()).signedURL : null;
      }
      return json({ files: rows });
    }
    if (op === 'replace' && req.method === 'POST') {
      const id = +u.searchParams.get('id');
      const [f] = await rest(`song_files?select=id,path,mime&id=eq.${id}&kind=eq.recording`);
      if (!f || OK.includes(f.mime)) return json({ error: 'gravação não encontrada ou já convertida' }, 404);
      const body = new Uint8Array(await req.arrayBuffer());
      // tem de ser mesmo um MP4/M4A (caixa «ftyp» no início)
      if (body.length < 12 || new TextDecoder().decode(body.slice(4, 8)) !== 'ftyp' || body.length > 50e6) return json({ error: 'ficheiro inválido' }, 400);
      const novo = f.path.replace(/\.[^./]+$/, '') + '.m4a';
      const up = await fetch(`${SB}/storage/v1/object/coro/${novo}`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'audio/mp4', 'x-upsert': 'true' }, body });
      if (!up.ok) return json({ error: 'upload ' + up.status }, 500);
      await rest(`song_files?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ path: novo, mime: 'audio/mp4', size: body.length }) });
      if (novo !== f.path) await fetch(`${SB}/storage/v1/object/coro`, { method: 'DELETE', headers: { ...HDR, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [f.path] }) });
      return json({ ok: true, path: novo });
    }
    return json({ error: 'op' }, 400);
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
});
