// Maquetas das cores por perfil (quadro «Opções — cores por perfil»): a app real com os tokens de cor trocados.
// Mesmo conteúdo (perfil Gestor) em todas, para comparar só a cor. Títulos das janelas em --accent (com brand-deep
// claro ficariam ilegíveis).
// Uso: NODE_PATH=$(npm root -g) NODE_USE_ENV_PROXY=1 node tools/screens/opcoes-perfis.mjs → out/opcoes4/*.png
import path from 'node:path';
import { chromium, server, sleep, openScreen, SCREENS, H } from './harness.mjs';
const OUT = new URL('./out/opcoes4', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
// destaque (botões, ligações, acordes) igual nas duas variantes de cada cor; muda só o fundo da marca
const HUE = {
  coro: { accent: '#1f6aa8', dark: '#7fb8e6', tint: '#e4f0fa', soft: '#f4f9fd', border: '#c9d8e4', dash: '#b5cadb', line: '#e4eaef', meter: '#cdd7df' },
  maestro: { accent: '#a8453f', dark: '#e8908a', tint: '#fbe7e5', soft: '#fdf4f3', border: '#e2cfcd', dash: '#d9bcb9', line: '#eee6e5', meter: '#dccfce' },
  gestor: { accent: '#56626a', dark: '#a9b4bb', tint: '#eceef0', soft: '#f6f7f8', border: '#d0d5d9', dash: '#bfc6cb', line: '#e7e9eb', meter: '#d0d4d7' },
};
const BRAND = {
  'coro-claro': ['#a9d3ef', '#8fc2e6', '#12324a'], 'coro-medio': ['#2f78b7', '#245f93', '#fff'],
  'maestro-claro': ['#f2bcb8', '#e9a39e', '#4a1714'], 'maestro-medio': ['#b35650', '#93433e', '#fff'],
  'gestor-claro': ['#d6dadd', '#c3c9cd', '#262b2f'], 'gestor-medio': ['#5e6a72', '#4a545b', '#fff'],
};
const css = k => {
  if (k === 'cancioneiro') return '';
  const h = HUE[k.split('-')[0]], [b, d, o] = BRAND[k];
  return `:root { --brand: ${b}; --brand-deep: ${d}; --on-brand: ${o};
    --light-accent: ${h.accent}; --light-chord: ${h.accent}; --light-pdf-title: ${h.accent};
    --dark-accent: ${h.dark}; --dark-chord: ${h.dark};
    --tint: ${h.tint}; --tint-soft: ${h.soft}; --border: ${h.border}; --border-dash: ${h.dash}; --line: ${h.line}; --meter-idle: ${h.meter}; }
    dialog h2, .admin-title, .admin h2, .listen-status { color: var(--accent); }
    .col-ed .ce-rows li.col-sec .sec-line { color: var(--accent); border-bottom-color: var(--accent); }`;
};
// escolhidas a 21 out 2026: azul claro, vermelho médio, cinzento claro (as outras ficam para comparar)
const VARS = ['cancioneiro', 'coro-claro', 'maestro-medio', 'gestor-claro'];
const IDS = ['indice', 'gaveta', 'folha', 'folha-edicao', 'cantico-acordes', 'folha-nova', 'perfis'];
const b = await chromium.launch();
for (const id of IDS) for (const k of VARS) {
  const s = { ...SCREENS.find(x => x.id === id), full: false };
  const { ctx, page } = await openScreen(b, s);
  const c = css(k);
  if (c) await page.addStyleTag({ content: c });
  const clip = { x: 0, y: 0, width: 390, height: H };
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, `${id}-${k}.png`), clip });
  await ctx.close(); console.log(id, k);
}
await b.close(); server.close();
