#!/usr/bin/env node
// Testes do Cancioneiro — ponto de entrada único.
//   node tests/run.mjs [--quick|--full] [--dim=<dimensão>[,…]] [--only=<prefixos de ID>] [--no-ui] [--no-db] [--no-live]
// Níveis: --quick (por omissão; depois de cada versão) e --full (semanal). Dimensões: static, live, db, ui
//   (ou pelos nomes do catálogo: funcionalidade, ligacoes, estabilidade, resiliencia, escalabilidade, usabilidade, seguranca, integridade, compatibilidade).
// Escreve tests/reports/AAAA-MM-DD-vNNN-<nível>.md e .json. Sai com código 1 se algum teste falhar.
// Só leitura em produção; SQL de escrita só em begin … rollback; nunca envia emails nem corre tarefas agendadas.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { TESTS, results, versions } from './lib.mjs';

// playwright está instalado globalmente: relança com NODE_PATH e o proxy do ambiente para o fetch do Node
if (!process.env.CANCIONEIRO_TESTS_CHILD) {
  let needs = false;
  try { createRequire(import.meta.url)('playwright'); } catch (e) { needs = true; }
  if (needs || (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY)) {
    const root = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim();
    const env = { ...process.env, CANCIONEIRO_TESTS_CHILD: '1', NODE_PATH: [process.env.NODE_PATH, root].filter(Boolean).join(path.delimiter), NODE_USE_ENV_PROXY: '1' };
    const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env });
    process.exit(r.status ?? 1);
  }
}

const args = process.argv.slice(2);
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
if (only) process.env.TEST_ONLY = only; // ex.: --only=FUN-02,RES (prefixos de IDs)
const level = args.includes('--full') ? 'full' : 'quick';
const dimArg = (args.find(a => a.startsWith('--dim=')) || '').slice(6).split(',').filter(Boolean).map(s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
// cada dimensão do catálogo → suites onde tem testes
const MAP = {
  static: ['static'], live: ['live'], db: ['db'], ui: ['ui'],
  funcionalidade: ['ui'], ligacoes: ['static', 'live', 'ui'], estabilidade: ['static', 'ui'], resiliencia: ['ui'], escalabilidade: ['live', 'db', 'ui'], desempenho: ['live', 'db', 'ui'],
  usabilidade: ['static', 'ui'], acessibilidade: ['ui'], seguranca: ['static', 'live', 'db', 'ui'], integridade: ['db'], compatibilidade: ['ui'],
};
let suites = dimArg.length ? [...new Set(dimArg.flatMap(d => MAP[d] || []))] : ['static', 'live', 'db', 'ui'];
if (dimArg.length && !suites.length) { console.error('Dimensão desconhecida: ' + dimArg.join(',') + '. Opções: ' + Object.keys(MAP).join(', ')); process.exit(2); }
for (const s of ['ui', 'db', 'live']) if (args.includes('--no-' + s)) suites = suites.filter(x => x !== s);

const v = versions();
const t0 = Date.now();
console.log(`Cancioneiro v${v.app} — testes ${level}${dimArg.length ? ' (' + dimArg.join(',') + ')' : ''}: ${suites.join(', ')}`);
for (const s of ['static', 'live', 'db', 'ui']) {
  if (!suites.includes(s)) continue;
  try { await (await import(`./suites/${s}.mjs`)).default(level); }
  catch (e) { results.push({ id: s.toUpperCase() + '-ERRO', title: `Suite ${s} não correu`, status: 'fail', detail: e.stack || e.message, dim: s, sev: 'alta' }); console.error(e); }
}

// filtro fino por dimensão (quando se pede uma dimensão, mostra só os testes dessa dimensão)
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const shown = dimArg.length && !dimArg.some(d => ['static', 'live', 'db', 'ui'].includes(d)) ? results.filter(r => dimArg.some(d => norm(r.dim).includes(d.slice(0, 6)))) : results;

// ---------- relatório ----------
const SEV = ['crítica', 'alta', 'média', 'baixa'];
const by = st => shown.filter(r => r.status === st);
const dims = [...new Set(shown.map(r => r.dim))];
const date = new Date().toISOString().slice(0, 10);
const secs = Math.round((Date.now() - t0) / 1000);
const line = r => `- **${r.id}** ${r.title} — ${r.detail.replace(/\n/g, ' ').slice(0, 400)}${r.where ? ` _(onde: ${r.where})_` : ''}${r.evidence ? `\n  - evidência: \`${String(r.evidence).replace(/`/g, "'").slice(0, 400)}\`` : ''}`;
let md = `# Relatório de testes — Cancioneiro v${v.app} (${level})\n\n${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC · ${secs} s · ${by('pass').length} ok, ${by('fail').length} falhas, ${by('warn').length} avisos, ${by('skip').length} não corridos\n\n`;
md += '| Dimensão | ok | falhas | avisos | não corridos |\n|---|---|---|---|---|\n';
for (const d of dims) { const x = shown.filter(r => r.dim === d); md += `| ${d} | ${x.filter(r => r.status === 'pass').length} | ${x.filter(r => r.status === 'fail').length} | ${x.filter(r => r.status === 'warn').length} | ${x.filter(r => r.status === 'skip').length} |\n`; }
const rank = r => SEV.indexOf(r.sev) < 0 ? 9 : SEV.indexOf(r.sev);
if (by('fail').length) md += '\n## Falhas (por gravidade)\n\n' + by('fail').sort((a, b) => rank(a) - rank(b)).map(r => `${line(r)} · gravidade ${r.sev}`).join('\n') + '\n';
if (by('warn').length) md += '\n## Avisos\n\n' + by('warn').sort((a, b) => rank(a) - rank(b)).map(r => `${line(r)} · gravidade ${r.sev}`).join('\n') + '\n';
if (by('skip').length) md += '\n## Não corridos\n\n' + by('skip').map(line).join('\n') + '\n';
md += '\n## Todos os testes\n\n| ID | Teste | Resultado | Detalhe |\n|---|---|---|---|\n' + shown.map(r => `| ${r.id} | ${r.title.replace(/\|/g, '/')} | ${{ pass: 'ok', fail: '**falha**', warn: 'aviso', skip: '—' }[r.status]} | ${(r.detail || '').replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 160)} |`).join('\n') + '\n';
const dir = path.join(TESTS, 'reports');
fs.mkdirSync(dir, { recursive: true });
const base = path.join(dir, `${date}-v${v.app}-${level}${dimArg.length ? '-' + dimArg.join('_') : ''}`);
fs.writeFileSync(base + '.md', md);
fs.writeFileSync(base + '.json', JSON.stringify({ version: v.app, level, date, secs, results: shown }, null, 1));
console.log(`\n${by('pass').length} ok · ${by('fail').length} falhas · ${by('warn').length} avisos · ${by('skip').length} não corridos — ${secs} s\nRelatório: ${path.relative(process.cwd(), base)}.md`);
process.exit(by('fail').length ? 1 : 0);
