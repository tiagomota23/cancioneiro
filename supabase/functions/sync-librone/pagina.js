// Letra a partir da página do cântico no libronedeicanti.it (canti/<id>.html): window.PAGINA = { ..., dati: {...} }.
// dati.b = estrofes → linhas → segmentos [acorde, texto, refrão]; um objeto { sez, a } numa estrofe é um título de secção
// (ex.: «Versione italiana»); dati.capo = capotasto; dati.l = língua (sem = italiano); dati.tr = tradução italiana.
export const MARK = '(letra do librone dei canti — libronedeicanti.it)';
export function dadosDaPagina(html) {
  const m = String(html).match(/dati:(\{.*\})\};<\/script>/s);
  return m ? JSON.parse(m[1]) : null;
}
export function fromPage(d) {
  const st = (d.b || []).map(b => {
    const lines = b.map(l => !Array.isArray(l) ? `(${[l.sez, (l.a || []).join(', ')].filter(Boolean).join(' — ')})` : l.map(([ch, tx]) => (ch ? `[${ch}]` : '') + tx).join('').replace(/\s+$/, '').replace(/^\s+/, '')).filter(x => x.replace(/\[[^\]]*\]/g, '').trim());
    const ref = b.filter(l => Array.isArray(l) && l.some(g => g[2])).length;
    return { type: ref * 2 >= b.length && ref ? 'chorus' : 'verse', lines };
  }).filter(s => s.lines.length);
  const chords = (d.b || []).some(b => b.some(l => Array.isArray(l) && l.some(g => g[0])));
  const head = d.capo ? `${MARK.slice(0, -1)} · capotasto ${d.capo})` : MARK;
  return { lyrics: [{ type: 'verse', lines: [head] }, ...st], chords, lang: d.l || 'it',
    tr: (d.tr || []).filter(t => String(t).trim()).map(t => ({ type: 'verse', lines: String(t).split('\n').map(x => x.trim()).filter(Boolean) })) };
}
