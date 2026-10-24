// Verificações do repositório (sem rede): versões, referências, CSP, SRI, segredos, design.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
    if (!/lvl >= 3 \|\| \(c\.published && Date\.parse\(c\.expires_at\) > Date\.now\(\) && \(c\.audience === 'cancioneiro' \|\| lvl >= 2\)\)/.test(sg)) bad.push('song+collection: condição de visibilidade da folha mudou (rever)');
    if (!/lvl >= 2 \? eff : noChords\(eff\)/.test(sg)) bad.push('song: versão da folha sem noChords para o Cancioneiro');
    if (!/collection_lyrics\?collection_id=eq\.\$\{col\.id\}/.test(c) || !/own\.get\(slug\) \|\| s\.eff/.test(c)) bad.push('shared: não usa a versão da folha');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/functions/conteudo/index.ts (ops collyrics, song, shared)' });
  await t('SEG-16', 'conteudo e grupos (v209): colSet e song+collection filtram por grupos (groupOk); os grupos da pessoa vêm de user_groups pelo seu email e, se a leitura falhar, ficam vazios (não recebe folhas); Maestro+ sem filtro', () => {
    const c = read('supabase/functions/conteudo/index.ts'), bad = [];
    if (!/const myGroups = async user => new Set\(\(await rest\(`user_groups\?email=eq\.\$\{encodeURIComponent\(user\.email\)\}&select=group_id`\)\.catch\(\(\) => \[\]\)\)/.test(c)) bad.push('myGroups mudou (rever: email da pessoa e falha → vazio)');
    if (!/const groupOk = \(mine, cg\) => !mine \|\| \(mine\.size > 0 && \(!\(cg \|\| \[\]\)\.length \|\| cg\.some\(x => mine\.has\(x\.group_id\)\)\)\)/.test(c)) bad.push('groupOk mudou (rever)');
    if (!/colSet = new Set\(rows\.filter\(r => groupOk\(mine, r\.collections\.collection_groups\)\)/.test(c)) bad.push('colSet sem filtro de grupos');
    if (!/lvl >= 3 \|\| \(c\.published[^\n]*groupOk\(await myGroups\(user\), c\.collection_groups\)/.test(c)) bad.push('song+collection sem filtro de grupos');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'alta', where: 'supabase/functions/conteudo/index.ts' });
  await t('SEG-14', 'transcribe só para contas com can_listen: chama rpc/can_listen com o token da pessoa e recusa (403) se não for true; já não usa is_allowed (v201)', () => {
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
  await t('USA-04', 'viewport não bloqueia o zoom (maximum-scale=1 / user-scalable=no)', () => {
    const v = (read('index.html').match(/name="viewport" content="([^"]+)"/) || [])[1] || '';
    return /maximum-scale=1\b|user-scalable=no/.test(v) ? { warn: `viewport «${v}» impede ampliar com os dedos (WCAG 1.4.4); A−/A+ compensa só na letra` } : true;
  });
}
