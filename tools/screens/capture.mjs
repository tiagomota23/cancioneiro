// Mapa visual da app: abre cada ecrã no modo ?demo (dados fictícios de fixture.mjs) e guarda
//   out/png/<id>.png   — imagem do ecrã (telemóvel 390 px, 2x)
//   mapa/<id>.html     — o HTML do ecrã com o CSS da app, publicado no site para importar no Figma com html.to.design
//   out/manifest.json  — lista dos ecrãs (grupo, título, tamanho)
// Uso: NODE_PATH=$(npm root -g) NODE_USE_ENV_PROXY=1 node tools/screens/capture.mjs [id ...]   (sem ids: todos)
import fs from 'node:fs';
import path from 'node:path';
import { chromium, HERE, ROOT, W, H, SCREENS, server, sleep, openScreen } from './harness.mjs';

const OUT = path.join(HERE, 'out');
const MAXH = 3000;

const only = process.argv.slice(2);
fs.mkdirSync(path.join(OUT, 'png'), { recursive: true });
const MAPA = path.join(ROOT, 'mapa');
fs.mkdirSync(MAPA, { recursive: true });
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const browser = await chromium.launch();
const manifest = [];
for (const s of SCREENS) {
  if (only.length && !only.includes(s.id)) continue;
  let ctx, page, errs = [];
  try {
    ({ ctx, page, errs } = await openScreen(browser, s));
    const dialog = await page.evaluate(() => !!document.querySelector('dialog[open]') || document.querySelector('#drawer')?.classList.contains('open') || !document.querySelector('#pdfview')?.hidden);
    const full = s.full && !dialog;
    const h = full ? Math.min(MAXH, await page.evaluate(() => document.documentElement.scrollHeight)) : H;
    await page.screenshot({ path: path.join(OUT, 'png', s.id + '.png'), clip: { x: 0, y: 0, width: W, height: h }, fullPage: full });
    // HTML do ecrã (sem scripts, com o CSS da app) para o html.to.design
    const html = await page.evaluate(() => {
      const d = document.documentElement.cloneNode(true);
      d.querySelectorAll('script, link[rel=stylesheet][href^="styles"], meta[http-equiv]').forEach(x => x.remove());
      return '<!doctype html>\n' + d.outerHTML;
    });
    fs.writeFileSync(path.join(MAPA, s.id + '.html'), html.replace('<head>', '<head><meta name="robots" content="noindex">').replace('</head>', `<base href="https://tiagomota23.github.io/cancioneiro/"><style>${css}</style></head>`));
    manifest.push({ id: s.id, group: s.group, title: s.title, w: W, h, scheme: s.scheme || 'light', perfil: s.perfil || 'gestor', errors: errs });
    console.log(`${s.id.padEnd(22)} ${h}px${errs.length ? '  ERROS: ' + errs.join(' | ') : ''}`);
  } catch (e) { console.log(`${s.id.padEnd(22)} FALHOU: ${e.message.split('\n')[0]}`); }
  await ctx?.close();
}
await browser.close(); server.close();
const mf = path.join(OUT, 'manifest.json');
const prev = only.length && fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')).filter(x => !only.includes(x.id)) : [];
const order = SCREENS.map(s => s.id);
fs.writeFileSync(mf, JSON.stringify([...prev, ...manifest].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)), null, 1));
const all = JSON.parse(fs.readFileSync(mf, 'utf8'));
fs.writeFileSync(path.join(MAPA, 'index.html'), `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Cancioneiro — ecrãs para o Figma</title>
<style>body{margin:0;padding:24px 16px;font-family:system-ui,sans-serif;max-width:640px;color:#1d2b25;background:#f3f5f4}a{color:#0f7a57}li{margin:6px 0}</style></head>
<body><h1>Cancioneiro — ecrãs (dados de demonstração)</h1><p>Cada página é um ecrã da app, para importar no Figma com o plugin html.to.design (largura 390 px). Gerado por <code>tools/screens/capture.mjs</code>.</p><ul>${all.map(x => `<li><a href="${x.id}.html">${x.group} — ${x.title}</a></li>`).join('')}</ul></body></html>`);
