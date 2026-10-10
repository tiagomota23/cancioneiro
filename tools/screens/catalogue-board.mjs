// Monta os quadros do catálogo de elementos do canvas a partir de out/catalogo/catalogo.json (três quadros: um quadro do canvas
// tem no máximo 8000 px de altura). A altura de cada um é medida no browser.
//   out/catalogo/blobs.json (opcional) — { "v001": "<id do asset no canvas>", ... }; sem ele, as imagens apontam para os PNG locais (pré-visualização)
// Uso: NODE_PATH=$(npm root -g) node tools/screens/catalogue-board.mjs   → out/catalogo/Catalogo*.dc.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'catalogo');
const cat = JSON.parse(fs.readFileSync(path.join(DIR, 'catalogo.json'), 'utf8'));
const bf = path.join(DIR, 'blobs.json');
const blobs = fs.existsSync(bf) ? JSON.parse(fs.readFileSync(bf, 'utf8')) : null;
const W = 2400;
const PARTS = [
  { file: 'Catalogo.dc.html', title: 'Catálogo — controlos', groups: ['botões', 'botões de ícone', 'ligações e botões de texto', 'campos', 'escolhas', 'linhas de lista', 'etiquetas'] },
  { file: 'CatalogoCaixas.dc.html', title: 'Catálogo — barras e caixas', groups: ['barras', 'caixas'] },
  { file: 'CatalogoTexto.dc.html', title: 'Catálogo — texto, ícones e cores', groups: ['texto', 'ícones'], cores: true },
];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let LOCAL = false; // true: PNG locais (para medir a altura no browser)
const src = id => blobs && !LOCAL ? `/_blob/${blobs[id]}` : `${id}.png`;

const INTRO = {
  'botões': 'Botões com fundo ou contorno.',
  'botões de ícone': 'Botões só com símbolo (sem palavras).',
  'ligações e botões de texto': 'Botões e ligações sem fundo nem contorno.',
  'campos': 'Caixas de texto, pesquisa e listas de escolha.',
  'escolhas': 'Caixas de seleção.',
  'linhas de lista': 'Linhas das listas (o elemento tocável que ocupa a linha).',
  'etiquetas': 'Texto curto com fundo ou contorno que não é botão.',
  'barras': 'Barras de topo, de ações e de leitura.',
  'caixas': 'Janelas de diálogo, menus e avisos, inteiros.',
  'texto': 'Cada combinação de letra, tamanho, peso e entrelinha. A cor aparece à parte, em «cores do texto».',
  'ícones': 'Tamanho, traço e cor de cada ícone.',
};
const SPEC_ORDER = ['letra', 'entrelinha', 'cor', 'fundo', 'borda', 'raio', 'espaco', 'altura', 'sombra', 'elemento', 'tamanho', 'traço', 'preenchimento'];
const SPEC_NAME = { espaco: 'espaço interior', elemento: 'tocável' };
// propriedades resumidas no topo de cada grupo (valores diferentes, com quantas variantes usam cada um)
const SUMMARY = { letra: 'Letras', raio: 'Raios', altura: 'Alturas', borda: 'Bordas', fundo: 'Fundos', tamanho: 'Tamanhos', traço: 'Traços', entrelinha: 'Entrelinhas' };

const sortKey = v => ['fundo', 'borda', 'raio', 'letra', 'tamanho', 'traço'].map(k => v.spec[k] || '').join('|');
const card = v => {
  const dw = Math.min(v.w, 390), dh = Math.round(v.h * dw / v.w);
  const specs = SPEC_ORDER.filter(k => v.spec[k] != null).map(k => `<span style="display: block"><span style="color: #7d8f87">${SPEC_NAME[k] || k}</span> ${esc(v.spec[k])}</span>`).join('');
  const cores = v.cores?.length ? `<span style="display: block"><span style="color: #7d8f87">cores do texto</span> ${esc(v.cores.join(' · '))}</span>` : '';
  const where = v.ecras.slice(0, 4).map(e => esc(cat.ecras[e] || e)).join(' · ') + (v.ecras.length > 4 ? ` · +${v.ecras.length - 4}` : '');
  return `<div style="width: ${Math.max(dw, 240)}px; display: flex; flex-direction: column; gap: 8px">
<div style="background: #ffffff; border: 1px solid #dfe6e2; border-radius: 10px; padding: 10px; display: flex; align-items: center; justify-content: center; min-height: 40px"><img src="${src(v.id)}" alt="${esc(v.exemplo || v.elemento)}" style="display: block; width: ${dw}px; height: ${dh}px"></div>
<p style="margin: 0; font-size: 13px; line-height: 18px; color: #1d2b25"><b>${v.id}</b> · ×${v.usos} · ${v.ecras.length} ${v.ecras.length === 1 ? 'ecrã' : 'ecrãs'}<span style="display: block; color: #4a5a53">«${esc(v.exemplo)}»</span>${specs}${cores}<span style="display: block; color: #7d8f87">${where}</span></p>
</div>`;
};
const summary = g => Object.entries(SUMMARY).map(([k, name]) => {
  const c = new Map(); for (const v of g.variantes) if (v.spec[k] != null) c.set(v.spec[k], (c.get(v.spec[k]) || 0) + 1);
  if (c.size < 2) return '';
  return `<p style="margin: 0; font-size: 14px; line-height: 21px"><b>${name} (${c.size})</b> — ${[...c].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${esc(v)} <span style="color: #7d8f87">×${n}</span>`).join(' · ')}</p>`;
}).join('');
const section = g => `<section style="display: flex; flex-direction: column; gap: 20px">
<div style="display: flex; flex-direction: column; gap: 8px; max-width: 2000px">
<h2 style="margin: 0; font-family: Marcellus, Georgia, serif; font-weight: 400; font-size: 28px; letter-spacing: 2px; color: #0f7a57">${esc(g.grupo[0].toUpperCase() + g.grupo.slice(1))} <span style="font-family: Lato, sans-serif; font-size: 16px; letter-spacing: 0; color: #4a5a53">${g.variantes.length} variantes</span></h2>
<p style="margin: 0; font-size: 15px; color: #4a5a53">${INTRO[g.grupo] || ''}</p>
${summary(g)}
</div>
<div style="display: flex; flex-wrap: wrap; gap: 32px 28px; align-items: flex-start">
${[...g.variantes].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(card).join('\n')}
</div>
</section>`;
const swatch = c => {
  const hex = c.cor.split(' ')[0], alpha = c.cor.includes('%') ? ` ${c.cor.split(' ')[1]}` : '';
  return `<div style="width: 150px; display: flex; flex-direction: column; gap: 6px">
<div style="height: 56px; border-radius: 10px; border: 1px solid #dfe6e2; background: ${esc(hex)}${alpha ? `; opacity: ${parseInt(alpha) / 100}` : ''}"></div>
<p style="margin: 0; font-size: 13px; line-height: 18px"><b>${esc(c.cor)}</b><span style="display: block; color: #4a5a53">${Object.entries(c.usos).map(([k, n]) => `${k} ×${n}`).join(' · ')}</span><span style="display: block; color: #7d8f87">${c.ecras.length} ${c.ecras.length === 1 ? 'ecrã' : 'ecrãs'}</span></p>
</div>`;
};
const cores = `<section style="display: flex; flex-direction: column; gap: 20px">
<div style="display: flex; flex-direction: column; gap: 8px">
<h2 style="margin: 0; font-family: Marcellus, Georgia, serif; font-weight: 400; font-size: 28px; letter-spacing: 2px; color: #0f7a57">Cores <span style="font-family: Lato, sans-serif; font-size: 16px; letter-spacing: 0; color: #4a5a53">${cat.cores.length} cores</span></h2>
<p style="margin: 0; font-size: 15px; color: #4a5a53">Todas as cores calculadas no tema claro, da mais usada à menos usada (texto, fundo, borda, ícone). Cores quase iguais são candidatas a unificar.</p>
</div>
<div style="display: flex; flex-wrap: wrap; gap: 24px 20px">
${cat.cores.map(swatch).join('\n')}
</div>
</section>`;

const total = cat.grupos.reduce((a, g) => a + g.variantes.length, 0);
const page = (part, HGT) => {
  const grupos = cat.grupos.filter(g => part.groups.includes(g.grupo));
  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>${part.title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&amp;family=Lato:wght@400;700&amp;display=swap">
<style>
body{margin:0}
a{color:#0f7a57}a:hover{color:#0a5a40}
</style>
</helmet>
<div style="width: ${W}px; height: ${HGT}px; box-sizing: border-box; padding: 64px; background: #f3f5f4; color: #1d2b25; font-family: Lato, 'Helvetica Neue', sans-serif; display: flex; flex-direction: column; gap: 72px">
<div style="display: flex; flex-direction: column; gap: 8px; max-width: 1600px">
<h1 style="margin: 0; font-family: Marcellus, Georgia, serif; font-weight: 400; font-size: 44px; letter-spacing: 3px; color: #0f7a57">${part.title}</h1>
<p style="margin: 0; font-size: 17px; line-height: 26px; color: #4a5a53">Todos os elementos visíveis nos ${Object.keys(cat.ecras).length} ecrãs e estados da app (tema claro, perfil Gestor), agrupados por tipo: ${total} variantes. Duas peças são a mesma variante quando têm exatamente o mesmo estilo; variantes parecidas ficam lado a lado. Em cada grupo, o resumo mostra os valores diferentes em uso: muitos valores próximos (por exemplo, raios de 10 e 12 px) indicam inconsistência. ×N é o número de vezes que a variante aparece.</p>
</div>
${grupos.map(section).join('\n')}
${part.cores ? cores : ''}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${W},"height":${HGT}}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
`;
};
const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: W, height: 1000 } });
for (const part of PARTS) {
  const f = path.join(DIR, part.file);
  LOCAL = true; fs.writeFileSync(path.join(DIR, '_medir.html'), page(part, 8000)); LOCAL = false;
  await pg.goto('file://' + path.join(DIR, '_medir.html')); await pg.waitForTimeout(500);
  const h = await pg.evaluate(() => { const r = document.querySelector('x-dc > div'); return Math.ceil(r.lastElementChild.getBoundingClientRect().bottom - r.getBoundingClientRect().top + 64); });
  if (h > 8000) console.log(`AVISO: ${part.file} tem ${h}px (máximo do canvas: 8000)`);
  part.h = Math.min(Math.ceil(h * 1.06), 8000); // folga: aqui sem as fontes Lato/Marcellus, as linhas podem partir de outra forma
  fs.writeFileSync(f, page(part, part.h));
  console.log(`${part.file}: ${part.groups.map(g => (cat.grupos.find(x => x.grupo === g)?.variantes.length || 0)).reduce((a, b) => a + b)} variantes${part.cores ? `, ${cat.cores.length} cores` : ''}, ${W}×${part.h}`);
}
fs.rmSync(path.join(DIR, '_medir.html'));
fs.writeFileSync(path.join(DIR, 'quadros.json'), JSON.stringify(PARTS.map(({ file, title, h }) => ({ file, title, w: W, h }))));
await browser.close();
// espelho do artefacto no repositório: design/artefactos/mapa/project (publicar com root=design/artefactos/mapa)
const MAPA_PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../design/artefactos/mapa/project');
for (const f of PARTS.map(p => p.file)) fs.copyFileSync(path.join(DIR, f), path.join(MAPA_PROJ, f));
