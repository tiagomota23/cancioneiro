const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const TOKEN = Deno.env.get('IMPORT_TOKEN');
const HDR = { apikey: SK, Authorization: `Bearer ${SK}` };
const TABLES = ['songs', 'song_sources', 'song_tags', 'song_files'];
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  if (!TOKEN || req.headers.get('x-import-token') !== TOKEN) return json({ error: 'sem acesso' }, 403);
  const u = new URL(req.url); const op = u.searchParams.get('op');
  try {
    if (op === 'file') {
      const path = u.searchParams.get('path') || ''; const mime = u.searchParams.get('mime') || 'application/octet-stream';
      if (!/^[a-z0-9][a-z0-9_\-\/.]{2,200}$/.test(path) || path.includes('..')) return json({ error: 'caminho inválido' }, 400);
      const up = await fetch(`${SB}/storage/v1/object/coro/${path}`, { method: 'POST', headers: { ...HDR, 'Content-Type': mime, 'x-upsert': 'true' }, body: await req.arrayBuffer() });
      if (!up.ok) return json({ error: 'upload ' + up.status + ': ' + (await up.text()).slice(0, 200) }, 502);
      return json({ ok: true, path });
    }
    if (op === 'rows' || op === 'read' || op === 'delete') {
      const b = await req.json(); if (!TABLES.includes(b.table)) return json({ error: 'tabela inválida' }, 400);
      let r;
      if (op === 'rows') r = await fetch(`${SB}/rest/v1/${b.table}${b.on_conflict ? '?on_conflict=' + b.on_conflict : ''}`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(b.rows) });
      else if (op === 'read') r = await fetch(`${SB}/rest/v1/${b.table}?${b.query || 'select=*'}`, { headers: { ...HDR, Range: b.range || '0-999' } });
      else { if (!b.query || !/=eq\./.test(b.query)) return json({ error: 'filtro obrigatório' }, 400); r = await fetch(`${SB}/rest/v1/${b.table}?${b.query}`, { method: 'DELETE', headers: { ...HDR, Prefer: 'return=minimal' } }); }
      const t = await r.text(); if (!r.ok) return json({ error: `${b.table} ${r.status}: ${t.slice(0, 300)}` }, 502);
      return new Response(t || '{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
    }
    return json({ error: 'operação desconhecida' }, 400);
  } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
});
