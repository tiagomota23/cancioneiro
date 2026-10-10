// Produção, só leitura e poucos pedidos: site publicado (GitHub Pages), Supabase sem sessão, funções (sondas que
// nunca chegam a fazer trabalho: sem token, token inválido ou tipo desconhecido). Nunca chama drive-sync, sync-songs,
// notify health/access/sync (enviam emails ou correm tarefas) nem transcribe com sessão.
import { t, dim, get, fn, SITE, SB, ANON, read, versions, sha384b64, needHost, reachable, npmFile } from '../lib.mjs';

export default async function (level) {
  const full = level === 'full';
  const v = versions();

  dim('Ligações e navegação — produção', 'alta');
  let idx = null;
  await t('LNK-10', 'Página principal responde 200 e é o Cancioneiro', async () => {
    await needHost(SITE);
    idx = await get(SITE);
    if (idx.status !== 200) return 'HTTP ' + idx.status;
    return idx.text().includes('CANCIONEIRO') || 'conteúdo inesperado';
  });
  await t('LNK-11', 'Versão publicada = versão do repositório (index.html ?v=, app.js, sw.js)', async () => {
    await needHost(SITE);
    if (!idx) return 'página principal não respondeu';
    const live = (idx?.text().match(/app\.js\?v=(\d+)/) || [])[1];
    const app = (await get(SITE + 'app.js?v=' + live)).text();
    const liveApp = (app.match(/APP_VERSION = '[^']*v(\d+)'/) || [])[1];
    const sw = ((await get(SITE + 'sw.js', { headers: { 'Cache-Control': 'no-cache' } })).text().match(/cancioneiro-v(\d+)/) || [])[1];
    if (live !== liveApp || live !== sw) return `publicado: index ?v=${live}, app.js v${liveApp}, sw.js v${sw}`;
    if (live !== v.app) return { warn: `publicado v${live}, repositório v${v.app} (o GitHub Pages pode demorar alguns minutos)` };
    return { pass: 'v' + live };
  });
  await t('LNK-12', 'Todos os recursos da página principal respondem 200', async () => {
    await needHost(SITE);
    if (!idx) return 'página principal não respondeu';
    const h = idx.text(), bad = [];
    const refs = [...new Set([...h.matchAll(/(?:href|src)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^(mailto:|javascript:)/.test(u)))];
    for (const r of refs) {
      const u = new URL(r, SITE).href;
      if (/fonts\.googleapis\.com\/?$|fonts\.gstatic\.com\/?$/.test(u)) continue; // preconnect
      const x = await get(u).catch(e => ({ status: e.message }));
      if (x.status !== 200) bad.push(`${r} → ${x.status}`);
    }
    return bad.length ? bad.join('; ') : { pass: refs.length + ' recursos' };
  });
  await t('LNK-13', 'Páginas auxiliares respondem: privacidade.html, admin.html, drive.html, manifest, ícones, vendor', async () => {
    await needHost(SITE);
    const pages = ['privacidade.html', 'admin.html', 'drive.html', 'manifest.json', 'icons/icon-512.png', 'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs', 'vendor/pdf-lib/pdf-lib.min.js', 'worker.js', 'theme.css', 'config.js'];
    const bad = [];
    for (const p of pages) { const r = await get(SITE + p); if (r.status !== 200) bad.push(`${p} → ${r.status}`); }
    return bad.length ? bad.join('; ') : true;
  });
  await t('LNK-14', 'Endereço inexistente devolve 404 (sem expor listagem)', async () => {
    await needHost(SITE);
    const r = await get(SITE + 'nao-existe-' + Date.now() + '.html');
    return r.status === 404 || 'HTTP ' + r.status;
  }, { sev: 'baixa' });
  await t('LNK-15', 'Ligações externas das páginas (privacidade e outras) respondem', async () => {
    const bad = [], seen = new Set(), skipped = [];
    for (const p of ['privacidade.html', 'index.html']) {
      for (const m of read(p).matchAll(/href="(https:\/\/[^"]+)"/g)) {
        const u = m[1].replace(/&amp;/g, '&'); if (seen.has(u) || /fonts\.(googleapis|gstatic)\.com\/?$/.test(u)) continue; seen.add(u);
        if (!(await reachable(u))) { skipped.push(new URL(u).host); continue; }
        const r = await get(u, { redirect: 'follow' }).catch(e => ({ status: e.message }));
        if (!(r.status >= 200 && r.status < 400)) bad.push(`${u} → ${r.status}`);
      }
    }
    if (bad.length) return bad.join('; ');
    return skipped.length ? (skipped.length === seen.size ? { skip: 'anfitriões inacessíveis daqui: ' + skipped.join(', ') } : { pass: `${seen.size - skipped.length} ligações; não verificadas (rede): ${skipped.join(', ')}` }) : { pass: seen.size + ' ligações' };
  }, { sev: 'baixa' });
  await t('LNK-16', 'drive.html mostra o texto do endereço como texto (sem HTML) e recusa ser emoldurada', async () => {
    await needHost(SITE);
    const h = (await get(SITE + 'drive.html')).text();
    if (/innerHTML/.test(h)) return 'drive.html usa innerHTML';
    return /window\.top !== window\.self/.test(h) || 'sem proteção contra iframe';
  });

  dim('Segurança — produção', 'alta');
  await t('SEG-20', 'SRI do supabase-js corresponde ao ficheiro servido pelo CDN', async () => {
    const tag = (read('index.html').match(/<script src="(https:\/\/cdn[^"]+)" integrity="sha384-([^"]+)"/) || []);
    let body, from = 'CDN';
    if (await reachable(tag[1])) body = (await get(tag[1])).body;
    else { const [, ver, file] = tag[1].match(/supabase-js@([\d.]+)\/(.+)$/); body = await npmFile('@supabase/supabase-js', ver, file); from = 'registo npm (jsDelivr inacessível daqui)'; }
    const h = sha384b64(body);
    return h === tag[2] ? { pass: from } : `${from} sha384-${h} ≠ index.html sha384-${tag[2]}`;
  }, { sev: 'crítica' });
  await t('SEG-21', 'Sem sessão: tabelas não se leem pela API REST (songs, allowed_emails, access_log, favorites, song_shares, invites…)', async () => {
    const tables = ['songs', 'song_files', 'song_tags', 'song_sources', 'allowed_emails', 'access_log', 'access_requests', 'favorites', 'song_shares', 'invites', 'collections', 'collection_songs', 'collection_templates', 'drive_state', 'job_requests', 'song_edits', 'sync_log', 'health_log', 'drive_files'];
    const bad = [];
    for (const tb of tables) {
      const r = await get(`${SB}/rest/v1/${tb}?select=*&limit=1`, { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
      const body = r.text();
      if (r.status === 200 && body.trim() !== '[]') bad.push(`${tb}: 200 com dados`);
      else if (r.status === 200) bad.push(`${tb}: 200 vazio (deve ser 401/403)`);
    }
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'crítica' });
  await t('SEG-22', 'Sem sessão: funções RPC protegidas (my_rank, my_role, is_allowed, backup_schema, backup_objects, call_notify)', async () => {
    const bad = [];
    for (const f of ['my_rank', 'my_role', 'is_allowed', 'backup_schema', 'backup_objects', 'in_cancioneiro_collection', 'set_source_hashes']) {
      const r = await get(`${SB}/rest/v1/rpc/${f}`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: '{}' });
      if (r.status === 200) bad.push(`${f}: 200 ${r.text().slice(0, 60)}`);
    }
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'crítica' });
  await t('SEG-23', 'Armazenamento: bucket «coro» privado (endereço público e lista sem sessão recusados)', async () => {
    const pub = await get(`${SB}/storage/v1/object/public/coro/livros/songbook.pdf`);
    const list = await get(`${SB}/storage/v1/object/list/coro`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 5 }) });
    const lt = list.text();
    if (pub.status === 200) return 'objeto público acessível';
    if (list.status === 200 && lt.trim() !== '[]') return 'lista do bucket acessível sem sessão';
    return true;
  }, { sev: 'crítica' });
  await t('SEG-24', 'Endereço assinado falso / adulterado é recusado', async () => {
    const r = await get(`${SB}/storage/v1/object/sign/coro/livros/songbook.pdf?token=eyJhbGciOiJIUzI1NiJ9.e30.x`);
    return r.status >= 400 || 'HTTP ' + r.status;
  });
  await t('SEG-25', 'Auth: entrada só com Google; registo por email/telefone/anónimo desligado', async () => {
    const s = (await get(`${SB}/auth/v1/settings`, { headers: { apikey: ANON } })).json();
    const ext = s.external || {};
    const on = Object.entries(ext).filter(([k, val]) => val === true).map(([k]) => k);
    if (!ext.google) return 'Google desligado';
    const extra = on.filter(k => !['google'].includes(k));
    if (extra.length) return { warn: 'outros fornecedores ligados: ' + extra.join(', ') + ' (qualquer conta pode criar sessão; o acesso continua a depender de allowed_emails)' };
    return true;
  });
  await t('SEG-26', 'conteudo: sem sessão → 403 em todas as operações (song, search, file, users, save, scrape…)', async () => {
    const bad = [];
    for (const op of ['song', 'search', 'file', 'users', 'save', 'scrape', 'upload', 'addsong', 'user', 'invite', 'share']) {
      const r = await fn('conteudo', { op, slug: 'x', q: 'xxx', url: 'http://127.0.0.1/' });
      if (r.status !== 403) bad.push(`${op}: ${r.status}`);
    }
    // sem cabeçalho Authorization: o gateway das funções recusa antes (401)
    const r2 = await get(`${SB}/functions/v1/conteudo`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: '{"op":"song","slug":"x"}' });
    if (![401, 403].includes(r2.status)) bad.push(`sem Authorization: ${r2.status}`);
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'crítica' });
  await t('SEG-27', 'conteudo «shared»: token mal formado → 400; token desconhecido → 410 (sem escrever nada)', async () => {
    const a = await fn('conteudo', { op: 'shared', token: "x' or 1=1--" });
    const b = await fn('conteudo', { op: 'shared', token: 'AAAAAAAAAAAAAAAAAAAAAAAA' });
    const c = await fn('conteudo', { op: 'shared', token: 'a'.repeat(65) });
    if (![400, 403].includes(a.status)) return `injeção: ${a.status}`; // 403 = bloqueado antes pela firewall (Cloudflare) do Supabase
    if (c.status !== 400) return `token longo: ${c.status}`;
    return b.status === 410 || `desconhecido: ${b.status} ${b.text().slice(0, 80)}`;
  });
  await t('SEG-28', 'conteudo: CORS só devolve a origem do GitHub Pages (origem estranha não é refletida)', async () => {
    const r = await fn('conteudo', null, { Origin: 'https://evil.example' }, 'OPTIONS');
    const o = r.headers.get('access-control-allow-origin');
    return o === 'https://tiagomota23.github.io' || `Access-Control-Allow-Origin: ${o}`;
  });
  await t('SEG-29', 'transcribe e notify: CORS «*» (aceitável só porque exigem sessão / token próprio)', async () => {
    const r = await fn('transcribe', null, { Origin: 'https://evil.example' }, 'OPTIONS');
    const o = r.headers.get('access-control-allow-origin');
    return o === '*' ? { warn: 'transcribe responde a qualquer origem (Access-Control-Allow-Origin: *); a proteção é só o token. Sugestão: restringir à origem do GitHub Pages como no conteudo' } : true;
  }, { sev: 'baixa' });
  await t('SEG-30', 'transcribe: sem sessão → 403 (não chega ao Groq)', async () => {
    const r = await get(`${SB}/functions/v1/transcribe`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'audio/wav' }, body: new Uint8Array(2000) });
    return r.status === 403 || 'HTTP ' + r.status;
  }, { sev: 'alta' });
  await t('SEG-31', 'backup e gravacoes: sem token OIDC / token forjado → 401', async () => {
    const forged = ['eyJhbGciOiJub25lIn0', Buffer.from(JSON.stringify({ iss: 'https://token.actions.githubusercontent.com', aud: 'cancioneiro-backup', repository: 'tiagomota23/cancioneiro', ref: 'refs/heads/main', exp: 9e9, nbf: 0 })).toString('base64url'), 'x'].join('.');
    const bad = [];
    for (const f of ['backup?op=schema', 'gravacoes?op=list']) {
      for (const auth of [undefined, 'Bearer ' + forged, 'Bearer ' + ANON]) {
        const r = await get(`${SB}/functions/v1/${f}`, { headers: auth ? { Authorization: auth, apikey: ANON } : { apikey: ANON } });
        if (r.status !== 401) bad.push(`${f} (${auth ? auth.slice(7, 20) : 'sem'}): ${r.status}`);
      }
    }
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'crítica' });
  await t('SEG-32', 'notify: tipos inválidos / ids mal formados → 400 (sem enviar emails)', async () => {
    const bad = [];
    for (const b of [{ type: 'xyz' }, { type: 'access', id: 'nao-e-um-uuid' }, { type: 'sync', id: 'abc' }, { type: 'decide', id: 'x', token: 'y', action: 'autorizar' }, { type: 'claim', invite: '<x>' }]) {
      const r = await fn('notify', b);
      if (r.status !== 400) bad.push(`${JSON.stringify(b)}: ${r.status}`);
    }
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta' });
  await t('SEG-33', 'Erros das funções não expõem detalhes internos (pilha, chaves, nomes de tabelas)', async () => {
    const r = await fn('conteudo', '{not json');
    const body = r.text();
    return !/service_role|eyJ|stack|at Object|\/rest\/v1/.test(body) || 'resposta expõe detalhes: ' + body.slice(0, 120);
  }, { sev: 'baixa' });
  await t('SEG-34', 'Cabeçalhos do GitHub Pages: HTTPS forçado (HSTS) e tipo de conteúdo correto', async () => {
    await needHost(SITE);
    const r = await get(SITE);
    const ct = r.headers.get('content-type') || '';
    const hsts = r.headers.get('strict-transport-security');
    const http = await get(SITE.replace('https:', 'http:'), { redirect: 'manual' }).catch(() => ({ status: 0 }));
    if (!/text\/html/.test(ct)) return 'content-type ' + ct;
    if (!(http.status >= 300 && http.status < 400)) return 'http:// não redireciona: ' + http.status;
    return hsts ? true : { warn: 'sem Strict-Transport-Security (limitação do GitHub Pages; a CSP vem por <meta>, sem frame-ancestors)' };
  }, { sev: 'baixa' });

  dim('Desempenho — produção', 'média');
  await t('DES-01', 'Tamanho dos ficheiros da app (app.js, styles.css, theme.css, index.html) dentro do orçamento', async () => {
    await needHost(SITE);
    const budget = { 'app.js': 260e3, 'styles.css': 80e3, 'theme.css': 15e3, 'index.html': 35e3 };
    const out = [], bad = [];
    for (const [f, max] of Object.entries(budget)) {
      const r = await get(SITE + f + (f.endsWith('.html') ? '' : '?v=' + v.app), { headers: { 'Accept-Encoding': 'gzip' } });
      out.push(`${f} ${Math.round(r.body.length / 1024)} KB`);
      if (r.body.length > max) bad.push(`${f} ${Math.round(r.body.length / 1024)} KB > ${Math.round(max / 1024)} KB`);
    }
    return bad.length ? { warn: bad.join('; '), evidence: out.join(', ') } : { pass: out.join(', ') };
  });
  await t('DES-02', 'Tempo de resposta do site e do Supabase (1 pedido cada, mediana de 3)', async () => {
    const med = a => a.sort((x, y) => x - y)[1];
    const s = [], sb = [], f = [];
    const site = await reachable(SITE);
    for (let i = 0; i < 3; i++) {
      if (site) s.push((await get(SITE + '?t=' + Date.now())).ms); else s.push(0, 0, 0);
      sb.push((await get(`${SB}/auth/v1/health`, { headers: { apikey: ANON } })).ms);
      f.push((await fn('conteudo', null, {}, 'OPTIONS')).ms);
    }
    const ev = `site ${site ? med(s) + ' ms' : 'não medido (inacessível daqui)'}, auth ${med(sb)} ms, função conteudo ${med(f)} ms`;
    return med(s) > 2500 || med(sb) > 2500 || med(f) > 4000 ? { warn: ev } : { pass: ev };
  });
  if (full) {
    await t('DES-03', 'Arranque a frio da função conteudo (OPTIONS) abaixo de 5 s', async () => {
      const r = await fn('conteudo', null, {}, 'OPTIONS');
      return r.ms < 5000 ? { pass: r.ms + ' ms' } : { warn: r.ms + ' ms' };
    });
  }
}
