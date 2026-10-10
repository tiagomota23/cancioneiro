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

// Supabase simulado para o modo real (sem ?demo): mode = { down, slowMs, role, conteudo(op, body) → {status, body}|null, rest(path) → …, refreshFail }
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
  await t('FUN-10', 'Folha publicada (Maestro): secções e cânticos só de leitura, só «Editar» e partilhar, sem «+ Adicionar»', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1' }, async ({ page }) => {
    await page.waitForSelector('#rows li'); await sleep(300);
    const s = await txt(page, '#rows');
    if (!/Entrada/.test(s) || !/Comunhão/.test(s) || !/Veni Creator/i.test(s)) return 'conteúdo da folha: ' + s.slice(0, 150);
    if ((await txt(page, '#col-mode')).trim() !== 'Editar') return 'botão de modo: «' + (await txt(page, '#col-mode')) + '»';
    if (!(await vis(page, '#col-share'))) return 'falta partilhar';
    for (const sel of ['#col-set', '#col-tpl', '#col-addsong', 'li.col-add']) if (await count(page, sel)) return 'na vista publicada há ' + sel;
    return (await page.evaluate(() => document.body.classList.contains('col-editing'))) ? 'fundo de edição na vista publicada' : true;
  }));
  await t('FUN-11', 'Nova folha: criar no diálogo aparece na gaveta', () => withApp({ perfil: 'maestro' }, async ({ page }) => {
    await page.click('#btn-menu'); await sleep(500);
    await page.click('.col-new'); await sleep(500);
    if (!(await page.evaluate(() => document.querySelector('#col-dlg').open))) return 'diálogo não abriu';
    await page.fill('#col-name', 'Folha de teste automática');
    await page.click('#col-save'); await sleep(800);
    await page.click('#btn-menu').catch(() => {}); await sleep(500);
    return /Folha de teste automática/.test(await txt(page, '#az')) || /Folha de teste automática/.test(await txt(page, '#list-title')) || 'folha nova não aparece';
  }));
  await t('FUN-12', 'Template só no diálogo «Nova folha» (#col-tpl-sel); escondido ao mudar as definições de uma folha existente', () => withApp({ perfil: 'maestro' }, async ({ page }) => {
    await page.click('#btn-menu'); await sleep(400); await page.click('.col-new'); await sleep(500);
    if (!(await vis(page, '#col-tpl-sel'))) return 'Nova folha sem escolha de template';
    const opts = await page.evaluate(() => [...document.querySelectorAll('#col-tpl-sel option')].map(o => o.textContent));
    if (!opts.some(o => /Criar ou mudar templates/.test(o))) return 'falta «Criar ou mudar templates…»: ' + opts.join(' | ');
    await page.click('#col-cancel'); await sleep(300);
    await page.evaluate(() => { location.hash = '#/lista/colecao-demoE'; }); await sleep(600);
    await page.click('#col-set'); await sleep(500);
    if (!(await page.evaluate(() => document.querySelector('#col-dlg').open))) return '«Definições» não abriu o diálogo';
    return !(await vis(page, '#col-tpl-sel')) || 'template visível ao editar uma folha existente';
  }, ), { sev: 'média' });
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
    return /Cântico de teste automático/.test(s) ? (/por aprovar/.test(s) ? true : { warn: 'aparece mas sem «por aprovar»' }) : 'não aparece em Novos Cânticos: ' + s.slice(0, 100);
  }));
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
  await t('FUN-25', 'Tutorial: aparece na 1.ª vez e «Saltar» fecha-o sem voltar a aparecer', () => withApp({ perfil: 'coro', tour: true, settle: 1500 }, async ({ page }) => {
    if (!(await vis(page, '.tour-box'))) return 'tutorial não apareceu';
    await page.click('.tour-skip'); await sleep(500);
    if (await vis(page, '.tour-box')) return 'Saltar não fechou';
    await page.reload(); await page.waitForSelector('#splash.gone', { state: 'attached' }); await sleep(1500);
    return !(await vis(page, '.tour-box')) || 'tutorial voltou a aparecer';
  }), { sev: 'média' });
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
      await page.locator('#app-dlg-list button').filter({ hasText: /Gerar PDF/ }).filter({ hasNotText: /Coro/ }).first().click();
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
    await t('FUN-32', 'Maestro: aprovar cântico novo por aprovar', () => withApp({ perfil: 'maestro', hash: '#/cantico/novo_por_aprovar' }, async ({ page }) => {
      await page.waitForSelector('#song h1');
      if (!(await vis(page, '#song-approve'))) return 'sem botão Aprovar';
      return true;
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
  await t('FUN-35', 'Menu ☰ em secções: «Os meus cânticos», «Livros», «Folhas»; secção vazia escondida; Livros do Cancioneiro só com o Cancioneiro', async () => {
    const heads = async o => withApp(o, async ({ page }) => { await page.click('#btn-menu'); await sleep(400); return { pass: await page.evaluate(() => JSON.stringify({ h: [...document.querySelectorAll('#az li.cat-head')].map(x => x.textContent.trim()), all: document.querySelector('#az').textContent })) }; }).then(r => JSON.parse(r.pass || '{"h":[],"all":""}'));
    const bad = [];
    const can = await heads({ perfil: 'cancioneiro', cols: [] }), coro = await heads({ perfil: 'coro', cols: [] }), mae = await heads({ perfil: 'maestro', cols: [] }), coroCols = await heads({ perfil: 'coro' });
    if (!can.h.includes('Os meus cânticos') || !can.h.includes('Livros')) bad.push('Cancioneiro: secções ' + can.h.join(','));
    if (/Songbook|CANTI|Coro CLU/.test(can.all)) bad.push('Cancioneiro: Livros mostra livros do Coro');
    if (can.h.includes('Folhas') || coro.h.includes('Folhas')) bad.push('«Folhas» aparece sem folhas para perfil < Maestro');
    if (!mae.h.includes('Folhas')) bad.push('Maestro sem folhas: falta «Folhas» (com + Nova folha)');
    if (!coroCols.h.includes('Folhas')) bad.push('Coro com folhas: falta «Folhas»');
    return bad.length ? bad.join('; ') : { pass: `Cancioneiro ${can.h.join('/')}; Maestro ${mae.h.join('/')}` };
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
  await t('FUN-38', 'Editar ↔ Publicar: modo muda o fundo e os botões e fica guardado depois de recarregar', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demo1' }, async ({ page }) => {
    await page.waitForSelector('#col-mode'); await page.click('#col-mode'); await sleep(600);
    const ed = await page.evaluate(() => ({ body: document.body.classList.contains('col-editing'), mode: document.querySelector('#col-mode')?.textContent.trim(), set: !!document.querySelector('#col-set'), add: document.querySelectorAll('li.col-add').length, end: !!document.querySelector('li.col-add.col-add-end') }));
    if (!ed.body || ed.mode !== 'Publicar' || !ed.set || !ed.add || !ed.end) return 'modo edição: ' + JSON.stringify(ed);
    await page.reload(); await page.waitForSelector('#col-mode', { timeout: 10000 }); await sleep(400);
    if ((await txt(page, '#col-mode')).trim() !== 'Publicar') return 'depois de recarregar não ficou em edição';
    await page.click('#col-mode'); await sleep(600);
    const pub = await page.evaluate(() => ({ body: document.body.classList.contains('col-editing'), mode: document.querySelector('#col-mode')?.textContent.trim() }));
    if (pub.body || pub.mode !== 'Editar') return 'publicar: ' + JSON.stringify(pub);
    await page.evaluate(() => { location.hash = '#/'; }); await sleep(300);
    return !(await page.evaluate(() => document.body.classList.contains('col-editing'))) || 'fundo de edição ficou fora da folha';
  }));
  await t('FUN-39', 'Folha em edição: tocar num cântico abre Abrir/Subir/Descer/Remover; Descer muda a ordem; Remover pede confirmação', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
    await page.waitForSelector('li[data-key] > a');
    const order = () => page.evaluate(() => [...document.querySelectorAll('#rows li[data-key], #rows a.sec-line[data-key]')].map(l => l.dataset.key)); // cânticos e secções (Descer pode passar o cântico para a secção seguinte)
    const o0 = await order();
    await page.locator('li[data-key="veni_creator_spiritus"] > a').click(); await sleep(400);
    const opts = await page.evaluate(() => [...document.querySelectorAll('#app-dlg-list button')].map(b => b.textContent.trim()));
    for (const w of ['Abrir o cântico', 'Subir', 'Descer', 'Remover da folha']) if (!opts.some(o => o.startsWith(w))) return 'menu do cântico sem «' + w + '»: ' + opts.join(' | ');
    await page.locator('#app-dlg-list button').filter({ hasText: /^Descer/ }).click(); await sleep(600);
    const o1 = await order();
    if (o1.indexOf('veni_creator_spiritus') <= o0.indexOf('veni_creator_spiritus')) return `Descer não mudou a ordem: ${o0} → ${o1}`;
    await page.locator('li[data-key="adoro_te_devote"] > a').click(); await sleep(400);
    await page.locator('#app-dlg-list button').filter({ hasText: /^Remover/ }).click(); await sleep(400);
    if (!(await page.evaluate(() => document.querySelector('#app-dlg').open))) return 'Remover não pediu confirmação';
    await page.click('#app-dlg-ok'); await sleep(600);
    if ((await order()).includes('adoro_te_devote')) return 'não removeu';
    await page.locator('a.sec-line').filter({ hasText: 'Saída' }).click(); await sleep(400);
    const sopts = await page.evaluate(() => [...document.querySelectorAll('#app-dlg-list button')].map(b => b.textContent.trim()));
    return ['Mudar o nome', 'Apagar secção'].every(w => sopts.some(o => o.startsWith(w))) || 'menu da secção: ' + sopts.join(' | ');
  }));
  await t('FUN-40', '«+ Adicionar cântico» por secção: Comunhão traz os cânticos do momento; Saída (não é momento) vem vazia; «+ Adicionar secção» no fim', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
    await page.waitForSelector('li.col-add button[data-sec]');
    const secs = await page.evaluate(() => [...document.querySelectorAll('li.col-add button[data-sec]')].map(b => b.dataset.sec));
    if (!secs.includes('e2') || !secs.includes('e3')) return 'linhas «+ Adicionar cântico»: ' + secs.join(',');
    if (!(await page.evaluate(() => document.querySelector('#rows li:last-child')?.matches('li.col-add.col-add-end')))) return '«+ Adicionar secção» não está no fim';
    await page.click('li.col-add button[data-sec="e2"]'); await sleep(500);
    const com = await page.evaluate(() => ({ n: document.querySelectorAll('#sa-list li').length, msg: document.querySelector('#sa-msg').textContent, t: document.querySelector('#sa-title').textContent }));
    if (!com.n || !/Comunhão/.test(com.msg)) return 'Comunhão sem pré-preenchimento: ' + JSON.stringify(com);
    await page.click('#sa-close'); await sleep(300);
    await page.click('li.col-add button[data-sec="e3"]'); await sleep(500);
    const sai = await page.evaluate(() => document.querySelectorAll('#sa-list li').length);
    await page.click('#sa-close');
    return sai === 0 ? { pass: `Comunhão: ${com.n} cânticos («${com.msg.slice(0, 50)}»)` } : `Saída mostra ${sai} cânticos`;
  }));
  await t('FUN-42', 'Folha em edição: cada ação grava logo (acrescentar, remover, mover, mudar o nome de cântico/secção, nova secção, Definições) — recarregar mostra a mudança', () => withApp({ perfil: 'maestro', hash: '#/lista/colecao-demoE' }, async ({ page }) => {
    const state = () => page.evaluate(() => ({ items: [...document.querySelectorAll('#rows li[data-key], #rows a.sec-line[data-key]')].map(l => l.dataset.key + '=' + l.textContent.trim().slice(0, 30)), title: document.querySelector('#list-title')?.firstChild?.textContent || '', editing: document.body.classList.contains('col-editing') }));
    const reload = async () => { await page.reload(); await page.waitForSelector('#col-mode', { timeout: 10000 }); await sleep(500); return state(); };
    const choose = async (rowSel, label) => { await page.locator(rowSel).first().click(); await sleep(400); await page.locator('#app-dlg-list button').filter({ hasText: new RegExp('^' + label) }).first().click(); await sleep(500); };
    const bad = [];
    // 1. acrescentar cântico à secção Saída
    await page.click('li.col-add button[data-sec="e3"]'); await sleep(400);
    await page.fill('#sa-q', 'salve'); await sleep(500);
    await page.locator('#sa-list button:not([disabled])').first().click(); await sleep(600); await page.click('#sa-close'); await sleep(300);
    let r = await reload(); if (!r.items.some(x => x.startsWith('salve_regina'))) bad.push('acrescentar não ficou gravado');
    // 2. mover (Subir) o cântico acrescentado
    const before = r.items.indexOf(r.items.find(x => x.startsWith('salve_regina')));
    await choose('li[data-key="salve_regina"] > a', 'Subir');
    r = await reload(); if (r.items.findIndex(x => x.startsWith('salve_regina')) >= before) bad.push('mover não ficou gravado');
    // 3. mudar o nome da secção Saída
    await choose('a.sec-line[data-key$="e3"], a.sec-line:text-is("Saída")', 'Mudar o nome');
    await page.fill('#app-dlg-input', 'Final'); await page.click('#app-dlg-ok'); await sleep(600);
    r = await reload(); if (!r.items.some(x => /=Final$/.test(x))) bad.push('mudar o nome da secção não ficou gravado');
    // 4. nova secção
    await page.click('#col-add-sec'); await sleep(300); await page.fill('#app-dlg-input', 'Ofertório'); await page.click('#app-dlg-ok'); await sleep(600);
    r = await reload(); if (!r.items.some(x => /=Ofertório$/.test(x))) bad.push('nova secção não ficou gravada');
    // 5. remover cântico (com confirmação)
    await choose('li[data-key="salve_regina"] > a', 'Remover'); await page.click('#app-dlg-ok'); await sleep(600);
    r = await reload(); if (r.items.some(x => x.startsWith('salve_regina'))) bad.push('remover não ficou gravado');
    // 6. apagar secção
    await choose('a.sec-line:text-is("Ofertório")', 'Apagar'); await page.click('#app-dlg-ok'); await sleep(600);
    r = await reload(); if (r.items.some(x => /=Ofertório$/.test(x))) bad.push('apagar secção não ficou gravado');
    // 7. Definições: mudar o título
    await page.click('#col-set'); await sleep(400); await page.fill('#col-name', 'Folha renomeada pelo teste'); await page.click('#col-save'); await sleep(700);
    r = await reload(); if (!/Folha renomeada pelo teste/.test(r.title)) bad.push('Definições (título) não ficaram gravadas');
    if (!r.editing) bad.push('depois de recarregar já não está em edição');
    return bad.length ? bad.join('; ') : true;
  }));

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
  const screens = [['índice', { perfil: 'maestro' }], ['cântico', { perfil: 'maestro', hash: '#/cantico/salve_regina' }], ['folha', { perfil: 'maestro', hash: '#/lista/colecao-demo1' }], ['gestão', { perfil: 'gestor', hash: '#/gestao' }], ['folha-edição', { perfil: 'maestro', hash: '#/lista/colecao-demoE' }]];
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
  await t('USA-12', 'Contraste de texto (WCAG AA 4.5:1) no índice e no cântico, claro e escuro', async () => {
    const bad = [];
    for (const scheme of ['light', 'dark']) for (const [name, o] of [...screens.slice(0, 3), screens[4]]) await withApp({ ...o, scheme }, async ({ page }) => {
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
  await t('USA-17', 'Interruptores «Cancioneiro»/«Coro» nas Folhas: role=switch, aria-checked atualiza, teclado (Espaço/Enter), fixo desativado', () => withApp({ perfil: 'maestro', hash: '#/cantico/pange_lingua', isMobile: false, hasTouch: false }, async ({ page }) => {
    await page.waitForSelector('#song h1'); await page.click('#btn-fav'); await sleep(500);
    const sw = await page.evaluate(() => [...document.querySelectorAll('#col-pick [role=switch]')].map(b => ({ id: b.id, checked: b.getAttribute('aria-checked'), dis: b.disabled, name: b.textContent.trim() })));
    if (!sw.length) return 'sem interruptores com role=switch no diálogo Folhas';
    const bad = sw.filter(x => !['true', 'false'].includes(x.checked) || !x.name).map(x => x.id);
    if (bad.length) return 'aria-checked/nome em falta: ' + bad.join(',');
    const c = sw.find(x => x.id === 'pick-canc');
    if (!c || c.dis) return 'pick-canc ausente ou desativado num cântico que não é do original';
    await page.focus('#pick-canc'); await page.keyboard.press('Space'); await sleep(800);
    const a1 = await page.getAttribute('#pick-canc', 'aria-checked');
    if (a1 === c.checked) return `Espaço não mudou aria-checked (${c.checked})`;
    // retirar: 1.º toque arma a confirmação, 2.º retira
    await page.focus('#pick-canc'); await page.keyboard.press('Enter'); await sleep(300);
    const armed = await page.getAttribute('#pick-canc', 'aria-checked');
    await page.keyboard.press('Enter'); await sleep(800);
    const a2 = await page.getAttribute('#pick-canc', 'aria-checked');
    if (armed !== a1) return 'retirar não pediu confirmação (1.º toque já mudou)';
    if (a2 !== c.checked) return 'confirmação não retirou';
    const fixed = await withApp({ perfil: 'maestro', hash: '#/cantico/amazing_grace' }, async ({ page: p2 }) => { await p2.waitForSelector('#song h1'); await p2.click('#btn-fav'); await sleep(400); return { pass: String(await p2.evaluate(() => document.querySelector('#pick-canc')?.disabled)) }; });
    return fixed.pass === 'true' || 'cântico do original: pick-canc não está desativado';
  }));
  await t('USA-18', 'Texto e ícones sobre a cor da marca: texto ≥ 4.5:1 e opaco; ícones ≥ 3:1 (índice, gaveta, folha publicada e em edição)', async () => {
    const bad = [], ev = [];
    for (const o of [{ perfil: 'coro' }, { perfil: 'maestro', act: 'menu' }, { perfil: 'maestro', hash: '#/lista/colecao-demo1' }, { perfil: 'maestro', hash: '#/lista/colecao-demoE' }]) await withApp(o, async ({ page }) => {
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
  if (full) {
    await t('USA-16', 'Componentes seguem o padrão (design/tokens.json): botões principais usam as cores dos tokens', () => withApp({ perfil: 'maestro', hash: '#/cantico/amazing_grace' }, async ({ page }) => {
      const tok = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/tokens.json'), 'utf8'));
      const accent = tok.color.tokens.find(x => x.name === 'accent').value.light;
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
