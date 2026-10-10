// Restauro: transforma base-de-dados/dados.json da cópia de segurança num ficheiro SQL que carrega os dados numa base
// já criada com esquema.sql. Uso: node restaurar-dados.mjs dados.json > dados.sql
// Depois: psql "<ligação>" -f dados.sql   (ou cole no SQL Editor do Supabase; se for grande demais, use --tabela=<nome>
// para gerar uma tabela de cada vez).
// Corre numa só transação; respeita as colunas geradas e de identidade; colunas que não estão na cópia ficam com o valor por omissão; favorites só para utilizadores que existam em auth.users.
import { readFileSync } from 'node:fs';

const [file, ...opts] = process.argv.slice(2);
if (!file) { console.error('uso: node restaurar-dados.mjs dados.json [--tabela=nome] > dados.sql'); process.exit(1); }
const only = (opts.find(o => o.startsWith('--tabela=')) || '').split('=')[1];
const dados = JSON.parse(readFileSync(file, 'utf8'));
const ORDEM = ['songs', 'song_sources', 'song_tags', 'song_files', 'allowed_emails', 'collections', 'collection_songs',
  'collection_sections', 'collection_templates', 'song_shares', 'drive_folders', 'song_edits', 'sync_log', 'drive_sync_log', 'favorites'];
const extra = Object.keys(dados).filter(t => !ORDEM.includes(t));
if (extra.length) console.error('Aviso: tabelas na cópia que este script não conhece (ignoradas):', extra.join(', '));

// literal JSON em dollar-quoting com uma etiqueta que não aparece no texto
const lit = s => { let tag = 'j'; while (s.includes(`$${tag}$`)) tag += 'x'; return `$${tag}$${s}$${tag}$`; };
const out = ['begin;'];
for (const t of ORDEM) {
  if (only && t !== only) continue;
  const rows = dados[t];
  if (!rows?.length) { out.push(`-- ${t}: vazio`); continue; }
  const filtro = t === 'favorites' ? ' where r.user_id in (select id from auth.users)' : '';
  // só as colunas que vêm na cópia: uma coluna nova (ex.: collections.published) fica com o valor por omissão ao carregar uma cópia antiga
  const keys = [...new Set(rows.flatMap(Object.keys))].map(k => `'${k.replace(/'/g, "''")}'`).join(', ');
  out.push(`-- ${t}: ${rows.length} linhas`, `do $do$
declare cols text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = '${t}' and is_generated = 'NEVER'
      and column_name = any(array[${keys}]::text[]);
  execute format('insert into public.%I (%s) overriding system value select %s from json_populate_recordset(null::public.%I, $1) r${filtro} on conflict do nothing',
    '${t}', cols, (select string_agg('r.' || c, ', ') from unnest(string_to_array(cols, ', ')) c), '${t}')
  using ${lit(JSON.stringify(rows))}::json;
end $do$;`);
}
// identidades: continuar a contar a partir do maior id carregado
out.push(`do $do$
declare r record;
begin
  for r in select table_name, column_name from information_schema.columns where table_schema = 'public' and is_identity = 'YES' loop
    execute format('select setval(pg_get_serial_sequence(%L, %L), coalesce(m, 1), m is not null) from (select max(%I) m from public.%I) x',
      'public.' || r.table_name, r.column_name, r.column_name, r.table_name);
  end loop;
end $do$;`, 'commit;');
console.log(out.join('\n'));
