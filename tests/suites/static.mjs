// Verificações do repositório (sem rede): versões, referências, CSP, SRI, segredos, design.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { t, dim, read, exists, ROOT, versions, gitFiles, sha256 } from '../lib.mjs';

export default async function (level) {
  dim('Estabilidade — versões', 'alta');
  await t('EST-01', 'APP_VERSION, ?v=N (index.html) e CACHE (sw.js) coincidem', () => {
    const v = versions();
    const all = [v.app, v.sw, ...v.idx];
    if (!v.app || !v.sw || !v.idx.length) return `versão em falta: ${JSON.stringify(v)}`;
    if (new Set(all).size !== 1) return `app.js v${v.app}, sw.js v${v.sw}, index.html ?v=${[...new Set(v.idx)].join('/')}`;
    return { pass: 'v' + v.app };
  }, { where: 'app.js APP_VERSION · index.html ?v= · sw.js CACHE' });
  await t('EST-02', 'APP_VERSION tem a data e o formato «AAAA-MM-DD vN»', () => /APP_VERSION = '\d{4}-\d{2}-\d{2} v\d+'/.test(read('app.js')) || 'formato inesperado');
  await t('EST-03', 'sw.js: todos os ficheiros do SHELL existem', () => {
    const shell = JSON.parse((read('sw.js').match(/SHELL = (\[[^\]]*\])/) || [])[1].replace(/'/g, '"'));
    const miss = shell.filter(f => f !== './' && !exists(f));
    return miss.length ? 'em falta: ' + miss.join(', ') : true;
  }, { where: 'sw.js SHELL' });
  await t('EST-04', 'sw.js: a versão do supabase-js no CDN e no index.html é a mesma da CSP', () => {
    const idx = read('index.html');
    const src = (idx.match(/<script src="(https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@([\d.]+)\/[^"]+)"/) || []);
    const csp = (idx.match(/supabase-js@([\d.]+)\//) || [])[1];
    if (!src[2]) return 'supabase-js não encontrado no index.html';
    return src[2] === csp || `script ${src[2]} vs CSP ${csp}`;
  });

  dim('Ligações e navegação — repositório', 'média');
  await t('LNK-01', 'Todas as referências locais (href/src) das páginas existem', () => {
    const pages = ['index.html', 'admin.html', 'drive.html', 'privacidade.html'];
    const bad = [];
    for (const p of pages) {
      const h = read(p);
      for (const m of h.matchAll(/(?:href|src)="([^"#:]+?)(?:\?[^"]*)?"/g)) {
        const f = m[1]; if (!f || f.startsWith('//') || f.includes('${')) continue;
        if (!exists(path.posix.join(path.posix.dirname(p), f))) bad.push(`${p} → ${f}`);
      }
    }
    return bad.length ? bad.join('; ') : true;
  });
  await t('LNK-02', 'manifest.json: ícones existem, start_url e scope relativos', () => {
    const m = JSON.parse(read('manifest.json'));
    const miss = m.icons.filter(i => !exists(i.src)).map(i => i.src);
    if (miss.length) return 'ícones em falta: ' + miss.join(', ');
    return (m.start_url === './' && m.scope === './') || `start_url ${m.start_url}, scope ${m.scope}`;
  });
  await t('LNK-03', 'Ficheiros referidos no app.js (vendor, worker, sw) existem', () => {
    const js = read('app.js');
    const refs = [...js.matchAll(/'((?:vendor|icons)\/[^'?#]+\.(?:js|mjs|png))'/g)].map(m => m[1]).concat(['vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs', 'sw.js', 'worker.js']);
    const miss = [...new Set(refs)].filter(f => !exists(f));
    return miss.length ? 'em falta: ' + miss.join(', ') : true;
  });

  dim('Segurança — repositório', 'alta');
  await t('SEG-01', 'CSP presente em index/admin/drive com object-src none e base-uri self', () => {
    const bad = [];
    for (const p of ['index.html', 'admin.html', 'drive.html']) {
      const c = (read(p).match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
      if (!c) { bad.push(p + ': sem CSP'); continue; }
      if (!/object-src 'none'/.test(c)) bad.push(p + ': falta object-src none');
      if (!/base-uri 'self'/.test(c)) bad.push(p + ': falta base-uri');
      if (/script-src[^;]*'unsafe-(inline|eval)'/.test(c)) bad.push(p + ': script-src com unsafe-*');
    }
    return bad.length ? bad.join('; ') : true;
  });
  await t('SEG-02', 'Hash CSP dos scripts inline (admin.html, drive.html) corresponde ao conteúdo', () => {
    const bad = [];
    for (const p of ['admin.html', 'drive.html', 'privacidade.html', 'index.html']) {
      const h = read(p);
      const csp = (h.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
      const hashes = [...csp.matchAll(/'sha256-([^']+)'/g)].map(m => m[1]);
      for (const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        const hsh = sha256(Buffer.from(m[1], 'utf8'), 'base64');
        if (csp && !hashes.includes(hsh)) bad.push(`${p}: script inline sha256-${hsh} não está na CSP (o browser bloqueia-o)`);
      }
    }
    return bad.length ? bad.join('; ') : true;
  }, { where: 'admin.html / drive.html <meta CSP>' });
  await t('SEG-03', 'supabase-js do CDN tem SRI (integrity + crossorigin) e versão fixa', () => {
    const tag = (read('index.html').match(/<script src="https:\/\/cdn[^>]+>/) || [])[0] || '';
    if (!/integrity="sha384-[A-Za-z0-9+/=]+"/.test(tag)) return 'sem integrity';
    if (!/crossorigin="anonymous"/.test(tag)) return 'sem crossorigin';
    return /@\d+\.\d+\.\d+\//.test(tag) || 'versão não fixa';
  });
  await t('SEG-04', 'Nenhum segredo no repositório (service_role, chaves Groq/Resend/Google, tokens)', () => {
    const pats = [
      [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, 'JWT'],
      [/sb_secret_[A-Za-z0-9_-]{10,}/g, 'chave secreta Supabase'], [/sbp_[a-f0-9]{30,}/g, 'token pessoal Supabase'],
      [/gsk_[A-Za-z0-9]{20,}/g, 'chave Groq'], [/re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{10,}/g, 'chave Resend'],
      [/GOCSPX-[A-Za-z0-9_-]{10,}/g, 'segredo OAuth Google'], [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/g, 'token GitHub'],
      [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'chave privada'], [/AKIA[0-9A-Z]{16}/g, 'chave AWS'],
    ];
    const bad = [];
    for (const f of gitFiles()) {
      if (/\.(png|pdf|jpg|ico|wasm|woff2?)$/.test(f) || f.startsWith('vendor/')) continue;
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const [re, what] of pats) for (const m of s.matchAll(re)) {
        if (what === 'JWT') { // só a chave anon (pública) é permitida
          try { const p = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString()); if (p.role === 'anon') continue; } catch { /* não é JWT */ continue; }
        }
        bad.push(`${f}: ${what}`);
      }
    }
    return bad.length ? [...new Set(bad)].join('; ') : true;
  }, { sev: 'crítica' });
  await t('SEG-05', 'config.js só tem a chave anon (role=anon)', () => {
    const k = (read('config.js').match(/eyJ[^']+/) || [])[0];
    const p = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString());
    return p.role === 'anon' || `role ${p.role}`;
  }, { sev: 'crítica' });
  await t('SEG-06', 'Nenhuma letra de cântico versionada (songs.json, seed/ fora do repositório)', () => {
    const files = gitFiles();
    const bad = files.filter(f => /(^|\/)songs\.json$|^seed\/|drive-coro-clu\//.test(f));
    let tracked = [];
    try { tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => /(^|\/)songs\.json$|^seed\//.test(f)); } catch (e) { /* sem git */ }
    return [...bad.filter(f => tracked.includes(f)), ...tracked].length ? 'versionado: ' + [...new Set(tracked)].join(', ') : true;
  }, { sev: 'alta' });
  await t('SEG-07', 'Ficheiros vendor (pdf.js, pdf-lib) iguais à referência', () => {
    const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/baseline.json'), 'utf8')).vendor;
    const bad = Object.entries(ref).filter(([f, h]) => !exists(f) || sha256(fs.readFileSync(path.join(ROOT, f))) !== h).map(([f]) => f);
    return bad.length ? 'alterado: ' + bad.join(', ') + ' (se foi intencional, atualizar tests/baseline.json)' : true;
  });
  await t('SEG-08', 'Funções do servidor: CORS do conteudo só para o GitHub Pages; OIDC com repo/ramo/workflow fixos', () => {
    const c = read('supabase/functions/conteudo/index.ts');
    if (!/ORIGINS = \['https:\/\/tiagomota23\.github\.io'\]/.test(c)) return 'conteudo: lista de origens mudou';
    for (const [f, wf] of [['backup', 'backup.yml'], ['gravacoes', 'converter-gravacoes.yml']]) {
      const s = read(`supabase/functions/${f}/index.ts`);
      if (!s.includes("claims.repository === 'tiagomota23/cancioneiro'") || !s.includes("claims.ref === 'refs/heads/main'") || !s.includes(wf) || !s.includes("head.alg !== 'RS256'"))
        return `${f}: verificação OIDC incompleta`;
    }
    return true;
  });
  await t('SEG-09', 'Workflows: permissões mínimas, ações com versão, sem segredos em claro', () => {
    const bad = [];
    for (const f of fs.readdirSync(path.join(ROOT, '.github/workflows'))) {
      const y = read('.github/workflows/' + f);
      if (/permissions:\s*write-all/.test(y)) bad.push(f + ': write-all');
      for (const m of y.matchAll(/uses:\s*([^\s]+)/g)) if (!/@v\d|@[0-9a-f]{40}/.test(m[1])) bad.push(f + ': ' + m[1] + ' sem versão');
      if (/pull_request_target/.test(y)) bad.push(f + ': pull_request_target');
    }
    return bad.length ? bad.join('; ') : true;
  });
  await t('SEG-10', 'SQL do repositório: o filtro «approved» da política «leitura familia» (novos.sql) está no esquema', () => {
    const s = read('supabase/novos.sql');
    return /approved or \(select public\.my_rank\(\)\) >= 3/.test(s) || 'novos.sql já não tem o filtro (ver DB-RLS-05)';
  }, { sev: 'baixa' });

  await t('SEG-11', 'conteudo «shared» com songs:true devolve só os campos previstos e a letra sem acordes (noChords)', () => {
    const c = read('supabase/functions/conteudo/index.ts');
    const m = c.match(/const full = b\.songs \?[\s\S]*?return \{([^}]*)\};/);
    if (!m) return 'bloco songs:true não encontrado';
    const fields = [...m[1].matchAll(/(?:^\s*|[,{]\s*)(\w+)\s*:/g)].map(x => x[1]).sort().join(',');
    const want = ['author', 'language', 'lyrics', 'number', 'slug', 'title', 'translation', 'translation_language'].sort().join(',');
    if (fields !== want) return 'campos: ' + fields;
    return /lyrics: noChords\((s\.eff|effOf\(it\.slug, s\))\)/.test(m[0]) || 'letra sem noChords'; // v204: effOf = versão da folha ou a original
  }, { sev: 'alta', where: 'supabase/functions/conteudo/index.ts (op shared)' });

  await t('SEG-12', 'conteudo: folha por publicar → endereço partilhado «expirado», share 409, e não conta para o Cancioneiro (colSet)', () => {
    const c = read('supabase/functions/conteudo/index.ts');
    const bad = [];
    if (!/sh\.collection_id && \(!col \|\| col\.published === false\)/.test(c)) bad.push('shared não recusa folha por publicar');
    if (!/col\.published === false\) return out\([^)]*409\)/.test(c)) bad.push('share não devolve 409');
    if (!/collections\.published=is\.true/.test(c)) bad.push('colSet não filtra published');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/functions/conteudo/index.ts' });

  await t('SEG-13', 'conteudo addsong: todos os cânticos novos começam por aprovar, também os de um Maestro (v165)', () => {
    const c = read('supabase/functions/conteudo/index.ts');
    return /const ok = false[^\n]*\n[\s\S]{0,600}approved: ok/.test(c) || 'addsong pode aprovar logo';
  }, { sev: 'média', where: 'supabase/functions/conteudo/index.ts (op addsong)' });
  await t('SEG-15', 'conteudo «Editar nesta folha» (v204): collyrics só Maestro+ (lvl < 3 → 403), valida coleção e letra e exige o cântico na folha; song com collection só dá a versão a quem vê a folha (publicada, ativa, público) e tira acordes ao Cancioneiro; shared usa a versão da folha', () => {
    const c = read('supabase/functions/conteudo/index.ts'), bad = [];
    const cl = (c.match(/if \(op === 'collyrics'\)[\s\S]{0,1600}?\n    \}/) || [''])[0];
    if (!cl) return "op collyrics não encontrada";
    if (!/^\s*if \(op === 'collyrics'\)[^\n]*\n\s*if \(lvl < 3\) return denied\(\);/.test(cl)) bad.push('collyrics: a 1.ª verificação não é lvl < 3 → denied');
    if (!/\[0-9a-f-\]\{36\}/.test(cl)) bad.push('collyrics: id da coleção não validado');
    if (!/validLyrics\(v\)/.test(cl)) bad.push('collyrics: letra não validada');
    if (!/collection_songs\?collection_id=eq\.\$\{id\}&song_slug=eq/.test(cl)) bad.push('collyrics: não confirma o cântico na folha');
    if (!/limit\(user, 'save'/.test(cl)) bad.push('collyrics: sem limite de uso');
    const sg = (c.match(/if \(op === 'song'\)[\s\S]{0,1800}?\n    \}/) || [''])[0];
    if (!/lvl >= 4 \|\| \(lvl >= 3 && await gOk\(\)\) \|\| \(c\.published && Date\.parse\(c\.expires_at\) > Date\.now\(\) && \(c\.audience === 'cancioneiro' \|\| lvl >= 2\) && await gOk\(\)\)/.test(sg)) bad.push('song+collection: condição de visibilidade da folha mudou (rever; v210: Gestor tudo, Maestro pelos grupos)');
    if (!/lvl >= 2 \? eff : noChords\(eff\)/.test(sg)) bad.push('song: versão da folha sem noChords para o Cancioneiro');
    if (!/collection_lyrics\?collection_id=eq\.\$\{col\.id\}/.test(c) || !/own\.get\(slug\) \|\| s\.eff/.test(c)) bad.push('shared: não usa a versão da folha');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/functions/conteudo/index.ts (ops collyrics, song, shared)' });
  await t('SEG-16', 'conteudo e grupos (v209): colSet e song+collection filtram por grupos (groupOk); os grupos da pessoa vêm de user_groups pelo seu email (em minúsculas, de who()) e, se a leitura falhar, ficam vazios (não recebe folhas); Gestor sem filtro e Maestro pelos seus grupos (v210), também em collyrics', () => {
    const c = read('supabase/functions/conteudo/index.ts'), bad = [];
    if (!/const email = \(u\.email \|\| ''\)\.toLowerCase\(\);[\s\S]{0,200}return a \? \{ id: u\.id, email,/.test(c)) bad.push('who() já não devolve o email em minúsculas (user_groups guarda-o em minúsculas)');
    if (!/const myGroups = async user => new Set\(\(await rest\(`user_groups\?email=eq\.\$\{encodeURIComponent\(user\.email\)\}&select=group_id`\)\.catch\(\(\) => \[\]\)\)/.test(c)) bad.push('myGroups mudou (rever: email da pessoa e falha → vazio)');
    if (!/const groupOk = \(mine, cg\) => !mine \|\| \(mine\.size > 0 && \(!\(cg \|\| \[\]\)\.length \|\| cg\.some\(x => mine\.has\(x\.group_id\)\)\)\)/.test(c)) bad.push('groupOk mudou (rever)');
    if (!/const mine = lvl >= 4 \? null : await myGroups\(user\);\s*colSet = new Set\(rows\.filter\(r => groupOk\(mine, r\.collections\.collection_groups\)\)/.test(c)) bad.push('colSet: filtro de grupos sem bypass só para o Gestor (v210)');
    if (!/const gOk = async \(\) => groupOk\(await myGroups\(user\), c\.collection_groups\);/.test(c)) bad.push('song+collection sem filtro de grupos');
    if (!/if \(lvl < 4 && !groupOk\(await myGroups\(user\), cs\.collections\?\.collection_groups\)\) return denied\(\);/.test(c)) bad.push('collyrics: Maestro não é recusado fora dos seus grupos (v210)');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/functions/conteudo/index.ts' });
  await t('SEG-17', 'sync-cc (v226): a 1.ª coisa que faz é exigir e consumir um pedido em job_requests (claimJob, últimos 10 min) e responder 403 sem ele', () => {
    const c = read('supabase/functions/sync-cc/index.ts');
    const bad = [];
    if (!/Deno\.serve\(async \(\) => \{\s*if \(!\(await claimJob\('sync-cc'\)\.catch\(\(\) => false\)\)\) return json\(\{[^}]*\}, 403\);/.test(c)) bad.push('Deno.serve não começa por claimJob → 403');
    if (!/job_requests\?job=eq\.\$\{job\}&requested_at=gte\.\$\{since\}`, \{ method: 'DELETE'/.test(c)) bad.push('claimJob não consome o pedido (DELETE em job_requests)');
    if (!/Date\.now\(\) - 10 \* 60e3/.test(c)) bad.push('janela do pedido diferente de 10 min (rever)');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/functions/sync-cc/index.ts' });
  await t('SEG-18', 'cc-transcribe (v227): valida slug e drive_id (400), depois exige e consome um pedido em job_requests (claimJob → 403) antes de qualquer outra leitura ou chamada; só transcreve gravações ligadas ao cântico como kind other', () => {
    const c = read('supabase/functions/cc-transcribe/index.ts'), bad = [];
    const body = (c.match(/Deno\.serve\(async \(req\) => \{([\s\S]*)$/) || [])[1] || '';
    const iClaim = body.indexOf("claimJob('cc-transcribe')"), iRest = body.indexOf('rest(`'), iFetch = body.search(/\bfetch\(/);
    if (iClaim < 0) bad.push('sem claimJob');
    if (!/return json\(\{ error: 'pedido inválido' \}, 400\)/.test(body)) bad.push('sem validação 400 de slug/drive_id');
    if (iClaim >= 0 && ((iRest >= 0 && iRest < iClaim) || (iFetch >= 0 && iFetch < iClaim))) bad.push('há leituras ou chamadas antes do claimJob');
    if (!/song_files\?song_slug=eq\.\$\{slug\}&kind=eq\.other/.test(body)) bad.push('não confirma a gravação ligada ao cântico (kind other)');
    if (!/Date\.now\(\) - 10 \* 60e3/.test(c)) bad.push('janela do pedido diferente de 10 min (rever)');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/functions/cc-transcribe/index.ts' });
  await t('SEG-37', 'drive-sync v10 (atalhos do Drive): shortcutDetails nos fields da listagem, followShortcuts definido e chamado, download por it.src || it.id, e ao Drive só GET (nenhum fetch a googleapis.com/drive com method)', () => {
    const c = read('supabase/functions/drive-sync/index.ts'), bad = [];
    if (!/fields: '[^']*files\([^)]*shortcutDetails[^)]*\)/.test(c)) bad.push('listagem sem shortcutDetails nos fields');
    if (!/async function followShortcuts\(/.test(c)) bad.push('followShortcuts não definido');
    if (!/await followShortcuts\(/.test(c)) bad.push('followShortcuts não é chamado');
    if (!/drive\/v3\/files\/\$\{it\.src \|\| it\.id\}\?alt=media/.test(c)) bad.push('download não usa it.src || it.id');
    const drive = c.split('\n').filter(l => /fetch\([^\n]*googleapis\.com\/drive/.test(l));
    if (!drive.length) bad.push('não encontrou chamadas ao Drive');
    const w = drive.filter(l => /method:/.test(l));
    if (w.length) bad.push('chamada ao Drive com method (não GET): ' + w[0].trim().slice(0, 80));
    return bad.length ? bad.join('; ') : { pass: drive.length + ' chamadas ao Drive, todas GET' };
  }, { sev: 'alta', where: 'supabase/functions/drive-sync/index.ts' });
  await t('SEG-38', 'conteudo «search» (v232, versão 33): números e pesquisas < 3 letras → hits [] antes do limite e do índice; limite search 200/h e 1000/dia; resultados partilhados em cache sem perfil e o filtro visible() aplicado depois a cada pessoa (também em match); no máximo 40 (MAX_HITS); cache 60 s; busca.js importado ao lado', () => {
    const c = read('supabase/functions/conteudo/index.ts'), bad = [];
    const op = (c.match(/if \(op === 'search'\) \{([\s\S]*?)\n    \}/) || [])[1] || '';
    if (!op) return 'op search não encontrada';
    const iNum = op.indexOf('return out({ hits: [] })'), iLim = op.indexOf("limit(user, 'search'"), iSongs = op.indexOf('songs()');
    if (!op.includes('/^[\\d ]+$/.test(nq)') || iNum < 0) bad.push('não recusa números (hits [])');
    if (!(iNum >= 0 && iLim > iNum && iSongs > iLim)) bad.push('ordem recusa → limite → índice não se verifica');
    if (!/search: \[200, 1000\]/.test(c)) bad.push('LIMITS.search diferente de [200, 1000]');
    if (!/const MAX_HITS = 40\b/.test(c)) bad.push('MAX_HITS ≠ 40');
    if (!/cached\(c, 's:' \+ nq, \(\) => Busca\.search\(index\(c\), q, null, \d+\)\)/.test(op)) bad.push('pesquisa sem cache partilhada por nq (ou com o perfil dentro da cache)');
    if (!/all\.filter\(h => visible\(c\.bySlug\.get\(h\.slug\)\)[^\n]*\)\.slice\(0, MAX_HITS\)/.test(op)) bad.push('hits sem filtro visible() por pessoa'); // v233: + (lvl >= 2 || h.field !== 'pdf')
    if (!/Busca\.pick\(all\.filter\(h => visible\(c\.bySlug\.get\(h\.slug\)\)[^\n]*\)\)/.test(c)) bad.push('match sem filtro visible()'); // v234: + (lvl >= 2 || h.field !== 'pdf')
    if (!/Date\.now\(\) - r\.at < 60e3/.test(c)) bad.push('cache de resultados ≠ 60 s');
    if (!/^import '\.\/busca\.js';/m.test(c)) bad.push("sem import './busca.js'");
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/functions/conteudo/index.ts' });
  await t('SEG-39', 'Texto dos PDF (v233): song_texts com RLS e sem políticas, revoke a anon/authenticated (texto-pdf.sql); pdf-texto verifica o OIDC (RS256, aud cancioneiro-pdf, repositório, main, workflow texto-pdf.yml) antes de tudo e responde 401; save só para song_files kind score e texto ≤ 30000; conteudo: search sem hits «pdf» para o perfil Cancioneiro (lvl < 2) e match sem trechos do PDF para lvl < 2', () => {
    const sqlf = read('supabase/texto-pdf.sql'), f = read('supabase/functions/pdf-texto/index.ts'), c = read('supabase/functions/conteudo/index.ts'), bad = [];
    if (!/alter table public\.song_texts enable row level security/.test(sqlf)) bad.push('song_texts sem RLS');
    if (/create policy[^;]*song_texts/i.test(sqlf)) bad.push('song_texts com políticas');
    if (!/revoke all on public\.song_texts from anon, authenticated/.test(sqlf)) bad.push('sem revoke a anon/authenticated');
    const body = (f.match(/Deno\.serve\(async req => \{\s*try \{\s*([^\n]*)/) || [])[1] || '';
    if (!/^if \(!\(await githubOk\(req\)\.catch\(\(\) => false\)\)\) return json\(\{[^}]*\}, 401\);/.test(body)) bad.push('pdf-texto não começa por githubOk → 401');
    for (const [k, re] of [['RS256', /head\.alg !== 'RS256'/], ['aud', /claims\.aud === 'cancioneiro-pdf'/], ['repositório', /claims\.repository === 'tiagomota23\/cancioneiro'/], ['main', /claims\.ref === 'refs\/heads\/main'/], ['workflow', /workflow_ref[^\n]*startsWith\('tiagomota23\/cancioneiro\/\.github\/workflows\/texto-pdf\.yml@'\)/], ['exp', /claims\.exp > now/]])
      if (!re.test(f)) bad.push('OIDC sem verificação de ' + k);
    if (!/song_files\?select=song_slug&kind=eq\.score&path=eq\./.test(f)) bad.push('save não confirma song_files kind score');
    if (!/\.slice\(0, 30000\)/.test(f)) bad.push('texto sem limite de 30000');
    if (!c.includes("(lvl >= 2 || h.field !== 'pdf')")) bad.push('search: Cancioneiro pode receber hits pdf');
    const mt = (c.match(/if \(op === 'match'\) \{([\s\S]*?)\n    \}/) || [])[1] || '';
    if (!mt.includes("(lvl >= 2 || h.field !== 'pdf')")) bad.push('match: o perfil Cancioneiro pode receber trechos do texto das partituras (match não distingue lvl; busca.match usa também as linhas do PDF)');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/texto-pdf.sql, supabase/functions/pdf-texto/index.ts, supabase/functions/conteudo/index.ts' });
  await t('SEG-51', 'conteudo «songs» e «files» (v238, versão 40): no máximo 60, sem repetidos; songs só cânticos visible() e sem acordes no perfil Cancioneiro; files só lvl ≥ 2 (403) e só caminhos de song_files; limites por limitMany (song / file) exceto cânticos de folhas ativas (free, só lvl < 3); recusados em refused', () => {
    const c = read('supabase/functions/conteudo/index.ts'), bad = [];
    const blk = op => (c.match(new RegExp(`if \\(op === '${op}'\\) \\{([\\s\\S]*?)\\n    \\}`)) || [])[1] || '';
    const so = blk('songs'), fi = blk('files');
    if (!so) bad.push('op songs não encontrada'); else {
      if (!/\[\.\.\.new Set\([^\n]*b\.slugs[^\n]*\)\]\.slice\(0, 60\)\.filter\(sl => visible\(c\.bySlug\.get\(sl\)\)\)/.test(so)) bad.push('songs: sem dedupe/≤60/visible()');
      if (!/limitMany\(user, 'song', want\.filter\(sl => !free\.has\(sl\)\)\)/.test(so)) bad.push('songs: sem limitMany song (fora das folhas)');
      if (!/lvl >= 2 \? s\.eff : noChords\(s\.eff\)/.test(so)) bad.push('songs: acordes para o perfil Cancioneiro');
      if (!/refused: want\.filter\(sl => !ok\.has\(sl\)\)/.test(so)) bad.push('songs: sem refused');
    }
    if (!fi) bad.push('op files não encontrada'); else {
      if (!/^[^\n]*\n\s*if \(lvl < 2\) return denied\(\);/.test(fi)) bad.push('files: não começa por lvl < 2 → 403');
      if (!/\.slice\(0, 60\)/.test(fi)) bad.push('files: sem máximo 60');
      if (!/rest\(`song_files\?select=path,song_slug&path=in\./.test(fi)) bad.push('files: não restringe a caminhos de song_files');
      if (!/limitMany\(user, 'file', need\)/.test(fi)) bad.push('files: sem limitMany file');
      if (!/refused: raw\.filter\(p => !files\[p\]\)/.test(fi)) bad.push('files: sem refused');
    }
    if (!/const free = user\.rank >= 3 \? new Set\(\) : colSet;/.test(c)) bad.push('free (sem limite) também para Maestro/Gestor');
    if (!/\['song', 'songs', 'search', 'match', 'file', 'files', 'share'\]\.includes\(op\)/.test(c)) bad.push('colSet não calculado para songs/files');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/functions/conteudo/index.ts' });
  await t('EST-06', 'Versão do catálogo (v238): a lista guardada só se reaproveita se nada de que ela depende mudou — cânticos/fontes/etiquetas/ficheiros (gatilhos), mas também o perfil da pessoa (allowed_emails.role) e, no perfil Cancioneiro, as folhas ativas para o Cancioneiro (collections / collection_songs, e a expiração, que não escreve nada)', () => {
    const sq = read('supabase/catalogo-versao.sql'), js = read('app.js'), bad = [];
    for (const tb of ['songs', 'song_sources', 'song_tags', 'song_files']) if (!new RegExp(`'${tb}'`).test(sq)) bad.push(`sem gatilho em ${tb}`);
    // v239: a chave guardada com a lista é listKey(v) = versão | conta | perfil da conta | folhas ativas do Cancioneiro (rank < 2)
    const lk = (js.match(/function listKey\(v\) \{([\s\S]*?)\n  \}/) || [])[1] || '';
    const skip = /if \(v && cached && cached\.length && store\.get\(VER_KEY, null\) === listKey\(v\)\) return;/.test(js);
    if (!lk || !skip) bad.push('load() não compara a chave guardada com listKey(v)');
    if (lk && !/session \? session\.user\.id/.test(lk)) bad.push('listKey sem a conta (session.user.id)');
    const coversRole = /allowed_emails/.test(sq) || /maxRole/.test(lk);
    const coversSheets = /collection_songs|collections/.test(sq) && /expir/i.test(sq) || (/c\.audience === 'cancioneiro'/.test(lk) && /!expired\(c\)/.test(lk) && /song_slug/.test(lk) && /c\.published !== false/.test(lk));
    // e volta a verificar quando as folhas chegam (ao abrir e ao voltar à app) e quando o perfil da conta muda
    const rc = (js.match(/loadCollections\(\)\.then\(recheckList\)/g) || []).length + (/Promise\.allSettled\(\[loadFavs\(\), loadCollections\(\)\]\)\.then\(\(\) => \{ recheckList\(\);/.test(js) ? 1 : 0);
    if (rc < 2) bad.push(`recheckList depois de loadCollections em ${rc} sítios (esperado: ao abrir e ao voltar à app)`);
    if (!/if \(roleChanged\) setTimeout\(recheckList, 0\)/.test(js)) bad.push('mudança de perfil da conta não chama recheckList');
    if (!coversRole) bad.push('mudança de perfil (ex.: Cancioneiro → Coro, Coro → Maestro) não invalida a lista guardada: fica a lista antiga até outro cântico mudar');
    if (!coversSheets) bad.push('perfil Cancioneiro: uma folha nova (ou que expira) para o Cancioneiro muda os cânticos que a pessoa vê (in_cancioneiro_collection na política «leitura familia»), mas não sobe a versão: a lista guardada não tem os cânticos da folha');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/catalogo-versao.sql, app.js (load, VER_KEY)' });
  await t('SEG-48', 'Revisão de recortes (v237, código): crop_reviews com RLS, sem políticas, revoke anon/authenticated; conteudo crops/croppages/cropset começam por lvl < 3 → 403; croppages conta cada página no limite file; cropset: só pendente (404), limite save antes de escrever, caminho do mesmo livro com &s= do cântico da revisão, 1–4 partes, 1.ª parte = p, páginas a ±1 das atuais/anteriores, frações 0–1, largura ≥ 0,05 e altura ≥ 0,02; pdf-texto locate depois do OIDC', () => {
    const c = read('supabase/functions/conteudo/index.ts'), sq = read('supabase/recortes.sql'), pf = read('supabase/functions/pdf-texto/index.ts'), bad = [];
    if (!/alter table public\.crop_reviews enable row level security/.test(sq)) bad.push('crop_reviews sem RLS');
    if (/create policy[^;]*crop_reviews/i.test(sq)) bad.push('crop_reviews com políticas');
    if (!/revoke all on public\.crop_reviews from anon, authenticated/.test(sq)) bad.push('crop_reviews sem revoke');
    const blk = op => (c.match(new RegExp(`if \\(op === '${op}'\\) \\{([\\s\\S]*?)\\n    \\}`)) || [])[1] || '';
    for (const op of ['crops', 'croppages', 'cropset']) { const b = blk(op); if (!b) bad.push(`op ${op} não encontrada`); else if (!/^[^\n]*\n\s*if \(lvl < 3\) return denied\(\);/.test(b)) bad.push(`op ${op} não começa por lvl < 3 → 403`); }
    const cp = blk('croppages'); if (cp && !/limit\(user, 'file',/.test(cp)) bad.push('croppages sem limite file por página');
    const cs = blk('cropset');
    if (cs) {
      if (!/r\.status !== 'pendente'[^\n]*404\)/.test(cs)) bad.push('cropset aceita revisão já feita');
      const iLim = cs.indexOf("limit(user, 'save'"), iW = cs.search(/method: 'PATCH'/);
      if (iLim < 0 || (iW >= 0 && iW < iLim)) bad.push('cropset escreve antes do limite save');
      // conteudo v39: a decisão é de quem a marcar primeiro (PATCH condicionado a pendente → 409) e só depois muda o recorte
      const iClaim = cs.search(/crop_reviews\?id=eq\.\$\{id\}&status=eq\.pendente`, \{ method: 'PATCH'/), iFile = cs.search(/song_files\?id=eq\.[^`]*`, \{ method: 'PATCH'/);
      if (iClaim < 0) bad.push('cropset marca «feito» sem exigir status pendente (dois Maestros ao mesmo tempo)');
      else if (iFile >= 0 && iFile < iClaim) bad.push('cropset muda o recorte antes de marcar a decisão');
      if (!/return out\(\{ error: '[^']*' \}, 409\)/.test(cs)) bad.push('cropset sem 409 quando outra pessoa já decidiu');
      for (const [k, re] of [['mesmo livro', /m\[1\] !== cur\.split\('#'\)\[0\]/], ['slug da revisão', /m\[4\] !== r\.song_slug/], ['1–4 partes', /parts\.length >= 1 && parts\.length <= 4/], ['1.ª parte = p', /\+m\[2\] === parts\[0\]\[0\]/], ['páginas perto', /pagesNear\.has\(pg\)/], ['±1 das atuais/anteriores/propostas', /\[cur, r\.previous \|\| '', r\.proposed \|\| ''\][^\n]*\[n - 1, n, n \+ 1\]/], ['frações 0–1', /v >= 0 && v <= 1/], ['largura ≥ 0,05', /x1 - x0 >= 0\.05/], ['altura ≥ 0,02', /y1 - y0 >= 0\.02/], ['400 inválido', /return out\(\{ error: 'Recorte inválido\.' \}, 400\)/]])
        if (!re.test(cs)) bad.push('cropset sem verificação: ' + k);
      if (!/\^\(livros\\\/\(\?:songbook\|canti2024\)\\\.pdf\)#p=\(\\d\+\)&c=\(\[0-9\.:,\|\]\+\)&s=\(\[a-z0-9_\]\+\)\$/.test(cs)) bad.push('cropset: formato do caminho diferente do revisto (rever)');
    }
    const body = (pf.match(/Deno\.serve\(async req => \{\s*try \{\s*([^\n]*)/) || [])[1] || '', iLoc = pf.indexOf("op === 'locate'"), iOk = pf.indexOf('githubOk(req)', pf.indexOf('Deno.serve'));
    if (!/githubOk/.test(body) || iLoc < iOk) bad.push('pdf-texto locate antes do OIDC');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/recortes.sql, supabase/functions/conteudo/index.ts, supabase/functions/pdf-texto/index.ts' });
  await t('EST-05','busca.js (v232): carregado no index.html com ?v= da versão, antes do app.js; no SHELL do sw.js; publicação da conteudo com busca.js ao lado documentada', () => {
    const h = read('index.html'), sw = read('sw.js'), v = (read('app.js').match(/APP_VERSION = '[^']* v(\d+)'/) || [])[1], bad = [];
    const ib = h.indexOf(`<script src="busca.js?v=${v}"></script>`), ia = h.search(/<script[^>]*src="app\.js/);
    if (ib < 0) bad.push(`index.html sem busca.js?v=${v}`); else if (ia >= 0 && ib > ia) bad.push('busca.js depois do app.js');
    if (!/SHELL = \[[^\]]*'busca\.js'/.test(sw)) bad.push('busca.js fora do SHELL do sw.js');
    if (!/busca\.js/.test(read('docs/sessoes/webapp.md'))) bad.push('publicação com busca.js não documentada');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'index.html, sw.js' });
  await t('SEG-14','transcribe só para contas com can_listen: chama rpc/can_listen com o token da pessoa e recusa (403) se não for true; já não usa is_allowed (v201)', () => {
    const c = read('supabase/functions/transcribe/index.ts');
    const bad = [];
    if (!/rpc\/can_listen/.test(c)) bad.push('não chama rpc/can_listen');
    if (/rpc\/is_allowed/.test(c)) bad.push('ainda chama rpc/is_allowed');
    if (!/allowed !== true\)\s*return json\(\{[^}]*\}, 403\)/.test(c)) bad.push('sem 403 quando can_listen não é true');
    if (!/Authorization: auth/.test(c)) bad.push('a verificação não usa o token da pessoa');
    const q = read('supabase/reconhecimento.sql');
    if (!/revoke execute on function public\.can_listen\(\) from public, anon/.test(q)) bad.push('reconhecimento.sql: can_listen sem revoke para anon');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média', where: 'supabase/functions/transcribe/index.ts, supabase/reconhecimento.sql' });

  dim('Usabilidade — padrão de design', 'baixa');
  await t('USA-01', 'theme.css gerado de design/tokens.json está atualizado (tools/theme/build.mjs --check)', () => {
    try { execFileSync(process.execPath, ['tools/theme/build.mjs', '--check'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }); return true; }
    catch (e) { return (e.stdout || '') + (e.stderr || '') || e.message; }
  });
  await t('USA-05', 'Tokens: on-brand sobre brand e brand-deep ≥ 4.5:1; accent e chord sobre paper (claro e escuro) e danger sobre surface ≥ 4.5:1 — base e os 4 perfis (design/tokens.json, v203)', () => {
    const T = JSON.parse(read('design/tokens.json'));
    const tok = T.color.tokens;
    const base = n => tok.find(x => x.name === n)?.value;
    const hex = h => { h = String(h).replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const lum = p => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); };
    const cr = (a, b) => { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const mode = (v, m) => typeof v === 'object' && v ? (v[m] ?? v.light) : v;
    const paper = base('paper'), surface = base('surface');
    const profiles = [['cancioneiro', {}], ...((T.perfis && T.perfis.tokens) || []).map(x => [x.id, x.values])];
    if (profiles.length < 4) return `design/tokens.json: ${profiles.length - 1} perfis em «perfis» (esperados coro, maestro, gestor)`;
    const bad = [], ev = [];
    for (const [id, v] of profiles) {
      const g = n => v[n] ?? base(n);
      const checks = [['on-brand/brand', g('on-brand'), g('brand')], ['on-brand/brand-deep', g('on-brand'), g('brand-deep')]];
      for (const m of ['light', 'dark']) for (const n of ['accent', 'chord']) checks.push([`${n} ${m}/paper`, mode(g(n), m), mode(paper, m)]);
      checks.push(['danger/surface', g('danger'), mode(surface, 'light')], ['on-brand-danger/danger', '#ffffff', g('danger')]);
      for (const [k, a, b] of checks) { if (!a || !b) continue; const r = cr(a, b); if (r < 4.5) bad.push(`${id} ${k} ${a} sobre ${b} ${r.toFixed(2)}:1`); }
      ev.push(`${id}: on-brand/brand ${cr(g('on-brand'), g('brand')).toFixed(2)}`);
    }
    return bad.length ? { fail: 'abaixo de 4.5: ' + bad.join('; '), evidence: ev.join(', ') } : { pass: ev.join(', ') };
  }, { sev: 'média', where: 'design/tokens.json (color e perfis) → theme.css' });
  await t('USA-02', 'styles.css não usa cores fixas fora de theme.css (exceto na secção COMPONENTES documentada)', () => {
    const css = read('styles.css');
    const hex = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length;
    return hex === 0 || { warn: `${hex} cores fixas em styles.css (deviam ser variáveis de theme.css)` };
  });
  await t('USA-03', 'Botões só com ícone têm aria-label (index.html)', () => {
    const h = read('index.html');
    const bad = [...h.matchAll(/<button([^>]*)>\s*<svg[\s\S]*?<\/button>/g)].filter(m => !/aria-label=/.test(m[1]) && !m[0].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim()).map(m => (m[1].match(/id="([^"]+)"/) || [])[1] || '?');
    return bad.length ? 'sem aria-label: ' + bad.join(', ') : true;
  });
  await t('USA-04', 'O zoom com os dedos não está bloqueado (v225, decisão do Tiago): viewport sem maximum-scale nem user-scalable=no; html/body sem touch-action que impeça o zoom; gesturestart/gesturechange só bloqueados com o visor de partituras aberto; nenhum touchmove bloqueado fora do visor (#pdfpages)', () => {
    const bad = [];
    const v = (read('index.html').match(/name="viewport" content="([^"]+)"/) || [])[1] || '';
    if (/maximum-scale|user-scalable=no/.test(v)) bad.push(`viewport «${v}» impede ampliar com os dedos (WCAG 1.4.4)`);
    const css = read('styles.css');
    for (const m of css.matchAll(/(^|\})\s*([^{}]*\b(?:html|body)\b[^{}]*)\{([^}]*)\}/g)) {
      const sel = m[2].trim(), body = m[3];
      if (/^(html|body)(\s*,\s*(html|body))*$/.test(sel) && /touch-action\s*:\s*(none|pan-x\s+pan-y|pan-y\s+pan-x|pan-x|pan-y)\b/.test(body)) bad.push(`styles.css: «${sel}» com ${body.match(/touch-action\s*:[^;]+/)[0].trim()}`);
    }
    const js = read('app.js');
    const gest = [...js.matchAll(/\['gesturestart', 'gesturechange'\][^\n]*/g)].map(m => m[0]);
    if (gest.some(g => /preventDefault/.test(g) && !/pdfview'\)\.hidden\) e\.preventDefault/.test(g))) bad.push('gesturestart/gesturechange com preventDefault fora do visor');
    const tm = [...js.matchAll(/(\w+)\.addEventListener\('touchmove'/g)].map(m => m[1]);
    if (tm.some(x => x !== 'pp')) bad.push('touchmove com listener fora de #pdfpages: ' + tm.join(', '));
    return bad.length ? bad.join('; ') : { pass: `viewport «${v}»` };
  }, { sev: 'média', where: 'index.html (viewport), styles.css (touch-action), app.js (gesture*/touchmove)' });

  dim('Funcionalidade — motor de pesquisa (busca.js)', 'alta');
  await t('BUS-01', 'busca.js (v232) com o fixture: erro de letras no título («amazng»), variante ortográfica («pange lyngua»), início de palavra («misericord»), letra com erros («swet sound», marks), nada para lixo; trechos ≤ 7 palavras; hits só com slug/score/field/snip/marks; max respeitado; match corrige palavras mal ouvidas', async () => {
    const ctx = vm.createContext({}); vm.runInContext(read('busca.js'), ctx);
    const B = ctx.Busca; if (!B) return 'busca.js não define Busca';
    const fx = (await import('../../tools/screens/fixture.mjs')).default;
    const ix = B.build(fx.map(x => ({ slug: x.slug, title: x.title, author: x.author, lines: [...(x.lyrics || []), ...(x.translation || [])].flatMap(st => st.lines || []) })));
    const bad = [], S = (q, max) => B.search(ix, q, null, max);
    const first = (q, slug, field) => { const r = S(q); if (!r.length || r[0].slug !== slug || (field && r[0].field !== field)) bad.push(`«${q}» → ${r[0] ? r[0].slug + '/' + r[0].field : 'nada'} (esperado ${slug}${field ? '/' + field : ''})`); return r; };
    first('amazng', 'amazing_grace', 'title');
    first('pange lyngua', 'pange_lingua');
    first('misericord', 'salve_regina', 'lyrics');
    const sw = first('swet sound', 'amazing_grace', 'lyrics');
    const mk = (sw[0] && sw[0].marks || []).join(' ');
    if (sw[0] && !(/sweet/i.test(mk) && /sound/i.test(mk))) bad.push('«swet sound»: marks ' + JSON.stringify(sw[0].marks));
    if (S('xyzzyq').length) bad.push('«xyzzyq» devolve resultados');
    const keys = new Set(['slug', 'score', 'field', 'snip', 'marks']);
    for (const q of ['de colores', 'santa lucia', 'grace', 'dormez', 'salve', 'sonnez les matines']) for (const h of S(q)) {
      const extra = Object.keys(h).filter(k => !keys.has(k)); if (extra.length) bad.push(`«${q}»: campos a mais ${extra.join(',')}`);
      if (h.snip && h.snip.split(/\s+/).filter(w => w && w !== '…').length > 7) bad.push(`«${q}»: trecho com mais de 7 palavras`);
    }
    if (S('de', 2).length > 2) bad.push('max não respeitado');
    const m = B.match(ix, 'amazin grase how swet the sownd');
    if (!m.length || m[0].slug !== 'amazing_grace') bad.push('match → ' + (m[0] ? m[0].slug : 'nada'));
    return bad.length ? [...new Set(bad)].join('; ') : true;
  }, { sev: 'alta', where: 'busca.js' });
  await t('BUS-02', 'busca.js com texto dos PDF (v233): palavras que só existem no texto da partitura → hit field «pdf» com trecho ≤ 7 palavras; a letra ganha à partitura quando a palavra está nas duas; match também encontra pelo texto da partitura', async () => {
    const ctx = vm.createContext({}); vm.runInContext(read('busca.js'), ctx);
    const B = ctx.Busca, bad = [];
    const ix = B.build([
      { slug: 'a', title: 'Primeiro', author: 'X', lines: ['luz do dia sobre o mar'], pdf: ['quadrifolium zeterna palavra rara do livro com muitas outras palavras depois desta'] },
      { slug: 'b', title: 'Segundo', author: 'Y', lines: ['montanha alta e verde'], pdf: ['montanha alta e verde'] },
    ]);
    const r = B.search(ix, 'quadrifolium zeterna');
    if (!r.length || r[0].slug !== 'a' || r[0].field !== 'pdf') bad.push('só no PDF → ' + (r[0] ? r[0].slug + '/' + r[0].field : 'nada'));
    else if (r[0].snip.split(/\s+/).filter(w => w && w !== '…').length > 7) bad.push('trecho do PDF com mais de 7 palavras');
    const r2 = B.search(ix, 'montanha alta');
    if (!r2.length || r2[0].field !== 'lyrics') bad.push('na letra e no PDF → ' + (r2[0] ? r2[0].field : 'nada') + ' (esperado lyrics)');
    const m = B.match(ix, 'quadrifolium zeterna palavra rara');
    if (!m.length || m[0].slug !== 'a') bad.push('match pelo PDF → ' + (m[0] ? m[0].slug : 'nada'));
    else if (m[0].field !== 'pdf') bad.push('match pelo PDF sem field «pdf» (v234): ' + m[0].field);
    const ml = B.match(ix, 'luz do dia sobre o mar');
    if (!ml.length || ml[0].slug !== 'a' || ml[0].field !== 'lyrics') bad.push('match pela letra → ' + (ml[0] ? ml[0].slug + '/' + ml[0].field : 'nada') + ' (esperado a/lyrics)');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média', where: 'busca.js' });
}
