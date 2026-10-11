// Maquetas das opções do rodapé das janelas (quadro «Opções — botões do rodapé»): a app real com CSS alterado.
// Uso: NODE_PATH=$(npm root -g) NODE_USE_ENV_PROXY=1 node tools/screens/opcoes-rodape.mjs → out/opcoes3/*.png
import path from 'node:path';
import { chromium, server, sleep, openScreen } from './harness.mjs';
const OUT = new URL('./out/opcoes3', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const DEL = '.edit-actions > button.danger-fill:not([hidden]), .edit-actions > button.ghost.danger:not([hidden])';
const DELSVG = DEL.split(', ').map(x => x + ' svg').join(', ');
const V = {
  atual: '',
  linha: `${DEL} { order: 3; }`,
  a: `.edit-actions { display: grid !important; grid-template-columns: max-content; justify-content: end; gap: 10px; }
      .edit-actions > button, .edit-actions > span { width: 100%; min-width: 150px; }
      .edit-actions > span:not(:has(> button:not([hidden]))) { display: none; }
      ${DEL} { order: 3; }`,
  c: `${DEL} { order: 3; flex: 0 0 var(--h-btn) !important; width: var(--h-btn) !important; min-width: var(--h-btn) !important; height: var(--h-btn) !important; padding: 0 !important; display: inline-grid !important; place-items: center; background: var(--surface) !important; color: var(--danger) !important; border-color: var(--danger-border) !important; }
      ${DELSVG} { display: block; width: var(--icon) !important; height: var(--icon) !important; flex: none; fill: none; stroke: currentColor; stroke-width: var(--stroke); stroke-linecap: round; stroke-linejoin: round; }`,
};
const TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>';
const CASES = [
  ['folha', { id: 'f', group: 'x', title: 'x', hash: '#/lista/colecao-demo1' }, '#col-mode', '#col-ed'],
  ['cantico', { id: 'c', group: 'x', title: 'x', hash: '#/cantico/amazing_grace' }, '#btn-edit', '#song-new'],
];
const b = await chromium.launch();
for (const [n, scr, open, dlg] of CASES) for (const [k, css] of Object.entries(V)) {
  const { ctx, page } = await openScreen(b, scr);
  await sleep(300); await page.locator(open).first().click(); await sleep(700);
  if (css) await page.addStyleTag({ content: css });
  if (k === 'c') await page.evaluate(([sel, svg]) => document.querySelectorAll(sel).forEach(x => { x.innerHTML = svg; x.setAttribute('aria-label', 'Apagar'); }), [DEL, TRASH]);
  const f = page.locator(dlg + ' .edit-actions').first();
  await f.scrollIntoViewIfNeeded(); await sleep(200);
  const q = await f.boundingBox();
  const top = Math.max(0, q.y - 150), bottom = Math.min(844, q.y + q.height + 26);
  await page.screenshot({ path: path.join(OUT, `${n}-${k}.png`), clip: { x: 0, y: top, width: 390, height: bottom - top } });
  await ctx.close(); console.log(n, k, Math.round(bottom - top));
}
await b.close(); server.close();
