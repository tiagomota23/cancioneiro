// Base comum dos testes: registo de resultados, pedidos com tempo limite, SQL (Management API) e leitura do repositório.
// Os testes nunca escrevem em produção (SQL de escrita só dentro de begin … rollback) e nunca enviam emails.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const TESTS = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(TESTS, '..');
export const SITE = 'https://tiagomota23.github.io/cancioneiro/';
export const PROJECT = 'hmfjbyiesghqhwhqgnem';
export const SB = `https://${PROJECT}.supabase.co`;
export const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
export const exists = f => fs.existsSync(path.join(ROOT, f));
export const sha256 = (buf, enc = 'hex') => crypto.createHash('sha256').update(buf).digest(enc);
export const sha384b64 = buf => crypto.createHash('sha384').update(buf).digest('base64');
export const ANON = (read('config.js').match(/SUPABASE_ANON_KEY:\s*'([^']+)'/) || [])[1];
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- resultados ----------
// status: pass | fail | warn (problema menor / a confirmar) | skip (não corre aqui: falta segredo, ferramenta…)
export const results = [];
let current = { dim: '?', sev: 'média' };
export function record(id, title, status, detail = '', extra = {}) {
  results.push({ id, title, status, detail: String(detail || ''), dim: extra.dim || current.dim, sev: extra.sev || current.sev, evidence: extra.evidence, where: extra.where, ms: extra.ms });
  const icon = { pass: '✓', fail: '✗', warn: '!', skip: '–' }[status] || '?';
  console.log(`  ${icon} ${id.padEnd(9)} ${title}${detail && status !== 'pass' ? ' — ' + String(detail).split('\n')[0].slice(0, 160) : ''}`);
}
// t(id, título, função, {sev, where}) — a função devolve true / nada (passa), uma string (falha com essa explicação),
// { warn: '…' } ou { skip: '…' }, ou lança um erro (falha)
export async function t(id, title, fn, opt = {}) {
  const ONLY = (process.env.TEST_ONLY || '').split(',').filter(Boolean);
  if (ONLY.length && !ONLY.some(o => id.startsWith(o))) return;
  const t0 = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - t0;
    if (r === true || r === undefined || r === null) record(id, title, 'pass', '', { ...opt, ms });
    else if (typeof r === 'string') record(id, title, 'fail', r, { ...opt, ms });
    else if (r.warn) record(id, title, 'warn', r.warn, { ...opt, ms, evidence: r.evidence });
    else if (r.skip) record(id, title, 'skip', r.skip, { ...opt, ms });
    else if (r.fail) record(id, title, 'fail', r.fail, { ...opt, ms, evidence: r.evidence });
    else if (r.pass !== undefined) record(id, title, 'pass', r.pass, { ...opt, ms, evidence: r.evidence });
    else record(id, title, 'pass', '', { ...opt, ms });
  } catch (e) {
    if (e && e.skip) return record(id, title, 'skip', e.skip, { ...opt, ms: Date.now() - t0 });
    record(id, title, 'fail', e && e.message ? e.message : String(e), { ...opt, ms: Date.now() - t0 });
  }
}
export function dim(name, sev = 'média') { current = { dim: name, sev }; console.log(`\n[${name}]`); }

// ---------- rede ----------
export async function get(url, init = {}, ms = 20000) {
  const t0 = performance.now();
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  const body = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: r.headers, body, text: () => body.toString('utf8'), json: () => JSON.parse(body.toString('utf8') || 'null'), ms: Math.round(performance.now() - t0), url: r.url };
}
export const fn = (name, body, headers = {}, method = 'POST') => get(`${SB}/functions/v1/${name}`, {
  method, headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', ...headers }, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body ?? {})) : undefined,
});

// ---------- SQL (Management API; só leitura ou dentro de begin … rollback) ----------
export const hasSql = () => !!process.env.SUPABASE_ACCESS_TOKEN;
export async function sql(query) {
  if (!hasSql()) throw new Error('SUPABASE_ACCESS_TOKEN em falta');
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(query) && !/^\s*begin\b[\s\S]*\brollback;?\s*$/i.test(query))
    throw new Error('sql(): escrita fora de begin … rollback recusada pelo próprio teste');
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(60000),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`SQL HTTP ${r.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}
// corre `body` como um papel (anon / authenticated com um email de allowed_emails de certo perfil / authenticated sem acesso), sempre com rollback
export function asRole(who, body) {
  const claims = who === 'anon' ? null
    : who === 'stranger' ? `json_build_object('email','teste-sem-acesso@example.invalid','role','authenticated','sub','00000000-0000-0000-0000-00000000dead')::text`
    : `json_build_object('email',(select email from public.allowed_emails where role='${who}' order by email limit 1),'role','authenticated','sub',coalesce((select id::text from auth.users u where lower(u.email)=(select email from public.allowed_emails where role='${who}' order by email limit 1)),'00000000-0000-0000-0000-00000000beef'))::text`;
  return `begin; ${claims ? `select set_config('request.jwt.claims', ${claims}, true);` : ''} set local role ${who === 'anon' ? 'anon' : 'authenticated'}; ${body} rollback;`;
}

// ---------- ficheiros do repositório ----------
export function gitFiles() {
  // lista de ficheiros versionados (sem depender de git: percorre e ignora o que está no .gitignore mais comum)
  const ign = ['.git', 'node_modules', 'tools/screens/out', 'tests/reports', 'seed', 'drive-coro-clu', '.claude', 'supabase/.temp'];
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = d ? d + '/' + e.name : e.name;
      if (ign.some(x => p === x || p.startsWith(x + '/'))) continue;
      if (e.isDirectory()) walk(p); else out.push(p);
    }
  })('');
  return out;
}
export function versions() {
  const app = (read('app.js').match(/APP_VERSION = '[^']*v(\d+)'/) || [])[1];
  const idx = [...read('index.html').matchAll(/\?v=(\d+)/g)].map(m => m[1]);
  const sw = (read('sw.js').match(/CACHE = 'cancioneiro-v(\d+)'/) || [])[1];
  return { app, idx, sw };
}

// ---------- rede bloqueada pelo ambiente ----------
// alguns ambientes (ex.: sessões na nuvem) não chegam a certos domínios; os testes que dependem deles ficam «não corridos»
const reach = new Map();
export function reachable(url) {
  const host = new URL(url).host;
  if (!reach.has(host)) reach.set(host, fetch(`https://${host}/`, { method: 'HEAD', signal: AbortSignal.timeout(10000) }).then(() => true).catch(() => false));
  return reach.get(host);
}
export async function needHost(url) { if (!(await reachable(url))) throw Object.assign(new Error('rede'), { skip: `${new URL(url).host} inacessível a partir deste ambiente (política de rede)` }); }
// ficheiro publicado no npm (o jsDelivr /npm/ serve exatamente estes bytes); o registo npm é acessível mesmo com rede limitada
const npmCache = new Map();
export function npmFile(pkg, ver, file) {
  const key = `${pkg}@${ver}/${file}`;
  if (!npmCache.has(key)) npmCache.set(key, (async () => {
    const os = await import('node:os'), cp = await import('node:child_process');
    const name = pkg.split('/').pop();
    const r = await fetch(`https://registry.npmjs.org/${pkg}/-/${name}-${ver}.tgz`, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error('npm HTTP ' + r.status);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-'));
    fs.writeFileSync(path.join(dir, 'p.tgz'), Buffer.from(await r.arrayBuffer()));
    cp.execFileSync('tar', ['-xzf', 'p.tgz', 'package/' + file], { cwd: dir });
    return fs.readFileSync(path.join(dir, 'package', file));
  })());
  return npmCache.get(key);
}
