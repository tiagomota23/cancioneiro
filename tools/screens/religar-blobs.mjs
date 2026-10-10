// Troca os ids das imagens (/_blob/<id>) nos quadros do espelho do mapa quando as imagens são carregadas de novo
// (por exemplo, ao reconstruir o artefacto do zero: os ids antigos só existem no artefacto antigo).
//   node tools/screens/religar-blobs.mjs <mapa-antigo.json> <mapa-novo.json>
// Os dois ficheiros têm a forma { "<nome>": "<id>" } com os mesmos nomes (ecrã, ficheiro de opção, vNNN…):
// cada id antigo passa ao id novo do mesmo nome em design/artefactos/mapa/project/*.dc.html. Depois de correr,
// copiar o mapa novo por cima do antigo (design/artefactos/mapa/blobs/*.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('uso: node tools/screens/religar-blobs.mjs <antigo.json> <novo.json>'); process.exit(2); }
const velho = JSON.parse(fs.readFileSync(a, 'utf8')), novo = JSON.parse(fs.readFileSync(b, 'utf8'));
const troca = new Map(Object.entries(velho).filter(([k]) => novo[k]).map(([k, v]) => [v, novo[k]]));
const faltam = Object.keys(velho).filter(k => !novo[k]);
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../design/artefactos/mapa/project');
let total = 0;
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.dc.html'))) {
  const p = path.join(DIR, f), s = fs.readFileSync(p, 'utf8');
  let n = 0; const t = s.replace(/\/_blob\/([0-9a-f]{32})/g, (m, id) => troca.has(id) ? (n++, '/_blob/' + troca.get(id)) : m);
  if (n) { fs.writeFileSync(p, t); console.log(`${f}: ${n}`); total += n; }
}
console.log(`${total} imagens religadas${faltam.length ? `; sem id novo: ${faltam.join(', ')}` : ''}`);
