// Maquetas das opções de títulos de secção (quadro «Opções — títulos de secção»): a app real com CSS alterado.
// Uso: NODE_PATH=$(npm root -g) NODE_USE_ENV_PROXY=1 node tools/screens/opcoes-seccoes.mjs → out/opcoes2/*.png
import path from 'node:path';
import { chromium, SCREENS, server, sleep, openScreen } from './harness.mjs';
const OUT = new URL('./out/opcoes2', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const H = '.rows li.cat-head, .rows li.col-sec .sec-line, .az li.sec-h';
const base = `.az li.sec-h { font-size: var(--fs-caps); font-weight: 700; letter-spacing: var(--ls-caps); text-transform: uppercase; padding: 20px 14px 6px; color: var(--on-brand); list-style: none; }`;
const V = {
  atual: base,
  a: base + `${H} { background: color-mix(in srgb, var(--shadow) 22%, transparent) !important; padding: 9px 14px !important; margin-top: 18px !important; border-bottom: 0 !important; }
    .rows li.cat-head + li a, .az li.sec-h + li a { border-top: 0; }`,
  b: base + `${H} { font-family: var(--serif) !important; font-weight: 400 !important; font-size: 19px !important; letter-spacing: .08em !important; padding: 28px 14px 8px !important; border-bottom: 1px solid var(--on-brand) !important; }`,
  c: base + `${H} { padding: 26px 14px 8px !important; font-size: 12px !important; display: flex !important; align-items: center; gap: 10px; }
    ${H.split(', ').map(s => s + '::after').join(', ')} { content: ""; flex: 1; height: 1px; background: var(--on-brand); opacity: .5; }
    .rows li.cat-head ~ li:not(.cat-head) > a, .rows li.col-sec ~ li:not(.col-sec) > a, .az li.sec-h ~ li > a { padding-left: 30px !important; }`,
};
const inject = page => page.evaluate(() => {
  const az = document.querySelector('#az'); if (!az) return;
  const lis = [...az.children];
  const book = lis.find(l => l.querySelector('a[href*="livro-cancioneiro"]'));
  const sheet = lis.find(l => l.querySelector('a[href*="colecao-"]'));
  const mk = t => { const li = document.createElement('li'); li.className = 'sec-h'; li.textContent = t; return li; };
  if (book) az.insertBefore(mk('Livros'), book);
  if (sheet) az.insertBefore(mk('Folhas'), sheet);
  const first = lis[0]; if (first) az.insertBefore(mk('Os meus cânticos'), first);
});
const b = await chromium.launch();
for (const id of ['indice', 'folha', 'gaveta']) for (const [k, css] of Object.entries(V)) {
  const { ctx, page } = await openScreen(b, SCREENS.find(x => x.id === id));
  await page.addStyleTag({ content: css });
  if (id === 'gaveta') await inject(page);
  if (id === 'indice') await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, `${id}-${k}.png`) });
  await ctx.close(); console.log(id, k);
}
await b.close(); server.close();
