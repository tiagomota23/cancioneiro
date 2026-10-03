const SOURCE = 'https://cancioneiro.marriaga.com/';
const STOP = {
  pt: 'o a os as de do da dos das que e em um uma não nao meu minha tu teu tua nós vós é são ao pelo pela para com senhor deus coração amor vem vinde eu',
  it: 'il lo la gli le di del della che e è non un una io tu mio mia noi per con sono nel nella signore cuore amore più ti ci',
  es: 'el la los las de del que y en un una no mi tu yo nosotros por con es son al señor corazón amor más te muy soy pues vuestra vuestro mí qué pues',
  fr: 'le la les de du des que et en un une ne pas je tu nous vous est sont au pour avec seigneur coeur cœur amour plus te',
  en: 'the a of and to in is you i my your we he she it not with for be are on all lord heart love will me',
  la: 'et in est non ad cum qui quae quod deus dominus domine nobis nos tibi mea meum sanctus gloria pater mater mei nostri eius ave es sum ut per tuum tua nostra caeli coeli regina alleluia salve virgo christe christi spiritus amen quia sicut deo nobis dei super vita ergo',
  pl: 'i w na nie się z do jest to że ty mnie ja my panie bóg boże serce jak',
  de: 'der die das und ist nicht ich du wir ein eine mit zu im den dem herr gott',
};
const STOPSETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(' '))]));
function langOf(text) {
  const t = text.toLowerCase();
  const words = t.match(/[a-zà-ÿœąęłńśźżó]+/g) || [];
  const sc = {};
  for (const [l, set] of Object.entries(STOPSETS)) sc[l] = words.filter(w => set.has(w)).length;
  if (/[ąęłńśźż]/.test(t)) sc.pl += 10;
  if (/[ãõç]/.test(t)) sc.pt += 3;
  if (/ñ|¿|¡/.test(t)) sc.es += 3;
  let best = null;
  for (const l of Object.keys(STOP)) if (best === null || sc[l] > sc[best]) best = l;
  return best;
}
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function unescapeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#'
    ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    : (NAMED[e.toLowerCase()] ?? m));
}
const clean = s => unescapeHtml(s.replace(/\s+/g, ' ')).trim();
const pyStrip = s => s.replace(/^[\s ]+|[\s ]+$/g, '');
function paraLines(inner) {
  inner = inner.replace(/<span chord="([^"]*)"\s*>\s*<\/span>/g, (m, c) => '[' + unescapeHtml(c).trim() + ']');
  const lines = inner.split(/<br\s*\/?>/).map(clean);
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}
function splitTranslation(txt) {
  txt = unescapeHtml(txt).trim();
  const lines = [];
  for (const r0 of txt.split('\n')) {
    const r = r0.trim();
    if (!r) continue;
    if (r.includes('/')) lines.push(...r.split('/').map(x => x.trim()).filter(Boolean));
    else lines.push(...r.split(/(?<=[.;!?])\s+/).map(x => x.trim()).filter(Boolean));
  }
  return lines;
}
function align(trLines, stanzas) {
  const olines = stanzas.flatMap(s => s.lines.map(l => l.replace(/\[[^\]]*\]/g, '')));
  const N = olines.length, words = [], brk = [];
  for (const l of trLines) {
    const ws = l.split(/\s+/).filter(Boolean);
    ws.forEach((w, wi) => { words.push(w); brk.push(wi === ws.length - 1 ? 2 : 0); });
  }
  const W = words.length;
  const O = olines.reduce((a, x) => a + x.length, 0) || 1;
  const T = words.reduce((a, w) => a + w.length + 1, 0);
  if (N === 0 || W < N || !(0.55 < T / O && T / O < 1.8)) return null;
  const pre = [0];
  for (const w of words) pre.push(pre[pre.length - 1] + w.length + 1);
  const bpen = j => {
    if (j === W) return 0;
    const w = words[j - 1];
    if (brk[j - 1] === 2) return 0;
    if ('.;!?'.includes(w[w.length - 1])) return 0.05;
    if (',:'.includes(w[w.length - 1])) return 0.2;
    return 0.9;
  };
  const INF = 1e18;
  const dp = Array.from({ length: N + 1 }, () => new Array(W + 1).fill(INF));
  const bk = Array.from({ length: N + 1 }, () => new Array(W + 1).fill(0));
  dp[0][0] = 0;
  for (let i = 1; i <= N; i++) {
    const exp = olines[i - 1].length * T / O;
    for (let j = i; j <= W - (N - i); j++) {
      let best = INF, bj = 0;
      for (let k = Math.max(i - 1, j - 40); k < j; k++) {
        if (dp[i - 1][k] >= INF) continue;
        const ln = pre[j] - pre[k];
        const c = dp[i - 1][k] + ((ln - exp) / (exp + 8)) ** 2 + bpen(j);
        if (c < best) { best = c; bj = k; }
      }
      dp[i][j] = best; bk[i][j] = bj;
    }
  }
  const cuts = [];
  let j = W;
  for (let i = N; i > 0; i--) { const k = bk[i][j]; cuts.push([k, j]); j = k; }
  cuts.reverse();
  const lines = cuts.map(([a, b]) => words.slice(a, b).join(' '));
  const out = []; let k = 0;
  for (const s of stanzas) { const n = s.lines.length; out.push({ type: s.type, lines: lines.slice(k, k + n) }); k += n; }
  return out;
}
function parseSong(slug, body) {
  const tm = body.match(/<p class="title">([\s\S]*?)<\/p>/);
  const titleHtml = tm ? tm[1] : '';
  const pdf = titleHtml.match(/href="([^"]+\.pdf)"/);
  const title = clean(titleHtml.replace(/<[^>]+>/g, ''));
  const am = body.match(/<p class="artist">([\s\S]*?)<\/p>/);
  const author = am ? clean(am[1].replace(/<[^>]+>/g, '')) : null;
  const stanzas = [];
  for (const m of body.matchAll(/<p class="(verse|chorus)[^"]*">([\s\S]*?)<\/p>/g)) stanzas.push({ type: m[1], lines: paraLines(m[2]) });
  const trm = body.match(/<p class="translation">([\s\S]*?)<\/p>/);
  let translation = null;
  if (trm) {
    const tl = splitTranslation(trm[1]);
    const nlines = stanzas.reduce((a, s) => a + s.lines.length, 0);
    if (tl.length === nlines) {
      translation = []; let k = 0;
      for (const s of stanzas) { const n = s.lines.length; translation.push({ type: s.type, lines: tl.slice(k, k + n) }); k += n; }
    } else translation = align(tl, stanzas) || [{ type: 'verse', lines: tl }];
  }
  const plain = stanzas.flatMap(s => s.lines.map(l => l.replace(/\[[^\]]*\]/g, ''))).join(' ');
  return {
    slug, title, author, language: langOf(title + ' ' + plain),
    lyrics: stanzas, translation, translation_language: translation ? 'pt' : null,
    has_chords: stanzas.some(s => s.lines.some(l => l.includes('['))),
    pdf_src: pdf ? pdf[1] : null,
  };
}
function splitDivs(html) {
  return [...html.matchAll(/<div id="([^"]+)" class="linkTopNav">([\s\S]*?)<\/div>/g)].map(m => ({ slug: m[1], body: m[2] }));
}
const SB = Deno.env.get('SUPABASE_URL');
const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const baseName = u => decodeURIComponent((u || '').split('/').pop() || '');
const safeName = n => n.replace(/[^A-Za-z0-9._-]+/g, '_');
function pdfFor(src, current) {
  if (!src) return null;
  if (current && !/^https?:/.test(current) && safeName(baseName(src)) === baseName(current)) return current;
  return /^https?:/.test(src) ? src : SOURCE + src.replace(/^\/+/, '');
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });


// Só corre a pedido do agendamento (pg_cron), que primeiro deixa um pedido em job_requests (que ninguém de fora consegue escrever).
// O pedido é gasto aqui: um pedido = uma execução.
async function claimJob(job) {
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const r = await rest(`job_requests?job=eq.${job}&requested_at=gte.${since}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  return Array.isArray(r) && r.length > 0;
}
Deno.serve(async () => {
  if (!(await claimJob('sync-songs').catch(() => false))) return json({ error: 'sem pedido do agendamento' }, 403);
  const log = { added: [], updated: [], baseline: 0, error: null };
  try {
    const last = await rest('sync_log?select=run_at&order=run_at.desc&limit=1');
    if (last.length && Date.now() - new Date(last[0].run_at).getTime() < 3600e3) return json({ skipped: 'executado há menos de 1 hora' });
    const page = await fetch(SOURCE + 'index.html');
    if (!page.ok) throw new Error('site original: HTTP ' + page.status);
    const divs = splitDivs(await page.text());
    if (divs.length < 50) throw new Error('site original: só ' + divs.length + ' cânticos encontrados (página incompleta?)');
    const existing = [];
    for (let from = 0; ; from += 1000) {
      const pageRows = await rest('songs?select=slug,number,title,pdf_url,source_hash&order=number', { headers: { Range: `${from}-${from + 999}` } });
      existing.push(...pageRows);
      if (pageRows.length < 1000) break;
    }
    const bySlug = new Map(existing.map(s => [s.slug, s]));
    let nextNumber = existing.reduce((m, s) => Math.max(m, s.number), 0) + 1;
    const baseline = {}, inserts = [];
    for (const d of divs) {
      const h = await sha256(d.body);
      const cur = bySlug.get(d.slug);
      if (cur && !cur.source_hash) { baseline[d.slug] = h; continue; }
      if (cur && cur.source_hash === h) continue;
      const p = parseSong(d.slug, d.body);
      if (!p.title || !p.lyrics.length) continue;
      const fields = { title: p.title, author: p.author, lyrics: p.lyrics, translation: p.translation, translation_language: p.translation_language, has_chords: p.has_chords, source_hash: h };
      if (!cur) {
        inserts.push({ slug: p.slug, number: nextNumber++, language: p.language, pdf_url: pdfFor(p.pdf_src, null), ...fields });
        log.added.push(p.title);
      } else {
        await rest(`songs?slug=eq.${encodeURIComponent(p.slug)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...fields, pdf_url: pdfFor(p.pdf_src, cur.pdf_url), updated_at: new Date().toISOString() }) });
        log.updated.push(p.title);
      }
    }
    if (Object.keys(baseline).length) log.baseline = await rest('rpc/set_source_hashes', { method: 'POST', body: JSON.stringify({ h: baseline }) });
    if (inserts.length) await rest('songs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(inserts) });
  } catch (e) {
    log.error = String(e && e.message || e);
  }
  await rest('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(log) }).catch(() => {});
  return json(log, log.error ? 500 : 200);
});
