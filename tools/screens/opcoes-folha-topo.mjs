// Maquetas «Editar folha» / «Publicar» no topo da folha (quadro «Opções — botões da folha»): a app real, perfil Maestro,
// com a barra de edição mudada de sítio por JavaScript e CSS. A app não muda.
// Uso: NODE_PATH=$(npm root -g) NODE_USE_ENV_PROXY=1 node tools/screens/opcoes-folha-topo.mjs → out/opcoes5/*.png
import path from 'node:path';
import { chromium, server, sleep, openScreen, H } from './harness.mjs';
const OUT = new URL('./out/opcoes5', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
// atual: no fim da lista. A: primeira linha da lista, botões de 40 px. B: dentro do título, por baixo da data, botões pequenos.
const V = {
  atual: null,
  a: { css: '.rows li.col-edit-bar .edit-bar { margin: 4px 0 12px; }', move: 'rows' },
  b: { css: `.list-title .edit-bar { margin: 10px 0 0; justify-content: flex-start; gap: 8px; }
      .list-title .edit-bar .edit-btn { flex: 0 0 auto; height: var(--h-btn-sm); padding: 0 14px; font-size: var(--fs-small); font-weight: 700; letter-spacing: 0; text-transform: none;
        font-family: var(--sans); color: var(--on-brand); border: 1px solid var(--on-brand-outline); background: none; border-radius: var(--pill); display: inline-flex; align-items: center; gap: 6px; }
      .list-title .edit-bar .edit-btn svg { width: var(--icon-sm); height: var(--icon-sm); }
      .list-title .edit-bar .edit-btn.col-pub { background: var(--on-brand); border-color: var(--on-brand); color: var(--brand-deep); }`, move: 'title' },
};
const CASES = [['por-publicar', '#/lista/colecao-demo3'], ['publicada', '#/lista/colecao-demo1']];
const b = await chromium.launch();
for (const [n, hash] of CASES) for (const [k, v] of Object.entries(V)) {
  const { ctx, page } = await openScreen(b, { id: n, hash, perfil: 'maestro' });
  if (v) {
    await page.addStyleTag({ content: v.css });
    await page.evaluate(where => {
      const li = document.querySelector('#rows li.col-edit-bar'); if (!li) return;
      if (where === 'rows') li.parentNode.prepend(li);
      else { const bar = li.querySelector('.edit-bar'); document.getElementById('list-title').append(bar); li.remove(); }
    }, v.move);
  }
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, `${n}-${k}.png`), clip: { x: 0, y: 0, width: 390, height: H } });
  await ctx.close(); console.log(n, k);
}
await b.close(); server.close();
