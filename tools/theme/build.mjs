// Gera theme.css a partir de design/tokens.json (fonte única dos valores de design).
// Uso: node tools/theme/build.mjs           escreve theme.css
//      node tools/theme/build.mjs --check   não escreve; sai com erro se theme.css não corresponder aos tokens
// Também verifica que todos os var(--x) usados em styles.css e nas páginas soltas estão definidos.
// Sem dependências (a app não tem passo de compilação; theme.css fica no repositório).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOKENS = path.join(ROOT, 'design/tokens.json');
const OUT = path.join(ROOT, 'theme.css');
const FAMILIES = ['type', 'tracking', 'radius', 'size', 'color'];
const USES = ['styles.css', 'admin.html', 'drive.html', 'privacidade.html'];

const doc = JSON.parse(fs.readFileSync(TOKENS, 'utf8'));
const errors = [];
const vars = []; // [{family, group, name, value, usage}]
for (const fam of FAMILIES) {
  const list = doc[fam]?.tokens;
  if (!Array.isArray(list)) { errors.push(`família «${fam}» em falta`); continue; }
  const themes = doc[fam].themes || [];
  for (const t of list) {
    if (!/^[a-z][a-z0-9-]*$/.test(t.name || '')) { errors.push(`${fam}: nome inválido «${t.name}»`); continue; }
    if (t.value && typeof t.value === 'object') { // par claro/escuro → --light-<nome> e --dark-<nome>
      for (const th of themes) {
        const v = t.value[th];
        if (typeof v !== 'string' || !v.trim()) errors.push(`${fam}: «${t.name}» sem valor para ${th}`);
        else vars.push({ family: fam, group: t.group, name: `${th}-${t.name}`, value: v.trim(), usage: t.usage });
      }
    } else if (typeof t.value === 'string' && t.value.trim()) vars.push({ family: fam, group: t.group, name: t.name, value: t.value.trim(), usage: t.usage });
    else errors.push(`${fam}: «${t.name}» sem valor`);
    for (const v of typeof t.value === 'object' && t.value ? Object.values(t.value) : [t.value]) if (/[;{}]/.test(String(v))) errors.push(`${fam}: «${t.name}» tem ; { ou } no valor`);
  }
}
const seen = new Set();
for (const v of vars) { if (seen.has(v.name)) errors.push(`nome repetido: --${v.name}`); seen.add(v.name); }

// referências: todos os var(--x) usados têm de estar definidos (no tema ou no próprio ficheiro)
for (const f of USES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  const local = new Set([...src.matchAll(/--([a-z0-9-]+)\s*:/g)].map(m => m[1]));
  for (const m of new Set([...src.matchAll(/var\(--([a-z0-9-]+)/g)].map(m => m[1])))
    if (!seen.has(m) && !local.has(m)) errors.push(`${f}: var(--${m}) não está definido`);
}
// tokens que se referem a outros tokens têm de os encontrar
for (const v of vars) for (const m of v.value.matchAll(/var\(--([a-z0-9-]+)/g)) if (!seen.has(m[1])) errors.push(`--${v.name}: var(--${m[1]}) não existe`);

if (errors.length) { console.error('Erros em design/tokens.json:\n  ' + errors.join('\n  ')); process.exit(1); }

const header = `/* ============================================================================================================
   TEMA DO CANCIONEIRO — GERADO a partir de design/tokens.json (node tools/theme/build.mjs). NÃO EDITAR À MÃO.
   Todas as cores, letras, tamanhos e formas da app estão em design/tokens.json; styles.css só tem a disposição
   e usa estes nomes. Também usado por admin.html, drive.html e privacidade.html.
   Fora daqui (mudar à mão se a cor da marca mudar): ícones (icons/*.png), manifest.json (theme_color,
   background_color) e <meta name="theme-color"> nas páginas HTML (cor da barra do telemóvel).
   Depois de mudar: gerar este ficheiro e subir a versão da app (app.js, index.html, sw.js).
   ============================================================================================================ */`;
const lines = [header, ':root {'];
let group = null;
for (const v of vars) {
  if (v.group !== group) { if (group !== null) lines.push(''); if (v.group) lines.push(`  /* ${v.group} */`); group = v.group; }
  const decl = `  --${v.name}: ${v.value};`;
  lines.push(v.usage ? `${decl.padEnd(31)} /* ${v.usage} */` : decl);
}
lines.push('}', '');
const css = lines.join('\n');

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== css) { console.error('theme.css não corresponde a design/tokens.json: corra node tools/theme/build.mjs'); process.exit(1); }
  console.log(`theme.css em dia (${vars.length} variáveis)`);
} else {
  fs.writeFileSync(OUT, css);
  console.log(`theme.css gerado (${vars.length} variáveis)`);
}
