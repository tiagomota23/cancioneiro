const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const CID = Deno.env.get('GOOGLE_CLIENT_ID'); const CSECRET = Deno.env.get('GOOGLE_CLIENT_SECRET'); const RESEND = Deno.env.get('RESEND_API_KEY');
const ADMIN = 'tiago.mota@gmail.com'; const APP = 'https://tiagomota23.github.io/cancioneiro/';
const TOP = '1s97kgMruXIrPI25RU7SC1DA3I38pt4l4';
const ROOTS = [['missa', '1Rd37zBWre5iv03lr89E9b-kxhqUX6o58'], ['gestos', '1GCfBC-xv0LiuZZnkJobyoQihp33p2Ozy'], ['cancioneiros', '1K9sQfKoop2nLsCOVy8HOLAbuf-Px0ZH6']];
const AUDIO = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg' };
const SCORE = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
const MAX = 30e6;
const nk = p => p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9/]/g, '');
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function all(path) { const out = []; for (let i = 0; ; i += 1000) { const p = await rest(path, { headers: { Range: `${i}-${i + 999}` } }); out.push(...p); if (p.length < 1000) return out; } }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const list = items => `<ul style="padding-left:20px;margin:8px 0">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
const wrap = (title, body) => `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e3e3e3;border-radius:12px;overflow:hidden"><div style="background:#1ab07f;color:#ffffff;padding:16px 22px;font-size:20px;letter-spacing:4px">CANCIONEIRO</div><div style="padding:22px;color:#333333;font-size:15px;line-height:1.5"><h2 style="margin:0 0 14px;font-size:18px;color:#12966a">${title}</h2>${body}</div></div>`;
async function sendEmail(subject, html) {
  if (!RESEND) return;
  await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Cancioneiro <onboarding@resend.dev>', to: [ADMIN], subject, html }) });
}
async function accessToken() {
  const [g] = await rest('drive_state?key=eq.google&select=value');
  if (!g || !g.value || !g.value.refresh_token) throw new Error('Drive não ligado (falta a autorização única em /functions/v1/drive-auth)');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CID, client_secret: CSECRET, refresh_token: g.value.refresh_token, grant_type: 'refresh_token' }) });
  const t = await r.json();
  if (!r.ok) throw new Error('Google recusou a autorização do Drive (' + (t.error || r.status) + '): é preciso ligar de novo em /functions/v1/drive-auth');
  return t.access_token;
}
async function children(tok, id) {
  const out = []; let page = '';
  do {
    const q = new URLSearchParams({ q: `'${id}' in parents and trashed=false`, fields: 'nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)', pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
    if (page) q.set('pageToken', page);
    const r = await fetch('https://www.googleapis.com/drive/v3/files?' + q, { headers: { Authorization: `Bearer ${tok}` } });
    const d = await r.json();
    if (!r.ok) throw new Error('Drive ' + r.status + ': ' + JSON.stringify(d).slice(0, 200));
    out.push(...d.files); page = d.nextPageToken || '';
  } while (page);
  return out;
}
const isFolder = f => f.mimeType === 'application/vnd.google-apps.folder';
async function walk(tok, id, prefix, items, depth) {
  for (const f of await children(tok, id)) {
    const path = prefix ? `${prefix}/${f.name.trim()}` : f.name.trim();
    items.push({ id: f.id, path, name: f.name, mime: f.mimeType, size: f.size ? +f.size : null, md5: f.md5Checksum || null, modified: f.modifiedTime, folder: isFolder(f) });
    if (isFolder(f) && depth > 0) await walk(tok, f.id, path, items, depth - 1);
  }
}
const label = (name, folder) => {
  let s = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const words = new Set(folder.toLowerCase().split(/[\s_\-,.!?()]+/).filter(w => w.length > 2));
  const kept = s.split(/\s+/).filter(w => !words.has(w.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '')));
  s = kept.join(' ').replace(/^[-\s]+|[-\s]+$/g, '');
  return s ? s[0].toUpperCase() + s.slice(1) : 'Gravação';
};
const VOICES = [['todos', 0], ['tutti', 0], ['soprano', 1], ['contralto', 2], ['alto', 2], ['tenor', 3], ['baixo', 4], ['piano', 5]];
const sortOf = l => { const x = l.toLowerCase(); for (const [k, v] of VOICES) if (x.includes(k)) return v; return 6; };

// Só corre a pedido do agendamento (pg_cron), que primeiro deixa um pedido em job_requests (que ninguém de fora consegue escrever).
// O pedido é gasto aqui: um pedido = uma execução.
async function claimJob(job) {
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const r = await rest(`job_requests?job=eq.${job}&requested_at=gte.${since}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  return Array.isArray(r) && r.length > 0;
}
Deno.serve(async () => {
  if (!(await claimJob('drive-sync').catch(() => false))) return json({ error: 'sem pedido do agendamento' }, 403);
  const sum = { imported: [], newFolders: [], changed: [], removed: [], skipped: [], baseline: 0 };
  let error = null;
  try {
    const [last] = await rest('drive_sync_log?select=run_at&error=is.null&order=run_at.desc&limit=1');
    if (last && Date.now() - new Date(last.run_at).getTime() < 3600e3) return json({ skipped: 'executado há menos de 1 hora' });
    const tok = await accessToken();
    const items = [];
    for (const [name, id] of ROOTS) await walk(tok, id, name, items, 3);
    for (const f of await children(tok, TOP)) if (!ROOTS.some(([, id]) => id === f.id)) items.push({ id: f.id, path: 'raiz/' + f.name.trim(), name: f.name, mime: f.mimeType, size: f.size ? +f.size : null, md5: f.md5Checksum || null, modified: f.modifiedTime, folder: isFolder(f) });
    const known = new Map((await all('drive_files?select=id,path,md5,modified,status')).map(k => [k.id, k]));
    const now = new Date().toISOString();
    const row = (it, status, song_slug = null) => ({ id: it.id, path: it.path, name: it.name, mime: it.mime, size: it.size, md5: it.md5, modified: it.modified, status, song_slug, last_seen: now });
    const upserts = [];
    if (!known.size) {
      for (const it of items) upserts.push(row(it, 'baseline'));
      sum.baseline = items.length;
    } else {
      const folders = new Map((await all('drive_folders?select=path,song_slug')).map(f => [nk(f.path), f.song_slug]));
      const seen = new Set();
      for (const it of items) {
        seen.add(it.id);
        const k = known.get(it.id);
        if (k) {
          if (!it.folder && ((it.md5 && k.md5 && it.md5 !== k.md5) || (!it.md5 && k.modified && it.modified !== k.modified))) { sum.changed.push(it.path); upserts.push(row(it, 'changed')); }
          else if (k.status === 'removed') upserts.push(row(it, 'seen'));
          continue;
        }
        const parts = it.path.split('/');
        if (it.folder) {
          if (parts.length === 2 && (parts[0] === 'missa' || parts[0] === 'gestos') && !folders.has(nk(it.path))) { sum.newFolders.push(it.path); upserts.push(row(it, 'reported')); }
          else upserts.push(row(it, 'seen'));
          continue;
        }
        const songPath = parts.slice(0, 2).join('/');
        const slug = folders.get(nk(songPath));
        const ext = (it.name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
        const mime = AUDIO[ext] || SCORE[ext];
        if (slug && mime && it.size && it.size <= MAX) {
          const r = await fetch(`https://www.googleapis.com/drive/v3/files/${it.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${tok}` } });
          if (!r.ok) { sum.skipped.push(`${it.path} (download ${r.status})`); upserts.push(row(it, 'reported')); continue; }
          const spath = `${slug}/drive_${it.id}.${ext}`;
          const up = await fetch(`${SB}/storage/v1/object/coro/${spath}`, { method: 'POST', headers: { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': mime, 'x-upsert': 'true' }, body: await r.arrayBuffer() });
          if (!up.ok) { sum.skipped.push(`${it.path} (upload ${up.status})`); upserts.push(row(it, 'reported')); continue; }
          const kind = AUDIO[ext] ? 'recording' : 'score';
          const lbl = kind === 'score' ? 'Partitura' : label(it.name, parts[1]);
          await rest('song_files?on_conflict=drive_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ song_slug: slug, kind, label: lbl, path: spath, mime, size: it.size, drive_id: it.id, sort: kind === 'score' ? 6 : sortOf(lbl) }]) });
          sum.imported.push(`${parts[1]} — ${it.name}`); upserts.push(row(it, 'imported', slug));
        } else {
          sum.skipped.push(`${it.path}${!slug ? ' (pasta sem cântico associado)' : !mime ? ' (tipo de ficheiro não importado automaticamente)' : ' (ficheiro grande)'}`);
          upserts.push(row(it, 'reported'));
        }
      }
      for (const [id, k] of known) if (!seen.has(id) && k.status !== 'removed') { sum.removed.push(k.path); upserts.push({ id, path: k.path, status: 'removed', last_seen: now }); }
    }
    for (let i = 0; i < upserts.length; i += 500) await rest('drive_files?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(upserts.slice(i, i + 500)) });
  } catch (e) { error = String(e.message || e); }
  await rest('drive_sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ summary: sum, error }) }).catch(() => {});
  const any = sum.imported.length + sum.newFolders.length + sum.changed.length + sum.removed.length + sum.skipped.length;
  if (error) await sendEmail('Cancioneiro: verificação do Drive do Coro falhou', wrap('Verificação do Drive falhou', `<p>${esc(error)}</p>`));
  else if (sum.baseline) await sendEmail('Cancioneiro: Drive do Coro ligado', wrap('Drive do Coro ligado', `<p>Foram registados ${sum.baseline} ficheiros e pastas da pasta do Coro CLU. A partir de agora, todas as semanas, as novidades são tratadas e comunicadas por email.</p>`));
  else if (any) {
    const sec = (t, a) => a.length ? `<p><b>${t} (${a.length})</b></p>${list(a)}` : '';
    await sendEmail(`Cancioneiro: novidades no Drive do Coro (${any})`, wrap('Novidades no Drive do Coro', `<p>A verificação semanal da pasta do Coro CLU encontrou:</p>` +
      sec('Gravações e partituras adicionadas ao Cancioneiro', sum.imported) + sec('Pastas novas (possíveis cânticos novos — para rever)', sum.newFolders) +
      sec('Ficheiros alterados (ex.: o Word "Músicas Coro") — para rever', sum.changed) + sec('Ficheiros por tratar (tipo ou tamanho não automático)', sum.skipped) +
      sec('Apagados no Drive (mantidos no Cancioneiro)', sum.removed) + `<p><a href="${APP}">Abrir o Cancioneiro</a></p>`));
  }
  return json({ ...sum, error }, error ? 500 : 200);
});
