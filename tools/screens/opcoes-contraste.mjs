// Maquetas das opções de contraste e maiúsculas (quadro «Opções — maiúsculas e contraste»): a app real com CSS alterado.
// Uso: NODE_PATH=$(npm root -g) NODE_USE_ENV_PROXY=1 node tools/screens/opcoes-contraste.mjs → out/opcoes/*.png
import path from 'node:path';
import { chromium, SCREENS, server, sleep, openScreen } from './harness.mjs';
const OUT = new URL('./out/opcoes', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const V = {
  atual: '',
  op2: `.rows .t, .az .t { text-transform: none !important; letter-spacing: 0 !important; font-size: var(--fs-ui) !important; }
        input::placeholder, textarea::placeholder, .search input::placeholder { text-transform: none !important; letter-spacing: 0 !important; font-size: var(--fs-field) !important; }`,
  op3a: `:root { --brand: #10835c !important; --brand-deep: #0b6b4b !important; }
         .rows .a, .rows .n, .rows .bp, .rows .snip, .rows .chev, .rows li.cat-head, .rows li.col-sec .sec-line { opacity: 1 !important; }`,
  op3b: `:root, * { --on-brand: #0a2e22 !important; }
         body, .view.green, #view-list, .topbar, .searchrow { background: #1fb385 !important; background-image: none !important; }
         .rows .a, .rows .n, .rows .bp, .rows .snip, .rows .chev, .rows li.cat-head, .rows li.col-sec .sec-line { opacity: 1 !important; }`,
};
const screens = ['indice', 'categoria'];
const b = await chromium.launch();
for (const id of screens) for (const [k, css] of Object.entries(V)) {
  const s = SCREENS.find(x => x.id === id);
  const { ctx, page } = await openScreen(b, s);
  if (css) { await page.addStyleTag({ content: css }); await sleep(300); }
  if (k === 'op2') await page.evaluate(() => document.querySelectorAll('input[placeholder]').forEach(i => { const p = i.placeholder.toLowerCase(); i.placeholder = p.charAt(0).toUpperCase() + p.slice(1); }));
  await page.screenshot({ path: path.join(OUT, `${id}-${k}.png`), clip: { x: 0, y: 0, width: 390, height: 844 } });
  await ctx.close(); console.log(id, k);
}
await b.close(); server.close();
