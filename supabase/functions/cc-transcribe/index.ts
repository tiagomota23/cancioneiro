// Supabase Edge Function (uso pontual): transcreve uma gravação MP3 do Coros & Companhia (Drive do grupo, partilhada por
// ligação) com o Whisper (Groq) e guarda o texto em cc_transcripts, para a webapp fazer um rascunho de letra «a rever».
// Só corre com um pedido em job_requests ('cc-transcribe'), escrito pela webapp; o ficheiro não é guardado.
const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const GROQ = Deno.env.get('GROQ_API_KEY');
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function claimJob(job) {
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const r = await rest(`job_requests?job=eq.${job}&requested_at=gte.${since}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  return Array.isArray(r) && r.length > 0;
}
Deno.serve(async (req) => {
  const b = await req.json().catch(() => ({}));
  const slug = String(b.slug || ''), id = String(b.drive_id || ''), lang = /^[a-z]{2}$/.test(b.lang || '') ? b.lang : null;
  if (!/^[a-z0-9_]{1,80}$/.test(slug) || !/^[A-Za-z0-9_-]{10,80}$/.test(id)) return json({ error: 'pedido inválido' }, 400);
  if (!(await claimJob('cc-transcribe').catch(() => false))) return json({ error: 'sem pedido' }, 403);
  // só gravações que estão ligadas a este cântico como «Ouvir» do Coros & Companhia
  const [f] = await rest(`song_files?song_slug=eq.${slug}&kind=eq.other&path=like.*${id}*&select=path`);
  if (!f) return json({ error: 'gravação não ligada a este cântico' }, 404);
  let text = null, language = null, error = null;
  try {
    const r = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, { redirect: 'follow' });
    if (!r.ok) throw new Error('Drive HTTP ' + r.status);
    const type = r.headers.get('content-type') || '';
    if (!/audio|octet-stream/.test(type)) throw new Error('não é áudio (' + type + ')');
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 24e6) throw new Error('ficheiro grande demais (' + buf.byteLength + ')');
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');
    if (lang) form.append('language', lang);
    const g = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${GROQ}` }, body: form });
    const d = await g.json().catch(() => ({}));
    if (!g.ok) throw new Error(d?.error?.message || 'Groq ' + g.status);
    // segmentos com as pausas, para a webapp separar versos
    text = (d.segments || []).map(s => `${s.start.toFixed(1)}\t${s.text.trim()}`).join('\n') || d.text || '';
    language = d.language || null;
  } catch (e) { error = String(e.message || e); }
  await rest('cc_transcripts?on_conflict=song_slug', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ song_slug: slug, drive_id: id, text, language, error, created_at: new Date().toISOString() }) });
  return json({ ok: !error, error }, error ? 502 : 200);
});
