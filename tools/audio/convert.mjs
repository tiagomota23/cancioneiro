// Converte as gravações que nem todos os telemóveis tocam (ogg, opus, webm, wav, 3gp…) para AAC (.m4a),
// o formato da maioria das gravações do Cancioneiro. Corre na GitHub Action «Converter gravações».
// Para cada uma: descarrega do bucket «coro», converte com ffmpeg, guarda <caminho>.m4a, atualiza song_files e apaga o original.
// Precisa de SUPABASE_SERVICE_ROLE_KEY (segredo do repositório) e do ffmpeg.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SB = process.env.SUPABASE_URL || 'https://hmfjbyiesghqhwhqgnem.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta o segredo SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const OK = ['audio/mpeg', 'audio/mp4', 'audio/aac']; // tocam em todo o lado

async function req(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${url.replace(SB, '')} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}

const list = await (await req(`${SB}/rest/v1/song_files?select=id,song_slug,label,path,mime&kind=eq.recording&mime=not.in.(${OK.map(encodeURIComponent).join(',')})`)).json();
console.log(`${list.length} gravação(ões) por converter`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-'));
let falhas = 0;
for (const f of list) {
  try {
    const src = path.join(tmp, 'in'), out = path.join(tmp, 'out.m4a');
    fs.writeFileSync(src, Buffer.from(await (await req(`${SB}/storage/v1/object/coro/${f.path}`)).arrayBuffer()));
    // AAC 128 kb/s (96 kb/s se for mono), início rápido no telemóvel
    const mono = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', src]).toString().trim() === '1';
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vn', '-c:a', 'aac', '-b:a', mono ? '96k' : '128k', '-movflags', '+faststart', out]);
    const body = fs.readFileSync(out);
    const novo = f.path.replace(/\.[^./]+$/, '') + '.m4a';
    await req(`${SB}/storage/v1/object/coro/${novo}`, { method: 'POST', headers: { 'Content-Type': 'audio/mp4', 'x-upsert': 'true' }, body });
    await req(`${SB}/rest/v1/song_files?id=eq.${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ path: novo, mime: 'audio/mp4', size: body.length }) });
    if (novo !== f.path) await req(`${SB}/storage/v1/object/coro`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [f.path] }) });
    console.log(`✓ ${f.song_slug} — ${f.label}: ${f.mime} → audio/mp4 (${f.path} → ${novo})`);
  } catch (e) { falhas++; console.error(`✗ ${f.song_slug} — ${f.label}: ${e.message}`); }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (falhas) process.exit(1); // a Action falha e o GitHub avisa por email
