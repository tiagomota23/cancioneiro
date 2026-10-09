// Converte as gravações que nem todos os telemóveis tocam (ogg, opus, webm, wav, 3gp…) para AAC (.m4a),
// o formato da maioria das gravações do Cancioneiro. Corre na GitHub Action «Converter gravações».
// Sem segredos: identifica-se à função gravacoes do Supabase com o token OIDC do GitHub; a função lista as gravações
// por converter (com endereços de download de 1 hora) e substitui cada uma pela versão convertida.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FN = 'https://hmfjbyiesghqhwhqgnem.supabase.co/functions/v1/gravacoes';
const { ACTIONS_ID_TOKEN_REQUEST_URL: TURL, ACTIONS_ID_TOKEN_REQUEST_TOKEN: TTOK } = process.env;
if (!TURL) { console.error('Só corre na GitHub Action (precisa de permissions: id-token: write)'); process.exit(1); }
const oidc = (await (await fetch(`${TURL}&audience=cancioneiro-gravacoes`, { headers: { Authorization: `Bearer ${TTOK}` } })).json()).value;
const H = { Authorization: `Bearer ${oidc}` };

async function call(op, init = {}, q = '') {
  const r = await fetch(`${FN}?op=${op}${q}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${op} → ${r.status} ${d.error || ''}`);
  return d;
}

const { files } = await call('list');
console.log(`${files.length} gravação(ões) por converter`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-'));
let falhas = 0;
for (const f of files) {
  try {
    const src = path.join(tmp, 'in'), out = path.join(tmp, 'out.m4a');
    const r = await fetch(f.url);
    if (!r.ok) throw new Error('download ' + r.status);
    fs.writeFileSync(src, Buffer.from(await r.arrayBuffer()));
    // AAC 128 kb/s (96 kb/s se for mono), início rápido no telemóvel
    const mono = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', src]).toString().trim() === '1';
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vn', '-c:a', 'aac', '-b:a', mono ? '96k' : '128k', '-movflags', '+faststart', out]);
    const d = await call('replace', { method: 'POST', headers: { 'Content-Type': 'audio/mp4' }, body: fs.readFileSync(out) }, `&id=${f.id}`);
    console.log(`✓ ${f.song_slug} — ${f.label}: ${f.mime} → audio/mp4 (${d.path})`);
  } catch (e) { falhas++; console.error(`✗ ${f.song_slug} — ${f.label}: ${e.message}`); }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (falhas) process.exit(1); // a Action falha e o GitHub avisa por email
