// Motor de pesquisa do Cancioneiro — o mesmo código na função conteudo (Supabase) e no modo de demonstração da app.
// Não tem letras: recebe-as de quem o usa. Pesquisa difusa em camadas, da mais forte para a mais fraca:
//   palavra exata (1) · variante ortográfica PT/IT/LA/ES (0,9) · início de palavra (0,75) · erro de 1–2 letras (0,6)
// e, por cima, frase exata numa linha (+0,5) e todas as palavras na mesma linha (+0,1). Os termos raros pesam mais (idf).
// Também serve a identificação pelo som: as palavras ouvidas são corrigidas para as do índice antes da correspondência.
(function (g) {
  'use strict';
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`´]/g, "'");
  const strip = l => String(l ?? '').replace(/\[[^\]]*\]/g, '');
  const toks = s => norm(strip(s)).split(/[^a-z0-9]+/).filter(Boolean);
  // variantes ortográficas: ph→f, th→t, y→i, j→i (Jesu/Iesu), k→c, h mudo (fica em ch, lh, nh, sh), letras dobradas
  const fold = w => w.replace(/ph/g, 'f').replace(/th/g, 't').replace(/y/g, 'i').replace(/j/g, 'i').replace(/k/g, 'c')
    .replace(/([^cslnp])h/g, '$1').replace(/^h/, '').replace(/(.)\1+/g, '$1');
  // distância de edição com limite (para cedo quando passa de max)
  function lev(a, b, max) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev = new Array(lb + 1); for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      const cur = [i], ca = a.charCodeAt(i - 1); let best = i;
      for (let j = 1; j <= lb; j++) {
        const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1));
        cur.push(v); if (v < best) best = v;
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[lb];
  }
  // erros aceites: nenhum até 3 letras, 1 até 7, 2 a partir de 8
  const fuzzyMax = n => n >= 8 ? 2 : n >= 4 ? 1 : 0;
  const lowerBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };

  // docs: [{ slug, title, author, lines: [linhas da letra, tradução, etc.] }]
  function build(docs) {
    const D = docs.map(d => {
      const lines = (d.lines || []).map(l => strip(l));
      return { slug: d.slug, lines, lt: lines.map(toks), tt: toks(d.title), at: toks(d.author) };
    });
    const vocab = new Map(); // palavra -> Set(índice do documento)
    D.forEach((d, i) => { for (const ws of [d.tt, d.at, ...d.lt]) for (const w of ws) { let s = vocab.get(w); if (!s) vocab.set(w, s = new Set()); s.add(i); } });
    const words = [...vocab.keys()].sort(), foldArr = words.map(fold), folds = new Map();
    words.forEach((w, i) => { const f = foldArr[i]; const a = folds.get(f); if (a) a.push(w); else folds.set(f, [w]); });
    const N = D.length;
    return { D, vocab, words, foldArr, folds, N, idf: w => Math.log((N + 1) / (1 + ((w && vocab.get(w)) ? vocab.get(w).size : 0))), win: null };
  }

  // palavras do índice que correspondem a um termo, com o peso da correspondência
  function expand(ix, t, prefix) {
    const m = new Map(), put = (w, v) => { if ((m.get(w) || 0) < v) m.set(w, v); };
    if (ix.vocab.has(t)) put(t, 1);
    const ft = fold(t);
    for (const w of ix.folds.get(ft) || []) put(w, 0.9);
    if (prefix && t.length >= 2) {
      for (let i = lowerBound(ix.words, t), k = 0; i < ix.words.length && k < 300 && ix.words[i].startsWith(t); i++, k++) put(ix.words[i], 0.75);
    }
    const mx = fuzzyMax(t.length);
    if (mx) for (let i = 0; i < ix.words.length; i++) {
      const f = ix.foldArr[i];
      if (Math.abs(f.length - ft.length) <= mx && lev(f, ft, mx) <= mx) put(ix.words[i], 0.6);
    }
    return m;
  }

  // trecho curto à volta do que foi encontrado (no máximo ~7 palavras)
  function snip(line, isMark) {
    const words = String(line || '').split(/\s+/).filter(Boolean);
    let i = words.findIndex(w => isMark(w)); if (i < 0) i = 0;
    if (words.length <= 7) return words.join(' ');
    const a = Math.max(0, Math.min(i - 3, words.length - 7));
    return (a > 0 ? '… ' : '') + words.slice(a, a + 7).join(' ') + (a + 7 < words.length ? ' …' : '');
  }

  // pesquisa: [{ slug, score, field: 'title'|'author'|'lyrics', snip, marks }] por ordem de relevância
  function search(ix, q, ok, max) {
    const terms = toks(q);
    if (!terms.length || terms.join('').length < 2) return [];
    const nq = terms.join(' ');
    const ex = terms.map((t, i) => expand(ix, t, i === terms.length - 1 || t.length >= 3));
    // peso de cada termo: a raridade da melhor correspondência (palavras muito comuns valem pouco, mas nunca zero)
    const tw = ex.map(m => { let best = null, bv = 0; for (const [w, v] of m) if (v > bv || (v === bv && ix.idf(w) > ix.idf(best))) { best = w; bv = v; } return best ? Math.max(0.3, ix.idf(best)) : 0; });
    const total = tw.reduce((a, b) => a + b, 0);
    if (!total) return [];
    // candidatos: documentos com todos os termos (com 3 ou mais termos, pode faltar um)
    const cnt = new Map();
    for (const m of ex) {
      const seen = new Set();
      for (const w of m.keys()) for (const d of ix.vocab.get(w)) seen.add(d);
      for (const d of seen) cnt.set(d, (cnt.get(d) || 0) + 1);
    }
    const need = terms.length >= 3 ? terms.length - 1 : terms.length;
    const lineW = ws => ex.map(m => { let b = 0; for (const w of ws) { const v = m.get(w); if (v > b) b = v; } return b; });
    const sum = w => w.reduce((a, v, i) => a + v * tw[i], 0) / total;
    const out = [];
    for (const [d, c] of cnt) {
      if (c < need) continue;
      const doc = ix.D[d];
      if (ok && !ok(doc.slug)) continue;
      let best = { score: 0 };
      const tW = lineW(doc.tt), tS = sum(tW) + (doc.tt.join(' ').includes(nq) ? 0.5 : 0) + 0.3;
      if (tW.every(Boolean) || terms.length >= 3) best = { score: tS, field: 'title' };
      const aW = lineW(doc.at);
      if (aW.every(Boolean)) { const aS = sum(aW) + 0.1; if (aS > best.score) best = { score: aS, field: 'author' }; }
      // letra: janela de duas linhas seguidas (uma frase partida em duas linhas também conta)
      const lw = doc.lt.map(lineW);
      for (let j = 0; j < lw.length; j++) {
        const w = j + 1 < lw.length ? lw[j].map((v, i) => Math.max(v, lw[j + 1][i])) : lw[j];
        let s = sum(w);
        if (!s) continue;
        if (lw[j].every(Boolean)) s += 0.1;
        if (doc.lt[j].join(' ').includes(nq)) s += 0.5;
        if (s > best.score) best = { score: s, field: 'lyrics', line: j };
      }
      // fraco demais (ex.: só correspondências aproximadas de um termo em três)
      if (best.score < 0.45) continue;
      const hit = { slug: doc.slug, score: Math.round(best.score * 1000) / 1000, field: best.field };
      if (best.field === 'lyrics') {
        const isMark = w => toks(w).some(t => ex.some(m => m.has(t)));
        hit.snip = snip(doc.lines[best.line], isMark);
        hit.marks = [...new Set(hit.snip.split(/\s+/).filter(w => w !== '…' && isMark(w)))];
      }
      out.push(hit);
    }
    return out.sort((a, b) => b.score - a.score).slice(0, max || 40);
  }

  // identificação pelo som: janelas de 3 linhas, palavras e pares de palavras pesados por raridade.
  // Cada palavra ouvida que não existe no índice é trocada pela mais parecida (variante ou erro de 1–2 letras).
  function windows(ix) {
    if (ix.win) return ix.win;
    ix.win = ix.D.map(doc => {
      const lt = doc.lt.map(ws => ws.filter(w => w.length > 1)), wins = [];
      for (let i = 0; i < lt.length; i++) {
        const words = new Set(), bigrams = new Set();
        for (let k = i; k < Math.min(i + 3, lt.length); k++) {
          const ws = lt[k];
          ws.forEach((w, j) => { words.add(w); if (j) bigrams.add(ws[j - 1] + ' ' + w); });
          if (k > i && lt[k - 1].length && ws.length) bigrams.add(lt[k - 1][lt[k - 1].length - 1] + ' ' + ws[0]);
        }
        if (words.size) wins.push({ words, bigrams, line: doc.lines[i] });
      }
      return wins;
    });
    return ix.win;
  }
  function correct(ix, w) {
    if (ix.vocab.has(w)) return w;
    let best = null, bv = 0;
    for (const [x, v] of expand(ix, w, false)) { const sc = v * 1e6 + ix.vocab.get(x).size; if (sc > bv) { bv = sc; best = x; } }
    return best || w;
  }
  // escolha final: os 8 melhores, o 1.º com pelo menos 0,12 e os outros com 0,2
  const pick = list => list.slice(0, 8).filter((r, i) => i === 0 ? r.score > 0.12 : r.score > 0.2);
  // all = true: a lista completa por ordem (para guardar em cache e filtrar por perfil depois); senão, pick()
  function match(ix, text, ok, all) {
    const wins = windows(ix), idf = ix.idf;
    const q = toks(text).filter(w => w.length > 1).map(w => correct(ix, w));
    const qset = [...new Set(q)], qbi = new Set(q.slice(1).map((w, i) => q[i] + ' ' + w));
    const bw = b => 0.75 * b.split(' ').reduce((x, w) => x + idf(w), 0);
    const total = qset.reduce((a, w) => a + idf(w), 0) + [...qbi].reduce((a, b) => a + bw(b), 0);
    if (!total) return [];
    const out = [];
    ix.D.forEach((doc, d) => {
      if (ok && !ok(doc.slug)) return;
      let best = 0, bestLine = null;
      for (const win of wins[d]) {
        let sc = 0;
        for (const w of qset) if (win.words.has(w)) sc += idf(w);
        for (const b of qbi) if (win.bigrams.has(b)) sc += bw(b);
        if (sc > best) { best = sc; bestLine = win.line; }
      }
      if (best) out.push({ slug: doc.slug, score: best / total, line: bestLine });
    });
    out.sort((a, b) => b.score - a.score);
    const isMark = w => toks(w).some(t => qset.includes(t));
    return (all ? out.slice(0, 200) : pick(out)).map(({ line, ...r }) => ({ ...r, snip: snip(line, isMark) }));
  }

  g.Busca = { norm, toks, fold, lev, fuzzyMax, build, expand, search, match, pick };
})(typeof globalThis !== 'undefined' ? globalThis : this);
