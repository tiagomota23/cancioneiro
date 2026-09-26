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
  let favs = store.get('cancioneiro.favs', []); // slugs, guardados neste dispositivo
  const isFav = slug => favs.includes(slug);
  function toggleFav(slug) {
    favs = isFav(slug) ? favs.filter(x => x !== slug) : favs.concat(slug);
    store.set('cancioneiro.favs', favs);
  }

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
    lyrIndex = null;
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
    if ($('az')) $('az').innerHTML = '';
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


  // ---------- Identificar pela letra ouvida ----------
  const tok = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 1);
  let lyrIndex = null; // [{s, wins:[{words:Set, bigrams:Set, line}]}], idf
  function buildLyricIndex() {
    const df = new Map(), items = [];
    for (const s of songs) {
      const sources = [(s.lyrics || []).flatMap(st => st.lines.map(stripChords)), (s.translation || []).flatMap(st => st.lines)];
      const wins = [], seen = new Set();
      for (const lines of sources) {
        const lt = lines.map(tok);
        lt.forEach(ws => ws.forEach(w => seen.add(w)));
        for (let i = 0; i < lines.length; i++) {
          const words = new Set(), bigrams = new Set();
          for (let k = i; k < Math.min(i + 3, lines.length); k++) {
            const ws = lt[k];
            ws.forEach((w, j) => { words.add(w); if (j) bigrams.add(ws[j - 1] + ' ' + w); });
            if (k > i && lt[k - 1].length && ws.length) bigrams.add(lt[k - 1][lt[k - 1].length - 1] + ' ' + ws[0]);
          }
          if (words.size) wins.push({ words, bigrams, line: lines[i] });
        }
      }
      seen.forEach(w => df.set(w, (df.get(w) || 0) + 1));
      items.push({ s, wins });
    }
    const N = songs.length;
    lyrIndex = { items, idf: w => Math.log((N + 1) / (1 + (df.get(w) || 0))) };
  }
  function matchLyrics(text) {
    if (!lyrIndex) buildLyricIndex();
    const { items, idf } = lyrIndex;
    const q = tok(text);
    const qset = [...new Set(q)];
    const qbi = new Set(q.slice(1).map((w, i) => q[i] + ' ' + w));
    const total = qset.reduce((a, w) => a + idf(w), 0) + [...qbi].reduce((a, b) => a + 0.75 * b.split(' ').reduce((x, w) => x + idf(w), 0), 0);
    if (!total) return [];
    const out = [];
    for (const { s, wins } of items) {
      let best = 0, bestLine = null;
      for (const win of wins) {
        let sc = 0;
        for (const w of qset) if (win.words.has(w)) sc += idf(w);
        for (const b of qbi) if (win.bigrams.has(b)) sc += 0.75 * b.split(' ').reduce((x, w) => x + idf(w), 0);
        if (sc > best) { best = sc; bestLine = win.line; }
      }
      if (best) out.push({ s, score: best / total, snip: bestLine });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8).filter((r, i) => i === 0 ? r.score > 0.12 : r.score > 0.2);
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const LISTEN_LANGS = [['pt-PT', 'PT'], ['it-IT', 'IT'], ['es-ES', 'ES'], ['en-GB', 'EN'], ['fr-FR', 'FR']];
  let rec = null, heard = '', listenTimer = null, listenResult = null, cancelled = false;
  function renderLangs() {
    $('listen-langs').innerHTML = LISTEN_LANGS.map(([code, lbl]) =>
      `<button data-l="${code}" class="${(prefs.listenLang || 'pt-PT') === code ? 'on' : ''}">${lbl}</button>`).join('');
    $('listen-langs').querySelectorAll('button').forEach(b => b.onclick = () => {
      prefs.listenLang = b.dataset.l; applyFont(); renderLangs();
      if (rec) { cancelled = true; rec.abort(); setTimeout(startListening, 250); }
    });
  }
  function listenMsg(status, on) { $('listen-status').textContent = status; $('listen-pulse').classList.toggle('on', !!on); }
  function openListen() {
    $('listen').hidden = false; renderLangs(); $('listen-text').textContent = '';
    if (!SR) { listenMsg('Não disponível'); $('listen-text').textContent = 'Este navegador não permite reconhecimento de voz. Experimente o Chrome (Android) ou o Safari (iPhone).'; $('listen-stop').hidden = true; return; }
    $('listen-stop').hidden = false;
    startListening();
  }
  function startListening() {
    cancelled = false; heard = '';
    rec = new SR();
    rec.lang = prefs.listenLang || 'pt-PT';
    rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = e => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + ' ';
      heard = t.trim();
      $('listen-text').textContent = heard ? `“${heard}”` : '';
    };
    rec.onerror = e => {
      if (e.error === 'aborted') return;
      cancelled = true;
      listenMsg(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Sem acesso ao microfone' : e.error === 'no-speech' ? 'Não ouvi nada' : 'Erro: ' + e.error);
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      $('listen-text').textContent = (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        ? (ios ? 'No iPhone: autorize o microfone e ative o Ditado (Definições › Geral › Teclado › Ativar ditado). Se abriu a app a partir do ecrã principal e não funcionar, experimente no Safari.' : 'Autorize o microfone nas definições do navegador.')
        : 'Tente de novo, mais perto de quem canta.';
    };
    rec.onend = () => { clearTimeout(listenTimer); rec = null; if (!cancelled) finishListening(); };
    try { rec.start(); listenMsg('A ouvir…', true); } catch (e) { listenMsg('Erro ao iniciar'); }
    clearTimeout(listenTimer);
    listenTimer = setTimeout(() => rec && rec.stop(), 10000);
  }
  function finishListening() {
    listenMsg('A procurar…');
    if (!heard) { listenMsg('Não ouvi nada'); $('listen-text').textContent = 'Tente de novo, mais perto de quem canta.'; return; }
    listenResult = { text: heard, res: matchLyrics(heard) };
    $('listen').hidden = true;
    $('search').value = ''; $('search-clear').hidden = true;
    if (location.hash === '#/ouvir') route(); else location.hash = '#/ouvir';
  }
  function closeListen() { cancelled = true; clearTimeout(listenTimer); if (rec) rec.abort(); $('listen').hidden = true; }
  function showListenResults() {
    show('view-list');
    $('btn-back-list').hidden = false; $('btn-favs').hidden = true;
    const title = $('list-title'); title.hidden = false;
    if (!listenResult) { location.hash = '#/'; return; }
    const { text, res } = listenResult;
    title.textContent = res.length ? 'Cânticos parecidos' : 'Nenhum cântico encontrado';
    const heardWords = new Set(tok(text).filter(w => w.length > 2));
    const mark = line => line.split(/(\s+)/).map(w => heardWords.has(norm(w).replace(/[^a-z0-9]/g, '')) ? `<mark>${esc(w)}</mark>` : esc(w)).join('');
    $('rows').innerHTML = res.map(r => {
      const s = r.s;
      const author = s.author ? `<span class="a">${esc(s.author)}</span>` : '';
      const bp = s.book_page ? `<span class="bp">pág. ${s.book_page}</span>` : '';
      return `<li><a href="#/cantico/${encodeURIComponent(s.slug)}"><span class="t">${esc(s.title)}${author}<span class="snip">${mark(r.snip || '')}</span></span><span class="n">${s.number}${bp}</span></a></li>`;
    }).join('');
    $('status').textContent = `Ouvido: “${text}”`;
  }
  window.cancioneiroMatch = matchLyrics; // útil para testes
  window.cancioneiroHeard = t => { heard = t; finishListening(); };
  $('btn-mic').onclick = openListen;
  $('listen-cancel').onclick = closeListen;
  $('listen-stop').onclick = () => { if (rec) rec.stop(); else if (heard) finishListening(); else startListening(); };
  $('listen').addEventListener('click', e => { if (e.target === $('listen')) closeListen(); });

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
    $('btn-favs').hidden = !$('btn-back-list').hidden;
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
    if (catId === 'favoritos') {
      title.hidden = false;
      title.textContent = 'Cânticos preferidos';
      const list = songs.filter(s => isFav(s.slug)).sort((a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }));
      rows.innerHTML = list.map(s => songRow(s)).join('');
      if (!list.length && songs.length) $('status').innerHTML = '<span class="fav-empty">Ainda não tem cânticos preferidos.<br>Abra um cântico e toque na ☆ no topo para o adicionar.</span>';
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
    const fb = $('btn-fav');
    fb.classList.toggle('on', isFav(slug)); fb.setAttribute('aria-pressed', isFav(slug));
    fb.setAttribute('aria-label', isFav(slug) ? 'Remover dos preferidos' : 'Adicionar aos preferidos');
    fb.onclick = () => { toggleFav(slug); fb.classList.toggle('on', isFav(slug)); fb.setAttribute('aria-pressed', isFav(slug)); fb.setAttribute('aria-label', isFav(slug) ? 'Remover dos preferidos' : 'Adicionar aos preferidos'); };
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
    if (h === '#/ouvir') { lastListHash = h; showListenResults(); return; }
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
  // Gaveta: índice alfabético completo
  const letterOf = t => { const c = norm(t).replace(/^[^a-z0-9]+/, '')[0] || '#'; return /[a-z]/.test(c) ? c.toUpperCase() : '#'; };
  function renderAZ() {
    const q = $('drawer-search').value.trim();
    const list = q ? search(q).map(r => r.s) : songs.slice().sort((a, b) => norm(a.title).replace(/^[^a-z0-9]+/, '').localeCompare(norm(b.title).replace(/^[^a-z0-9]+/, ''), 'pt'));
    let html = '', cur = null;
    for (const s of list) {
      const L = letterOf(s.title);
      if (!q && L !== cur) { html += `<li class="letter">${L}</li>`; cur = L; }
      html += `<li><a href="#/cantico/${encodeURIComponent(s.slug)}"><span class="t">${esc(s.title)}</span><span class="n">${s.number}${s.book_page ? `<small>pág. ${s.book_page}</small>` : ''}</span></a></li>`;
    }
    $('az').innerHTML = html || '<li class="empty">Nenhum cântico encontrado.</li>';
  }
  function openDrawer() {
    if (!$('az').innerHTML || $('drawer-search').value) { $('drawer-search').value = ''; renderAZ(); }
    $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); }
  $('btn-menu').onclick = openDrawer;
  $('drawer-close').onclick = closeDrawer;
  $('drawer-scrim').onclick = closeDrawer;
  $('az').addEventListener('click', e => { if (e.target.closest('a')) closeDrawer(); });
  let tz;
  $('drawer-search').addEventListener('input', () => { clearTimeout(tz); tz = setTimeout(() => { renderAZ(); $('az').scrollTop = 0; }, 120); });
  $('drawer-search').addEventListener('keydown', e => { if (e.key === 'Enter') $('drawer-search').blur(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  $('btn-info').onclick = () => $('info').showModal();
  $('btn-favs').onclick = () => { $('search').value = ''; $('search-clear').hidden = true; location.hash = '#/lista/favoritos'; };
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
