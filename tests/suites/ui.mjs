// Interface (Playwright, Chromium): modo ?demo em localhost (dados fictícios de tools/screens/fixture.mjs) e modo real
// com o Supabase simulado (nenhum pedido sai para produção: tudo o que vai para *.supabase.co é intercetado).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { t, dim, ROOT, TESTS, sleep, npmFile } from '../lib.mjs';

const PROJ = 'hmfjbyiesghqhwhqgnem';
const W = 390, H = 844;
let BASE, browser, fixture, chromium, webkit, server;

// ---------- abrir a app ----------
const ext = new Map();
async function external(route) {
  const url = route.request().url();
  if (url.includes('.supabase.co')) return route.abort('blockedbyclient'); // modo demo: nunca fala com produção
  if (!ext.has(url)) ext.set(url, fetch(url).then(async r => ({ status: r.status, contentType: r.headers.get('content-type') || '', body: Buffer.from(await r.arrayBuffer()) })).catch(async () => {
    // jsDelivr bloqueado neste ambiente: os mesmos bytes vêm do registo npm (o browser confirma o SRI)
    const m = url.match(/cdn\.jsdelivr\.net\/npm\/(@?[^@]+)@([\d.]+)\/(.+)$/);
    if (!m) return null;
    try { return { status: 200, contentType: 'text/javascript', body: await npmFile(m[1], m[2], m[3]) }; } catch (e) { return null; }
  }));
  const r = await ext.get(url);
  return r ? route.fulfill({ status: r.status, contentType: r.contentType, body: r.body, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
}
const demoCols = () => {
  const exp = new Date(Date.now() + 7 * 864e5).toISOString(), old = new Date(Date.now() - 864e5).toISOString();
  return [{ id: 'demo1', title: 'Missa de domingo', audience: 'coro', duration: '1w', expires_at: exp, created_by: 'demo@localhost',
    sections: [{ id: 's1', title: 'Entrada', position: 0 }, { id: 's2', title: 'Comunhão', position: 2 }],
    songs: [{ song_slug: 'veni_creator_spiritus', position: 1 }, { song_slug: 'adoro_te_devote', position: 3 }, { song_slug: 'salve_regina', position: 4 }] },
  { id: 'demo2', title: 'Encontro de jovens', audience: 'cancioneiro', duration: '48h', expires_at: exp, created_by: 'demo@localhost', sections: [],
    songs: [{ song_slug: 'amazing_grace', position: 0 }, { song_slug: 'de_colores', position: 1 }] },
  { id: 'demoE', title: 'Folha em edição', audience: 'coro', duration: '1w', expires_at: exp, created_by: 'demo@localhost', published: false,
    sections: [{ id: 'e1', title: 'Entrada', position: 0 }, { id: 'e2', title: 'Comunhão', position: 2 }, { id: 'e3', title: 'Saída', position: 4 }],
    songs: [{ song_slug: 'veni_creator_spiritus', position: 1 }, { song_slug: 'adoro_te_devote', position: 3 }] },
  { id: 'demo3', title: 'Folha expirada', audience: 'coro', duration: '24h', expires_at: old, created_by: 'demo@localhost', sections: [], songs: [{ song_slug: 'salve_regina', position: 0 }] }];
};
const fakeJwt = exp => ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', email: 'teste@example.invalid', role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600 })).toString('base64url'), 'assinatura-falsa'].join('.');
const session = () => { const exp = Math.floor(Date.now() / 1000) + 3600; return { access_token: fakeJwt(exp), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresh-falso',
  user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'teste@example.invalid', app_metadata: { provider: 'google' }, user_metadata: {} } }; };

// Supabase simulado para o modo real (sem ?demo): mode = { down, slowMs, role, canListen, conteudo(op, body) → {status, body}|null, rest(path) → …, refreshFail }
function mockSupabase(mode, songs, calls) {
  return async route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname;
    calls.push(`${req.method()} ${p}${u.search.slice(0, 60)}`);
    if (mode.down) return route.abort('connectionrefused');
    if (mode.slowMs) await sleep(mode.slowMs);
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return json('', 200, { 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' });
    if (p === '/auth/v1/user') return req.method() === 'GET' ? json(session().user) : json(session().user);
    if (p === '/auth/v1/token') return mode.refreshFail ? json({ error: 'invalid_grant', error_description: 'Refresh Token Not Found' }, 400) : json(session());
    if (p === '/auth/v1/logout') return json('', 204);
    if (p === '/rest/v1/rpc/my_role') return json(JSON.stringify(mode.role || 'coro'));
    if (p === '/rest/v1/rpc/can_listen') return json(JSON.stringify(mode.canListen === true)); // v201: por omissão sem reconhecimento, como a maioria das contas
    if (p.startsWith('/rest/v1/')) {
      const tb = p.slice(9);
      const custom = mode.rest && mode.rest(tb, req);
      if (custom) return json(custom.body, custom.status || 200);
      if (tb === 'songs') return json(songs.map(({ lyrics, translation, lyrics_edit, ...x }) => ({ ...x, has_translation: !!translation, is_edited: !!lyrics_edit })), 200, { 'content-range': `0-${songs.length - 1}/${songs.length}` });
      if (req.method() === 'GET') return json([]);
      return json('', 201);
    }
    if (p === '/functions/v1/conteudo') {
      const b = JSON.parse(req.postData() || '{}');
      calls.push(`${b.op}:${b.slug || ''}`);
      const custom = mode.conteudo && mode.conteudo(b.op, b);
      if (custom) return json(custom.body, custom.status || 200);
      const s = songs.find(x => x.slug === b.slug);
      if (b.op === 'song') return s ? json({ slug: s.slug, lyrics: s.lyrics, translation: s.translation, edited: false }) : json({ error: 'não encontrado' }, 404);
      if (b.op === 'search') return json({ hits: [] });
      if (b.op === 'file') return json({ url: BASE + 'drive-coro-clu/out/' + String(b.path).split('#')[0] });
      return json({ ok: true });
    }
    if (p.startsWith('/storage/')) return mode.storage403 ? json({ error: 'Unauthorized' }, 403) : json({});
    return json({ error: 'não simulado: ' + p }, 404);
  };
}

async function open(o = {}) {
  const ctx = await (o.engine || browser).newContext({ viewport: o.viewport || { width: W, height: H }, deviceScaleFactor: 1, isMobile: o.isMobile ?? true, hasTouch: o.hasTouch ?? true,
    colorScheme: o.scheme || 'light', locale: 'pt-PT', timezoneId: 'Europe/Lisbon', serviceWorkers: o.sw ? 'allow' : 'block', permissions: o.permissions || [] });
  const init = { cols: o.cols || demoCols(), tour: !!o.tour, extra: o.storage || {}, sess: o.real ? session() : null, favs: o.favs || ['salve_regina', 'amazing_grace'] };
  await ctx.addInitScript(i => {
    if (sessionStorage.getItem('teste.init')) return; sessionStorage.setItem('teste.init', '1');
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    if (!i.tour) set('cancioneiro.tutorial', 1);
    set('cancioneiro.instalada', 1);
    set('cancioneiro.favs.demo', i.favs);
    set('cancioneiro.demo.cols', i.cols);
    if (i.sess) set('sb-hmfjbyiesghqhwhqgnem-auth-token', i.sess);
    for (const [k, v] of Object.entries(i.extra)) set(k, v);
  }, init);
  const songs = o.songs || fixture;
  const calls = [];
  await ctx.route(/^https:\/\//, external);
  if (o.real) await ctx.route(/\.supabase\.co\//, mockSupabase(o.real, songs, calls));
  const page = await ctx.newPage();
  if (o.songs) await page.route(/\/songs\.json$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o.songs) }));
  if (o.real) await page.route(u => u.pathname === '/real.html', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(ROOT, 'index.html')) }));
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_BLOCKED_BY_CLIENT|net::ERR_/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  const url = o.real ? `${BASE}real.html${o.q ? '?' + o.q : ''}${o.hash || '#/'}` : `${BASE}?demo&perfil=${o.perfil || 'gestor'}${o.q ? '&' + o.q : ''}${o.hash || '#/'}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  if (o.wait !== false) await page.waitForSelector(o.wait || '#splash.gone', { state: 'attached', timeout: o.timeout || 15000 });
  const loadMs = Date.now() - t0;
  await sleep(o.settle ?? 500);
  if (o.open) { await page.click(o.open).catch(() => {}); await sleep(600); } // ex.: '#col-mode' abre a janela de edição da folha
  return { ctx, page, errs, calls, loadMs, close: () => ctx.close() };
}
// corre fn(app) com a app aberta e fecha sempre; erros JS durante o teste fazem-no falhar
async function withApp(o, fn) {
  const app = await open(o);
  try {
    const r = await fn(app);
    if ((r === true || r === undefined || (r && r.pass !== undefined)) && app.errs.length && !o.allowErrors) return { fail: 'erros JS: ' + app.errs.slice(0, 3).join(' | ') };
    return r;
  } finally { await app.close(); }
}
// interruptores (v205: button.switch-row role=switch; estado em aria-checked)
const swOn = (page, sel) => page.evaluate(q => { const e = document.querySelector(q); return e ? e.getAttribute('aria-checked') === 'true' : undefined; }, sel);
const swSet = async (page, sel, v) => { if ((await swOn(page, sel)) !== v) { await page.click(sel); await sleep(150); } };
const vis = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
// textContent (o CSS põe títulos em maiúsculas: innerText devolveria «CANCIONEIRO» em vez do texto real)
const txt = (page, sel) => page.locator(sel).first().evaluate(e => e.textContent).catch(() => '');
const count = (page, sel) => page.locator(sel).count();

// ---------- dados fictícios para testes de escala e de XSS ----------
function bigFixture(n) {
  const out = [...fixture];
  for (let i = out.length; i < n; i++) out.push({ ...fixture[i % fixture.length], slug: 'teste_' + i, number: 1000 + i, title: `Cântico de teste ${i}`, author: `Autor ${i % 37}`, lyrics: [{ type: 'verse', lines: [`Linha de exemplo ${i}`, 'la la la'] }], files: [], tags: [] });
  return out;
}
const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
function xssFixture() {
  return fixture.map((s, i) => i > 2 ? s : { ...s, title: s.title + ' ' + XSS, author: XSS + '"\'><svg onload=window.__xss=1>', lyrics: [{ type: 'verse', lines: ['Ave ' + XSS, '[<b onmouseover=x>]Sol ' + XSS] }], translation: s.translation ? [{ type: 'verse', lines: [XSS] }] : null,
    files: (s.files || []).map(f => ({ ...f, label: f.label + XSS })), tags: [...(s.tags || []), { grp: 'Coro CLU — momento', tag: XSS }] });
}

export default async function (level, opts = {}) {
  const full = level === 'full';
  const H = await import('../../tools/screens/harness.mjs');
  chromium = H.chromium; server = H.server;
  try { webkit = createRequire(import.meta.url)('playwright').webkit; } catch (e) { webkit = null; }
  BASE = `http://localhost:${server.address().port}/`;
  fixture = (await import('../../tools/screens/fixture.mjs')).default;
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try { await suites(full); }
  finally { await browser.close(); server.close(); }
}

async function suites(full) {
  // ===================== Funcionalidade =====================
  dim('Funcionalidade — interface', 'alta');
  for (const perfil of ['gestor', 'maestro', 'coro', 'cancioneiro']) {
    await t(`FUN-01.${perfil}`, `Arranque no perfil ${perfil}: índice com cânticos e sem erros JS`, () => withApp({ perfil }, async ({ page, loadMs }) => {
      await page.waitForSelector('#rows li a', { timeout: 8000 });
      const n = await count(page, '#rows li');
      return n > 0 ? { pass: `${n} linhas, ${loadMs} ms` } : 'índice vazio';
    }));
  }
  await t('FUN-02', 'Pesquisa por título, autor e letra; limpar repõe o índice', () => withApp({ perfil: 'coro' }, async ({ page }) => {
    await page.fill('#search', 'grace'); await sleep(900);
    const a = await txt(page, '#rows');
    if (!/Amazing Grace/.test(a)) return 'título: «grace» não encontrou Amazing Grace';
    await page.fill('#search', 'newton'); await sleep(900);
    if (!/Amazing Grace/.test(await txt(page, '#rows'))) return 'autor: «newton» não encontrou Amazing Grace';
    await page.fill('#search', 'misericordiae'); await sleep(1500);
    if (!/Salve Regina/.test(await txt(page, '#rows'))) return 'letra: «misericordiae» não encontrou Salve Regina';
    if (!(await vis(page, '#search-clear'))) return 'botão limpar não aparece';
    await page.click('#search-clear'); await sleep(400);
    return (await page.inputValue('#search')) === '' || 'limpar não esvaziou a pesquisa';
  }));
  await t('FUN-03', 'Cântico: título, letra, botões de idioma (original ↔ tradução)', () => withApp({ perfil: 'coro', hash: '#/cantico/salve_regina' }, async ({ page }) => {
    await page.waitForSelector('#song h1');
    if (!/Salve Regina/.test(await txt(page, '#song h1'))) return 'título errado';
    if (!/misericordiae/i.test(await txt(page, '#song'))) return 'letra original não aparece';
    const sw = page.locator('#song .lang-switch button');
    if (await sw.count() < 2) return 'sem botões de idioma';
    await sw.nth(1).click(); await sleep(400);
    return /misericórdia/i.test(await txt(page, '#song')) || 'tradução não aparece';
  }));
  await t('FUN-03b', 'Versão noutra língua (translation_language ≠ pt): botão só com a língua («Espanhol», sem «Tradução ·») e nota «Versão em espanhol»; tradução pt mantém «Tradução · Português» (v192)', () => withApp({ perfil: 'coro', hash: '#/cantico/versao_es', songs: [...fixture, { ...fixture.find(x => x.slug === 'de_colores'), slug: 'versao_es', number: 9200, title: 'Cântico com versão espanhola', language: 'en', translation: [{ type: 'verse', lines: ['Versión de ejemplo'] }], translation_language: 'es' }] }, async ({ page }) => {
    await page.waitForSelector('#song .lang-switch button');
    const b = page.locator('#song .lang-switch button[data-mode="trad"]');
    const label = (await b.textContent()).trim();
    if (/Tradução/.test(label) || !/^Espanhol$/i.test(label)) return 'botão: «' + label + '»';
    await b.click(); await sleep(400);
    const note = (await txt(page, '#song .note')).trim();
    if (!/^Versão em espanhol$/i.test(note)) return 'nota: «' + note + '»';
    await page.evaluate(() => { location.hash = '#/cantico/salve_regina'; }); await sleep(600);
    const pt = (await page.locator('#song .lang-switch button[data-mode="trad"]').textContent()).trim();
    return /^Tradução · Português$/.test(pt) || 'tradução pt: «' + pt + '»';
  }), { sev: 'média' });
  await t('FUN-47', 'Versões do mesmo cântico: fora das listas e da pesquisa; botões data-mode="v:<slug>" no principal; nota «Versão em …: «título» — autor»; #/cantico/<versão> vai para o principal; perfil Cancioneiro só vê versões a que tem acesso (v193)', async () => {
    const bad = [];
    await withApp({ perfil: 'coro', hash: '#/lista/livro-songbook' }, async ({ page }) => {
      await page.waitForSelector('#rows li a');
      const sb = await txt(page, '#rows');
      if (/Are you sleeping/.test(sb)) bad.push('a versão aparece no livro Songbook');
      if (!/Frère Jacques/.test(sb)) bad.push('o principal não aparece no Songbook (devia herdar a fonte da versão)');
      await page.evaluate(() => { location.hash = '#/'; }); await sleep(300);
      await page.fill('#search', 'Frei Martinho'); await sleep(900);
      const rs = await txt(page, '#rows');
      if (/Frei Martinho/.test(rs) && !/Frère Jacques/.test(rs)) bad.push('a pesquisa mostra a versão em vez do principal');
      await page.evaluate(() => { location.hash = '#/cantico/frere_jacques'; }); await sleep(800);
      const vb = await page.evaluate(() => [...document.querySelectorAll('#song .lang-switch button[data-mode^="v:"]')].map(b => b.dataset.mode + '=' + b.textContent.trim()));
      if (!vb.some(x => x.startsWith('v:are_you_sleeping=')) || !vb.some(x => x.startsWith('v:frei_martinho='))) bad.push('botões de versão: ' + vb.join(' | '));
      const en = page.locator('#song .lang-switch button[data-mode="v:are_you_sleeping"]');
      if (await en.count()) { await en.click(); await sleep(500);
        const note = (await txt(page, '#song .note')).trim();
        if (!/^Versão em inglês: «Are you sleeping» — Tradicional$/i.test(note)) bad.push('nota: «' + note + '»');
        if (!/Brother John/.test(await txt(page, '#song'))) bad.push('a letra da versão não aparece'); }
      await page.evaluate(() => { location.hash = '#/cantico/frei_martinho'; }); await sleep(900);
      const h = await page.evaluate(() => location.hash), on = await page.evaluate(() => document.querySelector('#song .lang-switch button.on')?.dataset.mode);
      if (h !== '#/cantico/frere_jacques') bad.push('#/cantico/frei_martinho não foi para o principal: ' + h);
      if (on !== 'v:frei_martinho') bad.push('a versão pedida não ficou escolhida: ' + on);
    });
    await withApp({ perfil: 'cancioneiro', hash: '#/cantico/frere_jacques' }, async ({ page }) => {
      await page.waitForSelector('#song h1').catch(() => {});
      const vb = await page.evaluate(() => [...document.querySelectorAll('#song .lang-switch button[data-mode^="v:"]')].map(b => b.dataset.mode));
      if (vb.includes('v:are_you_sleeping')) bad.push('perfil Cancioneiro vê a versão do Songbook (fora do Cancioneiro)');
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta' });
  await t('FUN-48', 'Versões e Cancioneiro: perfil Cancioneiro só vê versões do Cancioneiro (frere_jacques: Francês | Português); Maestro, numa versão fora do original, tem #ver-promo «Acrescentar…» → confirmação → «Retirar…»; versões do original sem o botão (v196)', async () => {
    const bad = [];
    await withApp({ perfil: 'cancioneiro', hash: '#/cantico/frere_jacques' }, async ({ page }) => {
      await page.waitForSelector('#song h1').catch(() => {});
      const l = await page.evaluate(() => [...document.querySelectorAll('#song .lang-switch button')].map(b => b.textContent.trim()));
      if (l.join(' | ') !== 'Francês | Português') bad.push('perfil Cancioneiro: seletor «' + l.join(' | ') + '» (esperado «Francês | Português»)');
    });
    await withApp({ perfil: 'maestro', hash: '#/cantico/frere_jacques' }, async ({ page }) => {
      await page.waitForSelector('#song .lang-switch');
      await page.click('#song .lang-switch button[data-mode="v:frei_martinho"]').catch(() => {}); await sleep(400);
      if (await count(page, '#ver-promo')) bad.push('versão do original (frei_martinho) tem #ver-promo');
      await page.click('#song .lang-switch button[data-mode="v:are_you_sleeping"]').catch(() => {}); await sleep(400);
      const t0 = (await txt(page, '#ver-promo')).trim();
      if (t0 !== 'Acrescentar esta versão ao Cancioneiro') { bad.push('#ver-promo: «' + t0 + '»'); return; }
      await page.click('#ver-promo'); await sleep(400);
      if (!(await page.evaluate(() => document.querySelector('#app-dlg').open))) { bad.push('#ver-promo sem confirmação'); return; }
      await page.click('#app-dlg-ok'); await sleep(900);
      const t1 = (await txt(page, '#ver-promo')).trim();
      if (t1 !== 'Retirar esta versão do Cancioneiro') bad.push('depois de acrescentar: «' + t1 + '»');
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });
  await t('FUN-49', 'Ficheiros herdados de uma versão só aparecem com essa versão escolhida: frere_jacques «Francês» sem a.pdf; «Inglês» com «Partitura» que abre o visor (v197)', () => withApp({ perfil: 'coro', hash: '#/cantico/frere_jacques' }, async ({ page }) => {
    await page.waitForSelector('#song .lang-switch');
    if (await count(page, '#song a.pdf')) return 'em «Francês» aparece a partitura da versão inglesa';
    await page.click('#song .lang-switch button[data-mode="v:are_you_sleeping"]'); await sleep(500);
    const a = page.locator('#song a.pdf').first();
    if (!(await a.count())) return 'em «Inglês» não aparece a partitura';
    const href = await a.getAttribute('href');
    if (!/^#\/cantico\/frere_jacques\/partitura(\/\d+)?$/.test(href || '')) return 'ligação da partitura: ' + href;
    await a.click(); await page.waitForSelector('#pdfpages canvas', { timeout: 12000 }).catch(() => {});
    return (await count(page, '#pdfpages canvas')) ? true : 'a partitura da versão não abriu: ' + (await txt(page, '#pdfpages'));
  }), { sev: 'média' });
  await t('FUN-04', 'A−/A+ mudam o tamanho da letra e a escolha fica guardada', () => withApp({ perfil: 'coro', hash: '#/cantico/salve_regina' }, async ({ page }) => {
    const fs0 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fs'));
    await page.click('#font-inc'); await page.click('#font-inc'); await sleep(200);
    const fs1 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fs'));
    if (parseInt(fs1) !== parseInt(fs0) + 4) return `A+ ${fs0} → ${fs1}`;
    for (let i = 0; i < 30; i++) await page.click('#font-dec');
    const min = parseInt(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fs')));
    if (min < 12) return 'A− desce abaixo de 12 px';
    await page.reload(); await page.waitForSelector('#splash.gone', { state: 'attached' }); await sleep(400);
    const fs2 = parseInt(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fs')));
    return fs2 === min || `depois de recarregar: ${fs2} (esperado ${min})`;
  }));
  await t('FUN-05', 'Modo escuro: o botão alterna o tema e fica guardado', () => withApp({ perfil: 'coro', hash: '#/cantico/salve_regina' }, async ({ page }) => {
    const bg0 = await page.evaluate(() => getComputedStyle(document.querySelector('#view-song')).backgroundColor);
    await page.click('#btn-theme'); await sleep(300);
    const th = await page.evaluate(() => document.documentElement.dataset.theme);
    const bg1 = await page.evaluate(() => getComputedStyle(document.querySelector('#view-song')).backgroundColor);
    if (th !== 'dark' || bg0 === bg1) return `tema ${th}, fundo ${bg0} → ${bg1}`;
    await page.click('#btn-theme'); await sleep(200);
    return (await page.evaluate(() => document.documentElement.dataset.theme)) === undefined || 'não volta a seguir o sistema';
  }));
  await t('FUN-06', 'Acordes: Coro vê e esconde acordes; Cancioneiro nunca vê acordes', async () => {
    const coro = await withApp({ perfil: 'coro', hash: '#/cantico/amazing_grace' }, async ({ page }) => {
      await page.waitForSelector('#song h1'); await sleep(300);
      if (!(await vis(page, '#btn-chords'))) return 'Coro: sem botão de acordes';
      const on = await page.evaluate(() => document.querySelector('#song').classList.contains('show-chords'));
      await page.click('#btn-chords'); await sleep(200);
      const off = await page.evaluate(() => document.querySelector('#song').classList.contains('show-chords'));
      return on !== off || 'o botão não alterna os acordes';
    });
    if (coro !== true && coro !== undefined) return typeof coro === 'string' ? coro : coro.fail;
    return withApp({ perfil: 'cancioneiro', hash: '#/cantico/amazing_grace' }, async ({ page }) => {
      await page.waitForSelector('#song h1'); await sleep(300);
      if (await vis(page, '#btn-chords')) return 'Cancioneiro tem botão de acordes';
      return !/\[(G|C|D|Em)\]/.test(await page.evaluate(() => document.querySelector('#song').textContent)) || 'Cancioneiro recebe acordes no texto';
    });
  });
  await t('FUN-07', 'Preferidos (Coro): ☆ marca e desmarca; lista Preferidos atualiza', () => withApp({ perfil: 'coro', hash: '#/cantico/de_colores', favs: [] }, async ({ page }) => {
    await page.waitForSelector('#song h1');
    await page.click('#btn-fav'); await sleep(300);
    if ((await page.getAttribute('#btn-fav', 'aria-pressed')) !== 'true') return 'aria-pressed não passou a true';
    await page.evaluate(() => { location.hash = '#/lista/favoritos'; }); await sleep(600);
    if (!/De Colores/i.test(await txt(page, '#rows'))) return 'não aparece em Preferidos';
    await page.evaluate(() => { location.hash = '#/cantico/de_colores'; }); await sleep(500);
    await page.click('#btn-fav'); await sleep(300);
    return (await page.getAttribute('#btn-fav', 'aria-pressed')) === 'false' || 'não desmarca';
  }));
  await t('FUN-07b', 'Estrela do cântico no Maestro: sempre estrela (sem .book), .on só nos Preferidos (não por estar numa folha), aria-label «Coleções e folhas» e abre #col-pick (v187)', () => withApp({ perfil: 'maestro', hash: '#/cantico/veni_creator_spiritus', favs: ['salve_regina'] }, async ({ page }) => {
    await page.waitForSelector('#song h1');
    const st = () => page.evaluate(() => { const b = document.querySelector('#btn-fav'); return { book: b.classList.contains('book'), on: b.classList.contains('on'), label: b.getAttribute('aria-label') }; });
    let r = await st();
    if (r.book) return '#btn-fav ainda tem .book';
    if (r.on) return 'cântico numa folha mas não nos Preferidos aparece .on';
    if (r.label !== 'Coleções e folhas') return 'aria-label: «' + r.label + '»';
    await page.click('#btn-fav'); await sleep(400);
    if (!(await page.evaluate(() => document.querySelector('#col-pick').open))) return 'não abriu #col-pick';
    await page.click('#col-pick-close'); await sleep(300);
    await page.evaluate(() => { location.hash = '#/cantico/salve_regina'; }); await sleep(600);
    r = await st();
    return r.on || 'cântico nos Preferidos sem .on';
  }));
  await t('FUN-08', 'Menu ☰: abre a gaveta com livros e folhas; fecha no fundo', () => withApp({ perfil: 'maestro' }, async ({ page }) => {
    await page.click('#btn-menu'); await sleep(500);
    if (!(await page.evaluate(() => document.querySelector('#drawer').classList.contains('open')))) return 'gaveta não abriu';
    const t1 = await txt(page, '#az');
    if (!/Preferidos/.test(t1) || !/Missa de domingo/.test(t1)) return 'faltam Preferidos ou folhas: ' + t1.slice(0, 120);
    if (/Folha expirada/.test(t1) === false) { /* Maestro vê expiradas para renovar: verificado em FUN-09 */ }
    await page.mouse.click(W - 10, H / 2); await sleep(500);
    return !(await page.evaluate(() => document.querySelector('#drawer').classList.contains('open'))) || 'gaveta não fecha ao tocar fora';
  }));
  await t('FUN-09', 'Folhas por perfil: Coro vê a do Coro; Cancioneiro só a do Cancioneiro; expirada só para Maestro', async () => {
    const seen = {};
    for (const perfil of ['cancioneiro', 'coro', 'maestro']) {
      seen[perfil] = await withApp({ perfil }, async ({ page }) => { await page.click('#btn-menu'); await sleep(500); return { pass: await txt(page, '#az') }; }).then(r => r.pass || '');
    }
    const bad = [];
    if (/Missa de domingo/.test(seen.cancioneiro)) bad.push('Cancioneiro vê folha do Coro');
    if (!/Encontro de jovens/.test(seen.cancioneiro)) bad.push('Cancioneiro não vê a sua folha');
    if (!/Missa de domingo/.test(seen.coro)) bad.push('Coro não vê a folha do Coro');
    if (/Folha expirada/.test(seen.coro)) bad.push('Coro vê folha expirada');
    return bad.length ? bad.join('; ') : true;
  });
  await t('FUN-10', 'Folha publicada (Maestro): secções e cânticos só de leitura; .col-edit-bar na 1.ª linha (v208) com «Editar folha» e, à direita, button.edit-btn.col-share «Partilhar» (v215, fora do título)', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1' }, async ({ page }) => {
    await page.waitForSelector('#rows li'); await sleep(300);
    const s = await txt(page, '#rows');
    if (!/Entrada/.test(s) || !/Comunhão/.test(s) || !/Veni Creator/i.test(s)) return 'conteúdo da folha: ' + s.slice(0, 150);
    if (!/Editar folha/.test(await txt(page, '#col-mode'))) return 'botão: «' + (await txt(page, '#col-mode')) + '»';
    // v208: a barra de edição é a 1.ª linha; v215: «Partilhar» é um botão com texto na barra, à direita de «Editar folha», fora do título
    if (!(await page.evaluate(() => { const b = document.querySelector('#rows > li.col-edit-bar'); return !!b && b === document.querySelector('#rows > li') && b.contains(document.querySelector('#col-mode')); }))) return '«Editar folha» não está na .col-edit-bar da 1.ª linha';
    if (!(await vis(page, '#col-share'))) return 'falta partilhar';
    const sh = await page.evaluate(() => { const b = document.querySelector('#col-share'), m = document.querySelector('#col-mode'); return { cls: b.matches('button.edit-btn.col-share'), txt: b.textContent.trim(), bar: !!b.closest('.col-edit-bar'), title: !!b.closest('#list-title'), right: b.getBoundingClientRect().left >= m.getBoundingClientRect().right - 1 }; });
    if (!sh.cls || sh.txt !== 'Partilhar' || !sh.bar || sh.title || !sh.right) return '«Partilhar»: ' + JSON.stringify(sh);
    for (const sel of ['#col-set', 'li.col-add', 'li[data-key]']) if (await count(page, '#rows ' + sel)) return 'na folha há ' + sel;
    return (await page.evaluate(() => document.body.classList.contains('col-editing'))) ? 'body.col-editing ainda existe' : true;
  }));
  await t('FUN-11', 'Nova folha: público segmentado, «Criar» abre logo a edição; a folha aparece na gaveta (v164)', () => withApp({ perfil: 'maestro' }, async ({ page }) => {
    await page.click('#btn-menu'); await sleep(500);
    await page.click('.col-new'); await sleep(500);
    if (!(await page.evaluate(() => document.querySelector('#col-dlg').open))) return 'diálogo não abriu';
    if (await count(page, '#col-del')) return 'Nova folha ainda tem «Apagar»';
    if ((await txt(page, '#col-save')).trim() !== 'Criar') return 'botão: «' + (await txt(page, '#col-save')) + '»';
    if ((await count(page, '#col-aud button[data-v]')) !== 2) return 'público não é segmentado';
    await page.click('#col-aud button[data-v="cancioneiro"]'); await sleep(200);
    await page.fill('#col-name', 'Folha de teste automática');
    await page.click('#col-save'); await sleep(900);
    if (!(await page.evaluate(() => document.querySelector('#col-ed').open))) return '«Criar» não abriu a edição';
    await page.click('#ce-cancel'); await sleep(400);
    if (await page.evaluate(() => document.querySelector('#app-dlg').open)) { await page.click('#app-dlg-ok'); await sleep(300); }
    await page.click('#btn-menu'); await sleep(500);
    return /Folha de teste automática/.test(await txt(page, '#az')) || 'folha nova não aparece na gaveta';
  }));
  await t('FUN-12', 'Template só no diálogo «Nova folha» (#col-tpl-sel, com «Criar ou mudar templates…»); a janela de edição não tem template', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1' }, async ({ page }) => {
    await page.click('#btn-menu'); await sleep(400); await page.click('.col-new'); await sleep(500);
    if (!(await vis(page, '#col-tpl-sel'))) return 'Nova folha sem escolha de template';
    const opts = await page.evaluate(() => [...document.querySelectorAll('#col-tpl-sel option')].map(o => o.textContent));
    if (!opts.some(o => /Criar ou mudar templates/.test(o))) return 'falta «Criar ou mudar templates…»: ' + opts.join(' | ');
    await page.click('#col-cancel'); await sleep(300);
    await page.click('#col-mode'); await sleep(500);
    return !(await page.evaluate(() => !!document.querySelector('#col-ed select[id*="tpl"], #col-ed #col-tpl-sel'))) || 'a edição tem escolha de template';
  }), { sev: 'média' });
  await t('FUN-13', 'Novo cântico (Coro): formulário, guardar, aparece em Novos Cânticos por aprovar', () => withApp({ perfil: 'coro', hash: '#/lista/livro-novos' }, async ({ page }) => {
    await page.waitForSelector('#novo-cantico'); await page.click('#novo-cantico'); await sleep(600);
    if (!(await page.evaluate(() => document.querySelector('#song-new').open))) return 'formulário não abriu';
    await page.fill('#sn-title', 'Cântico de teste automático');
    await page.fill('#sn-text', 'Primeira linha de teste\nSegunda linha\n\nR: Refrão de teste');
    await page.click('#sn-save'); await sleep(1500);
    // pode pedir confirmação de parecidos
    if (await page.evaluate(() => document.querySelector('#app-dlg').open)) { await page.click('#app-dlg-ok'); await sleep(1000); }
    await page.evaluate(() => { location.hash = '#/'; }); await sleep(300);
    await page.evaluate(() => { location.hash = '#/lista/livro-novos'; }); await sleep(800);
    const s = await txt(page, '#rows');
    if (!/Cântico de teste automático/.test(s)) return 'não aparece em Novos Cânticos: ' + s.slice(0, 100);
    // v177: a marca «por aprovar» fica dentro de .n (por cima do número), não em .t
    const where = await page.evaluate(() => { const li = [...document.querySelectorAll('#rows li')].find(l => /Cântico de teste automático/.test(l.textContent)); if (!li) return null; const n = li.querySelector('.n'); const pend = n && n.querySelector('.pend'); return { n: !!pend, t: !!li.querySelector('.t .pend'), num: n ? n.textContent.replace(pend ? pend.textContent : '', '').trim() : '' }; });
    if (!where || !where.n) return '«por aprovar» não está em .n';
    if (where.num) return `cântico por aprovar mostra o número «${where.num}» (v179: só a etiqueta)`;
    return where.t ? '«por aprovar» ainda em .t' : true;
  }));
  await t('FUN-13b', 'Novo cântico de um Maestro também fica por aprovar (v165)', () => withApp({ perfil: 'maestro', hash: '#/lista/livro-novos' }, async ({ page }) => {
    await page.waitForSelector('#novo-cantico'); await page.click('#novo-cantico'); await sleep(600);
    await page.fill('#sn-title', 'Cântico de teste do Maestro'); await page.fill('#sn-text', 'Linha um\nLinha dois');
    await page.click('#sn-save'); await sleep(1500);
    if (await page.evaluate(() => document.querySelector('#app-dlg').open)) { await page.click('#app-dlg-ok'); await sleep(1000); }
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('cancioneiro.demo.novos') || '[]').find(x => x.title === 'Cântico de teste do Maestro'));
    return !n ? 'não foi acrescentado' : n.approved === false || 'ficou aprovado logo';
  }));
  await t('FUN-13c', 'Apagar cântico novo aprovado: só em «Editar cântico» (#sn-del, com confirmação) e volta a Novos Cânticos; sem #song-reject na página; #sn-del escondido em cânticos que não são novos (v166)', () => withApp({ perfil: 'maestro', hash: '#/cantico/novo_teste_aprovado', storage: { 'cancioneiro.demo.novos': [{ slug: 'novo_teste_aprovado', number: 9100, title: 'Cântico novo de teste (aprovado)', author: null, language: 'pt', lyrics: [{ type: 'verse', lines: ['Linha de teste'] }], translation: null, cancioneiro: false, approved: true, added_by: 'demo@localhost', sources: [{ source: 'novos' }], tags: [], files: [] }] } }, async ({ page }) => {
    await page.waitForSelector('#song h1');
    if (await count(page, '#song-reject')) return 'a página do cântico aprovado ainda tem #song-reject';
    await page.click('#btn-edit'); await sleep(600);
    if (!(await vis(page, '#sn-del'))) return '«Editar cântico» sem #sn-del num cântico novo';
    await page.click('#sn-del'); await sleep(400);
    if (!(await page.evaluate(() => document.querySelector('#app-dlg').open))) return 'apagar não pediu confirmação';
    await page.click('#app-dlg-ok'); await sleep(1200);
    if (!/#\/lista\/livro-novos$/.test(await page.evaluate(() => location.hash))) return 'depois de apagar não foi para Novos Cânticos: ' + await page.evaluate(() => location.hash);
    if (await page.evaluate(() => JSON.parse(localStorage.getItem('cancioneiro.demo.novos') || '[]').some(x => x.slug === 'novo_teste_aprovado'))) return 'o cântico não foi apagado';
    const other = await withApp({ perfil: 'maestro', hash: '#/cantico/amazing_grace' }, async ({ page: p2 }) => { await p2.waitForSelector('#btn-edit'); await p2.click('#btn-edit'); await sleep(500); return { pass: String(await vis(p2, '#sn-del')) }; });
    return other.pass === 'false' || '#sn-del visível num cântico que não é novo';
  }), { sev: 'média' });
  await t('FUN-14', 'Editar letra (Maestro): editor abre, guarda e mostra «Letra editada» com Repor original', () => withApp({ perfil: 'maestro', hash: '#/cantico/amazing_grace' }, async ({ page }) => {
    await page.waitForSelector('#btn-edit'); await page.click('#btn-edit'); await sleep(600);
    if (!(await page.evaluate(() => document.querySelector('#editor').open || document.querySelector('#song-new').open))) return 'editor não abriu';
    const ta = (await page.evaluate(() => document.querySelector('#editor').open)) ? '#edit-text' : '#sn-text';
    await page.fill(ta, 'Linha editada pelo teste\n\nR: refrão editado');
    await page.click(ta === '#edit-text' ? '#edit-save' : '#sn-save'); await sleep(1200);
    const s = await txt(page, '#song');
    return /Linha editada pelo teste/.test(s) || 'a letra editada não aparece: ' + s.slice(0, 120);
  }));
  await t('FUN-15', 'Gravações: tocar abre o mini-leitor; parar fecha-o', () => withApp({ perfil: 'coro', hash: '#/cantico/salve_regina' }, async ({ page }) => {
    await page.waitForSelector('#song button.rec'); await page.click('#song button.rec'); await sleep(1500);
    if (!(await vis(page, '#mini-player'))) return 'mini-leitor não aparece';
    await page.click('#mini-stop'); await sleep(500);
    return !(await vis(page, '#mini-player')) || 'mini-leitor não fecha';
  }));
  await t('FUN-16', 'Partitura: visor PDF desenha a página, zoom +/− e Voltar', () => withApp({ perfil: 'coro', hash: '#/cantico/adoro_te_devote/partitura' }, async ({ page }) => {
    await page.waitForSelector('#pdfpages canvas', { timeout: 12000 }).catch(() => {});
    if (!(await count(page, '#pdfpages canvas'))) return 'nenhuma página desenhada: ' + (await txt(page, '#pdfpages'));
    const w0 = await page.evaluate(() => document.querySelector('#pdfpages canvas').getBoundingClientRect().width);
    await page.click('#pdf-zoom-in'); await sleep(800);
    const w1 = await page.evaluate(() => document.querySelector('#pdfpages canvas').getBoundingClientRect().width);
    if (!(w1 > w0)) return `zoom + não ampliou (${w0} → ${w1})`;
    await page.click('#pdf-back'); await sleep(600);
    return (await page.evaluate(() => document.querySelector('#pdfview').hidden && /#\/cantico\/adoro_te_devote$/.test(location.hash))) || 'Voltar não regressa ao cântico';
  }));
  await t('FUN-50', 'Descarregar partitura (#pdf-download) em todas as partituras: PDF tal como está (título.pdf), página de livro junta num PDF (pdf-lib), ao mudar de partitura o ficheiro é o da nova, erro de rede → #app-dlg (v199)', async () => {
    const bad = [];
    const grab = async page => {
      const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await page.click('#pdf-download');
      const d = await dl; if (!d) return null;
      return { name: d.suggestedFilename(), head: fs.readFileSync(await d.path()).subarray(0, 5).toString() };
    };
    const openScore = async (page, slug) => {
      // como a pessoa faz: volta ao cântico e abre a partitura (de uma partitura não se salta diretamente para outra)
      if (await page.evaluate(() => !document.querySelector('#pdfview').hidden)) { await page.click('#pdf-back'); await sleep(600); }
      await page.evaluate(s => { location.hash = '#/cantico/' + s; }, slug); await page.waitForSelector('#song h1', { timeout: 8000 }).catch(() => {});
      await page.evaluate(s => { location.hash = '#/cantico/' + s + '/partitura'; }, slug);
      await page.waitForSelector('#pdfpages canvas', { timeout: 15000 }).catch(() => {});
      return (await count(page, '#pdfpages canvas')) > 0;
    };
    // computador (sem toque): descarrega; PDF simples, depois página de livro, depois de novo o primeiro
    await withApp({ perfil: 'coro', hash: '#/cantico/adoro_te_devote', isMobile: false, hasTouch: false }, async ({ page }) => {
      if (!(await openScore(page, 'adoro_te_devote'))) { bad.push('adoro_te_devote: partitura não abriu'); return; }
      if (!(await vis(page, '#pdf-download'))) { bad.push('partitura normal sem #pdf-download'); return; }
      const a = await grab(page);
      if (!a) bad.push('adoro_te_devote: sem descarga'); else { if (a.head !== '%PDF-') bad.push('adoro_te_devote: não é PDF'); if (!/^Adoro-te-devote\.pdf$/i.test(a.name)) bad.push('nome «' + a.name + '» (esperado Adoro-te-devote.pdf)'); }
      if (!(await openScore(page, 'amazing_grace'))) { bad.push('amazing_grace (página do Songbook): partitura não abriu — ' + (await txt(page, '#pdfpages')).slice(0, 80) + ' / visor ' + (await page.evaluate(() => document.querySelector('#pdfview').hidden ? 'fechado' : 'aberto'))); return; }
      if (!(await vis(page, '#pdf-download'))) { bad.push('página de livro sem #pdf-download'); return; }
      const b = await grab(page);
      if (!b) bad.push('amazing_grace: sem descarga'); else { if (b.head !== '%PDF-') bad.push('página de livro: não é PDF'); if (!/^Amazing-Grace\.pdf$/i.test(b.name)) bad.push('ao mudar de partitura o ficheiro é «' + b.name + '» (esperado Amazing-Grace.pdf)'); }
    });
    // erro de rede ao descarregar → janela da app (sem erro JS)
    await withApp({ perfil: 'coro', hash: '#/cantico/adoro_te_devote', isMobile: false, hasTouch: false }, async ({ page }) => {
      if (!(await openScore(page, 'adoro_te_devote'))) { bad.push('erro de rede: partitura não abriu'); return; }
      await page.route(u => /\.pdf(\?|#|$)/.test(u.pathname || String(u)), r => r.abort());
      await page.click('#pdf-download'); await sleep(1500);
      const dlg = await page.evaluate(() => document.querySelector('#app-dlg')?.open ? document.querySelector('#app-dlg').textContent.replace(/\s+/g, ' ').trim() : '');
      if (!/descarregar/i.test(dlg)) bad.push('sem rede: sem aviso em #app-dlg (' + (dlg || 'nada') + ')');
    });
    // telemóvel: folha de partilha com o ficheiro
    await withApp({ perfil: 'coro', hash: '#/cantico/adoro_te_devote' }, async ({ page }) => {
      if (!(await openScore(page, 'adoro_te_devote'))) { bad.push('telemóvel: partitura não abriu'); return; }
      if (!(await page.evaluate(() => matchMedia('(pointer: coarse)').matches))) { bad.push('telemóvel: contexto sem pointer coarse (teste)'); return; }
      await page.evaluate(() => { navigator.canShare = () => true; navigator.share = d => { window.__sh = (d.files || []).map(f => f.name + ':' + f.type + ':' + f.size).join(','); return Promise.resolve(); }; });
      await page.click('#pdf-download'); await sleep(1500);
      const sh = await page.evaluate(() => window.__sh || '');
      if (!/^Adoro-te-devote\.pdf:application\/pdf:\d+/i.test(sh)) bad.push('telemóvel: partilha «' + (sh || 'nada') + '»');
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });
  await t('FUN-17', 'Partilhar cântico: gera endereço #/p/<código> (copiado ou mostrado)', () => withApp({ perfil: 'coro', hash: '#/cantico/salve_regina', permissions: ['clipboard-read', 'clipboard-write'] }, async ({ page }) => {
    await page.waitForSelector('#song h1');
    await page.evaluate(() => { navigator.share = d => { window.__shared = d && d.url; return Promise.resolve(); }; });
    await page.click('#btn-share'); await sleep(800);
    // Coro escolhe entre «Copiar letra» e «Partilhar/Copiar endereço»
    if (await page.evaluate(() => document.querySelector('#app-dlg').open && !document.querySelector('#app-dlg-list').hidden)) {
      await page.locator('#app-dlg-list button').filter({ hasText: /endereço/i }).first().click(); await sleep(1200);
    }
    const nat = await page.evaluate(() => window.__shared || '');
    if (/#\/p\/demo_salve_regina/.test(nat)) return { pass: 'menu de partilha: ' + nat.replace(/^.*#/, '#') };
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    const dlg = await page.evaluate(() => (document.querySelector('#app-dlg-input')?.value || '') + ' ' + document.querySelector('#app-dlg-msg')?.textContent);
    return /#\/p\/demo_salve_regina/.test(clip + dlg) || `endereço não encontrado (clipboard «${clip.slice(0, 80)}», diálogo «${dlg.slice(0, 80)}»)`;
  }));
  await t('FUN-17b', 'Partilhar letra (Coro): copia sempre; com menu de partilha chama-se «Partilhar letra» e abre navigator.share({title,text}); sem menu, «Copiar letra» e aviso «Letra copiada» (v188)', async () => {
    const bad = [];
    // telemóvel (ecrã tátil): menu de partilha
    await withApp({ perfil: 'coro', hash: '#/cantico/salve_regina', permissions: ['clipboard-read', 'clipboard-write'] }, async ({ page }) => {
      await page.waitForSelector('#song h1');
      await page.evaluate(() => { navigator.share = d => { window.__share = d; return Promise.resolve(); }; });
      await page.click('#btn-share'); await sleep(500);
      const opt = page.locator('#app-dlg-list button').filter({ hasText: /letra/i }).first();
      const label = (await opt.textContent().catch(() => '')).trim();
      if (!/^Partilhar letra/.test(label)) bad.push('telemóvel: opção «' + label + '» (esperado «Partilhar letra»)');
      await opt.click().catch(() => {}); await sleep(800);
      const sh = await page.evaluate(() => window.__share || null), clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
      if (!sh || !sh.title || !/misericordiae/i.test(sh.text || '')) bad.push('telemóvel: navigator.share sem title/text da letra');
      if (!/misericordiae/i.test(clip)) bad.push('telemóvel: a letra não foi copiada');
    });
    // computador (sem ecrã tátil, Chromium): copia e avisa
    await withApp({ perfil: 'coro', hash: '#/cantico/salve_regina', isMobile: false, hasTouch: false, permissions: ['clipboard-read', 'clipboard-write'] }, async ({ page }) => {
      await page.waitForSelector('#song h1');
      await page.click('#btn-share'); await sleep(500);
      const opt = page.locator('#app-dlg-list button').filter({ hasText: /letra/i }).first();
      const label = (await opt.textContent().catch(() => '')).trim();
      if (!/^Copiar letra/.test(label)) bad.push('computador: opção «' + label + '» (esperado «Copiar letra»)');
      await opt.click().catch(() => {}); await sleep(800);
      const dlg = await page.evaluate(() => document.querySelector('#app-dlg').open ? document.querySelector('#app-dlg').textContent : '');
      if (!/Letra copiada/.test(dlg)) bad.push('computador: sem aviso «Letra copiada»');
      if (!/misericordiae/i.test(await page.evaluate(() => navigator.clipboard.readText().catch(() => '')))) bad.push('computador: a letra não foi copiada');
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });
  await t('FUN-18', 'Endereço partilhado sem conta: só letra (sem acordes) e tradução, com botão de entrar', () => withApp({ q: 'semconta', hash: '#/p/demo_amazing_grace', wait: '#song h1' }, async ({ page }) => {
    const s = await page.evaluate(() => document.querySelector('#song').textContent);
    if (!/Amazing Grace/.test(s)) return 'cântico partilhado não abriu';
    if (/\[(G|C|D)\]/.test(s)) return 'mostra acordes a quem não tem conta';
    return true;
  }));
  await t('FUN-19', 'Endereço partilhado inválido: mensagem clara (sem ecrã em branco)', () => withApp({ q: 'semconta', hash: '#/p/demo_nao_existe', wait: false, settle: 3500 }, async ({ page }) => {
    const s = await page.evaluate(() => document.body.innerText);
    return /já não é válido|não está disponível|inválid/i.test(s) || 'sem mensagem: ' + s.slice(0, 120);
  }));
  await t('FUN-20', 'Folha partilhada sem conta: lista com secções e abre cânticos', () => withApp({ q: 'semconta', hash: '#/p/demoC_demo1', wait: '#rows li' }, async ({ page }) => {
    const s = await txt(page, '#rows');
    if (!/Entrada/.test(s) || !/Veni Creator/i.test(s)) return 'lista da folha: ' + s.slice(0, 120);
    await page.locator('#rows li a').filter({ hasText: /Veni Creator/i }).first().click(); await sleep(1500);
    return /Veni Creator/i.test(await txt(page, '#song h1')) || 'cântico da folha não abriu';
  }));
  await t('FUN-21', 'Gestão de utilizadores: Gestor vê utilizadores e pedidos; Coro não tem acesso', async () => {
    const g = await withApp({ perfil: 'gestor', hash: '#/gestao' }, async ({ page }) => {
      await sleep(800); const s = await txt(page, '#admin');
      return /novo@exemplo\.pt/.test(s) && /coro@exemplo\.pt/.test(s) || 'Gestor: ' + s.slice(0, 120);
    });
    if (g !== true && g !== undefined) return g;
    return withApp({ perfil: 'coro', hash: '#/gestao' }, async ({ page }) => {
      await sleep(800); const s = await txt(page, '#admin');
      return !/coro@exemplo\.pt/.test(s) || 'Coro vê a lista de utilizadores';
    });
  });
  await t('FUN-22', 'Perfil: menu mostra só perfis até ao da pessoa; mudar de perfil esconde funções', () => withApp({ perfil: 'maestro' }, async ({ page }) => {
    await page.click('#btn-perfil'); await sleep(500);
    const opts = await page.locator('#perfis-list .perfil-opt').count();
    if (opts !== 3) return `Maestro vê ${opts} perfis (esperado 3)`;
    await page.locator('#perfis-list .perfil-opt[data-p="cancioneiro"]').click(); await sleep(600);
    await page.evaluate(() => { location.hash = '#/cantico/amazing_grace'; }); await sleep(800);
    return !(await vis(page, '#btn-edit')) && !(await vis(page, '#btn-chords')) || 'no perfil Cancioneiro ainda há Editar / acordes';
  }));
  await t('FUN-23', 'Terminar sessão: volta ao ecrã de entrada e limpa a lista', () => withApp({ perfil: 'coro' }, async ({ page }) => {
    await page.evaluate(() => document.querySelector('#info').showModal());
    await page.click('#btn-logout'); await sleep(800);
    if (!(await vis(page, '#view-login'))) return 'ecrã de entrada não aparece';
    return !(await page.evaluate(() => localStorage.getItem('cancioneiro.songs.v2'))) || 'a lista guardada não foi apagada';
  }));
  await t('FUN-24', 'Ecrã de entrada (sem sessão): botão Google e ligação de privacidade', () => withApp({ q: 'semconta', wait: '#view-login:not([hidden])' }, async ({ page }) => {
    if (!(await vis(page, '#btn-google'))) return 'sem botão Google';
    return (await page.getAttribute('#view-login a[href="privacidade.html"]', 'href')) === 'privacidade.html' || 'sem ligação de privacidade';
  }));
  await t('FUN-24b', 'Regresso do Google (?code=): a capa fica ~2 s como numa abertura normal (v173)', () => withApp({ perfil: 'coro', q: 'code=teste-regresso', wait: false, settle: 0 }, async ({ page }) => {
    const t0 = Date.now();
    await page.waitForSelector('#splash.gone', { state: 'attached', timeout: 15000 });
    const ms = Date.now() - t0;
    return ms >= 1500 ? { pass: ms + ' ms' } : `a capa saiu em ${ms} ms (esperado ≈ 2 s)`;
  }, ), { sev: 'baixa' });
  await t('FUN-25', 'Tutorial: aparece na 1.ª vez e «Saltar» fecha-o sem voltar a aparecer', () => withApp({ perfil: 'coro', tour: true, settle: 1500 }, async ({ page }) => {
    if (!(await vis(page, '.tour-box'))) return 'tutorial não apareceu';
    await page.click('.tour-skip'); await sleep(500);
    if (await vis(page, '.tour-box')) return 'Saltar não fechou';
    await page.reload(); await page.waitForSelector('#splash.gone', { state: 'attached' }); await sleep(1500);
    return !(await vis(page, '.tour-box')) || 'tutorial voltou a aparecer';
  }), { sev: 'média' });
  await t('FUN-51', 'Microfone só com can_listen (v201): sem permissão #btn-mic e .listen-only escondidos e o tutorial salta o passo do microfone; com permissão aparecem (modo real simulado); no ?demo sempre ativo', async () => {
    const bad = [];
    const tourMsgs = async page => {
      const seen = [];
      for (let i = 0; i < 25; i++) {
        const m = await page.evaluate(() => document.querySelector('.tour-msg')?.textContent || '');
        if (!m || seen.includes(m)) break; seen.push(m);
        const next = page.locator('.tour-nav button').last(); if (!(await next.count())) break;
        await next.click().catch(() => {}); await sleep(600);
      }
      return seen;
    };
    const shown = page => page.evaluate(() => ({ cls: document.body.classList.contains('can-listen'), mic: (e => !!e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none')(document.querySelector('#btn-mic')), help: [...document.querySelectorAll('.listen-only')].map(e => getComputedStyle(e).display !== 'none') }));
    for (const on of [false, true]) await withApp({ real: { canListen: on }, wait: '#rows li a', timeout: 20000 }, async ({ page, calls }) => {
      await sleep(800);
      const s = await shown(page), k = on ? 'com' : 'sem';
      if (!calls.some(c => /rpc\/can_listen/.test(c))) bad.push(k + ': a app não pediu rpc/can_listen');
      if (s.cls !== on) bad.push(`${k}: body.can-listen=${s.cls}`);
      if (s.mic !== on) bad.push(`${k}: #btn-mic ${s.mic ? 'visível' : 'escondido'}`);
      if (s.help.some(x => x !== on)) bad.push(`${k}: .listen-only ${on ? 'escondido' : 'visível'} (estilo calculado)`);
      const st = await page.evaluate(() => Object.keys(localStorage).filter(x => x.startsWith('cancioneiro.listen.')).map(x => x + '=' + localStorage.getItem(x)));
      if (!st.some(x => x.endsWith('=' + on))) bad.push(`${k}: valor não guardado (cancioneiro.listen.*: ${st.join(',') || 'nada'})`);
    });
    // tutorial: 1.ª abertura (sem valor guardado) e abertura com o valor já guardado no telemóvel
    const LK = 'cancioneiro.listen.11111111-1111-4111-8111-111111111111';
    for (const [on, cached] of [[false, false], [true, false], [true, true]]) await withApp({ real: { canListen: on }, tour: true, storage: cached ? { [LK]: on } : {}, wait: '#rows li a', timeout: 20000, settle: 1500 }, async ({ page }) => {
      const msgs = await tourMsgs(page), mic = msgs.some(m => /microfone/i.test(m));
      const k = `tutorial ${on ? 'com' : 'sem'} permissão${cached ? ' (já guardada)' : ' (1.ª abertura)'}`;
      if (!msgs.length) bad.push(k + ': não apareceu no modo real');
      else if (mic !== on) bad.push(`${k}: passo do microfone ${mic ? 'presente' : 'ausente'}`);
    });
    await withApp({ perfil: 'coro' }, async ({ page }) => { const s = await shown(page); if (!s.cls || !s.mic) bad.push('?demo: microfone escondido'); });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });
  await t('FUN-26', 'Instalar a app: linha «Adicionar ao ecrã principal» no Perfil e na Informação', () => withApp({ perfil: 'coro', storage: { 'cancioneiro.instalada': 0 } }, async ({ page }) => {
    await page.click('#btn-perfil'); await sleep(400);
    const a = await vis(page, '#perfis-install');
    await page.click('#perfil-info').catch(() => {}); await sleep(400);
    const b = await vis(page, '#info-install');
    return a || b || 'sem proposta de instalação';
  }), { sev: 'baixa' });
  await t('FUN-27', 'Pesquisa por voz: abre a janela «A ouvir», mostra línguas e Cancelar fecha (sem transcrever)', () => withApp({ perfil: 'coro', permissions: ['microphone'] }, async ({ page, calls }) => {
    await page.click('#btn-mic'); await sleep(1200);
    if (!(await vis(page, '#listen'))) return 'janela de escuta não abriu';
    const langs = await count(page, '#listen-langs button');
    await page.click('#listen-cancel'); await sleep(500);
    if (await vis(page, '#listen')) return 'Cancelar não fechou';
    return langs > 0 || { warn: 'sem botões de língua' };
  }), { sev: 'média' });
  if (full) {
    await t('FUN-28', 'Exportar PDF de uma folha (pdf-lib): abre no visor e «Descarregar» dá um PDF', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1' }, async ({ page }) => {
      await page.waitForSelector('#col-share'); await page.click('#col-share'); await sleep(500);
      await page.locator('#app-dlg-list button').filter({ hasText: /Gerar PDF/ }).filter({ hasNotText: /Coro/ }).first().click(); await sleep(500);
      // v204: «Gerar PDF» abre as opções (acordes / partituras)
      if (await page.evaluate(() => !!document.querySelector('#app-dlg[open] #pdf-o-chords'))) { await page.click('#app-dlg-ok'); }
      await page.waitForSelector('#pdfpages canvas', { timeout: 20000 }).catch(() => {});
      if (!(await count(page, '#pdfpages canvas'))) return 'PDF não apareceu no visor: ' + (await txt(page, '#pdfpages')).slice(0, 100);
      if (!(await vis(page, '#pdf-download'))) return 'sem botão Descarregar';
      await page.evaluate(() => { navigator.share = d => { window.__pdf = d && d.files ? d.files.map(f => f.type + ':' + f.size).join(',') : 'share'; return Promise.resolve(); }; navigator.canShare = () => true; });
      const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
      await page.click('#pdf-download');
      const d = await dl;
      if (d) { const head = fs.readFileSync(await d.path()).subarray(0, 5).toString(); return head === '%PDF-' ? { pass: d.suggestedFilename() } : 'descarregado mas não é PDF'; }
      const sh = await page.evaluate(() => window.__pdf || '');
      return /pdf/.test(sh) ? { pass: 'partilhado ' + sh } : 'Descarregar não produziu ficheiro';
    }), { sev: 'média' });
    await t('FUN-29', 'Rotas: endereços desconhecidos e cânticos inexistentes não partem a app', () => withApp({ perfil: 'coro', hash: '#/lista/nao-existe' }, async ({ page }) => {
      await page.evaluate(() => { location.hash = '#/cantico/nao_existe_xyz'; }); await sleep(800);
      await page.evaluate(() => { location.hash = '#/qualquer/coisa'; }); await sleep(500);
      await page.evaluate(() => { location.hash = '#/cantico/%E0%A4%A'; }); await sleep(500);
      return true;
    }));
    await t('FUN-30', 'Ligação direta a um cântico sobrevive a recarregar a página', () => withApp({ perfil: 'coro', hash: '#/cantico/de_colores' }, async ({ page }) => {
      await page.reload(); await page.waitForSelector('#song h1', { timeout: 10000 });
      return /De Colores/i.test(await txt(page, '#song h1')) || 'cântico não reabriu';
    }));
    await t('FUN-31', 'Categorias e livros: lista latim, Songbook, Novos Cânticos', () => withApp({ perfil: 'coro', hash: '#/lista/la' }, async ({ page }) => {
      const a = await count(page, '#rows li a');
      await page.evaluate(() => { location.hash = '#/lista/livro-songbook'; }); await sleep(600);
      const b = await count(page, '#rows li a');
      return a > 0 && b > 0 || `latim ${a}, songbook ${b}`;
    }), { sev: 'média' });
    await t('FUN-31b', 'Novos Cânticos: filtro Todos / Por aprovar / Só no Coro / No Cancioneiro, por esta ordem (v178/v180)', () => withApp({ perfil: 'maestro', hash: '#/lista/livro-novos' }, async ({ page }) => {
      await page.waitForSelector('#novos-filtro', { timeout: 8000 }).catch(() => {});
      const o = await page.evaluate(() => [...document.querySelectorAll('#novos-filtro option')].map(x => x.value + '=' + x.textContent.trim()));
      const want = ['todos=Todos', 'pendentes=Por aprovar', 'so-coro=Só no Coro', 'canc=No Cancioneiro']; // ordem da v180
      return JSON.stringify(o) === JSON.stringify(want) || 'opções: ' + o.join(' | ');
    }), { sev: 'baixa' });
    await t('FUN-32', 'Aprovar cântico novo (Maestro): «Aprovar para…» (Cancioneiro / Coro); Cancelar não aprova; aprovar põe sempre no Coro e, para o Cancioneiro, também promove (v172)', () => withApp({ perfil: 'maestro', hash: '#/cantico/novo_teste_pendente', storage: { 'cancioneiro.demo.novos': [{ slug: 'novo_teste_pendente', number: 9101, title: 'Cântico novo de teste (pendente)', author: null, language: 'pt', lyrics: [{ type: 'verse', lines: ['Linha de teste'] }], translation: null, cancioneiro: false, approved: false, added_by: 'outra@example.invalid', sources: [{ source: 'novos' }], tags: [], files: [] }] } }, async ({ page }) => {
      const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('cancioneiro.demo.novos') || '[]').find(x => x.slug === 'novo_teste_pendente'));
      await page.waitForSelector('#song-approve');
      // v177: «Recusar» é um botão vermelho cheio
      if (!(await page.evaluate(() => document.querySelector('#song-reject')?.matches('.edit-btn.danger-btn')))) return '#song-reject não tem .edit-btn.danger-btn';
      await page.click('#song-approve'); await sleep(400);
      const opts = await page.evaluate(() => document.querySelector('#app-dlg').open ? [...document.querySelectorAll('#app-dlg-list button')].map(b => b.textContent.trim()) : null);
      if (!opts) return 'Aprovar não abriu a escolha';
      if (opts.length < 2 || !/^Cancioneiro/.test(opts[0]) || !/^Coro/.test(opts[1])) return 'opções (1.ª Cancioneiro, 2.ª Coro): ' + opts.join(' | ');
      await page.click('#app-dlg-cancel'); await sleep(500);
      if ((await stored()).approved !== false) return 'Cancelar aprovou';
      await page.click('#song-approve'); await sleep(400);
      // v181: depois da escolha há uma confirmação («Aprovar» ou «Aprovar mesmo assim»); Cancelar não aprova
      await page.locator('#app-dlg-list button').nth(0).click(); await sleep(500);
      const conf = await page.evaluate(() => document.querySelector('#app-dlg').open ? document.querySelector('#app-dlg-ok').textContent.trim() : '');
      if (!/^Aprovar/.test(conf)) return 'sem confirmação «Aprovar» depois de escolher (v181): «' + conf + '»';
      await page.click('#app-dlg-cancel'); await sleep(500);
      if ((await stored()).approved !== false) return 'Cancelar na confirmação aprovou';
      await page.click('#song-approve'); await sleep(400);
      await page.locator('#app-dlg-list button').nth(0).click(); await sleep(500); // 1.ª linha = Cancioneiro (o subtítulo menciona o Coro)
      await page.click('#app-dlg-ok'); await sleep(1200); // v172: aprovar põe sempre no Coro; Cancioneiro também promove
      const s = await stored();
      if (s.approved !== true) return 'não ficou aprovado';
      if (!(s.sources || []).some(x => x.source === 'coro_clu')) return 'aprovado para o Cancioneiro mas não ficou no Coro (v172: aprovar põe sempre no Coro)';
      // desde v165 o livro já não aparece como texto na página do cântico (está em #col-pick): verifica-se o estado guardado
      if (s.cancioneiro !== true) return 'aprovado para o Cancioneiro mas não ficou no Cancioneiro (cancioneiro=' + s.cancioneiro + ')';
      return (await count(page, '#song-approve')) ? 'o botão Aprovar continua na página' : true;
    }), { sev: 'média' });
  }

  // ---- v151–v155: secções da página inicial, antetítulo das categorias, menu em secções ----
  await t('FUN-33', 'Página inicial: cada secção com cânticos tem título; perfil Cancioneiro sem título por cima de «Todos os cânticos»', async () => {
    const bad = [];
    for (const perfil of ['cancioneiro', 'coro']) await withApp({ perfil }, async ({ page }) => {
      const r = await page.evaluate(() => { const li = [...document.querySelectorAll('#rows > li')]; return li.map(x => ({ head: x.classList.contains('cat-head'), t: x.textContent.trim() })); });
      if (!r.length) { bad.push(perfil + ': índice vazio'); return; }
      if (perfil === 'cancioneiro' && r[0].head) bad.push('Cancioneiro: título «' + r[0].t + '» por cima de Todos');
      if (perfil === 'coro' && !r[0].head) bad.push('Coro: sem título de secção no início (esperado «Cancioneiro»)');
      r.forEach((x, i) => { if (x.head && (!x.t || !r[i + 1] || r[i + 1].head)) bad.push(`${perfil}: título «${x.t}» sem categorias a seguir`); });
      if (!r.some(x => /Todos os cânticos/.test(x.t))) bad.push(perfil + ': falta «Todos os cânticos» por extenso');
      if (perfil === 'coro' && !r.some(x => x.head && /^Momentos da Missa$/i.test(x.t))) bad.push('Coro: falta o título «Momentos da Missa»');
      const empty = r.filter(x => !x.head && !x.t.replace(/\d+/g, '').trim()); if (empty.length) bad.push(perfil + `: ${empty.length} categorias sem nome`);
    });
    return bad.length ? bad.join('; ') : true;
  });
  await t('FUN-45', 'Secção Cancioneiro (Coro+): «Todos os cânticos» e restantes categorias só com cânticos do Cancioneiro (v189)', () => withApp({ perfil: 'coro', hash: '#/lista/todos' }, async ({ page }) => {
    await page.waitForSelector('#rows li a', { timeout: 8000 });
    const s = await txt(page, '#rows');
    const out = ['Pange lingua', 'Cântico no livro'].filter(x => s.includes(x));
    return out.length ? 'a lista Cancioneiro mostra cânticos fora do Cancioneiro: ' + out.join(', ') : true;
  }));
  await t('FUN-46', '«Todos os cânticos» (Coro+): secção no fim da página inicial com categorias tema-* (7, com Gestos); ausente no perfil Cancioneiro, no menu ☰ e no seletor de categoria (v190/v191)', async () => {
    const bad = [];
    await withApp({ perfil: 'coro' }, async ({ page }) => {
      const r = await page.evaluate(() => { const li = [...document.querySelectorAll('#rows > li')]; const heads = li.filter(x => x.classList.contains('cat-head')).map(x => x.textContent.trim()); const i = li.findIndex(x => x.classList.contains('cat-head') && /^Todos os cânticos$/.test(x.textContent.trim()));
        return { heads, after: i < 0 ? [] : li.slice(i + 1).map(x => x.querySelector('a')?.getAttribute('href') || '#head') }; });
      if (r.heads[r.heads.length - 1] !== 'Todos os cânticos') bad.push('Coro: a última secção não é «Todos os cânticos»: ' + r.heads.join(' | '));
      // v191: 7 categorias, incluindo tema-gestos (o fixture tem «Para Gestos»? se não, a categoria vazia não aparece)
      if (!r.after.length || r.after.some(h => !/^#\/lista\/tema-(liturgia|espirituais|movimento|infantis|gestos|populares|autor)$/.test(h))) bad.push('Coro: categorias depois de «Todos os cânticos»: ' + r.after.join(', '));
      await page.evaluate(() => { location.hash = '#/lista/tema-liturgia'; }); await sleep(600);
      if (!/Salve Regina/.test(await txt(page, '#rows'))) bad.push('tema-liturgia sem «Salve Regina» (latim)');
      await page.evaluate(() => { location.hash = '#/'; }); await sleep(300);
      await page.click('#btn-menu'); await sleep(400);
      if (await count(page, '#az a[href^="#/lista/tema-"]')) bad.push('menu ☰ mostra categorias tema-*');
    });
    await withApp({ perfil: 'cancioneiro' }, async ({ page }) => {
      if (await count(page, '#rows a[href^="#/lista/tema-"]')) bad.push('perfil Cancioneiro mostra «Todos os cânticos»');
    });
    await withApp({ perfil: 'maestro', hash: '#/cantico/amazing_grace' }, async ({ page }) => {
      await page.waitForSelector('#btn-edit'); await page.click('#btn-edit'); await sleep(500);
      // «Gestos» também é o nome curto de «Coro — para Gestos» (tag:Coro CLU||Para Gestos), que é legítimo: compara-se pelo valor
      const opts = await page.evaluate(() => [...document.querySelectorAll('#sn-cat option, #sn-cat optgroup')].map(o => ({ v: o.value || '', l: (o.label || o.textContent || '').trim() })));
      const temas = opts.filter(o => /^tag:Tema\|\|/.test(o.v) || o.l === 'Todos os cânticos' || (/^(Liturgia e Missa|Espirituais e gospel|Cânticos do Movimento|Infantis|Gestos|Populares e tradicionais|Pop, rock.*)$/.test(o.l) && !/^tag:(Coro CLU|CANTI 2024|Songbook)\|\|/.test(o.v)));
      if (temas.length) bad.push('seletor de categoria de «Editar cântico» tem temas: ' + temas.map(o => o.l + ' (' + o.v + ')').join(', '));
    });
    return bad.length ? bad.join('; ') : true;
  });
  await t('FUN-34', 'Páginas de categoria: antetítulo (.list-kicker) com a secção para Coro+; nenhum no perfil Cancioneiro', async () => {
    const bad = [], seen = [];
    await withApp({ perfil: 'coro' }, async ({ page }) => {
      const hrefs = await page.evaluate(() => [...document.querySelectorAll('#rows a[href^="#/lista/"]')].map(a => a.getAttribute('href')));
      for (const h of hrefs) {
        await page.evaluate(x => { location.hash = x; }, h); await sleep(200);
        const k = await page.evaluate(() => ({ k: document.querySelector('#list-title .list-kicker')?.textContent.trim() || '', n: [...document.querySelector('#list-title').childNodes].filter(n => !(n.classList && n.classList.contains('list-kicker'))).map(n => n.textContent).join('').trim() }));
        if (!k.k) bad.push(`${h}: sem antetítulo`); if (!k.n) bad.push(`${h}: nome vazio`);
        if (/^(Coro|Songbook|CANTI) — /.test(k.n)) bad.push(`${h}: nome ainda com o prefixo antigo «${k.n}»`);
        seen.push(`${k.k}/${k.n}`);
      }
    });
    await withApp({ perfil: 'cancioneiro', hash: '#/lista/la' }, async ({ page }) => {
      if (await count(page, '#list-title .list-kicker')) bad.push('Cancioneiro: tem antetítulo');
    });
    return bad.length ? bad.slice(0, 10).join('; ') : { pass: seen.length + ' categorias: ' + [...new Set(seen.map(x => x.split('/')[0]))].join(', ') };
  });
  await t('FUN-35', 'Menu ☰: Preferidos e Novos Cânticos no topo; «Livros» e «Folhas» (perfil Cancioneiro sem título «Livros»: Preferidos, Cancioneiro); secção vazia escondida (v165/v184)', async () => {
    const get = o => withApp(o, async ({ page }) => { await page.click('#btn-menu'); await sleep(400); return { pass: await page.evaluate(() => JSON.stringify({ h: [...document.querySelectorAll('#az li.cat-head')].map(x => x.textContent.trim()), first: [...document.querySelectorAll('#az > li')].slice(0, 3).map(x => (x.classList.contains('cat-head') ? '#' : '') + x.textContent.trim().replace(/\d+$/, '').trim()), all: document.querySelector('#az').textContent })) }; }).then(r => JSON.parse(r.pass || '{"h":[],"first":[],"all":""}'));
    const bad = [];
    const can = await get({ perfil: 'cancioneiro', cols: [] }), coro = await get({ perfil: 'coro', cols: [] }), mae = await get({ perfil: 'maestro', cols: [] }), coroCols = await get({ perfil: 'coro' });
    if ([can, coro, mae].some(x => x.h.includes('Os meus cânticos'))) bad.push('ainda há «Os meus cânticos»');
    if (!/^Preferidos/.test(can.first[0] || '')) bad.push('Cancioneiro: o topo não começa por Preferidos: ' + can.first.join(' | '));
    if (!/^Preferidos/.test(coro.first[0] || '') || !/^Novos Cânticos/.test(coro.first[1] || '')) bad.push('Coro: topo ' + coro.first.join(' | '));
    if (can.h.includes('Livros')) bad.push('Cancioneiro: tem o título «Livros» (v184: sem título)');
    if (!/^Cancioneiro/.test(can.first[1] || '')) bad.push('Cancioneiro: a 2.ª linha não é «Cancioneiro»: ' + can.first.join(' | '));
    if (!coro.h.includes('Livros')) bad.push('Coro: sem «Livros»');
    if (/Songbook|CANTI|Coro CLU|Novos Cânticos/.test(can.all)) bad.push('Cancioneiro: mostra livros do Coro');
    if (can.h.includes('Folhas') || coro.h.includes('Folhas')) bad.push('«Folhas» aparece sem folhas para perfil < Maestro');
    if (!mae.h.includes('Folhas')) bad.push('Maestro sem folhas: falta «Folhas» (com + Nova folha)');
    if (!coroCols.h.includes('Folhas')) bad.push('Coro com folhas: falta «Folhas»');
    return bad.length ? bad.join('; ') : { pass: `Coro: ${coro.first.slice(0, 2).join(', ')} · ${coro.h.join('/')}` };
  });
  await t('FUN-36', 'Tutorial (Maestro): o passo que aponta para «+ Nova folha» encontra o elemento', () => withApp({ perfil: 'maestro', tour: true, settle: 1500 }, async ({ page }) => {
    for (let i = 0; i < 25; i++) {
      const m = await page.evaluate(() => document.querySelector('.tour-msg')?.textContent || '');
      if (/Nova folha/.test(m)) { await sleep(500); return (await page.evaluate(() => { const e = document.querySelector('.col-new'); return !!e && e.getBoundingClientRect().width > 0; })) || 'passo «Nova folha» sem o botão visível'; }
      const next = page.locator('.tour-nav button').last(); if (!(await next.count())) break;
      await next.click().catch(() => {}); await sleep(700);
    }
    return 'não chegou ao passo «Nova folha»';
  }), { sev: 'média' });
  // ---- v159/v160: folhas em edição / publicadas ----
  await t('FUN-37', 'Folha por publicar: Coro e Cancioneiro não a veem; Maestro vê-a na gaveta com «não publicada»', async () => {
    const menu = perfil => withApp({ perfil }, async ({ page }) => { await page.click('#btn-menu'); await sleep(400); return { pass: await txt(page, '#az') }; }).then(r => r.pass || '');
    const bad = [];
    for (const p of ['coro', 'cancioneiro']) if (/Folha em edição/.test(await menu(p))) bad.push(p + ' vê a folha por publicar');
    const m = await menu('maestro');
    if (!/Folha em edição/.test(m)) bad.push('Maestro não vê a folha por publicar');
    // v162: a marca é um ícone de rascunho (svg.book-ic role=img aria-label «Não publicada»), sem texto
    const icon = await withApp({ perfil: 'maestro' }, async ({ page }) => { await page.click('#btn-menu'); await sleep(400);
      return { pass: JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#az a[href^="#/lista/colecao-"]')].map(a => ({ t: a.textContent.trim(), text: [...a.childNodes].filter(n => n.nodeName.toLowerCase() !== 'svg').map(n => n.textContent).join(''), draft: !!a.querySelector('svg.book-ic[role="img"][aria-label="Não publicada"]') })))) }; }).then(r => JSON.parse(r.pass || '[]'));
    const ed = icon.find(x => /Folha em edição/.test(x.t)), pub = icon.find(x => /Missa de domingo/.test(x.t));
    if (!ed || !ed.draft) bad.push('folha por publicar sem o ícone «Não publicada» (svg.book-ic role=img)');
    if (pub && pub.draft) bad.push('folha publicada com o ícone de rascunho');
    // o <title> do ícone também diz «Não publicada»: conta só o texto fora dos svg
    if (icon.some(x => /não publicada/i.test(x.text))) bad.push('ainda há texto «não publicada» no menu');
    const direct = await withApp({ perfil: 'coro', hash: '#/lista/colecao-demoE' }, async ({ page }) => ({ pass: await txt(page, '#rows') + '|' + await txt(page, '#status') }));
    if (/Veni Creator/i.test(direct.pass)) bad.push('Coro abre a folha por publicar pelo endereço');
    return bad.length ? bad.join('; ') : true;
  });
  await t('FUN-38', 'Editar folha trabalha numa cópia: nada grava até «Guardar» (#ce-save; desde v217 não muda published: só #ce-unpub despublica); «Cancelar» com alterações pede confirmação e deita fora; «Publicar» (#col-pub) só em folhas por publicar; folha vazia não se publica (v165)', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1' }, async ({ page }) => {
    const col = id => page.evaluate(i => JSON.parse(localStorage.getItem('cancioneiro.demo.cols')).find(c => c.id === i), id);
    await page.waitForSelector('#col-mode');
    if (await count(page, '#col-pub')) return 'folha publicada mostra «Publicar»';
    await page.click('#col-mode'); await sleep(500);
    for (const id of ['#ce-aud', '#ce-name', '#ce-dur', '#ce-rows', '#ce-save', '#ce-cancel', '#ce-del']) if (!(await count(page, id))) return 'falta ' + id;
    for (const id of ['#ce-close', '#ce-pub']) if (await count(page, id)) return 'ainda existe ' + id;
    if ((await col('demo1')).published === false) return 'abrir a edição já mudou a folha (published=false)';
    await page.fill('#ce-name', 'Título mudado e cancelado'); await sleep(200);
    await page.click('#ce-cancel'); await sleep(400);
    if (!(await page.evaluate(() => document.querySelector('#app-dlg').open))) return '«Cancelar» com alterações não pediu confirmação';
    await page.click('#app-dlg-ok'); await sleep(500);
    let c = await col('demo1'); if (c.title !== 'Missa de domingo' || c.published === false) return 'cancelar gravou alterações: ' + JSON.stringify({ t: c.title, p: c.published });
    await page.click('#col-mode'); await sleep(500);
    await page.fill('#ce-name', 'Missa de domingo (guardada)'); await page.click('#ce-save'); await sleep(700);
    // v217: Guardar nunca muda published (só «Despublicar» despublica)
    c = await col('demo1'); if (c.title !== 'Missa de domingo (guardada)' || c.published !== true) return 'Guardar (v217: continua publicada): ' + JSON.stringify({ t: c.title, p: c.published });
    await page.click('#col-mode'); await sleep(500); await page.click('#ce-unpub'); await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {}); await page.click('#app-dlg-ok'); await sleep(600);
    if ((await col('demo1')).published !== false) return '«Despublicar» não despublicou';
    await page.click('#ce-cancel'); await sleep(400); if (await page.evaluate(() => document.querySelector('#app-dlg').open)) { await page.click('#app-dlg-ok'); await sleep(300); }
    await page.reload(); await page.waitForSelector('#col-pub', { timeout: 10000 }).catch(() => {});
    if (!(await vis(page, '#col-pub'))) return 'folha por publicar sem «Publicar» na página';
    await page.click('#col-pub'); await sleep(400);
    if (!(await page.evaluate(() => document.querySelector('#app-dlg').open && /^Publicar/.test(document.querySelector('#app-dlg-ok').textContent.trim())))) return '«Publicar» não pediu confirmação (v181)';
    await page.click('#app-dlg-cancel'); await sleep(400);
    if ((await col('demo1')).published !== false) return 'Cancelar a confirmação publicou';
    await page.click('#col-pub'); await sleep(400); await page.click('#app-dlg-ok'); await sleep(600);
    if ((await col('demo1')).published !== true) return '«Publicar» não publicou';
    // folha por publicar e sem cânticos: alerta, não publica
    await page.evaluate(() => { const cs = JSON.parse(localStorage.getItem('cancioneiro.demo.cols')); cs.push({ id: 'vazia', title: 'Folha vazia', audience: 'coro', duration: '1w', expires_at: new Date(Date.now() + 864e5).toISOString(), published: false, sections: [], songs: [] }); localStorage.setItem('cancioneiro.demo.cols', JSON.stringify(cs)); location.hash = '#/lista/colecao-vazia'; });
    await page.reload(); await page.waitForSelector('#col-pub', { timeout: 10000 }).catch(() => {});
    await page.click('#col-pub'); await sleep(500);
    const alert = await page.evaluate(() => document.querySelector('#app-dlg').open && document.querySelector('#app-dlg-msg').textContent);
    if (!alert) return 'folha vazia: sem alerta';
    await page.click('#app-dlg-ok'); await sleep(300);
    return (await col('vazia')).published === false || 'folha vazia foi publicada';
  }));
  await t('FUN-39', 'Edição: tocar num item mostra .ce-acts (up/down/del/ok); Descer muda a ordem; Apagar pede confirmação; secção escolhida tem .ce-name (v165)', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
    await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(600);
    const order = () => page.evaluate(() => [...document.querySelectorAll('#ce-rows li[data-key]')].map(l => l.dataset.key));
    const o0 = await order();
    await page.click('#ce-rows li[data-key="veni_creator_spiritus"] a'); await sleep(300);
    const acts = await page.evaluate(() => [...document.querySelectorAll('#ce-rows li[data-key="veni_creator_spiritus"] .ce-acts button[data-act]')].map(b => b.dataset.act));
    if (acts.join() !== 'lyr,up,down,del,ok') return 'ações: ' + acts.join() + ' (esperado lyr,up,down,del,ok; lyr = Editar nesta folha desde v204)';
    await page.click('#ce-rows li[data-key="veni_creator_spiritus"] .ce-acts button[data-act="down"]'); await sleep(600);
    const o1 = await order();
    if (o1.indexOf('veni_creator_spiritus') <= o0.indexOf('veni_creator_spiritus')) return `Descer não mudou a ordem: ${o0} → ${o1}`;
    await page.click('#ce-rows li[data-key="adoro_te_devote"] a'); await sleep(300);
    await page.click('#ce-rows li[data-key="adoro_te_devote"] .ce-acts button[data-act="del"]'); await sleep(400);
    if (!(await page.evaluate(() => document.querySelector('#app-dlg').open))) return 'Apagar não pediu confirmação';
    await page.click('#app-dlg-ok'); await sleep(600);
    if ((await order()).includes('adoro_te_devote')) return 'não removeu';
    const sec = await page.evaluate(() => [...document.querySelectorAll('#ce-rows li.col-sec')].find(l => /Saída/.test(l.textContent))?.dataset.key);
    await page.click(`#ce-rows li[data-key="${sec}"] .sec-line`); await sleep(300);
    return (await count(page, `#ce-rows li[data-key="${sec}"] .ce-name`)) ? true : 'secção escolhida sem .ce-name';
  }));
  await t('FUN-40', 'Edição: «+ Adicionar cântico» por secção — Comunhão traz os cânticos do momento, Saída vem vazia; «+ Adicionar secção» no fim', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
    await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(600);
    const secs = await page.evaluate(() => [...document.querySelectorAll('#ce-rows li.col-add button[data-sec]')].map(b => b.dataset.sec));
    if (!secs.includes('e2') || !secs.includes('e3')) return 'linhas «+ Adicionar cântico»: ' + secs.join(',');
    if (!(await page.evaluate(() => document.querySelector('#ce-rows li:last-child')?.matches('li.col-add.col-add-end')))) return '«+ Adicionar secção» não está no fim';
    await page.click('#ce-rows li.col-add button[data-sec="e2"]'); await sleep(500);
    const com = await page.evaluate(() => ({ n: document.querySelectorAll('#sa-list li').length, msg: document.querySelector('#sa-msg').textContent }));
    if (!com.n || !/Comunhão/.test(com.msg)) return 'Comunhão sem pré-preenchimento: ' + JSON.stringify(com);
    await page.click('#sa-close'); await sleep(300);
    await page.click('#ce-rows li.col-add button[data-sec="e3"]'); await sleep(500);
    const sai = await page.evaluate(() => document.querySelectorAll('#sa-list li').length);
    await page.click('#sa-close');
    return sai === 0 ? { pass: `Comunhão: ${com.n} cânticos` } : `Saída mostra ${sai} cânticos`;
  }));
  await t('FUN-42', 'Edição: várias mudanças (acrescentar, mover, mudar o nome, nova/apagar secção, remover, público, título, duração) só ficam gravadas com «Guardar» — recarregar mostra todas (v165)', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
    const col = () => page.evaluate(() => JSON.parse(localStorage.getItem('cancioneiro.demo.cols')).find(c => c.id === 'demoE'));
    const keys = () => page.evaluate(() => [...document.querySelectorAll('#ce-rows li[data-key]')].map(l => l.dataset.key + '=' + l.textContent.trim().slice(0, 30)));
    const sel = async (key, act) => { await page.click(`#ce-rows li[data-key="${key}"] ${key.startsWith('sec:') ? '.sec-line' : 'a'}`); await sleep(300); if (act) { await page.click(`#ce-rows li[data-key="${key}"] .ce-acts button[data-act="${act}"]`); await sleep(400); } };
    const before = JSON.stringify(await col());
    let step = 'abrir edição'; const at = n => { step = n; };
    try {
    await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(500);
    at('acrescentar'); await page.click('#ce-rows li.col-add button[data-sec="e3"]'); await sleep(400);
    await page.fill('#sa-q', 'salve'); await sleep(500);
    await page.locator('#sa-list button:not([disabled])').first().click(); await sleep(500);
    if (await page.evaluate(() => document.querySelector('#sec-add')?.open)) { await page.click('#sa-close'); await sleep(300); } // escolher um cântico já fecha a janela
    at('mover'); await sel('salve_regina', 'up');
    at('nome da secção'); await sel('sec:e3'); await page.click('#ce-rows li[data-key="sec:e3"] .ce-name'); await sleep(300); await page.fill('#app-dlg-input', 'Final'); await page.click('#app-dlg-ok'); await sleep(400);
    at('nova secção'); await page.click('#col-add-sec'); await sleep(300); await page.fill('#app-dlg-input', 'Ofertório'); await page.click('#app-dlg-ok'); await sleep(400);
    at('remover'); await sel('adoro_te_devote', 'del'); await page.click('#app-dlg-ok'); await sleep(400);
    at('público'); await page.click('#ce-aud button[data-v="cancioneiro"]'); await sleep(200);
    at('título'); await page.fill('#ce-name', 'Folha renomeada pelo teste'); await sleep(200);
    at('duração'); await page.selectOption('#ce-dur', '1m'); await sleep(300);
    } catch (e) { throw new Error(`passo «${step}»: ${e.message.split('\n')[0]}`); }
    if (JSON.stringify(await col()) !== before) return 'mudanças gravadas antes de «Guardar»';
    const k = await keys();
    await page.click('#ce-save'); await sleep(800);
    await page.reload(); await page.waitForSelector('#col-mode', { timeout: 10000 }); await sleep(300);
    const c = await col(), bad = [];
    const slugs = c.songs.map(x => x.song_slug), titles = c.sections.map(x => x.title);
    if (!slugs.includes('salve_regina')) bad.push('acrescentar'); if (slugs.includes('adoro_te_devote')) bad.push('remover');
    if (!titles.includes('Final')) bad.push('mudar o nome da secção'); if (!titles.includes('Ofertório')) bad.push('nova secção');
    if (c.audience !== 'cancioneiro') bad.push('público'); if (c.title !== 'Folha renomeada pelo teste') bad.push('título'); if (c.duration !== '1m') bad.push('duração');
    if (c.published !== false) bad.push('não ficou por publicar');
    await page.click('#col-mode'); await sleep(500);
    if (JSON.stringify((await keys()).map(x => x.split('=')[0])) !== JSON.stringify(k.map(x => x.split('=')[0]))) bad.push('ordem (mover)');
    return bad.length ? 'não ficou gravado: ' + bad.join(', ') : true;
  }));

  // ---- v204: Editar nesta folha (letra só numa folha), indicadores e opções do PDF ----
  await t('FUN-52', 'Editar nesta folha (v204): ✎ (data-act="lyr") abre #cl-ed com uma caixa por estrofe; Guardar desativado sem estrofes; Cancelar com alterações pede confirmação; Guardar fica na cópia (nada gravado) e marca .col-edited; «Guardar» da folha grava (collyrics); «Editar texto» → #cl-text; Repor pede confirmação e apaga a versão; igual ao original = sem versão', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
    let step = 'início'; const late = []; const at = n => { step = n; };
    try {
    const SLUG = 'veni_creator_spiritus', K = 'demoE/' + SLUG;
    const stored = () => page.evaluate(k => JSON.parse(localStorage.getItem('cancioneiro.demo.collyr') || '{}')[k] || null, K);
    const marked = () => page.evaluate(sl => !!document.querySelector(`#ce-rows li[data-key="${sl}"] small.col-edited`), SLUG);
    const openLyr = async () => {
      at('abrir ✎');
      // o item já escolhido mostra .ce-acts (na v204 por cima da ligação): só se toca no item se ainda não estiver escolhido
      if (!(await vis(page, `#ce-rows li[data-key="${SLUG}"] .ce-acts button[data-act="lyr"]`))) { await page.click(`#ce-rows li[data-key="${SLUG}"] a`); await sleep(300); }
      await page.click(`#ce-rows li[data-key="${SLUG}"] .ce-acts button[data-act="lyr"]`);
      await page.waitForSelector('#cl-ed[open] #cl-sts input', { timeout: 8000 }).catch(() => {});
      return page.locator('#cl-sts input').count();
    };
    const dlgOk = async () => { await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {}); const t = await page.evaluate(() => document.querySelector('#app-dlg[open] #app-dlg-ok')?.textContent.trim() || ''); return t; };
    const editor = async () => { at('Editar folha'); await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(500); };
    await editor();
    const n = await openLyr();
    if (n !== 2) return `#cl-sts com ${n} caixas (esperadas 2, uma por estrofe)`;
    for (const i of [0, 1]) await page.locator('#cl-sts input').nth(i).uncheck();
    if (!(await page.evaluate(() => document.querySelector('#cl-save').disabled))) return 'Guardar ativo sem estrofes';
    await page.locator('#cl-sts input').nth(0).check();
    if (await page.evaluate(() => document.querySelector('#cl-save').disabled)) return 'Guardar desativado com 1 estrofe';
    at('Cancelar 1');
    await page.click('#cl-cancel');
    if (!/Sair sem guardar/.test(await dlgOk())) return 'Cancelar com alterações sem confirmação «Sair sem guardar»';
    await page.click('#app-dlg-cancel'); await sleep(300);
    if (!(await page.evaluate(() => document.querySelector('#cl-ed').open))) return 'cancelar a confirmação fechou #cl-ed';
    await page.click('#cl-cancel'); await dlgOk(); await page.click('#app-dlg-ok'); await sleep(400);
    if (await page.evaluate(() => document.querySelector('#cl-ed').open)) return 'Sair sem guardar não fechou #cl-ed';
    if (await marked()) return 'Cancelar deixou a marca .col-edited';
    at('guardar na cópia');
    // só a 1.ª estrofe → Guardar (na cópia)
    await openLyr(); await page.locator('#cl-sts input').nth(1).uncheck(); await page.click('#cl-save'); await sleep(400);
    if (await page.evaluate(() => document.querySelector('#cl-ed').open)) return 'Guardar não fechou #cl-ed';
    if (!(await marked())) return 'depois de Guardar a linha não tem small.col-edited «editado nesta folha»';
    if (await stored()) return 'a versão da folha foi gravada antes do «Guardar» da folha';
    at('Guardar da folha');
    await page.click('#ce-save'); await sleep(900);
    const v = await stored();
    if (!v || v.length !== 1) return '«Guardar» da folha não gravou a versão (1 estrofe): ' + JSON.stringify(v)?.slice(0, 80);
    // Editar texto
    await editor(); await openLyr();
    if (!(await vis(page, '#cl-reset'))) return 'com versão da folha, sem «Repor original» (#cl-reset)';
    at('Editar texto');
    await page.click('#cl-text-btn'); await sleep(200);
    if (!(await vis(page, '#cl-text')) || !(await page.inputValue('#cl-text')).trim()) return '«Editar texto» não mostrou #cl-text com a letra';
    if (await vis(page, '#cl-sts')) return '«Editar texto» deixou as caixas visíveis';
    await page.fill('#cl-text', ''); await sleep(200);
    if (!(await page.evaluate(() => document.querySelector('#cl-save').disabled))) return 'Guardar ativo com o texto vazio';
    await page.click('#cl-cancel'); await dlgOk(); await page.click('#app-dlg-ok'); await sleep(400);
    // Repor original: confirmação, tira a marca e apaga ao guardar a folha
    at('Repor');
    await openLyr(); await page.click('#cl-reset');
    if (!/Repor original/.test(await dlgOk())) return 'Repor sem confirmação «Repor original»';
    // v207: «Repor» entrou na regra das confirmações vermelhas (app.js appConfirm)
    if (!(await page.evaluate(() => document.querySelector('#app-dlg-ok').matches('.danger-fill')))) late.push('confirmação «Repor original» sem .danger-fill (v207)');
    await page.click('#app-dlg-ok'); await sleep(400);
    if (await marked()) return 'depois de Repor a linha continua marcada';
    await page.click('#ce-save'); await sleep(900);
    if (await stored()) return 'Repor + Guardar da folha não apagou a versão';
    at('igual ao original');
    // igual ao original: todas as estrofes → sem versão
    await editor(); await openLyr(); await page.click('#cl-save'); await sleep(400);
    if (await marked()) return 'guardar igual ao original marcou a linha';
    return late.length ? late.join('; ') : true;
    } catch (e) { throw new Error(`passo «${step}»: ${e.message.split('\n')[0]}`); }
  }), { sev: 'alta' });
  const FOLHA_LYR = [{ type: 'verse', lines: ['[G]Linha de teste desta [D]folha'] }];
  const colsWithEdit = (id, slug) => demoCols().map(c => c.id === id ? { ...c, edits: [{ song_slug: slug, edited_at: new Date().toISOString() }] } : c);
  await t('FUN-53', 'Cântico aberto da folha (v204–v206): todas as ligações da folha são #/cantico/<slug>/folha/<id>; o editado tem small.col-edited «editado nesta folha»; aberto da folha: .note.col-ver «Na folha «título»» (+ « · letra desta folha» com versão), sem ligações, sem #btn-edit/#btn-add-rec/#btn-add-score/#song-approve/#song-reject/#ver-promo; #/cantico/<slug> volta ao original com #btn-edit (Maestro); perfil Cancioneiro sem acordes', async () => {
    const bad = [];
    const HIDE = ['#btn-edit', '#btn-add-rec', '#btn-add-score', '#song-approve', '#song-reject', '#ver-promo'];
    for (const [perfil, id, slug, title] of [['maestro', 'demo1', 'salve_regina', 'Missa de domingo'], ['coro', 'demo1', 'salve_regina', 'Missa de domingo'], ['cancioneiro', 'demo2', 'amazing_grace', 'Encontro de jovens']]) await withApp({ perfil, hash: '#/lista/colecao-' + id, cols: colsWithEdit(id, slug), storage: { 'cancioneiro.demo.collyr': { [id + '/' + slug]: FOLHA_LYR } } }, async ({ page }) => {
      await page.waitForSelector('#rows li a', { timeout: 8000 }).catch(() => {});
      const rows = await page.evaluate(() => [...document.querySelectorAll('#rows li a[href^="#/cantico/"]')].map(a => ({ href: a.getAttribute('href'), mark: a.querySelector('small.col-edited')?.textContent.trim() || '' })));
      const k = perfil;
      const notFolha = rows.filter(r => !/\/folha\//.test(r.href)); if (notFolha.length) bad.push(`${k}: ligações sem /folha/: ${notFolha.map(r => r.href).join(', ')}`);
      const row = rows.find(r => r.href === `#/cantico/${slug}/folha/${id}`);
      if (!row) { bad.push(`${k}: linha de ${slug} sem #/cantico/${slug}/folha/${id}`); return; }
      if (!/^editado nesta folha/.test(row.mark)) bad.push(`${k}: sem «editado nesta folha»`);
      const others = rows.filter(r => r !== row && r.mark); if (others.length) bad.push(`${k}: marca em cânticos não editados`);
      await page.click(`#rows li a[href="${row.href}"]`); await page.waitForSelector('#song h1', { timeout: 8000 }).catch(() => {}); await sleep(800);
      const r = await page.evaluate(() => { const n = document.querySelector('#song .note.col-ver'); return { note: n ? n.textContent.replace(/\s+/g, ' ').trim() : '', links: n ? n.querySelectorAll('a').length : -1, text: document.querySelector('#song').textContent, chords: document.querySelectorAll('#song .ch').length }; });
      if (r.note !== `Na folha «${title}» · letra desta folha`) bad.push(`${k}: nota «${r.note}»`);
      if (r.links > 0) bad.push(`${k}: nota com ligações`);
      if (!/Linha de teste desta/.test(r.text)) bad.push(`${k}: não mostra a letra desta folha`);
      for (const h of HIDE) if (await vis(page, h)) bad.push(`${k}: ${h} visível no cântico aberto da folha`);
      if (perfil === 'cancioneiro' && r.chords) bad.push('Cancioneiro: letra da folha com acordes');
      // outro cântico da mesma folha, sem versão
      const other = rows.find(x => x !== row);
      if (other) {
        await page.evaluate(h => { location.hash = h; }, other.href); await sleep(800);
        const n2 = await page.evaluate(() => document.querySelector('#song .note.col-ver')?.textContent.replace(/\s+/g, ' ').trim() || '');
        if (n2 !== `Na folha «${title}»`) bad.push(`${k}: cântico sem versão, nota «${n2}»`);
        if (await vis(page, '#btn-edit')) bad.push(`${k}: #btn-edit visível no cântico sem versão aberto da folha`);
      }
      // fora da folha: original
      await page.evaluate(sl => { location.hash = '#/cantico/' + sl; }, slug); await sleep(800);
      const r3 = await page.evaluate(() => ({ note: !!document.querySelector('#song .note.col-ver'), text: document.querySelector('#song').textContent }));
      if (r3.note) bad.push(`${k}: fora da folha ainda com .note.col-ver`);
      if (/Linha de teste desta/.test(r3.text)) bad.push(`${k}: fora da folha mostra a letra da folha`);
      if (perfil === 'maestro' && !(await vis(page, '#btn-edit'))) bad.push('maestro: fora da folha sem «Editar cântico»');
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });
  await t('FUN-54', 'PDF da folha (v204): «Partilhar folha» com 4 linhas (endereço, um só «Gerar PDF», e «Enviar endereço/PDF por email» desligadas, que não fecham a janela, v216) → opções #pdf-o-chords e #pdf-o-scores (button.switch-row, aria-checked desde v205; ligadas numa folha Coro, desligadas numa Cancioneiro); ficheiro <título>-coro / -acordes / -partituras / sem sufixo', async () => {
    const bad = []; let menuChecked = false;
    const gen = async (page, chords, scores) => {
      await page.waitForSelector('#col-share'); await page.click('#col-share'); await sleep(500);
      const pdfs = await page.locator('#app-dlg-list button').filter({ hasText: /Gerar PDF/ }).count();
      if (pdfs !== 1) bad.push(`${pdfs} opções «Gerar PDF» (esperada 1)`);
      // v216: 4 linhas — endereço, Gerar PDF, e as duas de email desligadas (tocar nelas não fecha a janela)
      if (!menuChecked) {
        menuChecked = true;
        const m = await page.evaluate(() => [...document.querySelectorAll('#app-dlg-list button')].map(b => ({ t: b.textContent.replace(/\s+/g, ' ').trim(), d: b.disabled })));
        const ok = m.length === 4 && !m[0].d && /^Gerar PDF/.test(m[1].t) && !m[1].d && /^Enviar endereço por email/.test(m[2].t) && m[2].d && /^Enviar PDF por email/.test(m[3].t) && m[3].d;
        if (!ok) bad.push('menu «Partilhar folha»: ' + JSON.stringify(m.map(x => x.t.slice(0, 30) + (x.d ? ' [desligada]' : ''))));
        await page.evaluate(() => [...document.querySelectorAll('#app-dlg-list button[disabled]')].forEach(b => { b.click(); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); })); await sleep(300);
        if (!(await page.evaluate(() => document.querySelector('#app-dlg').open))) bad.push('tocar numa opção desligada fechou a janela');
      }
      await page.locator('#app-dlg-list button').filter({ hasText: /Gerar PDF/ }).first().click(); await sleep(500);
      const st = { c: await swOn(page, '#pdf-o-chords'), s: await swOn(page, '#pdf-o-scores') };
      if (chords !== undefined) { await swSet(page, '#pdf-o-chords', chords); await swSet(page, '#pdf-o-scores', scores); }
      await page.click('#app-dlg-ok');
      await page.waitForSelector('#pdfpages canvas', { timeout: 25000 }).catch(() => {});
      const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await page.click('#pdf-download'); const d = await dl;
      return { st, name: d ? d.suggestedFilename() : null };
    };
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1', isMobile: false, hasTouch: false }, async ({ page }) => {
      const a = await gen(page);
      if (!(a.st.c === true && a.st.s === true)) bad.push('folha Coro: opções ' + JSON.stringify(a.st) + ' (esperadas ligadas)');
      if (a.name !== 'Missa-de-domingo-coro.pdf') bad.push('acordes+partituras: ficheiro ' + a.name);
    });
    for (const [c, sc, suf] of [[true, false, '-acordes'], [false, true, '-partituras'], [false, false, '']]) await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1', isMobile: false, hasTouch: false }, async ({ page }) => {
      const a = await gen(page, c, sc); if (a.name !== `Missa-de-domingo${suf}.pdf`) bad.push(`${suf || 'sem opções'}: ficheiro ${a.name}`);
    });
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo2', isMobile: false, hasTouch: false }, async ({ page }) => {
      const a = await gen(page);
      if (!(a.st.c === false && a.st.s === false)) bad.push('folha Cancioneiro: opções ' + JSON.stringify(a.st) + ' (esperadas desligadas)');
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });

  await t('FUN-55', 'PDF da folha usa a versão da folha (v204): estrofe retirada em «Editar nesta folha» não aparece no PDF; as outras aparecem (texto extraído com vendor/pdfjs)', () => {
    const orig = fixture.find(x => x.slug === 'salve_regina').lyrics, ver = orig.filter((_, i) => i !== 2);
    const first = st => st.lines[0].replace(/\[[^\]]*\]/g, '').trim();
    return withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1', isMobile: false, hasTouch: false, cols: colsWithEdit('demo1', 'salve_regina'), storage: { 'cancioneiro.demo.collyr': { 'demo1/salve_regina': ver } } }, async ({ page }) => {
      await page.waitForSelector('#col-share'); await page.click('#col-share'); await sleep(500);
      await page.locator('#app-dlg-list button').filter({ hasText: /Gerar PDF/ }).first().click(); await sleep(500);
      if (await page.evaluate(() => !!document.querySelector('#app-dlg[open] #pdf-o-chords'))) { await swSet(page, '#pdf-o-chords', false); await swSet(page, '#pdf-o-scores', false); await page.click('#app-dlg-ok'); }
      await page.waitForSelector('#pdfpages canvas', { timeout: 25000 }).catch(() => {});
      const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await page.click('#pdf-download'); const d = await dl;
      if (!d) return 'sem descarga do PDF';
      const b64 = fs.readFileSync(await d.path()).toString('base64');
      const text = await page.evaluate(async b => {
        const lib = await import('/vendor/pdfjs/pdf.min.mjs'); lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
        const doc = await lib.getDocument({ data: Uint8Array.from(atob(b), c => c.charCodeAt(0)), isEvalSupported: false }).promise;
        let out = ''; for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + '\n';
        return out;
      }, b64);
      const norm = x => x.normalize('NFC').replace(/\s+/g, ' ').trim();
      const T = norm(text), bad = [];
      orig.forEach((st, i) => { const has = T.includes(norm(first(st))); if (i === 2 && has) bad.push('estrofe retirada (3.ª) aparece no PDF'); if (i !== 2 && !has) bad.push(`${i + 1}.ª estrofe não aparece no PDF`); });
      return bad.length ? bad.join('; ') : { pass: `${T.length} caracteres extraídos` };
    });
  }, { sev: 'média' });

  await t('FUN-56', 'Acordes e partituras por cântico na folha (v206): #cl-chords/#cl-scores (switch, ligados) só numa folha Coro e se o cântico tem acordes / partituras; Cancelar com mudança pede confirmação; Guardar marca «editado nesta folha · sem acordes / · sem partituras» e grava no_chords/no_scores com «Guardar» da folha; aberto da folha sem .ch nem #btn-chords / sem .scores a; Repor volta tudo a false', async () => {
    const bad = [];
    const cols = page => page.evaluate(() => JSON.parse(localStorage.getItem('cancioneiro.demo.cols') || '[]'));
    const openLyr = async (page, slug) => {
      if (!(await vis(page, `#ce-rows li[data-key="${slug}"] .ce-acts button[data-act="lyr"]`))) { await page.click(`#ce-rows li[data-key="${slug}"] a`); await sleep(300); }
      await page.click(`#ce-rows li[data-key="${slug}"] .ce-acts button[data-act="lyr"]`);
      await page.waitForSelector('#cl-ed[open] #cl-sts input', { timeout: 8000 }).catch(() => {}); await sleep(200);
    };
    const mark = (page, slug) => page.evaluate(sl => document.querySelector(`#ce-rows li[data-key="${sl}"] small.col-edited`)?.textContent.trim() || '', slug);
    // folha Cancioneiro: sem interruptores; mudar para Coro → amazing_grace tem acordes
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo2' }, async ({ page }) => {
      await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(500);
      await openLyr(page, 'amazing_grace');
      if (await vis(page, '#cl-chords') || await vis(page, '#cl-scores')) bad.push('folha Cancioneiro: interruptores visíveis');
      await page.click('#cl-cancel'); await sleep(300);
      await page.click('#ce-aud button[data-v="coro"]'); await sleep(300);
      await openLyr(page, 'amazing_grace');
      if (!(await vis(page, '#cl-chords'))) { bad.push('folha Coro: amazing_grace (com acordes) sem #cl-chords'); return; }
      if ((await swOn(page, '#cl-chords')) !== true) bad.push('#cl-chords não começa ligado');
      await swSet(page, '#cl-chords', false);
      await page.click('#cl-cancel');
      await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {});
      if (!/Sair sem guardar/.test(await page.evaluate(() => document.querySelector('#app-dlg[open] #app-dlg-ok')?.textContent || ''))) bad.push('Cancelar com interruptor mudado sem confirmação');
      await page.click('#app-dlg-cancel'); await sleep(300);
      await page.click('#cl-save'); await sleep(400);
      const m = await mark(page, 'amazing_grace');
      if (m !== 'editado nesta folha · sem acordes') bad.push(`marca «${m}» (esperado «editado nesta folha · sem acordes»)`);
      await page.click('#ce-save'); await sleep(900);
      const e = (await cols(page)).find(c => c.id === 'demo2')?.songs.find(x => x.song_slug === 'amazing_grace');
      if (!e || e.no_chords !== true) bad.push('no_chords não gravado com «Guardar» da folha: ' + JSON.stringify(e));
      // aberto da folha: sem acordes
      await page.evaluate(() => { location.hash = '#/cantico/amazing_grace/folha/demo2'; }); await sleep(900);
      if (await page.evaluate(() => document.querySelectorAll('#song .ch').length)) bad.push('aberto da folha com no_chords: há .ch');
      if (await vis(page, '#btn-chords')) bad.push('aberto da folha com no_chords: #btn-chords visível');
      await page.evaluate(() => { location.hash = '#/cantico/amazing_grace'; }); await sleep(900);
      if (!(await page.evaluate(() => document.querySelectorAll('#song .ch').length))) bad.push('fora da folha amazing_grace sem acordes');
      // Repor: volta tudo a false
      await page.evaluate(() => { location.hash = '#/lista/colecao-demo2'; }); await sleep(600);
      await page.click('#col-mode'); await sleep(500); await openLyr(page, 'amazing_grace');
      await page.click('#cl-reset'); await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {}); await page.click('#app-dlg-ok'); await sleep(400);
      if (await mark(page, 'amazing_grace')) bad.push('depois de Repor a marca continua');
      await page.click('#ce-save'); await sleep(900);
      const e2 = (await cols(page)).find(c => c.id === 'demo2')?.songs.find(x => x.song_slug === 'amazing_grace');
      if (e2 && (e2.no_chords || e2.no_scores)) bad.push('Repor + Guardar não pôs no_chords/no_scores a false');
    });
    // partituras: demo1 / adoro_te_devote
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1' }, async ({ page }) => {
      await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(500);
      await openLyr(page, 'adoro_te_devote');
      if (!(await vis(page, '#cl-scores'))) { bad.push('adoro_te_devote (com partitura) sem #cl-scores'); return; }
      await swSet(page, '#cl-scores', false); await page.click('#cl-save'); await sleep(400);
      const m = await mark(page, 'adoro_te_devote');
      if (m !== 'editado nesta folha · sem partituras') bad.push(`marca «${m}»`);
      await page.click('#ce-save'); await sleep(900);
      await page.evaluate(() => { location.hash = '#/cantico/adoro_te_devote/folha/demo1'; }); await sleep(900);
      if (await page.evaluate(() => document.querySelectorAll('#song .scores a').length)) bad.push('aberto da folha com no_scores: há .scores a');
      await page.evaluate(() => { location.hash = '#/cantico/adoro_te_devote'; }); await sleep(900);
      if (!(await page.evaluate(() => document.querySelectorAll('#song .scores a').length))) bad.push('fora da folha adoro_te_devote sem partitura');
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });

  await t('FUN-57', 'PDF da folha respeita no_chords / no_scores (v206): folha Coro com amazing_grace e santa_lucia, «Acordes» e «Partituras» ligados; com no_chords num cântico os acordes do PDF diminuem mas os do outro ficam; com no_scores num cântico o PDF tem menos páginas', async () => {
    const CHORD = /^[A-G](#|b)?(m|maj|min|dim|aug|sus)?\d*(\/[A-G](#|b)?)?$/;
    const folha = flags => [...demoCols(), { id: 'demoP', title: 'Folha PDF', audience: 'coro', duration: '1w', expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), created_by: 'demo@localhost', sections: [],
      songs: [{ song_slug: 'amazing_grace', position: 0, ...(flags.amazing_grace || {}) }, { song_slug: 'santa_lucia', position: 1, ...(flags.santa_lucia || {}) }] }];
    const gen = flags => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoP', isMobile: false, hasTouch: false, cols: folha(flags) }, async ({ page }) => {
      await page.waitForSelector('#col-share'); await page.click('#col-share'); await sleep(500);
      await page.locator('#app-dlg-list button').filter({ hasText: /Gerar PDF/ }).first().click(); await sleep(500);
      await swSet(page, '#pdf-o-chords', true); await swSet(page, '#pdf-o-scores', true); await page.click('#app-dlg-ok');
      await page.waitForSelector('#pdfpages canvas', { timeout: 30000 }).catch(() => {});
      const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      await page.click('#pdf-download'); const d = await dl;
      if (!d) return { err: 'sem descarga' };
      const b64 = fs.readFileSync(await d.path()).toString('base64');
      return page.evaluate(async b => {
        const lib = await import('/vendor/pdfjs/pdf.min.mjs'); lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
        const doc = await lib.getDocument({ data: Uint8Array.from(atob(b), c => c.charCodeAt(0)), isEvalSupported: false }).promise;
        const items = []; for (let i = 1; i <= doc.numPages; i++) items.push(...(await (await doc.getPage(i)).getTextContent()).items.map(x => x.str.trim()).filter(Boolean));
        return { pages: doc.numPages, items };
      }, b64);
    });
    const A = await gen({}), B = await gen({ amazing_grace: { no_chords: true } }), C = await gen({ santa_lucia: { no_scores: true } });
    for (const [k, r] of [['base', A], ['no_chords', B], ['no_scores', C]]) if (!r || r.err) return `${k}: ${r ? r.err : 'sem resultado'}`;
    const chords = r => r.items.filter(x => CHORD.test(x)).length;
    const cA = chords(A), cB = chords(B), bad = [];
    if (!cA) bad.push('PDF com «Acordes» ligado sem acordes no texto (o teste não consegue ler os acordes)');
    else { if (!(cB < cA)) bad.push(`no_chords em amazing_grace: acordes ${cA} → ${cB} (esperado menos)`); if (!(cB > 0)) bad.push('no_chords num cântico tirou também os acordes do outro'); }
    if (!(C.pages < A.pages)) bad.push(`no_scores em santa_lucia: páginas ${A.pages} → ${C.pages} (esperado menos)`);
    return bad.length ? { fail: bad.join('; '), evidence: `acordes ${cA}/${cB}, páginas ${A.pages}/${C.pages}` } : { pass: `acordes ${cA} → ${cB} com no_chords; páginas ${A.pages} → ${C.pages} com no_scores` };
  }, { sev: 'média' });

  // ---- v208: escolher como acrescentar em Editar folha; .col-edit-bar no topo ----
  await t('FUN-58', 'Editar folha (v208): .col-edit-bar é a 1.ª linha de #rows; depois de escolher em #sa-list, «Acrescentar «X»» com «Cântico completo» (acrescenta, sem #cl-ed) e «Versão desta folha» (acrescenta e abre #cl-ed); Cancelar no #cl-ed deixa o cântico completo', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
    await page.waitForSelector('#rows li', { timeout: 8000 });
    if (!(await page.evaluate(() => document.querySelector('#rows > li')?.classList.contains('col-edit-bar')))) return '.col-edit-bar não é a 1.ª linha de #rows';
    const has = sl => page.evaluate(x => !!document.querySelector(`#ce-rows li[data-key="${x}"]`), sl);
    const pick = async q => {
      await page.click('#ce-rows li.col-add button[data-sec="e3"]'); await sleep(400);
      await page.fill('#sa-q', q); await sleep(500);
      await page.locator('#sa-list button:not([disabled])').first().click(); await sleep(500);
      return page.evaluate(() => document.querySelector('#app-dlg').open ? { title: document.querySelector('#app-dlg-title, #app-dlg h2')?.textContent.trim() || '', opts: [...document.querySelectorAll('#app-dlg-list button')].map(b => b.textContent.trim()) } : null);
    };
    await page.click('#col-mode'); await sleep(500);
    const a = await pick('salve');
    if (!a) return 'sem a escolha «Acrescentar «…»» depois de escolher o cântico';
    if (!/^Acrescentar «Salve Regina/.test(a.title)) return 'título da escolha: ' + a.title;
    if (!(/^Cântico completo/.test(a.opts[0] || '') && /^Versão desta folha/.test(a.opts[1] || ''))) return 'opções: ' + a.opts.join(' | ');
    await page.locator('#app-dlg-list button').nth(0).click(); await sleep(500);
    if (await page.evaluate(() => document.querySelector('#cl-ed').open)) return '«Cântico completo» abriu #cl-ed';
    if (!(await has('salve_regina'))) return '«Cântico completo» não acrescentou';
    const b = await pick('amazing');
    if (!b) return 'segunda escolha não apareceu';
    await page.locator('#app-dlg-list button').nth(1).click();
    await page.waitForSelector('#cl-ed[open]', { timeout: 8000 }).catch(() => {});
    if (!(await page.evaluate(() => document.querySelector('#cl-ed').open))) return '«Versão desta folha» não abriu #cl-ed';
    if (!(await has('amazing_grace'))) return '«Versão desta folha» não acrescentou o cântico';
    await page.click('#cl-cancel'); await sleep(400);
    if (await page.evaluate(() => document.querySelector('#app-dlg').open)) await page.click('#app-dlg-ok'), await sleep(300);
    if (await page.evaluate(() => document.querySelector('#cl-ed').open)) return 'Cancelar não fechou #cl-ed';
    if (!(await has('amazing_grace'))) return 'Cancelar no #cl-ed tirou o cântico';
    if (await page.evaluate(() => !!document.querySelector('#ce-rows li[data-key="amazing_grace"] small.col-edited'))) return 'Cancelar no #cl-ed deixou-o marcado como editado';
    return true;
  }), { sev: 'média' });

  // ---- v209: grupos ----
  const grpState = page => page.evaluate(() => ({ mine: JSON.parse(localStorage.getItem('cancioneiro.demo.mygroups') || 'null'), asked: JSON.parse(localStorage.getItem('cancioneiro.demo.groupsAsked') || 'null') }));
  const dlgSw = page => page.evaluate(() => [...document.querySelectorAll('#app-dlg[open] .switch-row[data-g]')].map(b => ({ g: b.dataset.g, on: b.getAttribute('aria-checked') === 'true', vis: !b.closest('[hidden]') })));
  await t('FUN-59', 'Grupos na 1.ª abertura (v209, ?grupos): janela «Os seus grupos» com um .switch-row[data-g] por grupo (g1..g5), «Guardar» e sem Cancelar; Guardar grava os escolhidos e não volta a perguntar', () => withApp({ perfil: 'coro', q: 'grupos', settle: 1500 }, async ({ page }) => {
    await page.waitForSelector('#app-dlg[open]', { timeout: 8000 }).catch(() => {});
    const d = await page.evaluate(() => ({ open: document.querySelector('#app-dlg').open, title: document.querySelector('#app-dlg[open] h2, #app-dlg-title')?.textContent.trim() || '', ok: document.querySelector('#app-dlg-ok')?.textContent.trim(), cancel: (b => b && !b.hidden && b.getBoundingClientRect().width > 0)(document.querySelector('#app-dlg-cancel')) }));
    if (!d.open) return 'a pergunta dos grupos não apareceu';
    if (!/Os seus grupos/.test(d.title)) return 'título: ' + d.title;
    if (d.ok !== 'Guardar') return 'botão: ' + d.ok;
    if (d.cancel) return 'tem Cancelar';
    const sw = await dlgSw(page);
    if (sw.map(x => x.g).join() !== 'g1,g2,g3,g4,g5') return 'interruptores: ' + sw.map(x => x.g).join();
    for (const x of sw) if (x.g !== 'g3' && x.on) await page.click(`#app-dlg .switch-row[data-g="${x.g}"]`);
    if (!(await dlgSw(page)).find(x => x.g === 'g3').on) await page.click('#app-dlg .switch-row[data-g="g3"]');
    await page.click('#app-dlg-ok'); await sleep(600);
    const st = await grpState(page);
    if (JSON.stringify(st.mine) !== '["g3"]' || st.asked !== true) return 'gravado: ' + JSON.stringify(st);
    // sem ?grupos não volta a perguntar
    await page.evaluate(() => { location.search = '?demo&perfil=coro'; }); await page.waitForSelector('#splash.gone', { state: 'attached', timeout: 10000 }).catch(() => {}); await sleep(1500);
    return !(await page.evaluate(() => document.querySelector('#app-dlg').open && /Os seus grupos/.test(document.querySelector('#app-dlg').textContent))) || 'voltou a perguntar os grupos';
  }), { sev: 'média' });
  await t('FUN-60', 'Grupos no Perfil (v209): #perfis-groups com h3 «Grupos» e os interruptores (muda logo); sem nenhum aparece .grp-none «Sem grupo, não recebe folhas.» e o Coro deixa de ver as folhas; perfil só Cancioneiro: os grupos estão em #info-groups', async () => {
    const bad = [];
    await withApp({ perfil: 'coro' }, async ({ page }) => {
      await page.click('#btn-perfil'); await sleep(500);
      const r = await page.evaluate(() => { const el = document.querySelector('#perfis-groups'); return { h3: el?.querySelector('h3')?.textContent.trim(), n: el ? el.querySelectorAll('.switch-row[data-g]').length : 0 }; });
      if (r.h3 !== 'Grupos' || r.n !== 5) { bad.push(`coro: #perfis-groups h3=${r.h3} interruptores=${r.n}`); return; }
      for (const g of ['g1', 'g2', 'g3', 'g4', 'g5']) { await page.click(`#perfis-groups .switch-row[data-g="${g}"]`); await sleep(250); }
      const st = await grpState(page);
      if (JSON.stringify(st.mine) !== '[]') bad.push('coro: depois de desligar todos, gravado ' + JSON.stringify(st.mine));
      const none = await page.evaluate(() => document.querySelector('#perfis-groups .grp-none')?.textContent.trim() || '');
      if (none !== 'Sem grupo, não recebe folhas.') bad.push('coro: .grp-none «' + none + '»');
      await page.click('#perfis-close'); await sleep(300);
      await page.click('#btn-menu'); await sleep(500);
      if (await page.evaluate(() => [...document.querySelectorAll('a[href^="#/lista/colecao-"]')].some(a => a.getBoundingClientRect().width > 0))) bad.push('coro sem grupo ainda vê folhas na gaveta');
    });
    await withApp({ perfil: 'cancioneiro' }, async ({ page }) => {
      await page.click('#btn-perfil'); await sleep(500);
      const r = await page.evaluate(() => ({ solo: document.body.classList.contains('solo'), n: document.querySelectorAll('#info-groups .switch-row[data-g]').length, infoOpen: document.querySelector('#info').open }));
      if (!r.infoOpen) bad.push('cancioneiro: o símbolo do perfil não abriu a informação');
      if (r.n !== 5) bad.push(`cancioneiro: #info-groups com ${r.n} interruptores (solo=${r.solo})`);
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });
  await t('FUN-61', 'Visibilidade por grupos no ?demo (v209): folha só do grupo g1 → Coro e Maestro em g2 não a veem, em g1 veem (v210), Gestor vê sempre; folha sem grupos → vista por quem tem algum grupo; sem grupo nenhuma', async () => {
    const bad = [];
    const cols = () => demoCols().map(c => c.id === 'demo1' ? { ...c, groups: [{ group_id: 'g1' }] } : c);
    const sees = async (perfil, mine) => withApp({ perfil, cols: cols(), storage: { 'cancioneiro.demo.mygroups': mine, 'cancioneiro.demo.groupsAsked': true } }, async ({ page }) => {
      await page.click('#btn-menu'); await sleep(500);
      return page.evaluate(() => [...document.querySelectorAll('a[href^="#/lista/colecao-"]')].map(a => a.getAttribute('href').slice(17)));
    });
    const want = [['coro', ['g2'], { demo1: false }], ['coro', ['g1'], { demo1: true }], ['maestro', [], { demo1: false }], ['maestro', ['g2'], { demo1: false }], ['maestro', ['g1'], { demo1: true }], ['gestor', [], { demo1: true }], ['cancioneiro', ['g4'], { demo2: true }], ['cancioneiro', [], { demo2: false }], ['coro', [], { demo1: false }]];
    for (const [perfil, mine, exp] of want) {
      const got = await sees(perfil, mine);
      if (!Array.isArray(got)) { bad.push(`${perfil} ${mine}: ${JSON.stringify(got)}`); continue; }
      for (const [id, v] of Object.entries(exp)) if (got.includes(id) !== v) bad.push(`${perfil} [${mine}] ${v ? 'não vê' : 'vê'} ${id}`);
    }
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta' });
  await t('FUN-62', 'Publicar com grupos (v209/v212): «Publicar «X»» com «Todos» [data-g="*"] e todos os grupos ligados e visíveis; desligar «Todos» desliga todos e desativa OK; ligar todos um a um liga «Todos»; escolher um grupo → publica só para ele; .col-meta «Coro · até …» + «Grupos: Liceus» (por publicar: só a 1.ª); #ce-groups mostra o grupo; sem .pend-top', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
    await page.waitForSelector('#col-pub', { timeout: 8000 }).catch(() => {});
    if (!(await vis(page, '#col-pub'))) return 'sem #col-pub na folha por publicar';
    if (await count(page, '.pend-top')) return 'folha por publicar ainda com .pend-top (v212)';
    if (await count(page, '#col-share')) return 'folha por publicar com «Partilhar» (v215: só publicada)';
    const metas = () => page.evaluate(() => [...document.querySelectorAll('.col-meta')].map(m => m.textContent.replace(/\s+/g, ' ').trim()));
    const m0 = await metas();
    if (m0.length !== 1 || !/^Coro · até /.test(m0[0])) return 'folha por publicar: .col-meta ' + JSON.stringify(m0);
    await page.click('#col-pub'); await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {}); await sleep(300);
    const t0 = await page.evaluate(() => document.querySelector('#app-dlg[open]')?.textContent || '');
    if (!/Publicar «Folha em edição»/.test(t0)) return 'janela: ' + t0.slice(0, 60);
    let sw = await dlgSw(page);
    const all = sw.find(x => x.g === '*');
    if (!all || !all.on) return '«Todos» ausente ou desligado';
    if (!/^Todos$/.test(await page.evaluate(() => document.querySelector('#app-dlg .switch-row[data-g="*"]').textContent.trim()))) return 'rótulo de [data-g="*"] não é «Todos»';
    if (!sw.filter(x => x.g !== '*').every(x => x.on && x.vis)) return 'com «Todos» ligado os grupos não estão todos ligados e visíveis';
    await page.click('#app-dlg .switch-row[data-g="*"]'); await sleep(200);
    sw = await dlgSw(page);
    if (sw.some(x => x.on)) return 'desligar «Todos» não desligou os grupos';
    if (!(await page.evaluate(() => document.querySelector('#app-dlg-ok').disabled))) return 'OK ativo sem nenhum grupo';
    for (const g of ['g1', 'g2', 'g3', 'g4', 'g5']) { await page.click(`#app-dlg .switch-row[data-g="${g}"]`); await sleep(100); }
    if (!(await dlgSw(page)).find(x => x.g === '*').on) return 'ligar todos os grupos não ligou «Todos»';
    for (const g of ['g1', 'g3', 'g4', 'g5']) { await page.click(`#app-dlg .switch-row[data-g="${g}"]`); await sleep(100); }
    if ((await dlgSw(page)).find(x => x.g === '*').on) return 'desligar um grupo não desligou «Todos»';
    if (await page.evaluate(() => document.querySelector('#app-dlg-ok').disabled)) return 'OK desativado com um grupo';
    await page.click('#app-dlg-ok'); await sleep(900);
    const c = await page.evaluate(() => JSON.parse(localStorage.getItem('cancioneiro.demo.cols')).find(x => x.id === 'demoE'));
    if (c.published !== true) return 'não publicou';
    if (JSON.stringify((c.groups || []).map(x => x.group_id)) !== '["g2"]') return 'grupos gravados: ' + JSON.stringify(c.groups);
    const m1 = await metas();
    if (!(m1.length === 2 && /^Coro · até /.test(m1[0]) && m1[1] === 'Grupos: Liceus')) return 'folha publicada: .col-meta ' + JSON.stringify(m1);
    await page.click('#col-mode'); await sleep(500);
    const cg = await page.evaluate(() => document.querySelector('#ce-groups')?.textContent.trim());
    return cg === 'Liceus' || '#ce-groups: ' + cg;
  }), { sev: 'média' });
  await t('FUN-65', 'Folha publicada para todos (v212): .col-meta «Grupos: Todos»; vários grupos pela ordem dos grupos («Grupos: Liceus, CLU»); #col-aud e #ce-aud com Cancioneiro antes de Coro; #ce-groups «Todos»', async () => {
    const bad = [];
    for (const [groups, want] of [[[], 'Grupos: Todos'], [[{ group_id: 'g3' }, { group_id: 'g2' }], 'Grupos: Liceus, CLU']]) await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1', cols: demoCols().map(c => c.id === 'demo1' ? { ...c, published: true, groups } : c) }, async ({ page }) => {
      await page.waitForSelector('.col-meta', { timeout: 8000 }).catch(() => {});
      const m = await page.evaluate(() => [...document.querySelectorAll('.col-meta')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      if (m[1] !== want) bad.push(`grupos ${JSON.stringify(groups.map(x => x.group_id))}: «${m[1]}» (esperado «${want}»)`);
      if (!groups.length) {
        await page.click('#col-mode'); await sleep(500);
        const r = await page.evaluate(() => ({ ce: [...document.querySelectorAll('#ce-aud button[data-v]')].map(b => b.dataset.v).join(), grp: document.querySelector('#ce-groups')?.textContent.trim() }));
        if (r.ce !== 'cancioneiro,coro') bad.push('#ce-aud: ' + r.ce);
        if (r.grp !== 'Todos') bad.push('#ce-groups: ' + r.grp);
      }
    });
    await withApp({ perfil: 'maestro' }, async ({ page }) => {
      await page.click('#btn-menu'); await sleep(500); await page.click('.col-new'); await sleep(500);
      const o = await page.evaluate(() => [...document.querySelectorAll('#col-aud button[data-v]')].map(b => b.dataset.v).join());
      if (o !== 'cancioneiro,coro') bad.push('#col-aud: ' + o);
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'baixa' });
  await t('FUN-64', 'Maestro só com os seus grupos (v210, mygroups g2+g3): Publicar mostra só Liceus e CLU, sem «Todos», OK desativado até escolher; #ce-groups igual; folha nova nasce com g2+g3', async () => {
    const bad = [];
    const st = { 'cancioneiro.demo.mygroups': ['g2', 'g3'], 'cancioneiro.demo.groupsAsked': true };
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE', storage: st }, async ({ page }) => {
      await page.waitForSelector('#col-pub', { timeout: 8000 }).catch(() => {});
      await page.click('#col-pub'); await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {}); await sleep(300);
      const sw = await dlgSw(page);
      if (sw.map(x => x.g).join() !== 'g2,g3') bad.push('Publicar: interruptores ' + sw.map(x => x.g).join());
      if (sw.some(x => x.on)) bad.push('Publicar: grupos já ligados');
      if (!(await page.evaluate(() => document.querySelector('#app-dlg-ok').disabled))) bad.push('Publicar: OK ativo sem grupo');
      await page.click('#app-dlg .switch-row[data-g="g3"]'); await sleep(200);
      if (await page.evaluate(() => document.querySelector('#app-dlg-ok').disabled)) bad.push('Publicar: OK desativado com CLU');
      await page.click('#app-dlg-cancel'); await sleep(300);
      await page.click('#col-mode'); await sleep(500); await page.click('#ce-groups'); await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {}); await sleep(300);
      const sw2 = await dlgSw(page);
      if (sw2.map(x => x.g).join() !== 'g2,g3') bad.push('#ce-groups: interruptores ' + sw2.map(x => x.g).join());
      await page.click('#app-dlg-cancel'); await sleep(200);
    });
    await withApp({ perfil: 'maestro', storage: st }, async ({ page }) => {
      await page.click('#btn-menu'); await sleep(500); await page.click('.col-new'); await sleep(500);
      await page.fill('#col-name', 'Folha de teste dos grupos'); await page.click('#col-save'); await sleep(1000);
      const c = await page.evaluate(() => JSON.parse(localStorage.getItem('cancioneiro.demo.cols') || '[]').find(x => x.title === 'Folha de teste dos grupos'));
      if (!c) { bad.push('folha nova não gravada'); return; }
      const g = (c.groups || []).map(x => x.group_id).sort().join();
      if (g !== 'g2,g3') bad.push('folha nova com grupos «' + g + '» (esperado g2,g3)');
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta' });
  await t('FUN-66', 'Estado da folha em Editar folha (v213): #ce-state «Publicada · Despublicar» numa publicada (#ce-unpub → confirmação «Despublicar «X»?» → por publicar logo, sem Guardar) e «Por publicar» sem #ce-unpub; Guardar mantém sempre publicada (v217; aviso «Folha guardada — continua publicada»), também com o título mudado', async () => {
    const bad = [];
    const col = (page, id) => page.evaluate(i => JSON.parse(localStorage.getItem('cancioneiro.demo.cols')).find(x => x.id === i), id);
    const state = page => page.evaluate(() => document.querySelector('#ce-state')?.textContent.replace(/\s+/g, ' ').trim() || '');
    const pub = () => demoCols().map(c => c.id === 'demo1' ? { ...c, published: true } : c);
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1', cols: pub() }, async ({ page }) => {
      await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(500);
      if (await state(page) !== 'Publicada · Despublicar') bad.push('publicada: #ce-state «' + await state(page) + '»');
      await page.click('#ce-unpub'); await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {});
      const q = await page.evaluate(() => document.querySelector('#app-dlg[open]')?.textContent || '');
      if (!/Despublicar «Missa de domingo»\?/.test(q)) bad.push('confirmação: ' + q.slice(0, 60));
      await page.click('#app-dlg-cancel'); await sleep(300);
      if ((await col(page, 'demo1')).published !== true) bad.push('cancelar a confirmação despublicou');
      await page.click('#ce-unpub'); await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {}); await page.click('#app-dlg-ok'); await sleep(700);
      if ((await col(page, 'demo1')).published !== false) bad.push('Despublicar não pôs por publicar logo');
      if (await state(page) !== 'Por publicar') bad.push('depois de despublicar: #ce-state «' + await state(page) + '»');
      if (await count(page, '#ce-unpub')) bad.push('«Por publicar» ainda com #ce-unpub');
    });
    // só grupos mudados → continua publicada
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1', cols: pub() }, async ({ page }) => {
      await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(500);
      await page.click('#ce-groups'); await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {});
      await page.click('#app-dlg .switch-row[data-g="*"]'); await sleep(150); await page.click('#app-dlg .switch-row[data-g="g3"]'); await sleep(150);
      await page.click('#app-dlg-ok'); await sleep(400);
      await page.click('#ce-save'); await sleep(900);
      const t1 = await page.evaluate(() => [...document.querySelectorAll('.toast, #toast')].map(x => x.textContent).join(' '));
      const c = await col(page, 'demo1');
      if (c.published !== true) bad.push('só grupos mudados: ficou por publicar');
      if (JSON.stringify((c.groups || []).map(x => x.group_id)) !== '["g3"]') bad.push('grupos gravados: ' + JSON.stringify(c.groups));
      if (!/continua publicada/.test(t1)) bad.push('aviso: «' + t1.trim().slice(0, 60) + '»');
    });
    // outra mudança → por publicar
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1', cols: pub() }, async ({ page }) => {
      await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(500);
      await page.fill('#ce-name', 'Missa de domingo (mudada)'); await sleep(200);
      await page.click('#ce-save'); await sleep(900);
      const t2 = await page.evaluate(() => [...document.querySelectorAll('.toast, #toast')].map(x => x.textContent).join(' '));
      const c2 = await col(page, 'demo1');
      // v217: Guardar nunca muda published
      if (c2.published !== true) bad.push('mudar o título despublicou (v217: continua publicada)');
      if (c2.title !== 'Missa de domingo (mudada)') bad.push('título não gravado');
      if (!/Folha guardada — continua publicada/.test(t2)) bad.push('aviso: «' + t2.trim().slice(0, 60) + '»');
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });
  await t('FUN-63', 'Gestão e grupos (v209, Gestor): .adm-groups por utilizador; secção «Grupos» com li[data-group] (g1..g5), .grp-ren e .grp-del; #grp-add com nome obrigatório e único sem distinguir maiúsculas; Retirar pede os grupos destino', () => withApp({ perfil: 'gestor', hash: '#/gestao' }, async ({ page }) => {
    await page.waitForSelector('li[data-group]', { timeout: 10000 }).catch(() => {});
    const r = await page.evaluate(() => ({ users: document.querySelectorAll('.adm-groups').length, groups: [...document.querySelectorAll('li[data-group]')].map(l => l.dataset.group + (l.querySelector('.grp-ren') && l.querySelector('.grp-del') ? '' : '!')) }));
    if (!r.users) return 'sem .adm-groups nos utilizadores';
    if (r.groups.join() !== 'g1,g2,g3,g4,g5') return 'grupos: ' + r.groups.join();
    const sub = '#grp-add button[type=submit]';
    if (!(await page.evaluate(q => document.querySelector(q).disabled, sub))) return 'Acrescentar grupo ativo sem nome';
    await page.fill('#grp-name', 'liceus'); await sleep(200); await page.click(sub); await sleep(600);
    const err = await page.evaluate(() => (document.querySelector('#app-dlg[open]')?.textContent || '') + (document.querySelector('.toast')?.textContent || '') + (document.querySelector('#gestao, .admin')?.textContent || ''));
    if (!/Já existe um grupo com esse nome/.test(err)) return 'nome repetido (maiúsculas) aceite ou sem aviso';
    if (await page.evaluate(() => document.querySelector('#app-dlg').open)) { await page.click('#app-dlg-ok'); await sleep(300); }
    await page.fill('#grp-name', 'Grupo novo de teste'); await page.click(sub); await sleep(800);
    const n = await page.evaluate(() => [...document.querySelectorAll('li[data-group]')].filter(l => /Grupo novo de teste/.test(l.textContent)).length);
    if (n !== 1) return 'grupo novo não apareceu';
    await page.click('li[data-group="g5"] .grp-del'); await page.waitForSelector('#app-dlg[open]', { timeout: 3000 }).catch(() => {});
    const t1 = await page.evaluate(() => document.querySelector('#app-dlg[open]')?.textContent || '');
    if (!/Retirar o grupo «Fraternidade»/.test(t1)) return 'Retirar: ' + t1.slice(0, 60);
    if ((await dlgSw(page)).some(x => x.g === 'g5')) return 'a escolha de destino inclui o próprio grupo';
    await page.click('#app-dlg .switch-row[data-g="g1"]'); await sleep(200); await page.click('#app-dlg-ok'); await sleep(800);
    if (await page.evaluate(() => !!document.querySelector('li[data-group="g5"]'))) return 'o grupo não foi retirado';
    return true;
  }), { sev: 'média' });

  await t('FUN-67', 'Cor do PDF da folha pelo público (v214): folha Coro → #1f6aa8 (--folha-coro), folha Cancioneiro → #0e7f58 (--folha-cancioneiro), em qualquer perfil; a outra cor não aparece (cores de preenchimento/traço lidas com pdfjs getOperatorList)', async () => {
    const bad = [], ev = [];
    const colorsOf = async (perfil, id) => withApp({ perfil, hash: '#/lista/colecao-' + id, isMobile: false, hasTouch: false }, async ({ page }) => {
      await page.waitForSelector('#col-share'); await page.click('#col-share'); await sleep(500);
      await page.locator('#app-dlg-list button').filter({ hasText: /Gerar PDF/ }).first().click(); await sleep(500);
      if (await page.evaluate(() => !!document.querySelector('#app-dlg[open] #pdf-o-chords'))) await page.click('#app-dlg-ok');
      await page.waitForSelector('#pdfpages canvas', { timeout: 30000 }).catch(() => {});
      const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      await page.click('#pdf-download'); const d = await dl;
      if (!d) return null;
      const b64 = fs.readFileSync(await d.path()).toString('base64');
      return page.evaluate(async b => {
        const lib = await import('/vendor/pdfjs/pdf.min.mjs'); lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
        const doc = await lib.getDocument({ data: Uint8Array.from(atob(b), c => c.charCodeAt(0)), isEvalSupported: false }).promise;
        const O = lib.OPS, out = new Set();
        const hex = a => typeof a === 'string' ? a.toLowerCase() : '#' + [...a].slice(0, 3).map(v => Math.round((v <= 1 ? v * 255 : v)).toString(16).padStart(2, '0')).join('');
        const page = await doc.getPage(1), ol = await page.getOperatorList();
        ol.fnArray.forEach((f, i) => { if ([O.setFillRGBColor, O.setStrokeRGBColor].includes(f)) out.add(hex(ol.argsArray[i].length === 1 ? ol.argsArray[i][0] : ol.argsArray[i])); });
        return [...out];
      }, b64);
    });
    for (const [perfil, id, want, not] of [['maestro', 'demo1', '#1f6aa8', '#0e7f58'], ['maestro', 'demo2', '#0e7f58', '#1f6aa8'], ['gestor', 'demo1', '#1f6aa8', '#0e7f58'], ['gestor', 'demo2', '#0e7f58', '#1f6aa8']]) {
      const cs = await colorsOf(perfil, id);
      if (!cs) { bad.push(`${perfil}/${id}: sem PDF`); continue; }
      ev.push(`${perfil}/${id}: ${cs.join(' ')}`);
      if (!cs.includes(want)) bad.push(`${perfil}/${id}: sem ${want} (cores ${cs.join(' ')})`);
      if (cs.includes(not)) bad.push(`${perfil}/${id}: tem também ${not}`);
    }
    return bad.length ? { fail: bad.join('; '), evidence: ev.join(' | ') } : { pass: ev.join(' | ') };
  }, { sev: 'baixa' });

  // ---- v150: endereços partilhados guardados no telemóvel ----
  await t('SHR-01', 'Folha partilhada: a lista traz a letra de todos os cânticos (sem acordes) e fica guardada em cancioneiro.partilhados', () => withApp({ q: 'semconta', hash: '#/p/demoC_demo1', wait: '#rows li' }, async ({ page }) => {
    await sleep(500);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('cancioneiro.partilhados') || '{}'));
    const e = st.demoC_demo1;
    if (!e || !Array.isArray(e.songs) || !e.songs.length) return 'nada guardado para a folha: ' + Object.keys(st).join(',');
    const chords = e.songs.filter(x => JSON.stringify(x.lyrics).match(/\[[A-G][^\]]*\]/));
    return chords.length ? 'guardado com acordes: ' + chords.map(x => x.slug).join(',') : { pass: e.songs.length + ' cânticos guardados' };
  }));
  await t('SHR-02', 'Folha partilhada: abrir um cântico não pede nada à rede (vem da memória) e abre sem rede', () => withApp({ q: 'semconta', hash: '#/p/demoC_demo1', wait: '#rows li' }, async ({ page, ctx }) => {
    await page.evaluate(() => { window.__calls = 0; const f = window.fetch; window.fetch = (...a) => { window.__calls++; return f(...a); }; });
    await ctx.setOffline(true);
    await page.locator('#rows li a').filter({ hasText: /Veni Creator/i }).first().click(); await sleep(800);
    const ok = /Veni Creator/i.test(await txt(page, '#song h1')), calls = await page.evaluate(() => window.__calls);
    await ctx.setOffline(false);
    if (!ok) return 'sem rede, o cântico da folha não abriu';
    return calls === 0 || `${calls} pedidos ao abrir o cântico`;
  }));
  await t('SHR-03', 'Folha partilhada sem rede depois de recarregar (service worker + armazenamento)', () => withApp({ q: 'semconta', hash: '#/p/demoC_demo1', wait: '#rows li', sw: true, isMobile: false, hasTouch: false }, async ({ page, ctx }) => {
    await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('#rows li', { timeout: 10000 }); await sleep(800);
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    await page.waitForSelector('#rows li', { timeout: 12000 }).catch(() => {});
    const list = /Veni Creator/i.test(await txt(page, '#rows'));
    await page.evaluate(() => { location.hash = '#/p/demoC_demo1/salve_regina'; }); await sleep(1000);
    const song = /Salve Regina/i.test(await txt(page, '#song h1'));
    await ctx.setOffline(false);
    return list && song || `sem rede após recarregar: lista ${list}, cântico ${song}`;
  }), { sev: 'média' });
  await t('SHR-04', 'Partilhas expiradas são apagadas do armazenamento ao abrir', () => withApp({ q: 'semconta', hash: '#/p/demoC_demo1', wait: '#rows li', storage: { 'cancioneiro.partilhados': { velho_token_expirado: { expires_at: '2020-01-01T00:00:00Z', list: { items: [] }, songs: [] } } } }, async ({ page }) => {
    await sleep(500);
    const st = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cancioneiro.partilhados') || '{}')));
    return !st.includes('velho_token_expirado') || 'entrada expirada continua guardada';
  }), { sev: 'baixa' });
  await t('SHR-05', 'Cântico partilhado sozinho também fica guardado e abre sem rede', () => withApp({ q: 'semconta', hash: '#/p/demo_salve_regina', wait: '#song h1' }, async ({ page, ctx }) => {
    const st = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cancioneiro.partilhados') || '{}')));
    if (!st.includes('demo_salve_regina')) return 'não guardado: ' + st.join(',');
    await ctx.setOffline(true);
    await page.evaluate(() => { location.hash = '#/'; }); await sleep(300);
    await page.evaluate(() => { location.hash = '#/p/demo_salve_regina'; }); await sleep(800);
    const ok = /Salve Regina/i.test(await txt(page, '#song h1'));
    await ctx.setOffline(false);
    return ok || 'sem rede não abriu';
  }), { sev: 'média' });
  await t('SHR-06', 'Preferidos: letras descarregadas ao abrir, como as folhas (modo real simulado)', () => withApp({ real: { rest: tb => tb.startsWith('favorites') ? { body: [{ slug: 'de_colores' }, { slug: 'santa_lucia' }] } : null }, wait: '#rows li a', timeout: 20000, settle: 7000 }, async ({ calls }) => {
    const got = calls.filter(c => c.startsWith('song:')).map(c => c.slice(5));
    const miss = ['de_colores', 'santa_lucia'].filter(x => !got.includes(x));
    return miss.length ? `letras não pedidas: ${miss.join(', ')} (pedidos: ${got.join(',') || 'nenhum'})` : { pass: 'pedidas: ' + got.join(', ') };
  }), { sev: 'média' });

  // ===================== Ligações (na app) =====================
  dim('Ligações e navegação — app', 'média');
  await t('LNK-20', 'Todas as ligações internas (#/…) visíveis no índice, gaveta e cântico abrem um ecrã válido', () => withApp({ perfil: 'gestor' }, async ({ page }) => {
    await page.click('#btn-menu'); await sleep(400);
    const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="#/"]')].map(a => a.getAttribute('href')))]);
    const bad = [];
    for (const h of hrefs.slice(0, 60)) {
      await page.evaluate(x => { location.hash = x; }, h); await sleep(250);
      const ok = await page.evaluate(() => !document.querySelector('#view-list').hidden || !document.querySelector('#view-song').hidden || !document.querySelector('#view-admin').hidden);
      if (!ok) bad.push(h);
    }
    return bad.length ? 'sem ecrã: ' + bad.join(', ') : { pass: hrefs.length + ' ligações' };
  }));

  // ===================== Segurança (interface) =====================
  dim('Segurança — interface', 'crítica');
  await t('SEG-40', 'XSS: títulos, autores, letras, rótulos e etiquetas com HTML não executam (lista, pesquisa, cântico, folha, partilha)', () => withApp({ perfil: 'gestor', songs: xssFixture() }, async ({ page }) => {
    const routes = ['#/', '#/cantico/salve_regina', '#/cantico/amazing_grace', '#/lista/colecao-demo1', '#/lista/favoritos', '#/lista/la'];
    for (const h of routes) { await page.evaluate(x => { location.hash = x; }, h); await sleep(400); }
    await page.fill('#search', 'img'); await sleep(900);
    await page.fill('#search', 'Ave'); await sleep(1200);
    await page.evaluate(() => { location.hash = '#/cantico/salve_regina'; }); await sleep(400);
    const sw = page.locator('#song .lang-switch button'); if (await sw.count() > 1) { await sw.nth(1).click(); await sleep(300); }
    await page.hover('#song').catch(() => {});
    const x = await page.evaluate(() => window.__xss || 0);
    const injected = await page.evaluate(() => document.querySelectorAll('#song img[src="x"], #rows img[src="x"], svg[onload]').length);
    return x === 0 && injected === 0 || `script executado ${x}× / ${injected} elementos injetados`;
  }), { sev: 'crítica' });
  await t('SEG-41', 'XSS: nome de folha e de secção com HTML não executam', () => withApp({ perfil: 'maestro', cols: [{ ...demoCols()[0], title: 'Folha ' + XSS, sections: [{ id: 's1', title: XSS, position: 0 }] }] }, async ({ page }) => {
    await page.click('#btn-menu'); await sleep(400);
    await page.evaluate(() => { location.hash = '#/lista/colecao-demo1'; }); await sleep(600);
    return (await page.evaluate(() => window.__xss || 0)) === 0 || 'script executado';
  }), { sev: 'crítica' });
  await t('SEG-42', 'Letra protegida: copiar, menu de contexto e selecionar texto bloqueados na letra', () => withApp({ perfil: 'coro', hash: '#/cantico/salve_regina' }, async ({ page }) => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('#song p, #song .stanza, #song li') || document.querySelector('#song');
      const evs = ['copy', 'contextmenu', 'selectstart'].map(n => { const e = new Event(n, { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; });
      return evs;
    });
    return r.every(Boolean) || 'não bloqueado: ' + JSON.stringify(r);
  }), { sev: 'baixa' });
  await t('SEG-43', 'Modo ?demo não funciona fora de localhost (só em localhost/127.0.0.1)', () => {
    const js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    return /const DEMO = \['localhost', '127\.0\.0\.1'\]\.includes\(location\.hostname\)/.test(js) || 'condição do DEMO mudou';
  });
  await t('SEG-44', 'CSP do index.html não bloqueia nada da app em uso normal (modo real simulado)', () => withApp({ real: {}, hash: '#/cantico/salve_regina', wait: '#song h1', timeout: 20000 }, async ({ page, errs }) => {
    const csp = errs.filter(e => /Content Security Policy|CSP/i.test(e));
    return csp.length ? csp.join(' | ') : true;
  }, ), { sev: 'alta' });

  // ===================== Estabilidade =====================
  dim('Estabilidade — interface', 'alta');
  await t('EST-10', 'Sessão longa: 150 navegações sem erros, memória e nós DOM estáveis', () => withApp({ perfil: 'gestor', hash: '#/' }, async ({ page }) => {
    const m = () => page.evaluate(() => ({ heap: performance.memory ? performance.memory.usedJSHeapSize : 0, nodes: document.getElementsByTagName('*').length }));
    const hashes = ['#/', '#/cantico/salve_regina', '#/lista/la', '#/cantico/amazing_grace', '#/lista/favoritos', '#/lista/colecao-demo1', '#/cantico/adoro_te_devote'];
    for (let i = 0; i < 14; i++) { await page.evaluate(x => { location.hash = x; }, hashes[i % hashes.length]); await sleep(80); }
    const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage');
    const a = await m();
    for (let i = 0; i < (full ? 150 : 60); i++) { await page.evaluate(x => { location.hash = x; }, hashes[i % hashes.length]); await sleep(60); }
    await page.evaluate(() => { location.hash = '#/'; }); await sleep(400);
    await cdp.send('HeapProfiler.collectGarbage');
    const b = await m();
    const grow = (b.heap - a.heap) / 1e6;
    const ev = `heap ${Math.round(a.heap / 1e6)} → ${Math.round(b.heap / 1e6)} MB, nós ${a.nodes} → ${b.nodes}`;
    return grow > 15 || b.nodes > a.nodes * 1.5 + 200 ? { warn: ev } : { pass: ev };
  }));
  await t('EST-11', 'Service worker regista-se, guarda a app e abre sem rede (offline)', () => withApp({ perfil: 'coro', sw: true, isMobile: false, hasTouch: false }, async ({ page, ctx }) => {
    const ok = await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active).catch(() => false));
    if (!ok) return 'service worker não ficou ativo';
    await page.reload(); await page.waitForSelector('#splash.gone', { state: 'attached' }); await sleep(1500);
    const caches = await page.evaluate(() => caches.keys());
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    await page.waitForSelector('#splash.gone', { state: 'attached', timeout: 15000 }).catch(() => {});
    await sleep(1000);
    const shell = await page.evaluate(() => !!document.querySelector('#view-list') && getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)');
    const rows = await count(page, '#rows li');
    await ctx.setOffline(false);
    return shell ? { pass: `caches ${caches.join(',')}; ${rows} linhas sem rede` } : 'sem rede a app não abre';
  }), { sev: 'alta' });
  await t('EST-12', 'Service worker: ao mudar de versão apaga as caches antigas (exceto cancioneiro-media)', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    return /ks\.filter\(k => k !== CACHE && k !== 'cancioneiro-media'\)\.map\(k => caches\.delete\(k\)\)/.test(sw) && /skipWaiting/.test(sw) && /clients\.claim/.test(sw) || 'activate do sw.js mudou';
  });
  await t('EST-13', 'localStorage corrompido não impede a app de abrir', () => withApp({ perfil: 'coro', storage: { 'cancioneiro.prefs': '{nao-json', 'cancioneiro.songs.v2': '[[[', 'cancioneiro.favs.demo': 'x', 'cancioneiro.perfil.demo': '{' } }, async ({ page }) => {
    await page.waitForSelector('#rows li a', { timeout: 8000 }).catch(() => {});
    return (await count(page, '#rows li a')) > 0 || 'índice vazio com localStorage corrompido';
  }), { sev: 'média' });

  // ===================== Resiliência (modo real, Supabase simulado) =====================
  dim('Resiliência', 'alta');
  await t('RES-01', 'Supabase em baixo, com sessão guardada: a capa sai e há mensagem (não fica presa)', () => withApp({ real: { down: true }, wait: false, settle: 0, allowErrors: true }, async ({ page }) => {
    const t0 = Date.now();
    await page.waitForSelector('#splash.gone', { state: 'attached', timeout: 16000 }).catch(() => {});
    const ms = Date.now() - t0;
    await sleep(2500);
    const gone = await page.evaluate(() => document.querySelector('#splash').classList.contains('gone'));
    const msg = await page.evaluate(() => (document.querySelector('#status')?.textContent || '') + ' ' + (document.querySelector('#login-msg')?.textContent || ''));
    if (!gone) return 'presa na capa verde';
    return msg.trim() ? { pass: `${ms} ms; «${msg.trim().slice(0, 80)}»` } : { warn: `capa saiu em ${ms} ms mas sem mensagem para a pessoa` };
  }));
  await t('RES-02', 'Supabase lento (7 s por pedido): a app abre com a sessão guardada em ≤ 12 s', () => withApp({ real: { slowMs: 7000 }, wait: false, settle: 0, allowErrors: true }, async ({ page }) => {
    const t0 = Date.now();
    await page.waitForSelector('#splash.gone', { state: 'attached', timeout: 20000 }).catch(() => {});
    const ms = Date.now() - t0;
    return ms <= 12000 ? { pass: ms + ' ms' } : `${ms} ms até sair da capa`;
  }), { sev: 'média' });
  await t('RES-03', 'Função conteudo com erro 500 ao abrir um cântico: mensagem no cântico, sem erro JS', () => withApp({ real: { conteudo: op => op === 'song' ? { status: 500, body: { error: 'falha simulada' } } : null }, hash: '#/cantico/salve_regina', wait: '#song h1', timeout: 20000 }, async ({ page }) => {
    await sleep(1500);
    const s = await txt(page, '#song');
    return /não foi possível|erro|tente|ligação/i.test(s) ? { pass: s.split('\n').find(l => /possível|erro|tente|ligação/i.test(l)) } : 'sem mensagem: ' + s.slice(0, 120);
  }));
  await t('RES-04', 'Limite de uso (429): a mensagem do servidor chega à pessoa', () => withApp({ real: { conteudo: op => op === 'song' ? { status: 429, body: { error: 'limite', message: 'Atingiu o limite de uso por agora. Tente de novo mais tarde.' } } : null }, hash: '#/cantico/salve_regina', wait: '#song h1', timeout: 20000 }, async ({ page }) => {
    await sleep(1500);
    return /limite/i.test(await txt(page, '#song')) || 'mensagem de limite não aparece: ' + (await txt(page, '#song')).slice(0, 120);
  }));
  await t('RES-05', 'Sessão expirada (401 e renovação recusada): não fica em ciclo, mostra entrada ou mensagem', () => withApp({ real: { refreshFail: true, rest: tb => tb === 'songs' ? { status: 401, body: { message: 'JWT expired' } } : null, conteudo: () => ({ status: 401, body: { error: 'sem acesso' } }) }, wait: false, settle: 0, allowErrors: true }, async ({ page, calls }) => {
    await page.waitForSelector('#splash.gone', { state: 'attached', timeout: 16000 }).catch(() => {});
    await sleep(4000);
    const n = calls.length;
    await sleep(3000);
    const loop = calls.length - n;
    const login = await vis(page, '#view-login');
    const msg = await page.evaluate(() => document.querySelector('#status')?.textContent || '');
    if (loop > 10) return `${loop} pedidos em 3 s (ciclo de renovação)`;
    return login || msg ? { pass: login ? 'ecrã de entrada' : msg.slice(0, 80) } : { warn: 'sem ecrã de entrada nem mensagem' };
  }));
  await t('RES-06', 'Partitura indisponível (armazenamento 403): mensagem «Não foi possível abrir a partitura»', () => withApp({ real: { conteudo: op => op === 'file' ? { status: 500, body: { error: 'ficheiro indisponível' } } : null }, hash: '#/cantico/adoro_te_devote/partitura', wait: false, settle: 6000, allowErrors: true }, async ({ page }) => {
    const s = await txt(page, '#pdfpages');
    return /não foi possível|indisponível/i.test(s) || 'sem mensagem: «' + s.slice(0, 100) + '»';
  }));
  await t('RES-07', 'Sem rede a meio: marcar preferido repõe o estado e avisa', () => withApp({ real: { rest: (tb, req) => tb.startsWith('favorites') && req.method() !== 'GET' ? { status: 503, body: { message: 'sem rede' } } : null }, hash: '#/cantico/de_colores', wait: '#song h1', timeout: 20000 }, async ({ page }) => {
    await sleep(800);
    const before = await page.getAttribute('#btn-fav', 'aria-pressed');
    await page.click('#btn-fav'); await sleep(1200);
    const after = await page.getAttribute('#btn-fav', 'aria-pressed');
    const alert = await page.evaluate(() => document.querySelector('#app-dlg').open ? document.querySelector('#app-dlg-msg').textContent : '');
    if (after !== before) return `ficou ${after} sem gravar no servidor`;
    return alert ? { pass: alert.slice(0, 80) } : { warn: 'repôs mas sem aviso' };
  }), { sev: 'média' });
  await t('RES-08', 'Dados incompletos (sem autor, letra vazia, sem ficheiros, número em falta) não partem a app', () => withApp({ perfil: 'coro', songs: [...fixture, { ...fixture[0], slug: 'incompleto', title: 'Incompleto', author: null, lyrics: [], translation: null, files: null, tags: null, sources: [], number: null }, { ...fixture[1], slug: 'sem_linhas', title: 'Sem linhas', lyrics: [{ type: 'verse', lines: [] }], files: [{ kind: 'score', label: null, path: null }] }], hash: '#/cantico/incompleto' }, async ({ page }) => {
    await sleep(800);
    await page.evaluate(() => { location.hash = '#/cantico/sem_linhas'; }); await sleep(800);
    await page.evaluate(() => { location.hash = '#/'; }); await sleep(500);
    await page.fill('#search', 'Incompleto'); await sleep(800);
    return (await count(page, '#rows li')) > 0 || 'não encontra o cântico incompleto';
  }), { sev: 'média' });
  if (full) {
    await t('RES-09', 'Sessão guardada sem Supabase e sem cópia da lista: mensagem em vez de ecrã vazio', () => withApp({ real: { rest: tb => tb === 'songs' ? { status: 503, body: { message: 'indisponível' } } : null }, wait: false, settle: 0, allowErrors: true }, async ({ page }) => {
      await page.waitForSelector('#splash.gone', { state: 'attached', timeout: 16000 }).catch(() => {});
      await sleep(3000);
      const s = await page.evaluate(() => document.querySelector('#status')?.textContent || '');
      return s.trim() ? { pass: s.slice(0, 80) } : { warn: 'lista vazia sem mensagem' };
    }));
  }

  await t('RES-10', 'Voltar à app depois de > 5 min em segundo plano recarrega cânticos, preferidos e folhas; antes dos 5 min não (modo real simulado) (v194)', () => withApp({ real: {}, wait: '#rows li a', timeout: 20000, settle: 1500 }, async ({ page, calls }) => {
    const n = () => calls.filter(c => /\/rest\/v1\/(songs|favorites|collections)/.test(c)).length;
    const show = () => page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    const n0 = n(); await show(); await sleep(1000);
    if (n() !== n0) return 'recarregou logo (antes dos 5 min)';
    await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 6 * 60e3; }); // 6 min depois
    await show(); await sleep(2000);
    const got = calls.slice(n0).filter(c => /\/rest\/v1\/(songs|favorites|collections)/.test(c)).map(c => c.match(/\/rest\/v1\/(\w+)/)[1]);
    const miss = ['songs', 'favorites', 'collections'].filter(x => !got.includes(x));
    return miss.length ? 'depois de 6 min não recarregou: ' + miss.join(', ') : { pass: 'recarregou ' + [...new Set(got)].join(', ') };
  }), { sev: 'média' });

  await t('RES-11', 'Lista de cânticos recusada pelo servidor (42501) com cópia guardada: a app mostra o aviso «Não foi possível atualizar a lista…» em vez de ficar calada (v195)', () => withApp({ real: { rest: tb => tb === 'songs' ? { status: 401, body: { code: '42501', message: 'permission denied for table songs' } } : null }, storage: { 'cancioneiro.songs.v2': fixture.map(({ lyrics, translation, lyrics_edit, ...x }) => ({ ...x, has_translation: !!translation, is_edited: false })) }, wait: false, settle: 0, allowErrors: true }, async ({ page }) => {
    await page.waitForSelector('#splash.gone', { state: 'attached', timeout: 16000 }).catch(() => {});
    const seen = await page.waitForFunction(() => /Não foi possível atualizar a lista/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 12000 }).then(() => true).catch(() => false);
    return seen || 'sem aviso quando a lista não atualiza';
  }), { sev: 'alta' });

  // ===================== Escalabilidade / desempenho =====================
  dim('Escalabilidade e desempenho — interface', 'média');
  const big = bigFixture(2000);
  await t('ESC-10', 'Índice com 2000 cânticos: abre e desenha em tempo razoável', () => withApp({ perfil: 'coro', songs: big, settle: 0 }, async ({ page, loadMs }) => {
    await page.waitForSelector('#rows li a', { timeout: 15000 });
    const n = await count(page, '#rows li');
    const long = await page.evaluate(() => new Promise(r => { let tot = 0; try { new PerformanceObserver(l => l.getEntries().forEach(e => tot += e.duration)).observe({ type: 'longtask', buffered: true }); } catch (e) {} setTimeout(() => r(tot), 300); }));
    const ev = `${n} linhas, abriu em ${loadMs} ms (inclui capa de 2 s), tarefas longas ${Math.round(long)} ms`;
    return loadMs > 6000 ? { warn: ev } : { pass: ev };
  }));
  await t('ESC-11', 'Pesquisa em 2000 cânticos: resposta < 400 ms por tecla', () => withApp({ perfil: 'coro', songs: big }, async ({ page }) => {
    const ms = await page.evaluate(async () => {
      const inp = document.querySelector('#search'); const out = [];
      for (const q of ['c', 'ca', 'can', 'cant', 'cânt', 'teste 19']) { const t0 = performance.now(); inp.value = q; inp.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); out.push(performance.now() - t0); }
      return out;
    });
    const max = Math.max(...ms);
    return max < 400 ? { pass: 'máx. ' + Math.round(max) + ' ms' } : { warn: 'máx. ' + Math.round(max) + ' ms: ' + ms.map(Math.round).join(', ') };
  }));
  await t('ESC-12', 'Métricas de carregamento (FCP, LCP, CLS) no telemóvel', () => withApp({ perfil: 'coro', settle: 300 }, async ({ page }) => {
    const m = await page.evaluate(() => new Promise(r => {
      const o = { fcp: 0, lcp: 0, cls: 0 };
      try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.name === 'first-contentful-paint') o.fcp = e.startTime; })).observe({ type: 'paint', buffered: true }); } catch (e) {}
      try { new PerformanceObserver(l => l.getEntries().forEach(e => o.lcp = e.startTime)).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
      try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) o.cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
      setTimeout(() => r(o), 500);
    }));
    const ev = `FCP ${Math.round(m.fcp)} ms, LCP ${Math.round(m.lcp)} ms, CLS ${m.cls.toFixed(3)} (local, sem rede real)`;
    return m.cls > 0.1 || m.fcp > 1800 ? { warn: ev } : { pass: ev };
  }), { sev: 'baixa' });

  // ===================== Usabilidade e acessibilidade =====================
  dim('Usabilidade e acessibilidade', 'média');
  const screens = [['índice', { perfil: 'maestro' }], ['cântico', { perfil: 'maestro', hash: '#/cantico/salve_regina' }], ['folha', { perfil: 'maestro', hash: '#/lista/colecao-demo1' }], ['gestão', { perfil: 'gestor', hash: '#/gestao' }], ['folha-edição', { perfil: 'maestro', hash: '#/lista/colecao-demoE', open: '#col-mode' }]];
  await t('USA-10', 'Alvos de toque ≥ 44×44 px (botões e ligações visíveis)', async () => {
    const small = [];
    for (const [name, o] of screens) await withApp(o, async ({ page }) => {
      const s = await page.evaluate(() => [...document.querySelectorAll('button, a[href], [role=button], input, select')].filter(e => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width && r.height && st.visibility !== 'hidden' && r.top < innerHeight && r.bottom > 0 && !e.closest('[hidden]'); })
        .map(e => { const r = e.getBoundingClientRect(); let w = r.width, h = r.height;
          // área de toque alargada por ::after (position:absolute com inset negativo), como nos segmentados e botões pequenos
          const a = getComputedStyle(e, '::after');
          if (a.content !== 'none' && a.position === 'absolute') { const px = v => parseFloat(v) || 0; w = Math.max(w, w - px(a.left) - px(a.right), px(a.width)); h = Math.max(h, h - px(a.top) - px(a.bottom), px(a.height)); } // inset negativo ou tamanho próprio (ex.: height: var(--hit))
          // campo dentro de uma caixa maior que recebe o toque (ex.: pesquisa): conta a caixa
          if (e.tagName === 'INPUT' && e.parentElement) { const pr = e.parentElement.getBoundingClientRect(); w = Math.max(w, pr.width); h = Math.max(h, pr.height); }
          return { id: e.id || e.className.baseVal || e.className || ((e.parentElement?.closest('[id]')?.id || '') + '>' + e.tagName.toLowerCase()), w: Math.round(w), h: Math.round(h), inl: getComputedStyle(e).display === 'inline' }; })
        .filter(x => (x.w < 44 || x.h < 44) && !x.inl && !/^#\//.test(x.id)));
      for (const x of s) small.push(`${name}: ${String(x.id).slice(0, 30)} ${x.w}×${x.h}`);
    });
    // exceções decididas pela sessão principal (tests/baseline.json → tapExceptions): botões de 40 px e linhas densas de 32 px
    const exc = JSON.parse(fs.readFileSync(path.join(TESTS, 'baseline.json'), 'utf8')).tapExceptions || {};
    const uniq = [...new Set(small)].filter(x => !Object.keys(exc).some(k => x.includes(': ' + k + ' ')));
    return uniq.length ? { warn: `${uniq.length} alvos < 44 px: ${uniq.slice(0, 12).join('; ')}` } : { pass: 'exceções aceites: ' + Object.keys(exc).join(', ') };
  });
  await t('USA-11', 'Ecrãs pequenos (320 px) e paisagem: sem deslocamento horizontal', async () => {
    const bad = [];
    for (const vp of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
      for (const [name, o] of [...screens, ['partilhado', { q: 'semconta', hash: '#/p/demo_salve_regina', wait: '#song h1' }]]) await withApp({ ...o, viewport: vp }, async ({ page }) => {
        const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (ov > 1) bad.push(`${name} ${vp.width}×${vp.height}: +${ov} px`);
        // diálogos abertos também cabem
        if (name === 'índice') { await page.click('#btn-perfil'); await sleep(300); const d = await page.evaluate(() => { const r = document.querySelector('dialog[open]')?.getBoundingClientRect(); return r ? r.right - innerWidth : 0; }); if (d > 1) bad.push(`perfil ${vp.width}: diálogo sai ${d} px`); }
      });
    }
    return bad.length ? bad.join('; ') : true;
  });
  await t('USA-12', 'Contraste de texto (WCAG AA 4.5:1) no índice e no cântico, claro e escuro, nos 4 perfis (cores por perfil desde v203); folha e edição', async () => {
    const bad = [];
    const PERFIS4 = ['cancioneiro', 'coro', 'maestro', 'gestor'];
    const cs = [...PERFIS4.flatMap(p => [[screens[0][0] + '/' + p, { ...screens[0][1], perfil: p }], [screens[1][0] + '/' + p, { ...screens[1][1], perfil: p }]]), screens[2], screens[4]];
    for (const scheme of ['light', 'dark']) for (const [name, o] of cs) await withApp({ ...o, scheme }, async ({ page }) => {
      const r = await page.evaluate(() => {
        const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
        const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        // fundo efetivo: o primeiro antepassado opaco; no body conta também o ::before (folha em edição: fundo branco por cima do verde)
        const bgOf = el => { for (let e = el; e; e = e.parentElement) { const st = getComputedStyle(e);
          if (e === document.body) { const b = getComputedStyle(e, '::before'); const bc = parse(b.backgroundColor); if (b.content !== 'none' && bc && bc.a > 0.9) return bc; }
          if (st.backgroundImage && st.backgroundImage !== 'none') return 'img'; const c = parse(st.backgroundColor); if (c && c.a > 0.9) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
          const rc = el.getBoundingClientRect(); if (!rc.width || rc.top > innerHeight || rc.bottom < 0 || el.closest('[hidden],dialog:not([open]),.drawer:not(.open),#splash')) continue;
          const st = getComputedStyle(el); if (st.visibility === 'hidden' || +st.opacity < 0.5) continue;
          const fg = parse(st.color), bg = bgOf(el); if (!fg || bg === 'img') continue;
          const L1 = lum(fg), L2 = lum(bg), cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const big = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && +st.fontWeight >= 700);
          if (cr < (big ? 3 : 4.5)) out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} «${el.textContent.trim().slice(0, 18)}» ${cr.toFixed(2)}`);
        }
        return [...new Set(out)];
      });
      for (const x of r) bad.push(`${name}/${scheme}: ${x}`);
    });
    return bad.length ? { warn: `${bad.length} textos abaixo de AA: ${bad.slice(0, 10).join('; ')}` } : true;
  });
  await t('USA-13', 'Teclado: Tab percorre os controlos com foco visível; Escape fecha diálogos', () => withApp({ perfil: 'coro', isMobile: false, hasTouch: false }, async ({ page }) => {
    const seen = [], noRing = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab'); await sleep(60);
      const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null;
        // o anel pode estar no próprio elemento ou numa caixa à volta (:focus-within, ex.: .search)
        const ring = x => { const st = getComputedStyle(x); return st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0 || st.boxShadow !== 'none'; };
        return { id: e.id || e.className || e.tagName, ring: ring(e) || (!!e.parentElement && e.parentElement.matches(':focus-within') && ring(e.parentElement)) }; });
      if (f) { seen.push(f.id); if (!f.ring) noRing.push(f.id); }
    }
    await page.click('#btn-perfil'); await sleep(300);
    await page.keyboard.press('Escape'); await sleep(300);
    const open = await page.evaluate(() => !!document.querySelector('dialog[open]'));
    if (!seen.length) return 'Tab não move o foco';
    if (open) return 'Escape não fecha o diálogo Perfil';
    return noRing.length ? { warn: 'sem indicação de foco: ' + [...new Set(noRing)].join(', ') } : { pass: seen.join(' → ') };
  }));
  await t('USA-14', 'Nomes acessíveis: todos os botões e ligações visíveis têm texto ou aria-label; idioma da página pt', async () => {
    const bad = [];
    for (const [name, o] of screens) await withApp(o, async ({ page }) => {
      const r = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select, textarea')].filter(e => e.getBoundingClientRect().width && !e.closest('[hidden]'))
        .filter(e => !(e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText.trim() || e.getAttribute('placeholder') || (e.labels && e.labels.length) || e.getAttribute('aria-labelledby')))
        .map(e => e.id || e.className || e.outerHTML.slice(0, 40)));
      for (const x of r) bad.push(`${name}: ${x}`);
      if (name === 'índice' && (await page.evaluate(() => document.documentElement.lang)) !== 'pt') bad.push('html lang ≠ pt');
    });
    return bad.length ? [...new Set(bad)].slice(0, 15).join('; ') : true;
  });
  await t('USA-15', 'Diálogos têm título e botão de fechar visível', () => withApp({ perfil: 'maestro' }, async ({ page }) => {
    const ids = await page.evaluate(() => [...document.querySelectorAll('dialog')].map(d => ({ id: d.id, h: !!d.querySelector('h2'), close: !!d.querySelector('button[id$="close"], button[id$="cancel"], .dlg-x, button[id$="-x"]') })));
    const bad = ids.filter(d => !d.h || !d.close).map(d => d.id + (!d.h ? ' sem título' : ' sem fechar'));
    return bad.length ? { warn: bad.join(', ') } : true;
  }), { sev: 'baixa' });
  await t('USA-17', 'Livro no cântico (Maestro): opções .col-pick[data-k] com aria-pressed; original com aria-disabled; acrescentar ao Cancioneiro e retirar com confirmação; teclado (Espaço/Enter) (v165)', () => withApp({ perfil: 'maestro', hash: '#/cantico/pange_lingua', isMobile: false, hasTouch: false }, async ({ page }) => {
    await page.waitForSelector('#song h1'); await page.click('#btn-fav'); await sleep(500);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#col-pick .col-pick[data-k]')].map(b => ({ k: b.dataset.k, pressed: b.getAttribute('aria-pressed'), on: b.classList.contains('on'), dis: b.getAttribute('aria-disabled'), tag: b.tagName })));
    if (!rows.length) return 'sem opções .col-pick[data-k]';
    if (await count(page, '#pick-canc, #pick-fav, #pick-coro, #col-pick input[type=checkbox]')) return 'ainda há #pick-*/checkboxes';
    const bad = rows.filter(x => x.tag !== 'BUTTON' || !['true', 'false'].includes(x.pressed) || (x.pressed === 'true') !== x.on).map(x => x.k);
    if (bad.length) return 'aria-pressed/.on incoerentes: ' + bad.join(',');
    if (!rows.some(x => x.k === 'cancioneiro') || !rows.some(x => x.k === 'fav')) return 'faltam cancioneiro/fav: ' + rows.map(x => x.k).join(',');
    if (rows.some(x => x.k === 'coro')) return 'ainda há a opção Coro (saiu na v174)';
    // v186: cada opção tem um ícone svg.pick-ic antes do nome
    const noIcon = await page.evaluate(() => [...document.querySelectorAll('#col-pick .col-pick[data-k]')].filter(b => { const i = b.querySelector('svg.pick-ic'); const span = b.querySelector('span'); return !i || (span && (i.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING) === 0); }).map(b => b.dataset.k));
    if (noIcon.length) return 'opções sem svg.pick-ic antes do nome: ' + noIcon.join(',');
    const c0 = rows.find(x => x.k === 'cancioneiro').pressed;
    await page.focus('#col-pick .col-pick[data-k="cancioneiro"]'); await page.keyboard.press(c0 === 'true' ? 'Enter' : 'Space'); await sleep(700);
    if (c0 === 'true') { if (!(await page.evaluate(() => document.querySelector('#app-dlg').open))) return 'retirar do Cancioneiro não pediu confirmação'; await page.click('#app-dlg-ok'); await sleep(700); }
    else if (await page.evaluate(() => document.querySelector('#app-dlg').open)) return 'acrescentar pediu confirmação';
    const c1 = await page.getAttribute('#col-pick .col-pick[data-k="cancioneiro"]', 'aria-pressed');
    if (c1 === c0) return `aria-pressed não mudou (${c0})`;
    if (c1 === 'true') { // e agora retirar: tem de confirmar
      await page.focus('#col-pick .col-pick[data-k="cancioneiro"]'); await page.keyboard.press('Enter'); await sleep(500);
      if (!(await page.evaluate(() => document.querySelector('#app-dlg').open))) return 'retirar do Cancioneiro não pediu confirmação';
      await page.click('#app-dlg-cancel'); await sleep(400);
      if ((await page.getAttribute('#col-pick .col-pick[data-k="cancioneiro"]', 'aria-pressed')) !== 'true') return 'cancelar a confirmação retirou na mesma';
    }
    const fixed = await withApp({ perfil: 'maestro', hash: '#/cantico/amazing_grace' }, async ({ page: p2 }) => { await p2.waitForSelector('#song h1'); await p2.click('#btn-fav'); await sleep(400); return { pass: String(await p2.getAttribute('#col-pick .col-pick[data-k="cancioneiro"]', 'aria-disabled')) }; });
    return fixed.pass === 'true' || 'cântico do original: opção Cancioneiro sem aria-disabled=true';
  }));
  await t('USA-24', 'Cores por perfil (v203): <html> e <body> com .perfil-X do perfil ativo (e só esse), mudar de perfil troca a classe e --brand; capa (.splash) sempre com --app-brand #10835c; títulos das janelas (dialog h2) em --accent com contraste ≥ 4.5:1', async () => {
    const bad = [], ev = [];
    const rgb = 'rgb(16, 131, 92)';
    for (const perfil of ['cancioneiro', 'coro', 'maestro', 'gestor']) for (const scheme of ['light', 'dark']) await withApp({ perfil, scheme }, async ({ page }) => {
      const r = await page.evaluate(() => {
        const cls = el => [...el.classList].filter(c => c.startsWith('perfil-'));
        const probe = (v, el = document.body) => { const d = document.createElement('div'); d.style.color = `var(${v})`; el.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
        const sp = document.querySelector('#splash, .splash');
        const spBrand = sp ? probe('--brand', sp) : null, spBg = sp ? getComputedStyle(sp).backgroundImage : '';
        const dlg = document.querySelector('#info'); dlg.showModal();
        const h2 = dlg.querySelector('h2'), hc = getComputedStyle(h2).color, acc = probe('--accent', dlg);
        let bg = 'rgba(0, 0, 0, 0)'; for (let e = h2; e && (bg === 'rgba(0, 0, 0, 0)' || /, 0\)$/.test(bg)); e = e.parentElement) bg = getComputedStyle(e).backgroundColor;
        dlg.close();
        const p = c => (c.match(/[\d.]+/g) || []).map(Number);
        const lum = q => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(q[0]) + 0.7152 * f(q[1]) + 0.0722 * f(q[2]); };
        const x = lum(p(hc)), y = lum(p(bg));
        return { html: cls(document.documentElement), body: cls(document.body), brand: probe('--brand'), spBrand, spBg, hc, acc, bg, cr: (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) };
      });
      const k = `${perfil}/${scheme}`;
      if (JSON.stringify(r.html) !== JSON.stringify(['perfil-' + perfil])) bad.push(`${k}: <html> ${r.html.join(' ') || 'sem perfil-'}`);
      if (JSON.stringify(r.body) !== JSON.stringify(['perfil-' + perfil])) bad.push(`${k}: <body> ${r.body.join(' ') || 'sem perfil-'}`);
      if (r.spBrand !== rgb) bad.push(`${k}: capa com --brand ${r.spBrand} (esperado ${rgb})`);
      if (r.hc !== r.acc) bad.push(`${k}: dialog h2 ${r.hc} ≠ --accent ${r.acc}`);
      if (r.cr < 4.5) bad.push(`${k}: dialog h2 ${r.hc} sobre ${r.bg} ${r.cr.toFixed(2)}:1`);
      ev.push(`${k} brand ${r.brand} h2 ${r.cr.toFixed(1)}:1`);
    });
    // mudar de perfil (Gestor → Coro) troca a classe e a cor da marca
    await withApp({ perfil: 'gestor' }, async ({ page }) => {
      const before = await page.evaluate(() => (() => { const d = document.createElement('div'); d.style.color = 'var(--brand)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })());
      await page.click('#btn-perfil'); await sleep(400);
      const b = page.locator('#perfis-list .perfil-opt[data-p="coro"]').first();
      if (!(await b.count())) { bad.push('mudar de perfil: opção «Coro» não encontrada no Perfil'); return; }
      await b.click(); await sleep(700);
      const r = await page.evaluate(() => ({ html: [...document.documentElement.classList].filter(c => c.startsWith('perfil-')), bg: (() => { const d = document.createElement('div'); d.style.color = 'var(--brand)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })() }));
      if (JSON.stringify(r.html) !== '["perfil-coro"]') bad.push('depois de mudar para Coro: <html> ' + r.html.join(' '));
      if (r.bg === before) bad.push('depois de mudar para Coro --brand manteve-se ' + before);
    });
    return bad.length ? { fail: bad.join('; '), evidence: ev.join(' | ') } : { pass: ev.join(' | ') };
  }, { sev: 'média', where: 'app.js setPerfil (~2016), theme.css :root.perfil-*, styles.css .splash / dialog h2' });
  await t('USA-18', 'Texto e ícones sobre a cor da marca: texto ≥ 4.5:1 e opaco; ícones ≥ 3:1 (índice e gaveta nos 4 perfis, folha, e com a janela de edição aberta) (v203: cores por perfil)', async () => {
    const bad = [], ev = [];
    for (const o of [{ perfil: 'cancioneiro' }, { perfil: 'cancioneiro', act: 'menu' }, { perfil: 'coro' }, { perfil: 'coro', act: 'menu' }, { perfil: 'gestor' }, { perfil: 'gestor', act: 'menu' }, { perfil: 'maestro' }, { perfil: 'maestro', act: 'menu' }, { perfil: 'maestro', hash: '#/lista/colecao-demo1' }, { perfil: 'maestro', hash: '#/lista/colecao-demoE', open: '#col-mode' }]) await withApp(o, async ({ page }) => {
      if (o.act === 'menu') { await page.click('#btn-menu'); await sleep(500); }
      const r = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const rgb = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return p; };
        const lum = p => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); };
        const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const probe = v => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return rgb(c); };
        const brands = [probe('--brand'), probe('--brand-deep')].filter(Boolean);
        const isBrand = c => c && c[3] !== 0 && brands.some(b => Math.abs(b[0] - c[0]) + Math.abs(b[1] - c[1]) + Math.abs(b[2] - c[2]) < 6);
        const bgOf = el => { for (let e = el; e; e = e.parentElement) { const st = getComputedStyle(e);
          if (e === document.body) { const b = getComputedStyle(e, '::before'); const bc = rgb(b.backgroundColor); if (b.content !== 'none' && bc && (bc[3] === undefined || bc[3] > 0.9)) return bc; }
          const c = rgb(st.backgroundColor); if (c && (c[3] === undefined || c[3] > 0.9)) return c; const g = st.backgroundImage.match(/rgba?\([^)]+\)/g); if (g) return rgb(g[0]); } return null; };
        const op = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          const rc = el.getBoundingClientRect(); if (!rc.width || rc.top > innerHeight || rc.bottom < 0 || el.closest('[hidden],dialog:not([open]),.drawer:not(.open),#splash')) continue;
          const bg = bgOf(el); if (!isBrand(bg)) continue;
          if (el.closest('button:disabled, [aria-disabled=true]')) continue; // controlos desativados estão fora da regra de contraste (WCAG 1.4.3)
          const st = getComputedStyle(el);
          const text = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          if (text) { const c = rgb(st.color), r = cr(c, bg), o = op(el) * (c[3] ?? 1); if (r < 4.5) out.push(`texto «${el.textContent.trim().slice(0, 16)}» ${r.toFixed(2)}`); if (o < 0.999) out.push(`texto «${el.textContent.trim().slice(0, 16)}» opacidade ${o.toFixed(2)}`); }
          if (el.tagName === 'svg') { const s = getComputedStyle(el.querySelector('path,circle,rect') || el); const c = rgb(s.stroke !== 'none' ? s.stroke : s.fill); if (c) { const r = cr(c, bg); if (r < 3) out.push(`ícone ${el.closest('[id]')?.id || ''} ${r.toFixed(2)}`); } }
        }
        return { out: [...new Set(out)], brand: brands.map(b => 'rgb(' + b.slice(0, 3).join(',') + ')') };
      });
      ev.push(r.brand.join(' / '));
      for (const x of r.out) bad.push(`${o.hash || o.act || 'índice'}: ${x}`);
    });
    return bad.length ? { fail: `${bad.length} problemas: ${bad.slice(0, 10).join('; ')}`, evidence: ev[0] } : { pass: 'marca ' + ev[0] };
  }, { sev: 'média' });
  await t('USA-19', 'Campos obrigatórios: «*» (.req) e botão desativado até preencher — Novo cântico, Nova folha, Editar folha, Template, Gestão (email), caixa de texto da app (v171)', async () => {
    const bad = [];
    const dis = (page, sel) => page.evaluate(x => { const b = document.querySelector(x); return !!b && (b.disabled || b.getAttribute('aria-disabled') === 'true'); }, sel);
    const check = async (page, name, btn, fields, fill) => {
      if (!(await count(page, fields.map(f => `label:has(${f}) .req, ${f} ~ .req, ${f} + .req`).join(', ')))) bad.push(`${name}: sem «*» (.req)`);
      for (const f of fields) await page.fill(f, '');
      await sleep(150);
      if (!(await dis(page, btn))) bad.push(`${name}: ${btn} ativo com campos vazios`);
      await fill(); await sleep(250);
      if (await dis(page, btn)) bad.push(`${name}: ${btn} continua desativado depois de preencher`);
    };
    // Novo cântico (Coro): título + letra
    await withApp({ perfil: 'coro', hash: '#/lista/livro-novos' }, async ({ page }) => {
      await page.waitForSelector('#novo-cantico'); await page.click('#novo-cantico'); await sleep(500);
      await check(page, 'Novo cântico', '#sn-save', ['#sn-title', '#sn-text'], async () => { await page.fill('#sn-title', 'T'); await page.fill('#sn-text', 'linha'); });
      await page.fill('#sn-text', ''); await sleep(200); if (!(await dis(page, '#sn-save'))) bad.push('Novo cântico: Guardar ativo sem letra nem PDF');
    });
    // Nova folha e Template (Maestro)
    await withApp({ perfil: 'maestro' }, async ({ page }) => {
      await page.click('#btn-menu'); await sleep(400); await page.click('.col-new'); await sleep(500);
      await check(page, 'Nova folha', '#col-save', ['#col-name'], () => page.fill('#col-name', 'Folha'));
      await page.selectOption('#col-tpl-sel', 'gerir'); await sleep(600);
      if (await count(page, '#tpl-new')) { await page.click('#tpl-new'); await sleep(500);
        await check(page, 'Template', '#tpl-save', ['#tpl-name', '#tpl-secs'], async () => { await page.fill('#tpl-name', 'T'); await page.fill('#tpl-secs', 'Entrada'); });
        await page.fill('#tpl-secs', ''); await sleep(200); if (!(await dis(page, '#tpl-save'))) bad.push('Template: Guardar ativo sem secções');
      } else bad.push('Template: «+ Novo template» não encontrado');
    });
    // Editar folha: título e caixa de texto da app (Nova secção)
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1' }, async ({ page }) => {
      await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(500);
      await check(page, 'Editar folha', '#ce-save', ['#ce-name'], () => page.fill('#ce-name', 'Missa'));
      await page.click('#col-add-sec'); await sleep(300);
      await page.fill('#app-dlg-input', ''); await sleep(150);
      if (!(await dis(page, '#app-dlg-ok'))) bad.push('caixa de texto: OK ativo vazio');
      await page.press('#app-dlg-input', 'Enter'); await sleep(300);
      if (!(await page.evaluate(() => document.querySelector('#app-dlg').open))) bad.push('caixa de texto: Enter com o campo vazio confirmou');
      await page.fill('#app-dlg-input', 'Secção'); await sleep(150);
      if (await dis(page, '#app-dlg-ok')) bad.push('caixa de texto: OK desativado depois de preencher');
    });
    // Gestão: acrescentar pessoa só com email válido
    await withApp({ perfil: 'gestor', hash: '#/gestao' }, async ({ page }) => {
      await page.waitForSelector('#add-email', { timeout: 8000 }).catch(() => {});
      if (!(await count(page, '#add-email'))) { bad.push('Gestão: sem #add-email'); return; }
      const btn = '#adm-add button[type=submit]';
      await page.fill('#add-email', 'nao-e-email'); await sleep(200);
      if (!(await dis(page, btn))) bad.push('Gestão: Acrescentar ativo com email inválido');
      await page.fill('#add-email', 'pessoa@example.invalid'); await sleep(200);
      if (await dis(page, btn)) bad.push('Gestão: Acrescentar desativado com email válido');
      if (!(await count(page, '#adm-add .req'))) bad.push('Gestão: email sem «*»');
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });
  await t('USA-20', 'Botões lado a lado numa linha de ações com a mesma largura (±1 px; na .pend-bar à direita, sem ocupar a linha): .edit-actions, .info-actions, .pend-bar, .edit-bar, .file-btns (v175/v177)', async () => {
    const bad = [], seen = [];
    const measure = async (page, where) => {
      const r = await page.evaluate(() => [...document.querySelectorAll('.edit-actions, .info-actions, .pend-bar, .edit-bar, .file-btns')].filter(c => c.getBoundingClientRect().width && !c.closest('[hidden], dialog:not([open])'))
        .map(c => ({ c: (c.closest('[id]')?.id || '') + ' .' + c.className.split(' ')[0], w: [...c.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && !b.hidden && getComputedStyle(b).display !== 'none' && b.closest('.edit-actions, .info-actions, .pend-bar, .edit-bar, .file-btns') === c; }).map(b => Math.round(b.getBoundingClientRect().width * 10) / 10) }))
        .filter(x => x.w.length >= 2));
      for (const x of r) { seen.push(`${where}: ${x.c} [${x.w.join(', ')}]`); if (Math.max(...x.w) - Math.min(...x.w) > 1) bad.push(`${where}: ${x.c} larguras ${x.w.join(' / ')}`); }
    };
    await withApp({ perfil: 'coro' }, async ({ page }) => { await page.click('#btn-perfil'); await sleep(300); await page.click('#perfil-info').catch(() => {}); await sleep(400); await measure(page, 'Informação'); });
    await withApp({ perfil: 'coro', hash: '#/lista/livro-novos' }, async ({ page }) => { await page.waitForSelector('#novo-cantico'); await page.click('#novo-cantico'); await sleep(500); await measure(page, 'Novo cântico'); });
    await withApp({ perfil: 'maestro', hash: '#/cantico/novo_por_aprovar' }, async ({ page }) => { await page.waitForSelector('#song h1'); await measure(page, 'Cântico por aprovar'); });
    await withApp({ perfil: 'maestro', hash: '#/cantico/amazing_grace' }, async ({ page }) => { await page.waitForSelector('#btn-edit'); await measure(page, 'Cântico'); await page.click('#btn-edit'); await sleep(500); await measure(page, 'Editar cântico'); });
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => { await page.waitForSelector('#col-mode'); await measure(page, 'Folha por publicar'); await page.click('#col-mode'); await sleep(500); await measure(page, 'Editar folha'); });
    if (!seen.length) return 'nenhuma linha de ações com 2+ botões encontrada';
    return bad.length ? bad.join('; ') : { pass: seen.length + ' linhas: ' + seen.slice(0, 4).join('; ') };
  }, { sev: 'baixa' });
  await t('USA-21', 'Confirmações destrutivas (Apagar, Remover, Retirar, Recusar, Repor, Sair sem guardar) com #app-dlg-ok.danger-fill; caixas de texto e outras confirmações sem (v176; Repor desde v207)', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
    const ok = () => page.evaluate(() => ({ t: document.querySelector('#app-dlg-ok').textContent.trim(), d: document.querySelector('#app-dlg-ok').classList.contains('danger-fill'), open: document.querySelector('#app-dlg').open }));
    const bad = [];
    await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(500);
    // caixa de texto (nova secção): sem danger-fill
    await page.click('#col-add-sec'); await sleep(300); let o = await ok();
    if (!o.open) bad.push('«Nova secção» não abriu'); else if (o.d) bad.push('caixa de texto com danger-fill');
    await page.click('#app-dlg-cancel'); await sleep(300);
    // v207: repor original em «Editar nesta folha» (precisa de uma versão: tira a 2.ª estrofe e guarda na cópia)
    const lyr = async () => { const sel = '#ce-rows li[data-key="adoro_te_devote"]'; if (!(await vis(page, sel + ' .ce-acts button[data-act="lyr"]'))) { await page.click(sel + ' a'); await sleep(300); } await page.click(sel + ' .ce-acts button[data-act="lyr"]'); await page.waitForSelector('#cl-ed[open] #cl-sts input', { timeout: 8000 }).catch(() => {}); await sleep(200); };
    await lyr(); await page.locator('#cl-sts input').nth(1).uncheck(); await page.click('#cl-save'); await sleep(400);
    await lyr(); await page.click('#cl-reset'); await sleep(300);
    o = await ok(); if (!/^Repor/.test(o.t) || !o.d) bad.push(`repor original: «${o.t}» danger-fill=${o.d}`);
    await page.click('#app-dlg-cancel'); await sleep(300); await page.click('#cl-cancel'); await sleep(300);
    if (await page.evaluate(() => document.querySelector('#app-dlg').open)) { await page.click('#app-dlg-ok'); await sleep(300); }
    // remover cântico
    await page.click('#ce-rows li[data-key="veni_creator_spiritus"] a'); await sleep(300);
    await page.click('#ce-rows li[data-key="veni_creator_spiritus"] .ce-acts button[data-act="del"]'); await sleep(300);
    o = await ok(); if (!/^Remover/.test(o.t) || !o.d) bad.push(`remover: «${o.t}» danger-fill=${o.d}`);
    await page.click('#app-dlg-ok'); await sleep(400);
    // sair sem guardar (há alterações)
    await page.click('#ce-cancel'); await sleep(300);
    o = await ok(); if (!/^Sair sem guardar/.test(o.t) || !o.d) bad.push(`sair sem guardar: «${o.t}» danger-fill=${o.d}`);
    await page.click('#app-dlg-cancel'); await sleep(300);
    // apagar folha
    await page.click('#ce-del'); await sleep(300);
    o = await ok(); if (!/^Apagar/.test(o.t) || !o.d) bad.push(`apagar folha: «${o.t}» danger-fill=${o.d}`);
    await page.click('#app-dlg-cancel'); await sleep(300);
    return bad.length ? bad.join('; ') : true;
  }), { sev: 'baixa' });
  await t('USA-22', 'Editar folha: rodapé em linha a 390 e 320 px (Apagar | Cancelar | Guardar), em coluna (.stack) a ~260 px (Guardar, Cancelar, Apagar de cima para baixo) (v182/v185)', async () => {
    const bad = [], ev = [];
    for (const w of [390, 320, 260]) await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1', viewport: { width: w, height: 700 }, open: '#col-mode' }, async ({ page }) => {
      const r = await page.evaluate(() => { const a = document.querySelector('#col-ed .edit-actions'); if (!a) return null; const bs = [...a.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width); const ys = new Set(bs.map(b => Math.round(b.getBoundingClientRect().top)));
        return { stack: a.classList.contains('stack'), rows: ys.size, order: bs.slice().sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top || x.getBoundingClientRect().left - y.getBoundingClientRect().left).map(b => b.textContent.trim()) }; });
      if (!r) { bad.push(w + ' px: sem .edit-actions'); return; }
      ev.push(`${w}: ${r.stack ? 'coluna' : 'linha'} [${r.order.join(', ')}]`);
      if (w >= 320 && (r.stack || r.rows > 1)) bad.push(`${w} px: devia estar em linha`);
      if (w < 280 && !r.stack) bad.push(`${w} px: sem .stack`);
      // v185: principal primeiro = à direita em linha, em cima em coluna (ordem por posição, não DOM)
      const want = r.rows > 1 ? 'Guardar,Cancelar,Apagar' : 'Apagar,Cancelar,Guardar';
      if (r.order.join(',') !== want) bad.push(`${w} px (${r.rows > 1 ? 'coluna' : 'linha'}): ordem ${r.order.join(', ')} (esperado ${want.replace(/,/g, ', ')})`);
    });
    return bad.length ? { fail: bad.join('; '), evidence: ev.join(' · ') } : { pass: ev.join(' · ') };
  }, { sev: 'baixa' });
  await t('USA-23', 'Ação principal primeiro = à direita em linha, em cima em coluna: OK|Cancelar (também vermelho), Fechar|Terminar sessão, Procurar|Cancelar, Publicar|Editar folha (também a 220 px), Aprovar|Recusar (v185)', async () => {
    const bad = [];
    // v185: «principal primeiro» = à direita na mesma linha, em cima quando em coluna
    const primary = (page, a, b) => page.evaluate(([x, y]) => { const A = document.querySelector(x)?.getBoundingClientRect(), B = document.querySelector(y)?.getBoundingClientRect(); if (!A || !B || !A.width || !B.width) return null; return Math.abs(A.top - B.top) <= 2 ? A.left > B.left : A.top < B.top; }, [a, b]);
    const want = async (page, a, b, what) => { const r = await primary(page, a, b); if (r === null) bad.push(`${what}: botões não visíveis`); else if (!r) bad.push(`${what}: ${a} não está à direita (ou em cima) de ${b}`); };
    await withApp({ perfil: 'coro' }, async ({ page }) => { await page.evaluate(() => document.querySelector('#info').showModal()); await sleep(300); await want(page, '#info-close', '#btn-logout', 'Informação'); });
    await withApp({ perfil: 'coro', permissions: ['microphone'] }, async ({ page }) => { await page.click('#btn-mic'); await sleep(1000); await want(page, '#listen-stop', '#listen-cancel', 'Ouvir'); await page.click('#listen-cancel').catch(() => {}); });
    await withApp({ perfil: 'maestro', hash: '#/cantico/novo_por_aprovar' }, async ({ page }) => { await page.waitForSelector('#song-approve'); await want(page, '#song-approve', '#song-reject', 'Cântico por aprovar'); });
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE', viewport: { width: 220, height: 700 } }, async ({ page }) => { await page.waitForSelector('#col-mode'); await want(page, '#col-pub', '#col-mode', 'Folha por publicar a 220 px'); });
    await withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
      await page.waitForSelector('#col-mode'); await want(page, '#col-pub', '#col-mode', 'Folha por publicar');
      await page.click('#col-mode'); await sleep(500);
      await page.click('#col-add-sec'); await sleep(300); await want(page, '#app-dlg-ok', '#app-dlg-cancel', 'Caixa de texto'); await page.click('#app-dlg-cancel'); await sleep(300);
      await page.click('#ce-del'); await sleep(300); await want(page, '#app-dlg-ok', '#app-dlg-cancel', 'Confirmação vermelha (Apagar)'); await page.click('#app-dlg-cancel'); await sleep(300);
    });
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'baixa' });
  if (full) {
    await t('USA-16', 'Componentes seguem o padrão (design/tokens.json): botões principais usam as cores dos tokens', () => withApp({ perfil: 'maestro', hash: '#/cantico/amazing_grace' }, async ({ page }) => {
      const tok = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/tokens.json'), 'utf8'));
      // desde v203 as cores dependem do perfil (design/tokens.json → perfis); o perfil Maestro tem o seu accent
      const pm = (tok.perfis?.tokens || []).find(x => x.id === 'maestro')?.values?.accent;
      const accent = (pm && (pm.light || pm)) || tok.color.tokens.find(x => x.name === 'accent').value.light;
      const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`; };
      const got = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
      const btn = await page.evaluate(() => { const b = document.querySelector('#btn-edit'); return b ? getComputedStyle(b).backgroundColor + ' / ' + getComputedStyle(b).color : ''; });
      return got.toLowerCase() === accent.toLowerCase() || hex2rgb(got) === hex2rgb(accent) ? { pass: `--accent ${got}; Editar ${btn}` } : `--accent ${got} ≠ token ${accent}`;
    }), { sev: 'baixa' });
  }

  // ===================== Compatibilidade =====================
  dim('Compatibilidade', 'média');
  await t('COM-01', 'Computador (Chromium 1280×800, rato): índice, cântico e gaveta', () => withApp({ perfil: 'coro', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, hash: '#/cantico/salve_regina' }, async ({ page }) => {
    await page.waitForSelector('#song h1');
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    return ov <= 1 || `deslocamento horizontal ${ov} px`;
  }));
  await t('COM-02', 'WebKit (Safari) disponível para testes', async () => {
    let wk = null;
    try { wk = await webkit.launch(); } catch (e) { return { skip: 'Playwright WebKit não está instalado neste ambiente (só Chromium em /opt/pw-browsers); testes Safari ficam manuais (ver MAN-01..03)' }; }
    try {
      return await withApp({ perfil: 'coro', engine: wk, hash: '#/cantico/salve_regina' }, async ({ page }) => /Salve Regina/.test(await txt(page, '#song h1')) || 'cântico não abriu no WebKit');
    } finally { await wk.close(); }
  });
  await t('COM-03', 'PWA: manifest válido (nome, ícones 192 e 512, display standalone, theme_color)', () => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    const sizes = m.icons.map(i => i.sizes);
    if (!sizes.includes('192x192') || !sizes.includes('512x512')) return 'ícones: ' + sizes.join(',');
    return (m.display === 'standalone' && !!m.name && !!m.theme_color) || 'manifest incompleto';
  });
}
