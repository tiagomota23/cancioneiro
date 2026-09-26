// Supabase Edge Function: recebe um pedaço de áudio e devolve a transcrição (Groq, Whisper large).
// A chave GROQ_API_KEY fica guardada como segredo no Supabase (nunca na app).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) return json({ error: 'GROQ_API_KEY em falta' }, 500);

  const type = (req.headers.get('content-type') || 'audio/wav').split(';')[0];
  const buf = await req.arrayBuffer();
  if (buf.byteLength < 1000 || buf.byteLength > 3_000_000) return json({ error: 'tamanho de áudio inválido' }, 400);
  const ext = /mp4|m4a|aac/.test(type) ? 'm4a' : /webm/.test(type) ? 'webm' : /ogg/.test(type) ? 'ogg' : /mpeg|mp3/.test(type) ? 'mp3' : 'wav';

  const form = new FormData();
  form.append('file', new Blob([buf], { type }), `audio.${ext}`);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  // língua opcional escolhida na app (?lang=pt); sem ela o Whisper deteta sozinho
  const lang = new URL(req.url).searchParams.get('lang');
  if (lang && /^[a-z]{2}$/.test(lang)) form.append('language', lang);

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: data?.error?.message || `Groq ${r.status}` }, 502);
  return json({ text: data.text || '', language: data.language || null });
});
