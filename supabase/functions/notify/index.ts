const SB = Deno.env.get('SUPABASE_URL');
const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RESEND = Deno.env.get('RESEND_API_KEY');
const GROQ = Deno.env.get('GROQ_API_KEY');
const ADMIN = 'tiago.mota@gmail.com';
const APP = 'https://tiagomota23.github.io/cancioneiro/';
const SOURCE = 'https://cancioneiro.marriaga.com/index.html';
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const btn = (href, label, color) => `<a href="${href}" style="display:inline-block;padding:12px 24px;margin:6px 10px 6px 0;border-radius:22px;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px">${label}</a>`;
const wrap = (title, body) => `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e3e3e3;border-radius:12px;overflow:hidden"><div style="background:#1ab07f;color:#ffffff;padding:16px 22px;font-size:20px;letter-spacing:4px">CANCIONEIRO</div><div style="padding:22px;color:#333333;font-size:15px;line-height:1.5"><h2 style="margin:0 0 14px;font-size:18px;color:#12966a">${title}</h2>${body}</div></div>`;
const list = items => `<ul style="padding-left:20px;margin:8px 0">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
const when = d => new Date(d).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
// Os emails vão para todos os Gestores (perfil "gestor" em allowed_emails)
async function sendEmail(subject, html) {
  if (!RESEND) throw new Error('RESEND_API_KEY em falta');
  const send = to => fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Cancioneiro <onboarding@resend.dev>', to, subject, html }) });
  const to = (await rest('allowed_emails?select=email&role=eq.gestor').catch(() => [])).map(x => x.email);
  let r = await send(to.length ? to : [ADMIN]);
  // o remetente de teste do Resend só entrega ao dono da conta: se recusar a lista, envia só para o administrador
  if (!r.ok && !(to.length === 1 && to[0] === ADMIN)) r = await send([ADMIN]);
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
}

async function onAccess(id, force = false) {
  // espera um pouco: se a pessoa veio por um convite, a app junta-o ao pedido logo a seguir a entrar
  if (!force) await new Promise(r => setTimeout(r, 12000));
  const [req] = await rest(`access_requests?id=eq.${id}&select=*`);
  if (!req || (req.notified_at && !force) || req.status !== 'pendente') return { skipped: true };
  const perfis = req.invited_role ? [...PERFIS.filter(([r]) => r === req.invited_role), ...PERFIS.filter(([r]) => r !== req.invited_role)] : PERFIS;
  const label = r => (PERFIS.find(([x]) => x === r) || [, r])[1];
  const link = (a, r = '') => `${APP}admin.html?id=${req.id}&t=${req.token}&a=${a}${r ? '&r=' + r : ''}`;
  const body = `<p>Alguém sem autorização tentou entrar no Cancioneiro:</p>
    <div style="border:1px solid #d8e9e1;background:#f3faf7;border-radius:10px;padding:14px 16px;margin:12px 0">
      <div><b>${esc(req.name || '(sem nome)')}</b></div><div>${esc(req.email)}</div>
      <div style="color:#777;font-size:13px;margin-top:4px">${esc(when(req.created_at))}</div>
      ${req.invited_by ? `<div style="margin-top:10px;padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #d8e9e1">Convidado por <b>${esc(req.invited_by)}</b> para o perfil <b>${esc(label(req.invited_role))}</b></div>` : ''}
      <div style="margin-top:12px;font-size:13px;color:#555">Autorizar com o perfil:</div>
      <div>${perfis.map(([r, l]) => btn(link('autorizar', r), l + (r === req.invited_role ? ' (convite)' : ''), '#12966a')).join('')}</div>
      <div>${btn(link('bloquear'), 'Bloquear', '#c0392b')}</div>
    </div><p style="color:#777;font-size:13px">Cada botão abre uma página de confirmação.  Enquanto não decidir, esta pessoa não vê os cânticos.</p>`;
  await sendEmail(`Pedido de acesso: ${req.name || req.email}${req.invited_by ? ' (convite)' : ''}`, wrap('Pedido de acesso', body));
  await rest(`access_requests?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
  return { sent: true };
}

async function onSync(id) {
  const [log] = await rest(`sync_log?id=eq.${id}&select=*`);
  if (!log || log.notified_at) return { skipped: true };
  const added = log.added || [], updated = log.updated || [];
  if (!log.error && !added.length && !updated.length) return { nothing: true };
  let subject, body;
  if (log.error) {
    subject = 'Site original do cancioneiro indisponível';
    body = `<p>A verificação semanal de ${when(log.run_at)} não conseguiu ler o site original:</p><p style="color:#c0392b">${esc(log.error)}</p><p>Nada foi alterado no Cancioneiro. A verificação volta a tentar na próxima semana.</p><p><a href="${SOURCE}">${SOURCE}</a></p>`;
  } else {
    subject = `Cancioneiro atualizado: ${added.length} novo(s), ${updated.length} alterado(s)`;
    body = `<p>A verificação semanal de ${when(log.run_at)} encontrou alterações no site original, que já foram aplicadas:</p>` +
      (added.length ? `<p><b>Cânticos novos (${added.length})</b></p>${list(added)}` : '') +
      (updated.length ? `<p><b>Cânticos alterados (${updated.length})</b></p>${list(updated)}` : '') +
      `<p>${btn(APP, 'Abrir o Cancioneiro', '#12966a')}</p>`;
  }
  await sendEmail(subject, wrap(log.error ? 'Site original indisponível' : 'Alterações no site original', body));
  await rest(`sync_log?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
  return { sent: true };
}

const PERFIS = [['cancioneiro', '○ Cancioneiro'], ['coro', 'Ⓒ Coro'], ['maestro', 'Ⓜ Maestro'], ['gestor', '● Gestor']];
// convite: a app (já com a sessão da pessoa) junta o convite ao seu pedido de acesso pendente
async function onClaim(req0, invite) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(invite || '')) return json({ error: 'convite inválido' }, 400);
  const u = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SK, Authorization: req0.headers.get('authorization') || '' } });
  if (!u.ok) return json({ error: 'sem sessão' }, 401);
  const email = String((await u.json()).email || '').toLowerCase();
  if (!email) return json({ error: 'sem sessão' }, 401);
  const [inv] = await rest(`invites?token=eq.${invite}&expires_at=gt.${new Date().toISOString()}&select=role,invited_by,inviter_name`);
  if (!inv) return json({ error: 'convite expirado' }, 410);
  const [ar] = await rest(`access_requests?email=eq.${encodeURIComponent(email)}&status=eq.pendente&select=id,notified_at,invited_by&order=created_at.desc&limit=1`);
  if (!ar) return json({ ok: false });
  const by = inv.inviter_name ? `${inv.inviter_name} (${inv.invited_by})` : inv.invited_by;
  if (!ar.invited_by) {
    await rest(`access_requests?id=eq.${ar.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ invited_by: by, invited_role: inv.role }) });
    if (ar.notified_at) await onAccess(ar.id, true); // o email já tinha seguido sem o convite: segue outro, com ele
  }
  return json({ ok: true, inviter: inv.inviter_name || inv.invited_by, role: inv.role });
}
async function onPeekOrDecide(id, token, action, decide, role) {
  if (!/^[0-9a-f-]{36}$/.test(id || '') || !/^[0-9a-f-]{36}$/.test(token || '')) return json({ error: 'link inválido' }, 400);
  const [req] = await rest(`access_requests?id=eq.${id}&select=*`);
  if (!req || req.token !== token) return json({ error: 'link inválido' }, 403);
  // Os links do email só valem 30 dias
  if (Date.now() - Date.parse(req.created_at) > 30 * 86400000) return json({ error: 'link expirado (mais de 30 dias) — gira o acesso no Supabase' }, 410);
  const info = { email: req.email, name: req.name, status: req.status, invited_by: req.invited_by || null, invited_role: req.invited_role || null };
  if (!decide || req.status !== 'pendente') return json(info);
  if (action === 'autorizar') {
    if (!PERFIS.some(([r]) => r === role)) role = 'cancioneiro';
    await rest('allowed_emails', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ email: req.email, name: req.name || null, role, added_by: 'link do email' }) });
    info.role = role;
    info.status = 'autorizado';
  } else if (action === 'bloquear') {
    if (req.user_id) await fetch(`${SB}/auth/v1/admin/users/${req.user_id}`, { method: 'PUT', headers: HDR, body: JSON.stringify({ ban_duration: '876000h' }) });
    info.status = 'bloqueado';
  } else return json({ error: 'ação inválida' }, 400);
  await rest(`access_requests?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: info.status, decided_at: new Date().toISOString() }) });
  return json(info);
}

async function onHealth() {
  const [last] = await rest('health_log?select=run_at&order=run_at.desc&limit=1');
  if (last && Date.now() - new Date(last.run_at).getTime() < 3600e3) return { skipped: true };
  const problems = [];
  const check = async (name, fn) => { try { const r = await fn(); if (r !== true) problems.push(`${name}: ${r}`); } catch (e) { problems.push(`${name}: ${e.message || e}`); } };
  await check('Site do Cancioneiro', async () => { const r = await fetch(APP); const t = await r.text(); return r.ok && t.includes('CANCIONEIRO') ? true : 'HTTP ' + r.status; });
  await check('Código da app', async () => { const r = await fetch(APP + 'app.js'); const t = await r.text(); return r.ok && t.includes('APP_VERSION') ? true : 'HTTP ' + r.status; });
  await check('Base de dados (cânticos)', async () => { const r = await fetch(`${SB}/rest/v1/songs?select=slug`, { method: 'HEAD', headers: { ...HDR, Prefer: 'count=exact', Range: '0-0' } }); const n = Number((r.headers.get('content-range') || '/0').split('/')[1]); return n >= 400 ? true : `só ${n} cânticos`; });
  await check('Entrada com Google', async () => { const r = await fetch(`${SB}/auth/v1/settings`, { headers: { apikey: SK } }); const d = await r.json(); return d?.external?.google ? true : 'desativada'; });
  await check('Função de transcrição', async () => { const r = await fetch(`${SB}/functions/v1/transcribe`, { method: 'POST', headers: { apikey: SK, 'Content-Type': 'audio/wav' }, body: new Uint8Array(2000) }); return r.status === 403 ? true : 'resposta inesperada ' + r.status; });
  await check('Chave Groq (transcrição)', async () => { if (!GROQ) return 'em falta'; const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${GROQ}` } }); return r.ok ? true : 'HTTP ' + r.status; });
  await check('Verificação semanal do site original', async () => { const [l] = await rest('sync_log?select=run_at,error&order=run_at.desc&limit=1'); if (!l) return 'nunca executada'; if (Date.now() - new Date(l.run_at).getTime() > 8 * 864e5) return 'última execução em ' + when(l.run_at); return true; });
  await rest('health_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ok: !problems.length, problems }) });
  if (problems.length) await sendEmail('Atenção: problema no Cancioneiro', wrap('Verificação semanal: problemas', `<p>A verificação semanal encontrou ${problems.length} problema(s):</p>${list(problems)}<p>${btn(APP, 'Abrir o Cancioneiro', '#12966a')}</p>`));
  return { ok: !problems.length, problems };
}


// Só corre a pedido do agendamento (pg_cron), que primeiro deixa um pedido em job_requests (que ninguém de fora consegue escrever).
// O pedido é gasto aqui: um pedido = uma execução.
async function claimJob(job) {
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const r = await rest(`job_requests?job=eq.${job}&requested_at=gte.${since}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  return Array.isArray(r) && r.length > 0;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let b = {};
  try { b = await req.json(); } catch (e) { /* sem corpo */ }
  try {
    // identificadores vêm de fora (chave pública): só UUID (pedidos) ou número (verificações), nunca texto livre na consulta
    if ((b.type === 'access' && !/^[0-9a-f-]{36}$/.test(String(b.id || ''))) || (b.type === 'sync' && !/^\d{1,12}$/.test(String(b.id ?? '')))) return json({ error: 'id inválido' }, 400);
    if (b.type === 'access') { // corre em segundo plano (espera ~12 s pelo convite) e responde já a quem chamou
      const job = onAccess(b.id).catch(e => console.error('access', e));
      // @ts-ignore EdgeRuntime existe nas funções do Supabase
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) { EdgeRuntime.waitUntil(job); return json({ queued: true }); }
      return json(await job);
    }
    if (b.type === 'claim') return await onClaim(req, b.invite);
    if (b.type === 'sync') return json(await onSync(b.id));
    if (b.type === 'health') return (await claimJob('health').catch(() => false)) ? json(await onHealth()) : json({ error: 'sem pedido do agendamento' }, 403);
    if (b.type === 'peek') return await onPeekOrDecide(b.id, b.token, null, false);
    if (b.type === 'decide') return await onPeekOrDecide(b.id, b.token, b.action, true, b.role);
    return json({ error: 'tipo desconhecido' }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
});
