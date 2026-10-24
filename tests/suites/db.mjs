// Base de dados (Management API): RLS, permissões, funções, integridade, cópias e agendamentos, planos de consulta.
// Só leituras; as provas de escrita correm dentro de begin … rollback (nada fica gravado; pg_net só envia depois de commit).
import fs from 'node:fs';
import path from 'node:path';
import { t, dim, sql, asRole, hasSql, get, reachable, ROOT } from '../lib.mjs';

const ROLES = ['anon', 'stranger', 'cancioneiro', 'coro', 'maestro', 'gestor'];
const TMP = 'zz_teste_rls_' + Date.now(); // slug fictício, só existe dentro da transação

// a escrita é aceite? (true = gravou dentro da transação, false = recusada por permissões / RLS)
async function writes(who, stmt) {
  try { await sql(asRole(who, stmt)); return true; }
  catch (e) { if (/permission denied|row-level security|violates row-level|42501/i.test(e.message)) return false; throw e; }
}

export default async function (level) {
  const full = level === 'full';
  if (!hasSql()) {
    dim('Segurança — base de dados', 'crítica');
    await t('DB-00', 'Acesso SQL (SUPABASE_ACCESS_TOKEN)', () => ({ skip: 'SUPABASE_ACCESS_TOKEN em falta: testes de base de dados não correram' }));
    return;
  }

  dim('Segurança — base de dados', 'crítica');
  await t('DB-RLS-01', 'RLS ligada em todas as tabelas do esquema public', async () => {
    const r = await sql(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity`);
    return r.length ? 'sem RLS: ' + r.map(x => x.relname).join(', ') : true;
  });
  await t('DB-RLS-02', 'anon sem nenhuma permissão em tabelas, vistas e sequências de public', async () => {
    const r = await sql(`select table_name, string_agg(privilege_type, ',') p from information_schema.role_table_grants where table_schema='public' and grantee='anon' group by 1`);
    const c = await sql(`select distinct table_name from information_schema.column_privileges where table_schema='public' and grantee='anon'`);
    return r.length || c.length ? 'anon tem: ' + [...r.map(x => x.table_name + ' ' + x.p), ...c.map(x => x.table_name + ' (colunas)')].join('; ') : true;
  });
  await t('DB-RLS-03', 'authenticated: permissões exatamente as esperadas (lista fechada)', async () => {
    const want = {
      collection_sections: 'DELETE,INSERT,SELECT,UPDATE', collection_songs: 'DELETE,INSERT,SELECT,UPDATE', collection_templates: 'DELETE,INSERT,SELECT,UPDATE',
      collections: 'DELETE,INSERT,SELECT,UPDATE', favorites: 'DELETE,INSERT,SELECT', song_files: 'SELECT', song_sources: 'SELECT', song_tags: 'SELECT', sync_log: 'SELECT',
      groups: 'SELECT', user_groups: 'SELECT', collection_groups: 'DELETE,INSERT,SELECT', // v209: grupos
    };
    const r = await sql(`select table_name, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema='public' and grantee='authenticated' group by 1`);
    const got = Object.fromEntries(r.map(x => [x.table_name, x.p]));
    const diff = [...new Set([...Object.keys(want), ...Object.keys(got)])].filter(k => want[k] !== got[k]).map(k => `${k}: esperado ${want[k] || '—'}, tem ${got[k] || '—'}`);
    return diff.length ? diff.join('; ') : true;
  });
  await t('DB-RLS-04', 'songs: authenticated lê só colunas sem letra (lyrics, lyrics_edit, translation, source_hash nunca)', async () => {
    const r = await sql(`select column_name, privilege_type from information_schema.column_privileges where table_schema='public' and table_name='songs' and grantee='authenticated'`);
    const bad = r.filter(x => x.privilege_type !== 'SELECT' || ['lyrics', 'lyrics_edit', 'translation', 'source_hash'].includes(x.column_name));
    return bad.length ? 'permissões a mais: ' + bad.map(x => x.column_name + ' ' + x.privilege_type).join(', ') : true;
  });
  await t('DB-RLS-12', 'Todas as colunas que a app pede pela API (fetchSongs e cada .from(…).select(…) em app.js) têm permissão SELECT para authenticated (v195: version_of sem grant partia a lista)', async () => {
    const js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const pairs = []; // [tabela, coluna]
    const parse = (table, sel) => {
      let depth = 0, cur = '', parts = [];
      for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch; }
      parts.push(cur);
      for (let p of parts.map(x => x.trim()).filter(Boolean)) {
        const m = p.match(/^(?:\w+:)?(\w+)\((.*)\)$/);
        if (m) parse(m[1], m[2]); else pairs.push([table, p.replace(/^\w+:/, '')]);
      }
    };
    const cols = js.match(/const cols = '([^']*)'\s*\+\s*'([^']*)'/);
    if (!cols) return 'não encontrei const cols em fetchSongs (app.js)';
    parse('songs', cols[1] + cols[2]);
    for (const m of js.matchAll(/from\('(\w+)'\)\.select\('([^']*)'/g)) parse(m[1], m[2]);
    const uniq = [...new Set(pairs.map(x => x.join('.')))].map(x => x.split('.'));
    const q = `select t, c, has_column_privilege('authenticated', 'public.' || t, c, 'SELECT') ok from (values ${uniq.map(([t, c]) => `('${t}','${c}')`).join(',')}) v(t, c)`;
    const r = await sql(q);
    const bad = r.filter(x => !x.ok).map(x => `${x.t}.${x.c}`);
    return bad.length ? `sem permissão SELECT para authenticated: ${bad.join(', ')} (a app falha com 42501)` : { pass: `${r.length} colunas em ${new Set(uniq.map(x => x[0])).size} tabelas` };
  }, { sev: 'crítica', where: 'grants por coluna em public.* vs selects de app.js' });
  await t('DB-RLS-05', 'Política «leitura familia» esconde cânticos novos por aprovar a quem não os acrescentou (perfil Coro)', async () => {
    const stmt = `insert into public.songs (slug, number, title, language, lyrics, approved, added_by, cancioneiro) values ('${TMP}', 999999, 'Teste RLS (fictício)', 'pt', '[]', false, 'outra-pessoa@example.invalid', false);`;
    const r = await sql(`begin; ${stmt} select set_config('request.jwt.claims', json_build_object('email',(select email from public.allowed_emails where role='coro' order by email limit 1),'role','authenticated')::text, true); set local role authenticated; select count(*)::int n from public.songs where slug='${TMP}'; rollback;`);
    const pol = await sql(`select qual from pg_policies where schemaname='public' and tablename='songs' and policyname='leitura familia'`);
    return r[0].n === 0 || { fail: 'um perfil Coro vê (título, autor, quem acrescentou) um cântico novo por aprovar de outra pessoa. A política em produção não tem o filtro «approved or my_rank() >= 3 or added_by = email» que está em supabase/novos.sql', evidence: pol[0]?.qual };
  }, { sev: 'média', where: 'Supabase: policy «leitura familia» em public.songs (comparar com supabase/novos.sql)' });
  await t('DB-RLS-06', 'Leitura por perfil (contagens): anon/sem acesso 0; Cancioneiro sem ficheiros nem etiquetas; Coro+ tudo', async () => {
    const out = {}, bad = [];
    for (const who of ROLES) {
      try {
        const [r] = await sql(asRole(who, `select (select count(*) from public.songs)::int songs, (select count(*) from public.songs where not cancioneiro)::int extra, (select count(*) from public.song_files)::int files, (select count(*) from public.song_tags)::int tags, (select count(*) from public.collections)::int cols, (select count(*) from public.sync_log)::int sync;`));
        out[who] = r;
      } catch (e) { out[who] = /permission denied/.test(e.message) ? 'negado' : e.message.slice(0, 80); }
    }
    // Coro só vê cânticos novos por aprovar que ele próprio acrescentou (DB-RLS-05); Maestro+ vê tudo
    const [all] = await sql(`select count(*)::int songs, count(*) filter (where approved or lower(added_by) = lower((select email from public.allowed_emails where role='coro' order by email limit 1)))::int coro from public.songs`);
    if (out.anon !== 'negado') bad.push('anon: ' + JSON.stringify(out.anon));
    const s = out.stranger; if (typeof s === 'object' && (s.songs || s.files || s.tags || s.sync)) bad.push('sem acesso vê dados: ' + JSON.stringify(s));
    const c = out.cancioneiro; if (typeof c === 'object' && (c.files || c.tags)) bad.push('Cancioneiro vê ficheiros/etiquetas: ' + JSON.stringify(c));
    for (const w of ['coro', 'maestro', 'gestor']) { const exp = w === 'coro' ? all.coro : all.songs; if (typeof out[w] === 'object' && out[w].songs !== exp) bad.push(`${w} vê ${out[w].songs}/${exp} (total ${all.songs})`); }
    return bad.length ? { fail: bad.join('; '), evidence: JSON.stringify(out) } : { pass: JSON.stringify(out) };
  });
  await t('DB-RLS-07', 'Escrita por perfil (em rollback): coleções só Maestro+; letra/emails/registos nunca pelo browser', async () => {
    const bad = [], m = {};
    const probes = {
      colecao: `insert into public.collections (title, audience, duration, expires_at) values ('teste', 'coro', '24h', now() + interval '1 day');`,
      template: `insert into public.collection_templates (title, sections) values ('teste', '{}');`,
      letra: `update public.songs set lyrics_edit = '[]' where slug = (select slug from public.songs limit 1);`,
      perfil: `update public.allowed_emails set role = 'gestor';`,
      registo: `insert into public.access_log (user_id, kind) values (gen_random_uuid(), 'song');`,
      partilha: `insert into public.song_shares (token, song_slug, created_by, expires_at) values ('${'x'.repeat(24)}', (select slug from public.songs limit 1), 'x', now());`,
      favOutro: `insert into public.favorites (user_id, slug) values ('00000000-0000-0000-0000-000000000000', (select slug from public.songs limit 1));`,
    };
    const expect = { colecao: ['maestro', 'gestor'], template: ['maestro', 'gestor'] };
    for (const who of ['anon', 'stranger', 'cancioneiro', 'coro', 'maestro', 'gestor']) {
      for (const [k, stmt] of Object.entries(probes)) {
        let ok; try { ok = await writes(who, stmt); } catch (e) { ok = 'erro: ' + e.message.slice(0, 60); }
        m[who + ':' + k] = ok;
        const should = (expect[k] || []).includes(who);
        if (ok !== should && !(ok !== true && !should)) bad.push(`${who} ${k}: ${ok} (esperado ${should})`);
      }
    }
    return bad.length ? { fail: bad.join('; '), evidence: JSON.stringify(m) } : true;
  });
  await t('DB-RLS-08', 'Preferidos: cada pessoa só lê / apaga os seus (outro user_id invisível)', async () => {
    const [r] = await sql(asRole('coro', `select count(*)::int n from public.favorites where user_id <> auth.uid();`));
    return r.n === 0 || `vê ${r.n} preferidos de outras pessoas`;
  });
  await t('DB-RLS-09', 'Coleções: Coro não vê coleção expirada; Cancioneiro não vê coleção do Coro; Cancioneiro vê cântico de coleção ativa para o Cancioneiro', async () => {
    const setup = `insert into public.collections (id, title, audience, duration, expires_at) values ('00000000-0000-4000-8000-00000000c0a1','t','coro','24h', now() - interval '1 hour'), ('00000000-0000-4000-8000-00000000c0a2','t','coro','24h', now() + interval '1 day'), ('00000000-0000-4000-8000-00000000c0a3','t','cancioneiro','24h', now() + interval '1 day');
      update public.collections set published = true where id in ('00000000-0000-4000-8000-00000000c0a1','00000000-0000-4000-8000-00000000c0a2','00000000-0000-4000-8000-00000000c0a3');
      insert into public.collection_songs (collection_id, song_slug) values ('00000000-0000-4000-8000-00000000c0a3', (select slug from public.songs where not cancioneiro and approved order by slug limit 1));`;
    const q = who => `begin; ${setup} select set_config('request.jwt.claims', json_build_object('email',(select email from public.allowed_emails where role='${who}' order by email limit 1),'role','authenticated')::text, true); set local role authenticated;
      select (select count(*) from public.collections where id='00000000-0000-4000-8000-00000000c0a1')::int expirada, (select count(*) from public.collections where id='00000000-0000-4000-8000-00000000c0a2')::int coro, (select count(*) from public.collections where id='00000000-0000-4000-8000-00000000c0a3')::int canc,
        (select count(*) from public.songs where slug=(select song_slug from public.collection_songs where collection_id='00000000-0000-4000-8000-00000000c0a3'))::int cantico; rollback;`;
    const [co] = await sql(q('coro')), [ca] = await sql(q('cancioneiro')), [ma] = await sql(q('maestro'));
    const bad = [];
    if (co.expirada) bad.push('Coro vê expirada'); if (!co.coro) bad.push('Coro não vê a sua');
    if (ca.coro) bad.push('Cancioneiro vê coleção do Coro'); if (!ca.canc || !ca.cantico) bad.push('Cancioneiro não vê a coleção / cântico da coleção');
    if (!ma.expirada) bad.push('Maestro não vê expirada (para renovar)');
    return bad.length ? { fail: bad.join('; '), evidence: JSON.stringify({ co, ca, ma }) } : true;
  });
  await t('DB-RLS-11', 'Folhas por publicar (published=false): invisíveis a Coro e Cancioneiro (e os seus cânticos ao Cancioneiro); visíveis a Maestro/Gestor; novas começam por publicar', async () => {
    const setup = `insert into public.collections (id, title, audience, duration, expires_at) values ('00000000-0000-4000-8000-00000000c0c1','t','cancioneiro','24h', now() + interval '1 day');
      insert into public.collection_songs (collection_id, song_slug) values ('00000000-0000-4000-8000-00000000c0c1', (select slug from public.songs where not cancioneiro and approved order by slug limit 1));`;
    const q = who => `begin; ${setup} select set_config('request.jwt.claims', json_build_object('email',(select email from public.allowed_emails where role='${who}' order by email limit 1),'role','authenticated')::text, true); set local role authenticated;
      select (select published from public.collections where id='00000000-0000-4000-8000-00000000c0c1') pub, (select count(*) from public.collections where id='00000000-0000-4000-8000-00000000c0c1')::int col,
        (select count(*) from public.collection_songs where collection_id='00000000-0000-4000-8000-00000000c0c1')::int cs,
        (select count(*) from public.songs where slug=(select song_slug from public.collection_songs where collection_id='00000000-0000-4000-8000-00000000c0c1'))::int cantico; rollback;`;
    const r = {}; for (const w of ['cancioneiro', 'coro', 'maestro', 'gestor']) [r[w]] = await sql(q(w));
    const bad = [];
    if (r.cancioneiro.col || r.cancioneiro.cantico) bad.push('Cancioneiro vê a folha ou o cântico dela');
    if (r.coro.col || r.coro.cs) bad.push('Coro vê a folha por publicar');
    if (!r.maestro.col || !r.gestor.col) bad.push('Maestro/Gestor não veem a folha por publicar');
    if (r.maestro.pub !== false) bad.push('nova folha não começa por publicar (published=' + r.maestro.pub + ')');
    return bad.length ? { fail: bad.join('; '), evidence: JSON.stringify(r) } : true;
  });
  await t('DB-RLS-13', 'collection_lyrics (v204): RLS ligada; anon sem nada; authenticated só SELECT de collection_id, song_slug, edited_at (nunca lyrics nem edited_by), sem escrita; ler lyrics como Coro/Maestro é recusado; Coro/Cancioneiro só veem linhas de folhas que veem', async () => {
    const bad = [];
    const [t1] = await sql(`select c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='collection_lyrics'`);
    if (!t1) return 'tabela public.collection_lyrics não existe';
    if (!t1.rls) bad.push('RLS desligada');
    const tg = await sql(`select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='collection_lyrics' and grantee in ('anon','authenticated','PUBLIC')`);
    if (tg.length) bad.push('permissões de tabela: ' + tg.map(x => x.grantee + ' ' + x.privilege_type).join(', '));
    const cp = await sql(`select grantee, column_name, privilege_type from information_schema.column_privileges where table_schema='public' and table_name='collection_lyrics' and grantee in ('anon','authenticated','PUBLIC')`);
    const want = ['authenticated SELECT collection_id', 'authenticated SELECT edited_at', 'authenticated SELECT song_slug'];
    const got = cp.map(x => `${x.grantee} ${x.privilege_type} ${x.column_name}`).sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push('colunas: ' + got.join(', '));
    for (const who of ['coro', 'maestro']) {
      try { await sql(asRole(who, `select lyrics from public.collection_lyrics limit 1;`)); bad.push(`${who} lê lyrics`); } catch (e) { if (!/permission denied/.test(e.message)) bad.push(`${who}: ${e.message.slice(0, 60)}`); }
      try { await sql(asRole(who, `select edited_by from public.collection_lyrics limit 1;`)); bad.push(`${who} lê edited_by`); } catch (e) { if (!/permission denied/.test(e.message)) bad.push(`${who}: ${e.message.slice(0, 60)}`); }
    }
    for (const who of ['anon']) { try { await sql(asRole(who, `select song_slug from public.collection_lyrics limit 1;`)); bad.push('anon lê collection_lyrics'); } catch (e) { if (!/permission denied/.test(e.message)) bad.push('anon: ' + e.message.slice(0, 60)); } }
    // escrita pelo browser: nunca (em rollback)
    for (const who of ['maestro', 'gestor']) {
      let ok; try { ok = await writes(who, `insert into public.collection_lyrics (collection_id, song_slug, lyrics) select collection_id, song_slug, '[]'::jsonb from public.collection_songs limit 1;`); } catch (e) { ok = false; }
      if (ok === true) bad.push(`${who} escreve em collection_lyrics`);
    }
    // linhas visíveis: só de folhas que o papel vê
    const vis = {};
    for (const who of ['cancioneiro', 'coro', 'maestro']) { const [r] = await sql(asRole(who, `select count(*)::int n, count(*) filter (where collection_id not in (select id from public.collections))::int fora from public.collection_lyrics;`)); vis[who] = r.n; if (r.fora) bad.push(`${who} vê ${r.fora} linhas de folhas que não vê`); }
    const [all] = await sql(`select count(*)::int n from public.collection_lyrics`);
    return bad.length ? { fail: bad.join('; '), evidence: JSON.stringify(vis) } : { pass: `${all.n} versões de folha; visíveis ` + JSON.stringify(vis) };
  }, { sev: 'alta', where: 'supabase/folhas-letras.sql' });
  await t('DB-RLS-14', 'collection_songs.no_chords / no_scores (v206): authenticated tem SELECT, INSERT e UPDATE nessas colunas; Coro não as muda (em rollback), Maestro sim', async () => {
    const r = await sql(`select column_name, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.column_privileges where table_schema='public' and table_name='collection_songs' and grantee='authenticated' and column_name in ('no_chords','no_scores') group by 1 order by 1`);
    const bad = [];
    for (const c of ['no_chords', 'no_scores']) { const x = r.find(y => y.column_name === c); if (!x) bad.push(`${c}: coluna sem permissões (ou não existe)`); else if (!['INSERT', 'SELECT', 'UPDATE'].every(p => x.p.split(',').includes(p))) bad.push(`${c}: ${x.p}`); }
    // a RLS de UPDATE não dá erro: só não muda linhas; conta-se com returning (tudo em rollback)
    const changed = async who => { try { const [x] = await sql(asRole(who, `with u as (update public.collection_songs set no_chords = not coalesce(no_chords, false) where (collection_id, song_slug) = (select collection_id, song_slug from public.collection_songs order by collection_id, song_slug limit 1) returning 1) select count(*)::int n from u;`)); return x ? x.n : 0; } catch (e) { return /permission denied|42501/.test(e.message) ? 0 : 'erro ' + e.message.slice(0, 60); } };
    const coro = await changed('coro'), maestro = await changed('maestro');
    if (coro !== 0) bad.push('Coro muda no_chords: ' + coro); if (maestro !== 1) bad.push('Maestro não muda no_chords: ' + maestro);
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'média' });
  // ---- v209: grupos ----
  const claimsOf = who => `json_build_object('email',(select email from public.allowed_emails where role='${who}' order by email limit 1),'role','authenticated')::text`;
  const emailOf = who => `(select email from public.allowed_emails where role='${who}' order by email limit 1)`;
  // corre «setup» como dono (em rollback) e depois «body» como o papel
  const asRoleAfter = (who, setup, body) => `begin; ${setup} select set_config('request.jwt.claims', ${claimsOf(who)}, true); set local role authenticated; ${body} rollback;`;
  const err = async q => { try { await sql(q); return null; } catch (e) { return e.message; } };
  await t('DB-RLS-15', 'Grupos (v209): RLS nas 3 tabelas; anon sem nada; Coro só lê os seus user_groups e não escreve em collection_groups; Maestro lê os de todos; group_save/group_remove só Gestor; set_user_groups só Maestro+; set_my_groups recusa quem não tem acesso (tudo em rollback)', async () => {
    const bad = [];
    const rls = await sql(`select c.relname, c.relrowsecurity r from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('groups','user_groups','collection_groups')`);
    if (rls.length !== 3) bad.push('tabelas de grupos: ' + rls.map(x => x.relname).join(','));
    rls.filter(x => !x.r).forEach(x => bad.push(x.relname + ' sem RLS'));
    const an = await sql(`select table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('groups','user_groups','collection_groups') and grantee in ('anon','PUBLIC')`);
    if (an.length) bad.push('anon: ' + an.map(x => x.table_name + ' ' + x.privilege_type).join(', '));
    const [c1] = await sql(asRole('coro', `select count(*) filter (where email <> lower(coalesce(auth.jwt() ->> 'email','')))::int outros, count(*)::int n from public.user_groups;`));
    if (c1.outros) bad.push(`Coro lê ${c1.outros} user_groups de outras pessoas`);
    const [m1] = await sql(asRole('maestro', `select count(distinct email)::int pessoas from public.user_groups;`));
    if (m1.pessoas < 2) bad.push(`Maestro só vê grupos de ${m1.pessoas} pessoa(s)`);
    // escrita em collection_groups: Coro recusado (RLS)
    const ins = `insert into public.collection_groups (collection_id, group_id) select c.id, g.id from public.collections c, public.groups g limit 1;`;
    if (await writes('coro', ins).catch(() => false) === true) bad.push('Coro escreve em collection_groups');
    // funções
    const g0 = `(select id from public.groups order by position limit 1)`;
    const e1 = await err(asRole('maestro', `select public.group_save(null, 'Teste ' || gen_random_uuid());`)); if (!/sem permiss/.test(e1 || '')) bad.push('group_save como Maestro: ' + (e1 || 'aceite'));
    const e2 = await err(asRole('gestor', `select public.group_save(null, 'Teste ' || gen_random_uuid());`)); if (e2) bad.push('group_save como Gestor recusado: ' + e2.slice(0, 80));
    const e3 = await err(asRole('gestor', `select public.group_save(null, (select name from public.groups limit 1));`)); if (!/Já existe/.test(e3 || '')) bad.push('group_save com nome repetido: ' + (e3 || 'aceite'));
    const e4 = await err(asRole('gestor', `select public.group_save(null, upper((select name from public.groups limit 1)));`)); if (!/Já existe/.test(e4 || '')) bad.push('group_save com nome repetido em maiúsculas: ' + (e4 || 'aceite'));
    const e5 = await err(asRole('maestro', `select public.group_remove(${g0}, '{}');`)); if (!/sem permiss/.test(e5 || '')) bad.push('group_remove como Maestro: ' + (e5 || 'aceite'));
    const e6 = await err(asRole('coro', `select public.set_user_groups(${emailOf('cancioneiro')}, array[${g0}]);`)); if (!/sem permiss/.test(e6 || '')) bad.push('set_user_groups como Coro: ' + (e6 || 'aceite'));
    const e7 = await err(asRole('maestro', `select public.set_user_groups(${emailOf('cancioneiro')}, array[${g0}]);`)); if (e7) bad.push('set_user_groups como Maestro recusado: ' + e7.slice(0, 80));
    const e8 = await err(asRole('stranger', `select public.set_my_groups(array[${g0}]);`)); if (!/sem acesso/.test(e8 || '')) bad.push('set_my_groups sem acesso: ' + (e8 || 'aceite'));
    const e9 = await err(`begin; set local role anon; select public.my_groups(); rollback;`); if (!/permission denied/.test(e9 || '')) bad.push('my_groups como anon: ' + (e9 || 'aceite'));
    return bad.length ? bad.join('; ') : { pass: `Coro vê ${c1.n} grupos seus; Maestro vê grupos de ${m1.pessoas} pessoas` };
  }, { sev: 'alta', where: 'supabase/grupos.sql' });
  await t('DB-RLS-16', 'Folhas por grupo (v209, em rollback): Coro sem grupo não vê folhas; folha só de um grupo que o Coro não tem → invisível ao Coro e ao Maestro (v210), visível ao Gestor; com um grupo do Coro → visível; folha sem grupos → visível a quem tem grupo', async () => {
    const bad = [], out = {};
    const mk = `insert into public.collections (id, title, audience, duration, expires_at, published) values ('00000000-0000-4000-8000-0000000000c1', 'Teste grupos', 'coro', '1w', now() + interval '1 day', true);`;
    const newG = `insert into public.groups (id, name, position) values ('00000000-0000-4000-8000-0000000000a1', 'Grupo de teste ' || gen_random_uuid(), 99);`;
    const q = `select count(*)::int n from public.collections where id = '00000000-0000-4000-8000-0000000000c1';`;
    const run = async (who, setup) => { const [r] = await sql(asRoleAfter(who, setup, q)); return r.n; };
    out.semGrupos = await run('coro', mk); // folha para todos
    out.coroSemGrupo = await run('coro', mk + ` delete from public.user_groups where email = ${emailOf('coro')};`);
    out.outroGrupo = await run('coro', mk + newG + ` insert into public.collection_groups values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1');`);
    out.outroGrupoMaestro = await run('maestro', mk + newG + ` insert into public.collection_groups values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1');`); // v210: Maestro só vê os seus grupos
    out.outroGrupoGestor = await run('gestor', mk + newG + ` insert into public.collection_groups values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1');`);
    out.grupoDoCoro = await run('coro', mk + ` insert into public.collection_groups select '00000000-0000-4000-8000-0000000000c1', group_id from public.user_groups where email = ${emailOf('coro')} limit 1;`);
    const want = { semGrupos: 1, coroSemGrupo: 0, outroGrupo: 0, outroGrupoMaestro: 0, outroGrupoGestor: 1, grupoDoCoro: 1 };
    for (const k of Object.keys(want)) if (out[k] !== want[k]) bad.push(`${k}: ${out[k]} (esperado ${want[k]})`);
    return bad.length ? { fail: bad.join('; '), evidence: JSON.stringify(out) } : { pass: JSON.stringify(out) };
  }, { sev: 'alta', where: 'supabase/grupos.sql (col_group_ok, «colecoes ler»)' });
  await t('DB-RLS-10', 'Coleções: máximo de 10 cânticos por folha (gatilho)', async () => {
    try {
      await sql(`begin; insert into public.collections (id, title, audience, duration, expires_at) values ('00000000-0000-4000-8000-00000000c0b1','t','coro','24h', now() + interval '1 day'); insert into public.collection_songs (collection_id, song_slug) select '00000000-0000-4000-8000-00000000c0b1', slug from public.songs order by slug limit 11; rollback;`);
      return 'aceitou 11 cânticos';
    } catch (e) { return /no máximo 10/.test(e.message) || e.message.slice(0, 120); }
  }, { sev: 'baixa' });

  dim('Segurança — funções SQL e armazenamento', 'alta');
  await t('DB-FN-01', 'Funções SECURITY DEFINER com search_path fixo e sem EXECUTE para anon', async () => {
    const r = await sql(`select p.proname, p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`);
    const bad = r.filter(x => x.prosecdef && (!x.proconfig || !x.proconfig.some(c => c.startsWith('search_path')) || x.anon)).map(x => x.proname + (x.anon ? ' (anon executa)' : ' (sem search_path)'));
    return bad.length ? bad.join(', ') : true;
  });
  await t('DB-FN-02', 'my_rank()/my_role(): sem acesso → 0/null; cada perfil → o seu nível', async () => {
    const out = {};
    for (const who of ['stranger', 'cancioneiro', 'coro', 'maestro', 'gestor']) { const [r] = await sql(asRole(who, 'select public.my_rank() r, public.my_role() role;')); out[who] = r.r; }
    const want = { stranger: 0, cancioneiro: 1, coro: 2, maestro: 3, gestor: 4 };
    const bad = Object.keys(want).filter(k => out[k] !== want[k]);
    return bad.length ? 'obtido ' + JSON.stringify(out) : true;
  });
  await t('DB-FN-04', 'can_listen(): anon sem EXECUTE; sem acesso → false; cada perfil → o valor de allowed_emails.can_listen; SECURITY DEFINER com search_path (v201)', async () => {
    const bad = [], out = {};
    const [f] = await sql(`select p.prosecdef d, p.proconfig c, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_listen'`);
    if (!f) return 'função public.can_listen() não existe';
    if (!f.d) bad.push('não é SECURITY DEFINER'); if (!(f.c || []).some(x => /^search_path=/.test(x))) bad.push('sem search_path fixo');
    if (f.anon) bad.push('anon pode executar'); if (!f.auth) bad.push('authenticated não pode executar');
    for (const who of ['stranger', 'cancioneiro', 'coro', 'maestro', 'gestor']) {
      const [r] = await sql(asRole(who, `select public.can_listen() got;`));
      // o valor esperado lê-se fora do papel (authenticated não lê allowed_emails, e ainda bem)
      const [w] = who === 'stranger' ? [{ want: false }] : await sql(`select coalesce(can_listen, false) want from public.allowed_emails where role='${who}' order by email limit 1`);
      out[who] = r.got; if (r.got !== (w ? w.want : false)) bad.push(`${who}: ${r.got} (esperado ${w && w.want})`);
    }
    if (out.stranger !== false) bad.push('sem acesso: ' + out.stranger);
    const [n] = await sql(`select count(*) filter (where can_listen)::int on_, count(*)::int total from public.allowed_emails`);
    return bad.length ? { fail: bad.join('; '), evidence: JSON.stringify(out) } : { pass: `${n.on_}/${n.total} contas com reconhecimento; ` + JSON.stringify(out) };
  }, { sev: 'média', where: 'supabase/reconhecimento.sql' });
  await t('DB-FN-03', 'Funções de backup e gatilhos não executáveis por authenticated', async () => {
    const r = await sql(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('backup_schema','backup_objects','call_notify','set_source_hashes','on_access_request','on_auth_user_signin','on_song_from_original','on_sync_log','song_edit_stamp') and has_function_privilege('authenticated', p.oid, 'execute')`);
    return r.length ? 'authenticated executa: ' + r.map(x => x.proname).join(', ') : true;
  });
  await t('DB-ST-01', 'Bucket «coro» privado, com tipos e tamanho limitados e sem políticas de leitura direta', async () => {
    const [b] = await sql(`select public, file_size_limit, allowed_mime_types from storage.buckets where id='coro'`);
    const pol = await sql(`select policyname from pg_policies where schemaname='storage'`);
    const others = await sql(`select id from storage.buckets where public`);
    if (!b) return 'bucket coro não existe';
    if (b.public) return 'bucket público';
    if (others.length) return 'buckets públicos: ' + others.map(x => x.id).join(', ');
    if (!b.allowed_mime_types || !b.file_size_limit) return 'sem limites de tipo / tamanho';
    return pol.length ? 'políticas em storage: ' + pol.map(x => x.policyname).join(', ') : true;
  });
  await t('DB-ST-02', 'Partilhas: tokens com ≥ 16 caracteres (≥ 96 bits) e validade ≤ 24 h (cânticos)', async () => {
    const [r] = await sql(`select count(*) filter (where length(token) < 16)::int curtos, count(*) filter (where song_slug is not null and expires_at - created_at > interval '25 hours')::int longos, count(*)::int n from public.song_shares`);
    return r.curtos || r.longos ? JSON.stringify(r) : { pass: r.n + ' partilhas' };
  });

  dim('Integridade dos dados', 'alta');
  await t('INT-01', 'Ficheiros dos cânticos existem no armazenamento (song_files → storage.objects)', async () => {
    const r = await sql(`select count(*)::int n, count(*) filter (where f.path not like '%#%' and not exists (select 1 from storage.objects o where o.bucket_id='coro' and o.name=f.path))::int falta, (array_agg(f.song_slug || ' → ' || f.path) filter (where f.path not like '%#%' and not exists (select 1 from storage.objects o where o.bucket_id='coro' and o.name=f.path)))[1:5] exemplos from public.song_files f`);
    const books = await sql(`select distinct split_part(path,'#',1) b from public.song_files where path like '%#%'`);
    return r[0].falta ? { fail: `${r[0].falta}/${r[0].n} ficheiros sem objeto`, evidence: (r[0].exemplos || []).join('; ') } : { pass: `${r[0].n} ficheiros; livros por página: ${books.map(x => x.b).join(', ')}` };
  });
  await t('INT-02', 'Partituras antigas (songs.pdf_url internas) existem no armazenamento', async () => {
    const [r] = await sql(`select count(*)::int n, count(*) filter (where not exists (select 1 from storage.objects o where o.bucket_id='coro' and o.name=s.pdf_url))::int falta, (select count(*) from public.songs where pdf_url ~ '^https?:')::int externas from public.songs s where pdf_url is not null and pdf_url !~ '^https?:'`);
    return r.falta ? `${r.falta}/${r.n} pdf_url sem objeto` : { pass: `${r.n} internas; ${r.externas} ligações externas (ver INT-12)` };
  });
  if (full) await t('INT-12', 'Partituras externas (pdf_url http/https) ainda respondem', async () => {
    const rows = await sql(`select slug, pdf_url from public.songs where pdf_url ~ '^https?:' order by slug`);
    const bad = [], skipped = new Set();
    for (const x of rows) {
      if (!(await reachable(x.pdf_url))) { skipped.add(new URL(x.pdf_url).host); continue; }
      const r = await get(x.pdf_url, { method: 'HEAD', redirect: 'follow' }).catch(e => ({ status: e.message }));
      if (!(r.status >= 200 && r.status < 400)) bad.push(`${x.slug}: ${r.status}`);
    }
    if (bad.length) return { warn: `${bad.length}/${rows.length} ligações partidas: ${bad.slice(0, 8).join('; ')}` };
    return skipped.size === new Set(rows.map(x => new URL(x.pdf_url).host)).size ? { skip: 'anfitriões inacessíveis daqui: ' + [...skipped].join(', ') } : { pass: `${rows.length} ligações${skipped.size ? '; não verificadas (rede): ' + [...skipped].join(', ') : ''}` };
  }, { sev: 'baixa' });
  await t('INT-03', 'Objetos órfãos no armazenamento (sem cântico nem livro)', async () => {
    const [r] = await sql(`select count(*)::int n, count(*) filter (where o.name not like 'livros/%' and not exists (select 1 from public.song_files f where f.path=o.name) and not exists (select 1 from public.songs s where s.pdf_url=o.name))::int orfaos, coalesce(sum((o.metadata->>'size')::bigint) filter (where o.name not like 'livros/%' and not exists (select 1 from public.song_files f where f.path=o.name) and not exists (select 1 from public.songs s where s.pdf_url=o.name)),0)::bigint bytes from storage.objects o where o.bucket_id='coro'`);
    return r.orfaos ? { warn: `${r.orfaos}/${r.n} objetos órfãos (${Math.round(r.bytes / 1e6)} MB)` } : { pass: r.n + ' objetos' };
  }, { sev: 'baixa' });
  await t('INT-04', 'Cânticos: número único, título e letra presentes, fontes válidas', async () => {
    const [r] = await sql(`select (select count(*) from (select number from public.songs group by 1 having count(*)>1) x)::int dup_num, count(*) filter (where coalesce(trim(title),'')='')::int sem_titulo, count(*) filter (where jsonb_typeof(lyrics)<>'array' or (jsonb_array_length(lyrics)=0 and not exists (select 1 from public.song_files f where f.song_slug=s.slug and f.kind='score') and pdf_url is null))::int sem_letra, count(*) filter (where not exists (select 1 from public.song_sources x where x.song_slug=s.slug))::int sem_fonte, count(*)::int n from public.songs s`);
    const bad = Object.entries(r).filter(([k, v]) => k !== 'n' && v);
    return bad.length ? { fail: bad.map(([k, v]) => `${k}: ${v}`).join(', '), evidence: JSON.stringify(r) } : { pass: r.n + ' cânticos' };
  });
  await t('INT-13', 'Cânticos novos aprovados estão todos no Coro (song_sources coro_clu) (v174)', async () => {
    const r = await sql(`select s.slug from public.songs s where s.approved and exists (select 1 from public.song_sources x where x.song_slug=s.slug and x.source='novos') and not exists (select 1 from public.song_sources x where x.song_slug=s.slug and x.source='coro_clu')`);
    return r.length ? `${r.length} sem coro_clu: ${r.map(x => x.slug).slice(0, 5).join(', ')}` : true;
  }, { sev: 'média' });
  await t('INT-14', '«Todos os cânticos»: nenhum cântico sem categoria (consulta de docs/sessoes/webapp.md; tarefa contínua da sessão principal) (v190)', async () => {
    const r = await sql(`select s.slug from public.songs s
      where s.approved is not false and s.language <> 'la' and s.version_of is null
        and not exists (select 1 from public.song_tags t where t.song_slug = s.slug and (
          t.grp = 'Tema' or t.grp = 'Coro CLU — momento'
          or (t.grp = 'Coro CLU' and t.tag in ('Para a Missa', 'Para Gestos'))
          or (t.grp = 'CANTI 2024' and t.tag in ('Canti per la liturgia', 'Canti della nostra storia', 'Canti per bambini', 'Canti popolari regionali', 'Canti di montagna', 'Canzoni italiane'))
          or (t.grp = 'Songbook' and t.tag in ('Hymns', 'Latin songs', 'Spirituals', 'Italian folk songs', 'Troubadour-songs', 'African songs', 'Brasilian songs', 'Rock – pop – folk'))))
      order by s.slug`);
    return r.length ? { warn: `${r.length} cânticos sem categoria (a classificar pela sessão principal): ${r.slice(0, 8).map(x => x.slug).join(', ')}` } : true;
  }, { sev: 'baixa' });
  await t('INT-15', 'Etiquetas «Tema» só com os nomes das categorias de «Todos os cânticos» (v191: sem «Infantis e de gestos»)', async () => {
    const r = await sql(`select tag, count(*)::int n from public.song_tags where grp = 'Tema' group by 1 order by 1`);
    const ok = ['Liturgia e Missa', 'Espirituais e gospel', 'Cânticos do Movimento', 'Infantis', 'Gestos', 'Populares e tradicionais', 'Pop, rock e canções de autor'];
    const bad = r.filter(x => !ok.includes(x.tag));
    return bad.length ? 'etiquetas Tema desconhecidas: ' + bad.map(x => `${x.tag} (${x.n})`).join(', ') : { pass: r.map(x => `${x.tag} ${x.n}`).join(', ') };
  }, { sev: 'baixa' });
  await t('INT-16', 'os_crocodilos / dos_cocodrilos: dos_cocodrilos é versão (es, songbook, fora do Cancioneiro, com a página do Songbook) de os_crocodilos, que só tem a fonte original e não tem tradução (v196)', async () => {
    const [r] = await sql(`select (select row_to_json(x) from (select language, cancioneiro, version_of from public.songs where slug='dos_cocodrilos') x) dos,
      (select string_agg(source, ',' order by source) from public.song_sources where song_slug='dos_cocodrilos') dos_src,
      (select count(*) from public.song_files where song_slug='dos_cocodrilos' and path like 'livros/songbook%')::int dos_page,
      (select string_agg(source, ',' order by source) from public.song_sources where song_slug='os_crocodilos') os_src,
      (select translation is null from public.songs where slug='os_crocodilos') os_sem_trad`);
    const bad = [];
    if (!r.dos) bad.push('dos_cocodrilos não existe');
    else { if (r.dos.version_of !== 'os_crocodilos') bad.push('dos_cocodrilos não é versão de os_crocodilos'); if (r.dos.language !== 'es') bad.push('língua ' + r.dos.language); if (r.dos.cancioneiro) bad.push('dos_cocodrilos no Cancioneiro'); }
    if (!/songbook/.test(r.dos_src || '')) bad.push('dos_cocodrilos sem fonte songbook'); if (!r.dos_page) bad.push('dos_cocodrilos sem página do Songbook');
    if (r.os_src !== 'original') bad.push('fontes de os_crocodilos: ' + r.os_src); if (!r.os_sem_trad) bad.push('os_crocodilos ainda tem tradução');
    return bad.length ? bad.join('; ') : true;
  }, { sev: 'baixa' });
  await t('INT-17', 'Versões (songs.version_of): apontam para um principal que existe e não é ele próprio versão; os cânticos juntados já não existem (v193)', async () => {
    const [r] = await sql(`select (select count(*) from public.songs where version_of is not null)::int n,
      (select count(*) from public.songs v where v.version_of is not null and not exists (select 1 from public.songs p where p.slug = v.version_of))::int orfas,
      (select count(*) from public.songs v join public.songs p on p.slug = v.version_of where p.version_of is not null)::int cadeias,
      (select count(*) from public.songs where version_of = slug)::int propria,
      (select count(*) from public.songs where slug in ('com_e_grande','foggy_dew','parsifal_canzone_dell_ideale'))::int juntados`);
    const bad = [];
    if (r.orfas) bad.push(`${r.orfas} versões sem principal`); if (r.cadeias) bad.push(`${r.cadeias} versões de versões`); if (r.propria) bad.push(`${r.propria} versões de si próprias`); if (r.juntados) bad.push(`${r.juntados} cânticos juntados ainda existem`);
    return bad.length ? { fail: bad.join('; '), evidence: JSON.stringify(r) } : { pass: r.n + ' versões' };
  }, { sev: 'média' });
  await t('INT-18', 'Versões de folha (collection_lyrics, v204): cada uma pertence a um cântico que está na folha; letra é uma lista não vazia de estrofes {type, lines[]}; diferente do original', async () => {
    const [r] = await sql(`select count(*)::int n,
      count(*) filter (where not exists (select 1 from public.collection_songs cs where cs.collection_id=l.collection_id and cs.song_slug=l.song_slug))::int orfas,
      count(*) filter (where jsonb_typeof(l.lyrics) <> 'array' or jsonb_array_length(l.lyrics) = 0)::int vazias,
      count(*) filter (where exists (select 1 from jsonb_array_elements(case when jsonb_typeof(l.lyrics)='array' then l.lyrics else '[]' end) e where jsonb_typeof(e->'lines') <> 'array' or not (e ? 'type')))::int mal,
      count(*) filter (where l.lyrics = coalesce(s.lyrics_edit, s.lyrics))::int iguais
      from public.collection_lyrics l left join public.songs s on s.slug = l.song_slug`);
    const bad = [];
    if (r.orfas) bad.push(`${r.orfas} sem o cântico na folha`); if (r.vazias) bad.push(`${r.vazias} vazias`); if (r.mal) bad.push(`${r.mal} com estrofes mal formadas`);
    if (r.iguais) bad.push(`${r.iguais} iguais ao original (deviam não existir)`);
    return bad.length ? bad.join('; ') : { pass: `${r.n} versões de folha` };
  }, { sev: 'baixa' });
  await t('INT-19', 'Grupos (v209): nomes únicos sem distinguir maiúsculas; collection_groups e user_groups apontam para grupos e folhas que existem; contas abaixo de Maestro sem grupo (não recebem folhas) assinaladas', async () => {
    const [r] = await sql(`select (select count(*) from public.groups)::int g,
      (select count(*) from (select lower(name) from public.groups group by 1 having count(*) > 1) x)::int dup,
      (select count(*) from public.allowed_emails ae where ae.role in ('coro','cancioneiro') and ae.groups_asked and not exists (select 1 from public.user_groups ug where ug.email = ae.email))::int sem,
      (select count(*) from public.allowed_emails ae where not ae.groups_asked)::int porPerguntar`);
    if (!r.g) return 'nenhum grupo';
    if (r.dup) return `${r.dup} nomes de grupo repetidos`;
    return r.sem ? { warn: `${r.sem} conta(s) Coro/Cancioneiro sem grupo: não recebem folhas (escolha delas)` } : { pass: `${r.g} grupos; ${r.porPerguntar} contas ainda por escolher` };
  }, { sev: 'baixa' });
  await t('DB-RLS-17', 'Maestro e grupos (v210, em rollback, Maestro só no 1.º grupo G1): folha só de G2 → 0 visíveis e update 0; G1+G2 → visível, apagar o link G2 = 0 linhas, apagar G1 = 1; o Maestro sem todos os grupos não deixa uma folha publicada sem grupos (col_groups_guard, v211, com set constraints all immediate): nem tirando o último link, nem criando publicada sem grupos; rascunho sem grupos e Maestro em todos os grupos continuam a poder', async () => {
    const bad = [], out = {};
    const C = `'00000000-0000-4000-8000-0000000000c2'`, G1 = `(select id from public.groups order by position limit 1)`, G2 = `(select id from public.groups order by position offset 1 limit 1)`;
    const base = `delete from public.user_groups where email = ${emailOf('maestro')} and group_id <> ${G1}; insert into public.collections (id, title, audience, duration, expires_at, published) values (${C}, 'Teste grupos Maestro', 'coro', '1w', now() + interval '1 day', true);`;
    const one = async (setup, body) => { const r = await sql(asRoleAfter('maestro', base + setup, body)); return r[0] ? Object.values(r[0])[0] : null; };
    out.soG2_ver = await one(`insert into public.collection_groups values (${C}, ${G2});`, `select count(*)::int from public.collections where id = ${C};`);
    out.soG2_update = await one(`insert into public.collection_groups values (${C}, ${G2});`, `with u as (update public.collections set title = 'x' where id = ${C} returning 1) select count(*)::int from u;`);
    out.g1g2_ver = await one(`insert into public.collection_groups values (${C}, ${G1}), (${C}, ${G2});`, `select count(*)::int from public.collections where id = ${C};`);
    out.g1g2_apagaG2 = await one(`insert into public.collection_groups values (${C}, ${G1}), (${C}, ${G2});`, `with d as (delete from public.collection_groups where collection_id = ${C} and group_id = ${G2} returning 1) select count(*)::int from d;`);
    out.g1g2_apagaG1 = await one(`insert into public.collection_groups values (${C}, ${G1}), (${C}, ${G2});`, `with d as (delete from public.collection_groups where collection_id = ${C} and group_id = ${G1} returning 1) select count(*)::int from d;`);
    const want = { soG2_ver: 0, soG2_update: 0, g1g2_ver: 1, g1g2_apagaG2: 0, g1g2_apagaG1: 1 };
    for (const k of Object.keys(want)) if (out[k] !== want[k]) bad.push(`${k}: ${out[k]} (esperado ${want[k]})`);
    // lacuna a confirmar: folha só de G1, o Maestro tira o link G1 → a folha fica sem grupos = para todos os grupos
    // v211: col_groups_guard é um gatilho constraint deferred → forçar a verificação antes do rollback (set constraints all immediate)
    const GUARD = /pelo menos um dos seus grupos/;
    try { out.soG1_tiraUltimo = await one(`insert into public.collection_groups values (${C}, ${G1});`, `with d as (delete from public.collection_groups where collection_id = ${C} returning 1) select count(*)::int from d; set constraints all immediate; select 1;`); }
    catch (e) { out.soG1_tiraUltimo = GUARD.test(e.message) ? 'recusado' : 'erro ' + e.message.slice(0, 60); }
    if (out.soG1_tiraUltimo !== 'recusado') bad.push('o Maestro (só em G1) tira o último grupo de uma folha publicada: ' + out.soG1_tiraUltimo);
    // lacuna a confirmar: folha nova sem grupos criada pelo Maestro (só em G1) → para todos os grupos
    const setupM = `delete from public.user_groups where email = ${emailOf('maestro')} and group_id <> ${G1};`;
    const ins = pub => `insert into public.collections (title, audience, duration, expires_at, published) values ('Teste sem grupos', 'coro', '1w', now() + interval '1 day', ${pub}); set constraints all immediate; select 1;`;
    try { await sql(asRoleAfter('maestro', setupM, ins(true))); out.novaSemGrupos = 'aceite'; } catch (e) { out.novaSemGrupos = GUARD.test(e.message) ? 'recusado' : 'erro ' + e.message.slice(0, 60); }
    if (out.novaSemGrupos !== 'recusado') bad.push('o Maestro (só em G1) cria uma folha publicada sem grupos: ' + out.novaSemGrupos);
    // o que tem de continuar a passar: rascunho sem grupos; Maestro em todos os grupos a publicar sem grupos
    try { await sql(asRoleAfter('maestro', setupM, ins(false))); out.rascunho = 'aceite'; } catch (e) { out.rascunho = 'erro ' + e.message.slice(0, 60); }
    if (out.rascunho !== 'aceite') bad.push('rascunho sem grupos recusado ao Maestro: ' + out.rascunho);
    try { await sql(asRoleAfter('maestro', `insert into public.user_groups (email, group_id) select ${emailOf('maestro')}, id from public.groups on conflict do nothing;`, ins(true))); out.maestroTodos = 'aceite'; } catch (e) { out.maestroTodos = 'erro ' + e.message.slice(0, 60); }
    if (out.maestroTodos !== 'aceite') bad.push('Maestro em todos os grupos não publica sem grupos: ' + out.maestroTodos);
    return bad.length ? { fail: bad.join('; '), evidence: JSON.stringify(out) } : { pass: JSON.stringify(out) };
  }, { sev: 'média', where: 'supabase/grupos-maestro.sql (políticas «colecoes gerir» e «grupos folha gerir»)' });
  await t('INT-05', 'Cancioneiro: cânticos do site original estão todos no Cancioneiro', async () => {
    const [r] = await sql(`select count(*)::int n from public.songs s where not cancioneiro and exists (select 1 from public.song_sources x where x.song_slug=s.slug and x.source='original')`);
    return r.n ? `${r.n} cânticos do original fora do Cancioneiro` : true;
  });
  await t('INT-06', 'Coleções: cânticos e secções apontam para coleções e cânticos existentes; posições sem repetição', async () => {
    const [r] = await sql(`select (select count(*) from (select collection_id, position from (select collection_id, position from public.collection_songs union all select collection_id, position from public.collection_sections) u group by 1,2 having count(*)>1) d)::int pos_dup, (select count(*) from public.collections)::int cols`);
    return r.pos_dup ? { warn: `${r.pos_dup} posições repetidas em folhas` } : { pass: r.cols + ' folhas' };
  }, { sev: 'baixa' });
  await t('INT-07', 'Limpezas automáticas a funcionar (partilhas, coleções, convites, pedidos antigos)', async () => {
    const [r] = await sql(`select (select count(*) from public.song_shares where expires_at < now() - interval '3 days')::int partilhas, (select count(*) from public.collections where expires_at < now() - interval '35 days')::int colecoes, (select count(*) from public.invites where expires_at < now() - interval '3 days')::int convites, (select count(*) from public.job_requests where requested_at < now() - interval '3 days')::int pedidos`);
    const bad = Object.entries(r).filter(([, v]) => v);
    return bad.length ? 'por limpar: ' + bad.map(([k, v]) => `${k} ${v}`).join(', ') : true;
  });
  await t('INT-08', 'Agendamentos pg_cron presentes e ativos (7 tarefas) e sem falhas recentes', async () => {
    const want = ['cancioneiro-colecoes-limpeza', 'cancioneiro-convites-limpeza', 'cancioneiro-drive-semanal', 'cancioneiro-partilhas-limpeza', 'cancioneiro-pedidos-limpeza', 'cancioneiro-saude-semanal', 'cancioneiro-verificacao-semanal'];
    const r = await sql(`select jobname, active from cron.job`);
    const miss = want.filter(w => !r.some(x => x.jobname === w && x.active));
    let fails = [];
    try { fails = await sql(`select j.jobname, d.status, d.start_time, left(d.return_message, 120) msg from cron.job_run_details d join cron.job j on j.jobid=d.jobid where d.start_time > now() - interval '8 days' and d.status <> 'succeeded' order by d.start_time desc limit 5`); } catch (e) { /* sem histórico */ }
    if (miss.length) return 'em falta / inativas: ' + miss.join(', ');
    return fails.length ? { warn: 'execuções falhadas: ' + fails.map(f => `${f.jobname} ${f.status} ${f.msg}`).join('; ') } : true;
  });
  await t('INT-09', 'Verificações semanais recentes: site original (sync_log), Drive do Coro (drive_sync_log), saúde (health_log) — ≤ 8 dias e sem erro', async () => {
    const [r] = await sql(`select (select row_to_json(x) from (select run_at, error from public.sync_log order by run_at desc limit 1) x) sync, (select row_to_json(x) from (select run_at, error from public.drive_sync_log order by run_at desc limit 1) x) drive, (select row_to_json(x) from (select run_at, ok, problems from public.health_log order by run_at desc limit 1) x) health`);
    const old = (x, n) => !x || Date.now() - Date.parse(x.run_at) > n * 864e5;
    const bad = [];
    if (old(r.sync, 8)) bad.push('sync_log antigo: ' + (r.sync?.run_at || 'nunca')); else if (r.sync.error) bad.push('sync_log erro: ' + r.sync.error);
    if (old(r.drive, 8)) bad.push('drive_sync_log antigo: ' + (r.drive?.run_at || 'nunca')); else if (r.drive.error) bad.push('drive_sync_log erro: ' + r.drive.error);
    if (old(r.health, 8)) bad.push('health_log antigo: ' + (r.health?.run_at || 'nunca')); else if (!r.health.ok) bad.push('health_log problemas: ' + JSON.stringify(r.health.problems));
    return bad.length ? { fail: bad.join('; '), evidence: JSON.stringify(r) } : { pass: `sync ${r.sync.run_at.slice(0, 10)}, drive ${r.drive.run_at.slice(0, 10)}, saúde ${r.health.run_at.slice(0, 10)}` };
  });
  await t('INT-10', 'Cópia de segurança semanal (GitHub Action «Cópia de segurança») concluída com sucesso há ≤ 8 dias', async () => {
    const r = await get('https://api.github.com/repos/tiagomota23/cancioneiro/actions/workflows/backup.yml/runs?per_page=5', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cancioneiro-tests' } });
    if (r.status !== 200) return { skip: 'API do GitHub: HTTP ' + r.status };
    const runs = r.json().workflow_runs || [];
    const ok = runs.find(x => x.conclusion === 'success');
    const last = runs[0];
    if (!ok) return { fail: 'nenhuma execução com sucesso nas últimas 5', evidence: runs.map(x => `${x.created_at} ${x.conclusion}`).join(', ') };
    if (Date.now() - Date.parse(ok.created_at) > 8 * 864e5) return `última com sucesso em ${ok.created_at}`;
    return last.conclusion && last.conclusion !== 'success' ? { warn: `última execução ${last.conclusion} (${last.created_at}); última boa ${ok.created_at}` } : { pass: 'última boa ' + ok.created_at.slice(0, 10) };
  });
  await t('INT-11', 'Verificação semanal e conversão de gravações (GitHub Actions) sem falhas recentes', async () => {
    const bad = [], ok = [];
    for (const wf of ['verificacao-semanal.yml', 'converter-gravacoes.yml']) {
      const r = await get(`https://api.github.com/repos/tiagomota23/cancioneiro/actions/workflows/${wf}/runs?per_page=3`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cancioneiro-tests' } });
      if (r.status !== 200) return { skip: 'API do GitHub: HTTP ' + r.status };
      const last = (r.json().workflow_runs || []).find(x => x.status === 'completed');
      if (!last) bad.push(wf + ': sem execuções'); else if (last.conclusion !== 'success') bad.push(`${wf}: ${last.conclusion} em ${last.created_at}`); else ok.push(`${wf} ${last.created_at.slice(0, 10)}`);
    }
    return bad.length ? bad.join('; ') : { pass: ok.join(', ') };
  }, { sev: 'média' });

  dim('Escalabilidade — base de dados', 'média');
  await t('ESC-01', 'Índices nas chaves estrangeiras usadas pela app (song_files.song_slug, collection_sections.collection_id, song_shares.collection_id, access_log)', async () => {
    const r = await sql(`select c.conrelid::regclass::text tbl, a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] join pg_namespace n on n.oid=c.connamespace
      where c.contype='f' and n.nspname='public' and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1])`);
    const big = r.filter(x => ['song_files', 'song_tags', 'song_sources', 'collection_songs', 'collection_sections', 'song_shares', 'favorites', 'song_edits'].includes(x.tbl.replace('public.', '')));
    return big.length ? { warn: 'chaves estrangeiras sem índice: ' + big.map(x => x.tbl + '.' + x.col).join(', ') } : true;
  }, { sev: 'baixa' });
  await t('ESC-02', 'Plano da lista de cânticos (perfil Coro, como a app pede) abaixo de 300 ms', async () => {
    const q = `explain (analyze, format json) select s.slug, s.number, s.title, s.author, (select json_agg(x) from public.song_sources x where x.song_slug=s.slug), (select json_agg(x) from public.song_tags x where x.song_slug=s.slug), (select json_agg(json_build_object('kind',f.kind,'path',f.path)) from public.song_files f where f.song_slug=s.slug) from public.songs s order by s.number;`;
    const [r] = await sql(asRole('coro', q));
    const plan = r['QUERY PLAN'][0];
    const ms = plan['Execution Time'];
    return ms < 300 ? { pass: Math.round(ms) + ' ms' } : { warn: `${Math.round(ms)} ms`, evidence: JSON.stringify(plan.Plan).slice(0, 300) };
  });
  await t('ESC-03', 'Limites do plano Supabase: base de dados < 400 MB, armazenamento < 800 MB, access_log < 200 mil linhas', async () => {
    const [r] = await sql(`select pg_database_size(current_database())::bigint db, (select coalesce(sum((metadata->>'size')::bigint),0) from storage.objects)::bigint st, (select count(*) from public.access_log)::int log`);
    const ev = `BD ${Math.round(r.db / 1e6)} MB, armazenamento ${Math.round(r.st / 1e6)} MB, access_log ${r.log}`;
    return r.db > 400e6 || r.st > 800e6 || r.log > 2e5 ? { warn: ev + ' (perto dos limites do plano gratuito: 500 MB / 1 GB)' } : { pass: ev };
  });
  if (full) {
    await t('ESC-04', 'access_log: consulta de limites por pessoa usa o índice (user_id, kind, at)', async () => {
      const [r] = await sql(`explain (format json) select key, at from public.access_log where user_id='00000000-0000-0000-0000-000000000000' and kind='song' and at >= now() - interval '1 day' order by at desc limit 5000`);
      const s = JSON.stringify(r['QUERY PLAN']);
      return /access_log_user_kind_at/.test(s) || { warn: 'não usa o índice: ' + s.slice(0, 200) };
    });
  }
}
