// Divide em estrofes uma letra sem linhas em branco (librone): refrões repetidos, fins de frase e tamanho regular.
const nk = l => l.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const END = /[.!?…;:]["»”’)\]]*$/, STRONG = /[.!?…]["»”’)\]]*$/;
const UP = /^["«“'(¡¿-]*\p{Lu}/u;
export function strofe(text) {
  const L = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const n = L.length; if (n <= 5) return [{ type: 'verse', lines: L }];
  const K = L.map(nk);
  // 1) bloco repetido (≥ 2 linhas, o mais longo) → refrão
  let rep = null;
  for (let len = Math.min(8, Math.floor(n / 2)); len >= 2 && !rep; len--) {
    for (let i = 0; i + len <= n && !rep; i++) {
      const sig = K.slice(i, i + len).join('|'); if (sig.length < 20) continue;
      const occ = [];
      for (let j = 0; j + len <= n; j++) if (K.slice(j, j + len).join('|') === sig && (!occ.length || j >= occ[occ.length - 1] + len)) occ.push(j);
      // o refrão acaba num fim de frase (não corta uma frase que continua na linha seguinte)
      let l2 = len; while (l2 > 2 && !END.test(L[i + l2 - 1])) l2--;
      if (occ.length >= 2 && (l2 === len || END.test(L[i + l2 - 1]))) rep = { len: l2, occ };
    }
  }
  const forced = new Set(), chorusAt = new Set();
  if (rep) for (const j of rep.occ) { if (j) forced.add(j); if (j + rep.len < n) forced.add(j + rep.len); for (let x = j; x < j + rep.len; x++) chorusAt.add(x); }
  // 2) candidatos: fim de frase e linha seguinte com maiúscula (se nem todas as linhas começam com maiúscula)
  const allUp = L.filter(l => UP.test(l)).length / n > 0.7;
  const cand = new Array(n).fill(9); // custo de quebrar antes da linha i
  for (let i = 1; i < n; i++) {
    if (forced.has(i)) cand[i] = 0;
    else if (STRONG.test(L[i - 1]) && (allUp || UP.test(L[i]))) cand[i] = 0.2;
    else if (END.test(L[i - 1]) && (allUp || UP.test(L[i]))) cand[i] = 1;
  }
  const ncand = cand.filter((c, i) => i && c <= 1).length;
  // 3) programação dinâmica: estrofes perto de k linhas, quebrando onde há candidatos
  let best = null;
  for (const k of [4, 6, 8, 5, 3, 2]) {
    const D = new Array(n + 1).fill(Infinity), P = new Array(n + 1).fill(-1); D[0] = 0;
    for (let e = 1; e <= n; e++) for (let s = Math.max(0, e - 14); s < e; s++) {
      const len = e - s;
      const c = D[s] + (s ? cand[s] : 0) + Math.abs(len - k) * 0.6 + (len === 1 ? 3 : 0);
      // nenhuma quebra forçada pode ficar dentro da estrofe
      let bad = false; for (let x = s + 1; x < e; x++) if (forced.has(x)) { bad = true; break; }
      if (!bad && c < D[e]) { D[e] = c; P[e] = s; }
    }
    if (!best || D[n] < best.c) { const cut = []; for (let e = n; e > 0; e = P[e]) cut.unshift(P[e]); best = { c: D[n], cut, k }; }
  }
  // sem pontuação para guiar e sem refrão: só divide se o número de linhas for múltiplo de 4
  if (!rep && ncand < 2) {
    if (n % 4 === 0 && n >= 8) best = { cut: Array.from({ length: n / 4 }, (_, i) => i * 4) };
    else return [{ type: 'verse', lines: L }];
  }
  const out = best.cut.map((s, i) => { const e = best.cut[i + 1] ?? n; return { type: chorusAt.has(s) ? 'chorus' : 'verse', lines: L.slice(s, e) }; });
  return out;
}
