(() => {
  'use strict';

  const LANGS = {
    pt: 'Português', it: 'Italiano', en: 'Inglês', la: 'Latim', es: 'Espanhol', fr: 'Francês',
    gl: 'Galego-português', cu: 'Eslavo eclesiástico', fur: 'Friulano', nap: 'Napolitano', ln: 'Lingala',
  };
  // Categorias do índice (como na versão italiana, agrupadas por língua)
  const CATEGORIES = [
    { id: 'todos', label: 'Todos os cânticos', test: () => true },
    { id: 'pt', label: 'Cânticos em português', test: s => s.language === 'pt' || s.language === 'gl' },
    { id: 'it', label: 'Cânticos italianos', test: s => s.language === 'it' || s.language === 'nap' || s.language === 'fur' },
    { id: 'la', label: 'Cânticos em latim', test: s => s.language === 'la' },
    { id: 'en', label: 'Cânticos ingleses, irlandeses e americanos', test: s => s.language === 'en' },
    { id: 'es', label: 'Cânticos espanhóis e sul-americanos', test: s => s.language === 'es' },
    { id: 'fr', label: 'Cânticos franceses', test: s => s.language === 'fr' },
    { id: 'outros', label: 'Outras línguas', test: s => ['cu', 'ln'].includes(s.language) },
    { id: 'traducao', label: 'Cânticos com tradução', test: s => !!s.translation },
    { id: 'acordes', label: 'Cânticos com acordes', test: s => s.has_chords },
    { id: 'partituras', label: 'Cânticos com partitura', test: s => !!s.pdf_url },
  ];

  const CACHE_KEY = 'cancioneiro.songs.v1';
  const $ = id => document.getElementById(id);
  const chev = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`´]/g, "'");
  const stripChords = l => l.replace(/\[[^\]]*\]/g, '');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  };

  let songs = [];
  let bySlug = new Map();
  const prefs = Object.assign({ fs: 18, chords: true }, store.get('cancioneiro.prefs', {}));
  const songView = {}; // slug -> 'orig' | 'trad'

  // ---------- Dados (Supabase) ----------
  async function fetchSongs() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.CANCIONEIRO_CONFIG;
    if (!SUPABASE_URL) return (await fetch('songs.json')).json(); // desenvolvimento local
    const cols = 'slug,number,book_page,title,author,language,lyrics,translation,translation_language,has_chords,pdf_url';
    const all = [];
    for (let from = 0; ; from += 1000) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=${cols}&order=number.asc`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Range: `${from}-${from + 999}` },
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}`);
      const page = await r.json();
      all.push(...page);
      if (page.length < 1000) break;
    }
    return all;
  }

  function setSongs(list) {
    songs = list;
    bySlug = new Map();
    for (const s of songs) {
      bySlug.set(s.slug, s);
      const lyr = (s.lyrics || []).flatMap(st => st.lines.map(stripChords));
      const tr = (s.translation || []).flatMap(st => st.lines);
      s._lines = lyr.concat(tr);
      s._t = norm(s.title);
      s._a = norm(s.author);
      s._l = s._lines.map(norm);
    }
    $('info-count').textContent = `${songs.length} cânticos.`;
  }

  async function load() {
    const cached = store.get(CACHE_KEY, null);
    if (cached && cached.length) { setSongs(cached); route(); }
    try {
      const fresh = await fetchSongs();
      store.set(CACHE_KEY, fresh);
      const changed = !cached || JSON.stringify(cached) !== JSON.stringify(fresh);
      setSongs(fresh);
      if (changed) route();
    } catch (e) {
      if (!songs.length) { showList(); $('status').textContent = 'Não foi possível carregar os cânticos. Verifique a ligação à internet.'; }
      console.error(e);
    }
  }

  // ---------- Pesquisa ----------
  function search(q) {
    const nq = norm(q).trim();
    if (!nq) return [];
    const terms = nq.split(/\s+/);
    const num = /^\d+$/.test(nq) ? +nq : null;
    const out = [];
    for (const s of songs) {
      let score = 0, snip = null;
      if (num !== null && s.number === num) score += 100;
      if (num !== null && s.book_page === num) score += 100;
      const inTitle = terms.every(t => s._t.includes(t));
      const inAuthor = terms.every(t => s._a.includes(t));
      if (s._t.startsWith(nq)) score += 60; else if (inTitle) score += 40;
      if (inAuthor) score += 25;
      // frase exata numa linha, ou todos os termos na letra
      let li = s._l.findIndex(l => l.includes(nq));
      if (li >= 0) score += 20;
      else if (!inTitle && !inAuthor && terms.every(t => s._l.some(l => l.includes(t)))) {
        score += 8; li = s._l.findIndex(l => l.includes(terms[0]));
      }
      if (li >= 0 && !inTitle) snip = s._lines[li];
      if (score) out.push({ s, score, snip });
    }
    return out.sort((a, b) => b.score - a.score || a.s.title.localeCompare(b.s.title, 'pt'));
  }

  function highlight(text, q) {
    const nt = norm(text), terms = norm(q).trim().split(/\s+/).filter(Boolean);
    const marks = new Array(text.length).fill(false);
    for (const t of terms) {
      let i = nt.indexOf(t);
      while (i >= 0) { for (let k = i; k < i + t.length; k++) marks[k] = true; i = nt.indexOf(t, i + t.length); }
    }
    let html = '', open = false;
    for (let i = 0; i < text.length; i++) {
      if (marks[i] && !open) { html += '<mark>'; open = true; }
      if (!marks[i] && open) { html += '</mark>'; open = false; }
      html += esc(text[i]);
    }
    return html + (open ? '</mark>' : '');
  }

  // ---------- Vistas ----------
  function show(id) {
    for (const v of ['view-list', 'view-song']) $(v).hidden = v !== id;
  }

  function songRow(s, q, snip) {
    const title = q ? highlight(s.title, q) : esc(s.title);
    const author = s.author ? `<span class="a">${q ? highlight(s.author, q) : esc(s.author)}</span>` : '';
    const sn = snip ? `<span class="snip">${highlight(snip, q)}</span>` : '';
    return `<li><a href="#/cantico/${encodeURIComponent(s.slug)}"><span class="t">${title}${author}${sn}</span><span class="n">${s.number}${s.book_page ? `<span class="bp">pág. ${s.book_page}</span>` : ''}</span></a></li>`;
  }

  function showList(catId) {
    show('view-list');
    const q = $('search').value;
    const rows = $('rows');
    const title = $('list-title');
    $('status').textContent = '';
    $('btn-back-list').hidden = !catId && !q;
    $('btn-menu').hidden = !$('btn-back-list').hidden;
    if (q.trim()) {
      const res = search(q);
      title.hidden = false;
      title.textContent = `${res.length} resultado${res.length === 1 ? '' : 's'}`;
      rows.innerHTML = res.slice(0, 200).map(r => songRow(r.s, q, r.snip)).join('');
      return;
    }
    if (!catId) {
      title.hidden = true;
      rows.innerHTML = CATEGORIES.map(c => {
        const n = songs.filter(c.test).length;
        return n ? `<li><a href="#/lista/${c.id}"><span class="t">${esc(c.label)}</span><span class="n">${n}</span>${chev}</a></li>` : '';
      }).join('');
      if (!songs.length) $('status').textContent = 'A carregar…';
      return;
    }
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];
    title.hidden = false;
    title.textContent = cat.label;
    rows.innerHTML = songs.filter(cat.test)
      .sort((a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }))
      .map(s => songRow(s)).join('');
  }

  function renderStanzas(stanzas) {
    return stanzas.map(st => {
      const hasCh = st.lines.some(l => l.includes('['));
      const lines = st.lines.map(l => {
        const html = esc(l).replace(/\[([^\]]*)\]/g, (_, c) => `<span class="ch" data-c="${c}"></span>`);
        return `<div class="line">${html}</div>`;
      }).join('');
      return `<div class="stanza ${st.type === 'chorus' ? 'chorus' : 'verse'}${hasCh ? ' has-ch' : ''}">${lines}</div>`;
    }).join('');
  }

  function showSong(slug) {
    const s = bySlug.get(slug);
    if (!s) { if (songs.length) location.hash = '#/'; return; }
    show('view-song');
    const mode = s.translation ? (songView[slug] || 'orig') : 'orig';
    const langName = LANGS[s.language] || s.language;
    const trName = LANGS[s.translation_language] || 'Português';
    const sw = s.translation
      ? `<div class="lang-switch" role="group" aria-label="Idioma">
           <button data-mode="orig" class="${mode === 'orig' ? 'on' : ''}">${esc(langName)}</button>
           <button data-mode="trad" class="${mode === 'trad' ? 'on' : ''}">Tradução · ${esc(trName)}</button>
         </div>`
      : `<span class="lang-chip">${esc(langName)}</span>`;
    const pdf = s.pdf_url ? `<a class="pdf" href="${esc(s.pdf_url)}" target="_blank" rel="noopener">Partitura (PDF)</a>` : '';
    const body = mode === 'trad' ? s.translation : s.lyrics;
    const note = mode === 'trad' ? '<p class="note">Tradução</p>' : '';
    $('song').innerHTML = `
      <h1>${esc(s.title)}</h1>
      ${s.author ? `<p class="author">${esc(s.author)}</p>` : ''}
      <div class="meta">${sw}${pdf}</div>
      ${note}
      ${renderStanzas(body)}
      <p class="num">${s.number}${s.book_page ? ` · pág. ${s.book_page} do livro` : ''}</p>`;
    $('song').classList.toggle('show-chords', prefs.chords && mode === 'orig');
    $('btn-chords').hidden = !(s.has_chords && mode === 'orig');
    $('btn-chords').classList.toggle('on', prefs.chords);
    $('song').querySelectorAll('.lang-switch button').forEach(b => b.onclick = () => {
      songView[slug] = b.dataset.mode;
      const y = window.scrollY;
      showSong(slug);
      window.scrollTo(0, y);
    });
  }

  // ---------- Router ----------
  let lastListHash = '#/';
  function route() {
    const h = location.hash || '#/';
    const m = h.match(/^#\/cantico\/(.+)$/);
    if (m) { showSong(decodeURIComponent(m[1])); window.scrollTo(0, 0); return; }
    lastListHash = h;
    const c = h.match(/^#\/lista\/(.+)$/);
    showList(c ? c[1] : null);
    const y = store.get('cancioneiro.scroll.' + h, 0);
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  // ---------- Eventos ----------
  function applyFont() {
    document.documentElement.style.setProperty('--fs', prefs.fs + 'px');
    store.set('cancioneiro.prefs', prefs);
  }
  $('font-inc').onclick = () => { prefs.fs = Math.min(40, prefs.fs + 2); applyFont(); };
  $('font-dec').onclick = () => { prefs.fs = Math.max(12, prefs.fs - 2); applyFont(); };
  $('btn-chords').onclick = () => {
    prefs.chords = !prefs.chords; applyFont();
    $('song').classList.toggle('show-chords', prefs.chords);
    $('btn-chords').classList.toggle('on', prefs.chords);
  };
  $('btn-back').onclick = () => { location.hash = lastListHash; };
  $('btn-back-list').onclick = () => {
    if ($('search').value) { $('search').value = ''; $('search-clear').hidden = true; route(); }
    else location.hash = '#/';
  };
  $('btn-menu').onclick = () => { location.hash = '#/'; };
  $('btn-info').onclick = () => $('info').showModal();
  let t;
  $('search').addEventListener('input', () => {
    $('search-clear').hidden = !$('search').value;
    clearTimeout(t);
    t = setTimeout(() => { if ($('view-list').hidden) location.hash = lastListHash; showList((lastListHash.match(/^#\/lista\/(.+)$/) || [])[1]); window.scrollTo(0, 0); }, 120);
  });
  $('search').addEventListener('keydown', e => { if (e.key === 'Enter') $('search').blur(); });
  $('search-clear').onclick = () => { $('search').value = ''; $('search-clear').hidden = true; route(); $('search').focus(); };
  window.addEventListener('scroll', () => {
    if (!$('view-list').hidden && !$('search').value) store.set('cancioneiro.scroll.' + (location.hash || '#/'), window.scrollY);
  }, { passive: true });
  window.addEventListener('hashchange', route);

  applyFont();
  setTimeout(() => $('splash').classList.add('gone'), 900);
  showList();
  load();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
