// Cópia de segurança semanal (GitHub Action «Cópia de segurança»): dá à Action os dados, o esquema, endereços temporários
// dos ficheiros e um acesso temporário ao Google Drive de destino (outra conta, autorizada em drive-auth?para=copia; nunca
// o Drive do Coro, que só é lido).
// Sem segredos partilhados: a Action identifica-se com o token OIDC do GitHub, que só é aceite se vier do repositório
// tiagomota23/cancioneiro, ramo main, workflow backup.yml.
const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CID = Deno.env.get('GOOGLE_CLIENT_ID'); const CSECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
const ISS = 'https://token.actions.githubusercontent.com';
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
  return claims.iss === ISS && claims.aud === 'cancioneiro-backup' && claims.exp > now && claims.nbf <= now + 60 &&
    claims.repository === 'tiagomota23/cancioneiro' && claims.ref === 'refs/heads/main' &&
    String(claims.workflow_ref || '').startsWith('tiagomota23/cancioneiro/.github/workflows/backup.yml@');
}
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function all(path) { const out = []; for (let i = 0; ; i += 1000) { const p = await rest(path, { headers: { Range: `${i}-${i + 999}` } }); out.push(...p); if (p.length < 1000) return out; } }

Deno.serve(async req => {
  try {
    if (!(await githubOk(req).catch(() => false))) return json({ error: 'não autorizado' }, 401);
    const op = new URL(req.url).searchParams.get('op');
    if (op === 'schema') return json({ sql: await rest('rpc/backup_schema', { method: 'POST', body: '{}' }) });
    if (op === 'objects') return json({ objects: await rest('rpc/backup_objects', { method: 'POST', body: '{}', headers: { Range: '0-99999' } }) });
    if (op === 'data') {
      // tudo o que é preciso para reconstruir (sem registos de acesso, pedidos, convites nem estado do Drive, que são transitórios ou secretos)
      const T = ['songs?order=number', 'song_sources', 'song_tags', 'song_files?order=id', 'collections', 'collection_songs', 'collection_sections',
        'collection_templates', 'allowed_emails?order=email', 'drive_folders', 'favorites', 'song_edits?order=id', 'sync_log?order=id', 'drive_sync_log?order=id'];
      const out = {};
      for (const t of T) out[t.split('?')[0]] = await all(t.includes('?') ? t.replace('?', '?select=*&') : t + '?select=*');
      return json(out);
    }
    if (op === 'sign' && req.method === 'POST') { // endereços de 2 horas para descarregar ficheiros do bucket coro
      const { paths } = await req.json();
      if (!Array.isArray(paths) || paths.length > 500) return json({ error: 'paths' }, 400);
      const r = await fetch(`${SB}/storage/v1/object/sign/coro`, { method: 'POST', headers: HDR, body: JSON.stringify({ expiresIn: 7200, paths }) });
      const d = await r.json();
      if (!r.ok) return json({ error: 'sign ' + r.status }, 500);
      return json({ urls: d.map(x => ({ path: x.path, url: x.signedURL ? SB + '/storage/v1' + x.signedURL : null, error: x.error || null })) });
    }
    if (op === 'google') { // acesso de 1 hora ao Drive de DESTINO da cópia (outra conta; só os ficheiros criados pela app, drive.file)
      const [g] = await rest('drive_state?key=eq.backup_google&select=value');
      if (!g?.value?.refresh_token) return json({ error: 'Destino da cópia não ligado (autorização em /functions/v1/drive-auth?para=copia)' }, 409);
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CID, client_secret: CSECRET, refresh_token: g.value.refresh_token, grant_type: 'refresh_token' }) });
      const t = await r.json();
      if (!r.ok) return json({ error: 'Google recusou (' + (t.error || r.status) + '): é preciso autorizar de novo em /functions/v1/drive-auth?para=copia' }, 409);
      return json({ access_token: t.access_token, expires_in: t.expires_in, scope: t.scope });
    }
    return json({ error: 'op' }, 400);
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
});
