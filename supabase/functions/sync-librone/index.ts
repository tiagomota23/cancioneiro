// Supabase Edge Function: atualização semanal do «Librone dei canti» (https://www.libronedeicanti.it/).
// O site publica o índice (indice.js: id, título, autores, secção) e as letras (testi.js: id → texto, sem estrofes).
// Cânticos já ligados (song_sources librone, ref = id no site): acrescenta a secção (song_tags grp «Librone dei canti»)
// e, se a letra no site mudou e a do Cancioneiro ainda é a do librone (1.ª linha MARK, sem edição de um Maestro),
// atualiza-a (estrofes pelo divisor strofe.js). Cânticos novos no site: só são comunicados por email (a webapp
// verifica se já existem com outro nome antes de criar). Nada se apaga: o que sai do site fica (só é comunicado).
import { strofe } from './strofe.js';
const SB = Deno.env.get('SUPABASE_URL'); const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const RESEND = Deno.env.get('RESEND_API_KEY');
const ADMIN = 'tiago.mota@gmail.com'; const APP = 'https://tiagomota23.github.io/cancioneiro/';
const SITE = 'https://www.libronedeicanti.it/';
const MARK = '(letra do librone dei canti — libronedeicanti.it)';
const GRP = 'Librone dei canti';
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
// todas as linhas (o PostgREST devolve no máximo 1000 de cada vez)
async function all(path) {
  const out = [];
  for (let off = 0; ; off += 1000) { const r = await rest(`${path}&limit=1000&offset=${off}`); out.push(...r); if (r.length < 1000) return out; }
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const list = items => `<ul style="padding-left:20px;margin:8px 0">${items.map(x => `<li>${x}</li>`).join('')}</ul>`;
const wrap = (title, body) => `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e3e3e3;border-radius:12px;overflow:hidden"><div style="background:#1ab07f;color:#ffffff;padding:16px 22px;font-size:20px;letter-spacing:4px">CANCIONEIRO</div><div style="padding:22px;color:#333333;font-size:15px;line-height:1.5"><h2 style="margin:0 0 14px;font-size:18px;color:#12966a">${title}</h2>${body}</div></div>`;
async function sendEmail(subject, html) {
  if (!RESEND || !ADMIN) return;
  await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Cancioneiro <onboarding@resend.dev>', to: [ADMIN], subject, html }) });
}
// «window.X = {...};» → objeto
async function load(file) {
  const r = await fetch(SITE + file);
  if (!r.ok) throw new Error(`${file} HTTP ${r.status}`);
  const s = await r.text();
  return JSON.parse(s.slice(s.indexOf('{'), s.trimEnd().replace(/;$/, '').lastIndexOf('}') + 1));
}
const words = s => (String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) || []).join(' ');
const songUrl = id => `${SITE}canti/${encodeURIComponent(id)}.html`;

async function claimJob(job) {
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const r = await rest(`job_requests?job=eq.${job}&requested_at=gte.${since}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  return Array.isArray(r) && r.length > 0;
}
Deno.serve(async () => {
  if (!(await claimJob('sync-librone').catch(() => false))) return json({ error: 'sem pedido do agendamento' }, 403);
  const sum = { newSongs: [], gone: [], tags: [], lyrics: [], songs: 0 };
  let error = null;
  try {
    const [idx, txt] = await Promise.all([load('indice.js'), load('testi.js')]);
    const canti = idx.canti || [];
    if (canti.length < 500) throw new Error(`índice com só ${canti.length} cânticos (mudou o formato?)`);
    sum.songs = canti.length;
    const linked = await all('song_sources?source=eq.librone&select=song_slug,ref&order=song_slug');
    const byRef = new Map(); for (const x of linked) { if (!byRef.has(x.ref)) byRef.set(x.ref, []); byRef.get(x.ref).push(x.song_slug); }
    const tags = new Set((await all(`song_tags?grp=eq.${encodeURIComponent(GRP)}&select=song_slug,tag&order=song_slug`)).map(x => x.song_slug + '|' + x.tag));
    const seen = new Set();
    for (const c of canti) {
      seen.add(c.id);
      const slugs = byRef.get(c.id);
      if (!slugs) { sum.newSongs.push(`<a href="${songUrl(c.id)}">${esc(c.t)}</a>`); continue; }
      const cat = idx.cats?.[c.m]?.n;
      for (const slug of slugs) if (cat && !tags.has(slug + '|' + cat)) {
        await rest('song_tags?on_conflict=song_slug,grp,tag', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify([{ song_slug: slug, grp: GRP, tag: cat }]) });
        tags.add(slug + '|' + cat); sum.tags.push(`${esc(c.t)} — ${esc(cat)}`);
      }
    }
    // letras: só as que ainda são as do librone (1.ª linha MARK) e sem edição de um Maestro
    const mine = await all(`songs?select=slug,title,lyrics&lyrics_edit=is.null&lyrics->0->lines->>0=eq.${encodeURIComponent(MARK)}&order=slug`);
    const refOf = new Map(linked.map(x => [x.song_slug, x.ref]));
    for (const s of mine) {
      const ly = Array.isArray(s.lyrics) ? s.lyrics : [];
      if (ly[0]?.lines?.[0] !== MARK || !refOf.has(s.slug)) continue;
      const site = txt[refOf.get(s.slug)];
      if (!site || !site.trim()) continue;
      const cur = ly.slice(1).map(st => (st.lines || []).join('\n')).join('\n');
      if (words(cur) === words(site)) continue;
      await rest(`songs?slug=eq.${encodeURIComponent(s.slug)}&lyrics_edit=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ lyrics: [{ type: 'verse', lines: [MARK] }, ...strofe(site)], updated_at: new Date().toISOString() }) });
      sum.lyrics.push(`<a href="${songUrl(refOf.get(s.slug))}">${esc(s.title)}</a>`);
    }
    for (const [ref] of byRef) if (!seen.has(ref)) sum.gone.push(esc(ref));
  } catch (e) { error = String(e.message || e); }
  await rest('librone_sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ summary: sum, error }) }).catch(() => {});
  const any = sum.newSongs.length + sum.gone.length + sum.tags.length + sum.lyrics.length;
  if (error) await sendEmail('Cancioneiro: atualização do «Librone dei canti» falhou', wrap('Atualização do «Librone dei canti» falhou', `<p>${esc(error)}</p><p><a href="${SITE}">Ver o site</a></p>`));
  else if (any) {
    const sec = (t, a) => a.length ? `<p><b>${t} (${a.length})</b></p>${list(a)}` : '';
    await sendEmail(`Cancioneiro: novidades no «Librone dei canti» (${any})`, wrap('Novidades no «Librone dei canti»', `<p>A verificação semanal do libronedeicanti.it encontrou:</p>` +
      sec('Cânticos novos no site — para rever (ver se já existem com outro nome; se não, criar)', sum.newSongs) +
      sec('Letras atualizadas (iguais às do site; as editadas por um Maestro não mudam)', sum.lyrics) +
      sec('Secções acrescentadas', sum.tags) +
      sec('Saíram do site (mantidos no Cancioneiro)', sum.gone) + `<p><a href="${SITE}">Ver o site</a> · <a href="${APP}">Abrir o Cancioneiro</a></p>`));
  }
  return json({ newSongs: sum.newSongs.length, gone: sum.gone, tags: sum.tags.length, lyrics: sum.lyrics.length, songs: sum.songs, error }, error ? 500 : 200);
});
