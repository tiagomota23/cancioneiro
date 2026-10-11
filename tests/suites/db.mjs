// Base de dados (Management API): RLS, permissões, funções, integridade, cópias e agendamentos, planos de consulta.
// Só leituras; as provas de escrita correm dentro de begin … rollback (nada fica gravado; pg_net só envia depois de commit).
import { t, dim, sql, asRole, hasSql, get, reachable } from '../lib.mjs';

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
    const [all] = await sql(`select count(*)::int songs from public.songs`);
    if (out.anon !== 'negado') bad.push('anon: ' + JSON.stringify(out.anon));
    const s = out.stranger; if (typeof s === 'object' && (s.songs || s.files || s.tags || s.sync)) bad.push('sem acesso vê dados: ' + JSON.stringify(s));
    const c = out.cancioneiro; if (typeof c === 'object' && (c.files || c.tags)) bad.push('Cancioneiro vê ficheiros/etiquetas: ' + JSON.stringify(c));
    for (const w of ['coro', 'maestro', 'gestor']) if (typeof out[w] === 'object' && out[w].songs !== all.songs) bad.push(`${w} vê ${out[w].songs}/${all.songs}`);
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
