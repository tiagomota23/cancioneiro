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

  // Gravação: microfone -> PCM 16 kHz -> Whisper (worker) a cada ~2,5 s -> correspondência.
  // Pára sozinho quando um cântico se destaca claramente (ou aos 15 s).
  const MAX_SECONDS = 18, TARGET_RATE = 16000;
  // Línguas a experimentar (null = deteção automática do Whisper); a última que resultou vai à frente
  const LANG_ORDER = ['portuguese', null, 'italian', 'latin', 'spanish', 'english', 'french'];
  function langQueue() {
    const last = prefs.lastLang;
    return last && LANG_ORDER.includes(last) ? [last, ...LANG_ORDER.filter(l => l !== last)] : LANG_ORDER.slice();
  }
  let worker = null, modelReady = false, modelFailed = false, busy = false;
  let rec = null, heard = '', listenResult = null, loadProgress = {};
  function listenMsg(status, on) { $('listen-status').textContent = status; $('listen-pulse').classList.toggle('on', !!on); }
  function getWorker() {
    if (worker) return worker;
    worker = new Worker('worker.js', { type: 'module' });
    worker.onmessage = e => {
      const m = e.data;
      if (m.type === 'progress') {
        loadProgress[m.file] = [m.loaded, m.total];
        const [l, t] = Object.values(loadProgress).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
        if (!modelReady && rec) $('listen-hint').textContent = `A preparar o reconhecimento (só da primeira vez): ${Math.round(100 * l / t)}% de ${Math.round(t / 1e6)} MB`;
      } else if (m.type === 'ready') {
        modelReady = true; $('listen-hint').textContent = '';
        if (rec) tick();
      } else if (m.type === 'text') {
        busy = false;
        if (rec && m.id === rec.id) onTranscript(m.text, m.language);
      } else if (m.type === 'error') {
        busy = false;
        if (!modelReady) { modelFailed = true; }
        if (rec) { stopRecording(); listenMsg('Erro no reconhecimento'); $('listen-text').textContent = 'Não foi possível transcrever neste dispositivo. ' + m.message; }
      }
    };
    worker.onerror = () => { modelFailed = true; };
    worker.postMessage({ type: 'load' });
    return worker;
  }
  function downsample(chunks, rate) {
    const len = chunks.reduce((a, c) => a + c.length, 0);
    const input = new Float32Array(len); let o = 0;
    for (const c of chunks) { input.set(c, o); o += c.length; }
    if (rate === TARGET_RATE) return input;
    const ratio = rate / TARGET_RATE, out = new Float32Array(Math.floor(len / ratio));
    for (let i = 0; i < out.length; i++) {
      const s = Math.floor(i * ratio), e = Math.min(len, Math.floor((i + 1) * ratio));
      let sum = 0; for (let k = s; k < e; k++) sum += input[k];
      out[i] = sum / Math.max(1, e - s);
    }
    return out;
  }
  const rms = a => { let s = 0; for (let i = 0; i < a.length; i += 4) s += a[i] * a[i]; return Math.sqrt(s / (a.length / 4)); };
  // Frases que o Whisper "inventa" em silêncio/ruído
  const HALLUCINATIONS = /(amara\.org|legendas|subt[ií]tulos|sottotitoli|obrigad[oa] por|thank you for watching|thanks for watching|inscreva-se|\[m[uú]sica\]|\(m[uú]sica\))/i;
  function cleanText(t) { return t.replace(/[♪♫🎵🎶]/g, ' ').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(); }

  async function openListen() {
    $('listen').hidden = false; $('listen-text').textContent = ''; $('listen-hint').textContent = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.Worker) {
      listenMsg('Não disponível'); $('listen-text').textContent = 'Este navegador não permite gravar som.'; return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC(); // criado no toque do utilizador (necessário no iPhone)
    rec = { id: Date.now(), ctx, chunks: [], started: performance.now(), stream: null, lastSent: 0, queue: langQueue(), qi: 0, lang: undefined, best: null };
    const me = rec;
    listenMsg('A pedir o microfone…');
    getWorker();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } });
      if (rec !== me) { stream.getTracks().forEach(t => t.stop()); return; }
      rec.stream = stream;
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = e => { if (rec === me) me.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      src.connect(proc); proc.connect(ctx.destination);
      rec.started = performance.now();
      listenMsg('A ouvir…', true);
      rec.timer = setInterval(tick, 500);
    } catch (e) {
      stopRecording();
      listenMsg('Sem acesso ao microfone');
      $('listen-text').textContent = /iPhone|iPad|iPod/.test(navigator.userAgent)
        ? 'Autorize o microfone: Definições › Apps › Safari › Microfone (ou toque em "aA" na barra do Safari › Definições do site).'
        : 'Autorize o microfone nas definições do navegador.';
    }
  }
  function tick() {
    if (!rec || !rec.stream) return;
    const secs = (performance.now() - rec.started) / 1000;
    const bar = Math.min(100, Math.round(100 * secs / MAX_SECONDS));
    $('listen-bar').style.width = bar + '%';
    if (secs >= MAX_SECONDS && !busy) { finish(); return; }
    if (!modelReady || busy || secs < 3.5 || secs - rec.lastSent < 2.5) return;
    const audio = downsample(rec.chunks, rec.ctx.sampleRate).slice(-TARGET_RATE * MAX_SECONDS);
    if (rms(audio.subarray(-TARGET_RATE * 3)) < 0.004) { listenMsg('A ouvir… (muito baixo)', true); return; }
    rec.lastSent = secs; busy = true;
    if (!heard) listenMsg('A ouvir e a transcrever…', true);
    // língua fixada quando uma já deu resultado; senão, experimenta a próxima
    const language = rec.lang !== undefined ? rec.lang : rec.queue[rec.qi++ % rec.queue.length];
    getWorker().postMessage({ type: 'transcribe', id: rec.id, audio, language });
  }
  function onTranscript(raw, language) {
    const t = cleanText(raw || '');
    if (!t || HALLUCINATIONS.test(t)) return;
    const res = matchLyrics(t), words = tok(t).length;
    const top = res[0], second = res[1];
    const score = top ? top.score : 0;
    if (!rec.best || score >= rec.best.score) rec.best = { text: t, score, language };
    if (score >= 0.3 && rec.lang === undefined) rec.lang = language; // esta língua funciona: fica
    heard = rec.best.text;
    $('listen-text').textContent = `“${heard}”`;
    const clear = top && score >= 0.45 && (!second || score - second.score >= 0.12);
    if ((clear && words >= 6) || (words >= 20 && score >= 0.3)) {
      if (language) { prefs.lastLang = language; applyFont(); }
      finish();
    } else listenMsg(top ? 'A ouvir… (a confirmar)' : 'A ouvir…', true);
  }
  function stopRecording() {
    if (!rec) return;
    clearInterval(rec.timer);
    if (rec.stream) rec.stream.getTracks().forEach(t => t.stop());
    try { rec.ctx.close(); } catch (e) {}
    rec = null; busy = false;
  }
  function finish() {
    stopRecording();
    if (!heard) {
      listenMsg('Não percebi a letra');
      $('listen-text').textContent = modelReady ? 'Tente de novo, mais perto de quem canta.' : 'O reconhecimento ainda estava a ser preparado. Tente de novo dentro de momentos.';
      return;
    }
    finishListening();
  }
  function finishListening() {
    listenResult = { text: heard, res: matchLyrics(heard) };
    heard = '';
    $('listen').hidden = true;
    $('search').value = ''; $('search-clear').hidden = true;
    if (location.hash === '#/ouvir') route(); else location.hash = '#/ouvir';
  }
  function closeListen() { stopRecording(); heard = ''; $('listen').hidden = true; }
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
  $('listen-stop').onclick = () => { if (rec) { if (heard) finish(); else listenMsg('Ainda a ouvir…', true); } else if (heard) finishListening(); else openListen(); };
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
