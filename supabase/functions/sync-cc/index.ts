// Supabase Edge Function: atualização semanal do livro «Coros & Companhia» (lista pública do grupo, folha Google).
// Cânticos já ligados (song_sources coros_companhia, ref = título na lista): acrescenta momentos e gravações novas.
// Títulos novos na lista: só são comunicados por email (a webapp verifica se já existem com outro nome antes de criar).
// Nada se apaga: um cântico que sai da lista fica no Cancioneiro (só é comunicado).
const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const RESEND = Deno.env.get('RESEND_API_KEY');
const ADMIN = 'tiago.mota@gmail.com'; const APP = 'https://tiagomota23.github.io/cancioneiro/';
const CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_pklspjEWCUk5WRjOPmJyEU7HVxyHbxi2usKVpWOqIU_nLP9XUW8NlqUiKP40FrhbRryPYOEuJ9tM/pub?gid=1678047759&single=true&output=csv';
const SITE = 'https://listacorosecompanhia.netlify.app/';
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const list = items => `<ul style="padding-left:20px;margin:8px 0">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
const wrap = (title, body) => `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e3e3e3;border-radius:12px;overflow:hidden"><div style="background:#1ab07f;color:#ffffff;padding:16px 22px;font-size:20px;letter-spacing:4px">CANCIONEIRO</div><div style="padding:22px;color:#333333;font-size:15px;line-height:1.5"><h2 style="margin:0 0 14px;font-size:18px;color:#12966a">${title}</h2>${body}</div></div>`;
async function sendEmail(subject, html) {
  if (!RESEND) return;
  await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Cancioneiro <onboarding@resend.dev>', to: [ADMIN], subject, html }) });
}
// CSV simples (campos entre aspas com vírgulas e aspas duplicadas)
function parseCsv(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.replace(/^﻿/, '').trim());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
const kindOf = u => /youtu/.test(u) ? 'YouTube' : /drive\.google/.test(u) ? 'Drive' : /spotify/.test(u) ? 'Spotify' : 'Ligação';
// mesmos pares da lista que são o mesmo cântico (escritos de duas maneiras)
const ALIAS = { 'Agora é hora': 'Agora é Hora', 'Vim aqui (Imagem)': 'Imagem (Vim aqui, ó Virgem mãe)', 'Senhor vela por mim': 'Senhor, vela por mim', 'Não dormirá Aquele que Te guarda': 'Não dormirá Aquele que te guarda' };

async function claimJob(job) {
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const r = await rest(`job_requests?job=eq.${job}&requested_at=gte.${since}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  return Array.isArray(r) && r.length > 0;
}
Deno.serve(async () => {
  if (!(await claimJob('sync-cc').catch(() => false))) return json({ error: 'sem pedido do agendamento' }, 403);
  const sum = { newTitles: [], gone: [], moments: [], links: [], rows: 0 };
  let error = null;
  try {
    const r = await fetch(CSV, { redirect: 'follow' });
    if (!r.ok) throw new Error('lista HTTP ' + r.status);
    const rows = parseCsv(await r.text()).filter(x => x.Musica && x.Momento).map(x => ({ ...x, Musica: ALIAS[x.Musica] || x.Musica }));
    if (rows.length < 20) throw new Error(`lista com só ${rows.length} linhas (mudou o formato?)`);
    sum.rows = rows.length;
    const linked = new Map((await rest('song_sources?source=eq.coros_companhia&select=song_slug,ref')).map(x => [x.ref, x.song_slug]));
    const tags = new Set((await rest(`song_tags?grp=eq.${encodeURIComponent('Coros & Companhia')}&select=song_slug,tag`)).map(x => x.song_slug + '|' + x.tag));
    const paths = new Set((await rest('song_files?kind=eq.other&select=path')).map(x => x.path));
    const seen = new Set();
    for (const x of rows) {
      seen.add(x.Musica);
      const slug = linked.get(x.Musica);
      if (!slug) { if (!sum.newTitles.includes(x.Musica)) sum.newTitles.push(x.Musica); continue; }
      if (!tags.has(slug + '|' + x.Momento)) {
        await rest('song_tags?on_conflict=song_slug,grp,tag', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify([{ song_slug: slug, grp: 'Coros & Companhia', tag: x.Momento }]) });
        tags.add(slug + '|' + x.Momento); sum.moments.push(`${x.Musica} — ${x.Momento}`);
      }
      const u = x.Link;
      if (/^https:\/\//.test(u) && !paths.has(u)) {
        await rest('song_files?on_conflict=path', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify([{ song_slug: slug, kind: 'other', label: `${kindOf(u)} · Coros & Companhia`, path: u, mime: 'text/html', sort: 50 }]) });
        paths.add(u); sum.links.push(`${x.Musica} (${kindOf(u)})`);
      }
    }
    for (const [ref] of linked) if (!seen.has(ref)) sum.gone.push(ref);
  } catch (e) { error = String(e.message || e); }
  await rest('cc_sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ summary: sum, error }) }).catch(() => {});
  const any = sum.newTitles.length + sum.gone.length + sum.moments.length + sum.links.length;
  if (error) await sendEmail('Cancioneiro: atualização de «Coros & Companhia» falhou', wrap('Atualização de «Coros & Companhia» falhou', `<p>${esc(error)}</p><p><a href="${SITE}">Ver a lista</a></p>`));
  else if (any) {
    const sec = (t, a) => a.length ? `<p><b>${t} (${a.length})</b></p>${list(a)}` : '';
    await sendEmail(`Cancioneiro: novidades em «Coros & Companhia» (${any})`, wrap('Novidades em «Coros & Companhia»', `<p>A verificação semanal da lista do grupo encontrou:</p>` +
      sec('Cânticos novos na lista — para rever (ver se já existem com outro nome; se não, criar)', sum.newTitles) +
      sec('Momentos acrescentados', sum.moments) + sec('Gravações acrescentadas (por ligação)', sum.links) +
      sec('Saíram da lista (mantidos no Cancioneiro)', sum.gone) + `<p><a href="${SITE}">Ver a lista</a> · <a href="${APP}">Abrir o Cancioneiro</a></p>`));
  }
  return json({ ...sum, error }, error ? 500 : 200);
});
