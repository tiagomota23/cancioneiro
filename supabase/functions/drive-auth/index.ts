const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const CID = Deno.env.get('GOOGLE_CLIENT_ID'); const CSECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const ADMIN = 'tiago.mota@gmail.com'; const SELF = `${SB}/functions/v1/drive-auth`;
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
const page = (title, msg) => Response.redirect(`https://tiagomota23.github.io/cancioneiro/drive.html?t=${encodeURIComponent(title)}&m=${encodeURIComponent(msg)}`, 302); // as funções do Supabase não servem HTML
async function setState(key, value) { const r = await fetch(`${SB}/rest/v1/drive_state?on_conflict=key`, { method: 'POST', headers: { ...HDR, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) }); if (!r.ok) throw new Error('drive_state ' + r.status); }
async function getState(key) { const r = await fetch(`${SB}/rest/v1/drive_state?key=eq.${key}&select=value`, { headers: HDR }); const d = await r.json(); return d[0] ? d[0].value : null; }
Deno.serve(async (req) => {
  try {
    if (!CID || !CSECRET) return page('Configuração em falta', 'Faltam os segredos GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no Supabase.');
    const u = new URL(req.url); const code = u.searchParams.get('code'); const err = u.searchParams.get('error');
    if (err) return page('Ligação cancelada', 'A autorização não foi dada. Pode tentar de novo quando quiser.');
    if (!code) {
      const state = crypto.randomUUID();
      await setState('oauth_state', { state, at: Date.now() });
      const q = new URLSearchParams({ client_id: CID, redirect_uri: SELF, response_type: 'code', scope: 'openid email https://www.googleapis.com/auth/drive.readonly', access_type: 'offline', prompt: 'consent', login_hint: ADMIN, state });
      return Response.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + q, 302);
    }
    const st = await getState('oauth_state');
    if (!st || st.state !== u.searchParams.get('state') || Date.now() - st.at > 15 * 60e3) return page('Link expirado', 'Abra de novo o link de ligação ao Drive.');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: CID, client_secret: CSECRET, redirect_uri: SELF, grant_type: 'authorization_code' }) });
    const t = await r.json();
    if (!r.ok || !t.refresh_token) return page('Não foi possível ligar', 'O Google não devolveu autorização (' + (t.error || r.status) + ').');
    const email = JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email;
    if (email !== ADMIN) return page('Conta errada', 'Entre com a conta ' + ADMIN + '.');
    await setState('google', { refresh_token: t.refresh_token, email, at: new Date().toISOString() });
    await setState('oauth_state', null);
    return page('Drive ligado ✓', 'A verificação semanal da pasta do Coro CLU já pode ler o Drive (só leitura). Pode fechar esta página.');
  } catch (e) { return page('Erro', String(e.message || e)); }
});
