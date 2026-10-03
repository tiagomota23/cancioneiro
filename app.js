(() => {
  'use strict';

  const LANGS = {
    pt: 'Português', it: 'Italiano', en: 'Inglês', la: 'Latim', es: 'Espanhol', fr: 'Francês',
    gl: 'Galego-português', cu: 'Eslavo eclesiástico', fur: 'Friulano', nap: 'Napolitano', ln: 'Lingala', ru: 'Russo', sw: 'Suaíli', de: 'Alemão', xx: 'Outra língua',
  };
  // Fontes dos cânticos (tabela song_sources). "original" = cancioneiro.marriaga.com
  const SOURCES = { original: 'Cancioneiro', coro_clu: 'Coro', songbook: 'Songbook', canti2024: 'CANTI 2024' };
  const srcOf = s => (s.sources && s.sources.length ? s.sources.map(x => x.source) : ['original']);
  // Perfis (hierárquicos; cada um pode tudo o que os anteriores podem). O perfil da pessoa vem de allowed_emails.role;
  // o perfil ativo pode ser qualquer um até esse, escolhido no símbolo do canto superior direito
  // (que abre também a informação e o fim de sessão).
  // Símbolos: o mesmo círculo; Coro com C, Maestro com M, Gestor preenchido
  const CIRCLE = '<circle cx="12" cy="12" r="7.5"/>';
  const letter = c => `<text x="12" y="12.4" text-anchor="middle" dominant-baseline="central" style="fill:currentColor;stroke:none;font:700 9.5px Lato, -apple-system, Helvetica, Arial, sans-serif">${c}</text>`;
  const PERFIS = [
    { id: 'cancioneiro', label: 'Cancioneiro', desc: 'Os cânticos do Cancioneiro, sem acordes, partituras nem gravações', icon: CIRCLE },
    { id: 'coro', label: 'Coro', desc: 'Todos os cânticos e livros, com acordes, partituras e gravações', icon: CIRCLE + letter('C') },
    { id: 'maestro', label: 'Maestro', desc: 'Editar letras e promover cânticos ao Cancioneiro', icon: CIRCLE + letter('M') },
    { id: 'gestor', label: 'Gestor', desc: 'Gerir os utilizadores e os seus perfis', icon: '<circle cx="12" cy="12" r="7.5" style="fill:currentColor"/>' },
  ];
  const rankOf = r => PERFIS.findIndex(p => p.id === r) + 1;
  let maxRole = null, perfil = null; // perfil da pessoa e perfil ativo
  const lvl = () => Math.min(rankOf(perfil), rankOf(maxRole)) || 1;
  // Com o filtro "Cancioneiro" (ou no perfil Cancioneiro) os cânticos aparecem como eram antes (sem gravações, etiquetas nem partituras extra)
  const extrasOn = () => lvl() >= 2 && prefs.src !== 'original';
  const inCancioneiro = s => s.cancioneiro ?? srcOf(s).includes('original');
  // As letras não vêm com a lista: cada cântico é pedido ao servidor quando se abre (função "conteudo", com limites
  // por pessoa contra cópias em massa). Guardam-se só os cânticos já abertos, para os voltar a mostrar sem rede.
  const lyr = new Map(); // slug -> { lyrics, translation, edited }
  const lyricsOf = s => (lyr.get(s.slug) || {}).lyrics || [];
  const hasTag = (s, grp, tag) => extrasOn() && (s.tags || []).some(t => t.grp === grp && t.tag === tag);
  const filesOf = (s, kind) => (extrasOn() ? s.files || [] : []).filter(f => f.kind === kind).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'pt', { numeric: true }));
  const scoresOf = s => lvl() < 2 ? [] : [
    ...(s.pdf_url ? [/^https?:/.test(s.pdf_url) ? { label: 'Partitura', url: s.pdf_url, mime: 'application/pdf' } : { label: 'Partitura', path: s.pdf_url, mime: 'application/pdf' }] : []),
    ...filesOf(s, 'score'),
  ];
  // Momentos da missa (índice do Word "Músicas Coro" do Coro CLU)
  const MOMENTS = ['Entrada', 'Ofertório', 'Comunhão', 'Ação de Graças', 'Nossa Senhora', 'Advento', 'Natal', 'Quaresma', 'Páscoa', 'Geral', 'A aprender'];
  // Secções dos livros importados (etiquetas song_tags com grp = nome do livro)
  const BOOKS = [
    { id: 'sb', grp: 'Songbook', head: 'Songbook', secs: ['English songs', 'Spirituals', 'Rock – pop – folk', 'Songs', 'Hymns', 'Latin songs', 'Troubadour-songs', 'Italian songs', 'Italian folk songs', 'French songs', 'Spanish songs', 'Brasilian songs', 'German songs', 'African songs'] },
    { id: 'ct', grp: 'CANTI 2024', head: 'CANTI 2024', secs: ['Canti per la liturgia', 'Canti della nostra storia', 'Canti di montagna', 'Canti popolari regionali', 'Canti per bambini', 'Canzoni italiane', 'Canti stranieri'] },
  ];
  // Categorias do índice (como na versão italiana, agrupadas por língua)
  const CATEGORIES = [
    { id: 'todos', label: 'Todos os cânticos', test: () => true },
    { id: 'pt', label: 'Cânticos em português', test: s => s.language === 'pt' || s.language === 'gl' },
    { id: 'it', label: 'Cânticos italianos', test: s => s.language === 'it' || s.language === 'nap' || s.language === 'fur' },
    { id: 'la', label: 'Cânticos em latim', test: s => s.language === 'la' },
    { id: 'en', label: 'Cânticos ingleses, irlandeses e americanos', test: s => s.language === 'en' },
    { id: 'es', label: 'Cânticos espanhóis e sul-americanos', test: s => s.language === 'es' },
    { id: 'fr', label: 'Cânticos franceses', test: s => s.language === 'fr' },
    { id: 'outros', label: 'Outras línguas', test: s => ['cu', 'ln', 'ru', 'sw', 'de', 'xx'].includes(s.language) },
    { id: 'traducao', label: 'Cânticos com tradução', test: s => !!s.has_translation },
    { id: 'acordes', label: 'Cânticos com acordes', test: s => lvl() >= 2 && s.has_chords },
    { id: 'partituras', label: 'Cânticos com partitura', test: s => scoresOf(s).length > 0 },
    { id: 'gravacoes', label: 'Cânticos com gravações das vozes', test: s => filesOf(s, 'recording').length > 0 },
    { id: 'copyright', label: 'Cânticos com copyright', test: s => extrasOn() && !!s.rights },
    { id: 'coro-missa', head: 'Coro', label: 'Coro — para a Missa', test: s => hasTag(s, 'Coro CLU', 'Para a Missa') },
    { id: 'coro-gestos', label: 'Coro — para Gestos', test: s => hasTag(s, 'Coro CLU', 'Para Gestos') },
    { id: 'coro-outras', label: 'Coro — outras músicas', test: s => hasTag(s, 'Coro CLU', 'Outras') },
    ...MOMENTS.map((m, i) => ({ id: 'momento-' + m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '-'), head: i === 0 ? 'Coro — momentos da Missa' : null, label: m, test: s => hasTag(s, 'Coro CLU — momento', m) })),
    ...BOOKS.flatMap(b => b.secs.map((sec, i) => ({ id: b.id + '-' + i, head: i === 0 ? b.head : null, label: sec, test: s => hasTag(s, b.grp, sec) }))),
  ];

  const APP_VERSION = '2026-10-03 v66';
  const CACHE_KEY = 'cancioneiro.songs.v2'; // só a lista (sem letras)
  try { localStorage.removeItem('cancioneiro.songs.v1'); } catch (e) {} // versão antiga guardava todas as letras
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
  let allSongs = [];
  let bySlug = new Map();
  const prefs = Object.assign({ fs: 18, chords: true, src: 'todas' }, store.get('cancioneiro.prefs', {}));
  const songView = {}; // slug -> 'orig' | 'trad'
  // Preferidos: guardados no Supabase por utilizador (tabela favorites, RLS: cada um só vê os seus).
  // Cópia local por utilizador para mostrar logo e funcionar sem rede.
  let favs = [];
  const isFav = slug => favs.includes(slug);
  const favKey = () => 'cancioneiro.favs.' + (session ? session.user.id : 'anon');

  // ---------- Sessão (Google via Supabase Auth; acesso limitado por email na base de dados) ----------
  const CFG = window.CANCIONEIRO_CONFIG;
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  let session = null;
  // Modo de teste só em localhost (?demo): sem Google, com a cópia local songs.json
  const DEMO = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('demo');
  async function accessToken(renew) {
    if (DEMO) { session = { user: { id: 'demo', email: 'demo@localhost' }, access_token: '' }; return ''; }
    let { data } = await sb.auth.getSession();
    // Renova a sessão se já expirou (ou expira dentro de 1 min), ou se o servidor a recusou
    if (data.session && (renew || (data.session.expires_at || 0) * 1000 < Date.now() + 60000)) {
      const r = await sb.auth.refreshSession();
      if (r.data && r.data.session) data = r.data;
    }
    session = data.session;
    return session ? session.access_token : null;
  }
  function showLogin(msg) {
    for (const v of ['view-list', 'view-song', 'view-admin']) $(v).hidden = true;
    $('view-login').hidden = false;
    $('login-msg').textContent = msg || '';
    splashDone.then(() => $('splash').classList.add('gone'));
  }
  $('btn-google').onclick = async () => {
    $('login-msg').textContent = 'A abrir o Google…';
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
    });
    if (error) $('login-msg').textContent = 'Erro: ' + error.message;
  };
  async function logout(msg) {
    try { await sb.auth.signOut(); } catch (e) { /* sem rede */ }
    try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(lyrKey()); } catch (e) {}
    songs = []; bySlug = new Map(); session = null; favs = []; lyr.clear(); maxRole = perfil = null;
    if ($('info').open) $('info').close();
    showLogin(msg);
  }

  async function loadFavs() {
    favs = store.get(favKey(), []);
    if (DEMO) { refreshFavUI(); return; }
    try {
      // migração: preferidos antigos guardados só neste dispositivo passam para a conta
      const legacy = store.get('cancioneiro.favs', null);
      if (legacy && legacy.length) {
        const { error } = await sb.from('favorites').upsert(legacy.map(slug => ({ slug })), { onConflict: 'user_id,slug', ignoreDuplicates: true });
        if (!error) localStorage.removeItem('cancioneiro.favs');
      } else if (legacy) localStorage.removeItem('cancioneiro.favs');
      const { data, error } = await sb.from('favorites').select('slug').order('created_at');
      if (!error && data) { favs = data.map(r => r.slug); store.set(favKey(), favs); }
    } catch (e) { /* sem rede: fica a cópia local */ }
    refreshFavUI();
  }
  async function toggleFav(slug) {
    const was = isFav(slug);
    favs = was ? favs.filter(x => x !== slug) : favs.concat(slug);
    store.set(favKey(), favs);
    if (DEMO) { refreshFavUI(); return; }
    const { error } = was
      ? await sb.from('favorites').delete().eq('slug', slug)
      : await sb.from('favorites').insert({ slug });
    if (error && !/duplicate/i.test(error.message)) {
      favs = was ? favs.concat(slug) : favs.filter(x => x !== slug); // repõe
      store.set(favKey(), favs);
      alert('Não foi possível guardar o preferido. Verifique a ligação à internet.');
    }
    refreshFavUI();
  }
  // No cântico: ☆ (preferido) ou, do perfil Maestro para cima, um livro que abre as coleções do cântico
  const ICON_STAR = '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6 6.7 19.5l1.1-5.9L3.4 9.5l6-.8z"/>';
  const ICON_BOOK = '<path d="M3 5.5c2.6-1 5.6-1 9 1 3.4-2 6.4-2 9-1V19c-2.6-1-5.6-1-9 1-3.4-2-6.4-2-9-1z"/><path d="M12 6.5V20"/>';
  function refreshFavUI() {
    const fb = $('btn-fav'), slug = fb.dataset.slug;
    if (slug) {
      const book = lvl() >= 3;
      const on = isFav(slug) || (book && cols.some(c => !expired(c) && (c.songs || []).some(x => x.song_slug === slug)));
      fb.querySelector('svg').innerHTML = book ? ICON_BOOK : ICON_STAR;
      fb.classList.toggle('book', book);
      fb.classList.toggle('on', on); fb.setAttribute('aria-pressed', on);
      fb.setAttribute('aria-label', book ? 'Coleções' : isFav(slug) ? 'Remover dos preferidos' : 'Adicionar aos preferidos');
      fb.title = book ? 'Coleções' : '';
    }
    if (location.hash === '#/lista/favoritos' && !$('view-list').hidden) showList('favoritos');
  }

  // Última verificação semanal do site original (tabela sync_log, escrita pela função sync-songs)
  async function loadSyncInfo() {
    if (DEMO) return;
    try {
      const { data } = await sb.from('sync_log').select('run_at,added,updated,error').order('run_at', { ascending: false }).limit(1);
      if (!data || !data.length) return;
      const r = data[0], d = new Date(r.run_at);
      const quando = d.toLocaleDateString('pt-PT') + ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      const n = (r.added || []).length, u = (r.updated || []).length;
      $('info-sync').textContent = r.error
        ? `Última verificação do site original: ${quando} (erro: ${r.error})`
        : `Última verificação do site original: ${quando} · ${n} novo${n === 1 ? '' : 's'}, ${u} atualizado${u === 1 ? '' : 's'}`;
    } catch (e) { /* sem rede */ }
  }

  // ---------- Conteúdo protegido (função "conteudo" no Supabase) ----------
  const lyrKey = () => 'cancioneiro.letras.' + (session ? session.user.id : 'anon');
  const LYR_MAX = 150;
  function loadLyrCache() { lyr.clear(); for (const [k, v] of store.get(lyrKey(), [])) lyr.set(k, v); }
  function saveLyrCache() { store.set(lyrKey(), [...lyr.entries()].slice(-LYR_MAX)); }
  class Limit extends Error {}
  async function api(op, body) {
    if (DEMO) return demoApi(op, body);
    const call = async renew => fetch(CFG.SUPABASE_URL + '/functions/v1/conteudo', {
      method: 'POST', headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + await accessToken(renew), 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, perfil: PERFIS[lvl() - 1].id, ...body }),
    });
    let r = await call(false);
    if (r.status === 401) r = await call(true);
    const d = await r.json().catch(() => ({}));
    if (r.status === 429) throw new Limit(d.message || 'Atingiu o limite de uso por agora. Tente de novo mais tarde.');
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    return d;
  }
  const pending = new Map();
  const hasLyrics = slug => lyr.has(slug) && !(lyr.get(slug).nc && lvl() >= 2);
  function getLyrics(slug) {
    if (hasLyrics(slug)) { const v = lyr.get(slug); lyr.delete(slug); lyr.set(slug, v); return Promise.resolve(v); } // mais recente no fim
    if (!pending.has(slug)) pending.set(slug, api('song', { slug }).then(d => {
      const v = { lyrics: d.lyrics || [], translation: d.translation || null, edited: !!d.edited, nc: lvl() < 2 };
      lyr.set(slug, v); saveLyrCache();
      return v;
    }).finally(() => pending.delete(slug)));
    return pending.get(slug);
  }
  // Modo de teste local (?demo): o mesmo, mas com a cópia songs.json e sem limites
  let demoFull = new Map();
  async function demoApi(op, b) {
    if (op === 'song') { const s = demoFull.get(b.slug); return { lyrics: s.lyrics_edit || s.lyrics || [], translation: s.translation || null, edited: !!s.lyrics_edit }; }
    if (op === 'search') return { hits: demoSearch(b.q) };
    if (op === 'match') return { matches: matchLyrics(b.text) };
    if (op === 'file') {
      const [path, frag = ''] = b.path.split('#');
      const book = { 'livros/songbook.pdf': 'livros/songbook', 'livros/canti2024.pdf': 'livros/canti2024' }[path];
      if (!book) return { url: 'drive-coro-clu/out/' + path };
      const p = +(frag.match(/(?:^|&)p=(\d+)/) || [])[1] || 1, c = (frag.match(/(?:^|&)c=([^&]+)/) || [])[1];
      const pages = c ? [...new Set(c.split('|').map(r => +r.split(':')[0]))] : [p, p + 1];
      return { pages: pages.map(n => ({ n, url: `drive-coro-clu/out/${book}/p${String(n).padStart(3, '0')}.pdf` })) };
    }
    if (op === 'save') { const s = demoFull.get(b.slug); s.lyrics_edit = b.lyrics_edit; return { edited_by: 'demo', edited_at: new Date().toISOString(), is_edited: !!b.lyrics_edit }; }
    if (op === 'promote') return { cancioneiro: b.on, promoted_by: b.on ? 'demo@localhost' : null, promoted_at: b.on ? new Date().toISOString() : null };
    if (op === 'users') return { me: 'demo@localhost', requests: [{ id: '00000000-0000-0000-0000-000000000000', email: 'novo@exemplo.pt', name: 'Pessoa Nova', created_at: new Date().toISOString() }],
      users: [{ email: 'demo@localhost', name: 'Demo', role: 'gestor', last_sign_in_at: new Date().toISOString() }, { email: 'coro@exemplo.pt', name: 'Coralista', role: 'coro', last_sign_in_at: null }].filter(u => lvl() >= 4 || u.role !== 'gestor') };
    if (op === 'user' || op === 'reject') return { ok: true };
    throw new Error('op');
  }
  function demoSearch(q) {
    const nq = norm(q).trim(), terms = nq.split(/\s+/), out = [];
    for (const s of demoFull.values()) {
      const lines = (s.lyrics_edit || s.lyrics || []).flatMap(st => st.lines.map(stripChords)).concat((s.translation || []).flatMap(st => st.lines));
      const nl = lines.map(norm);
      let li = nl.findIndex(l => l.includes(nq)), score = 20;
      if (li < 0 && terms.every(t => nl.some(l => l.includes(t)))) { li = nl.findIndex(l => l.includes(terms[0])); score = 8; }
      if (li >= 0) out.push({ slug: s.slug, score, snip: lines[li] });
    }
    return out.slice(0, 60);
  }

  // ---------- Dados (Supabase) ----------
  async function fetchSongs() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = CFG;
    let token = await accessToken();
    if (DEMO) {
      const full = await (await fetch('songs.json')).json();
      demoFull = new Map(full.map(s => [s.slug, s]));
      return full.map(({ lyrics, translation, lyrics_edit, ...x }) => ({ ...x, has_translation: !!translation, is_edited: !!lyrics_edit }));
    }
    const cols = 'slug,number,book_page,title,author,language,translation_language,has_chords,has_translation,pdf_url,rights,is_edited,edited_by,edited_at,cancioneiro,promoted_by,promoted_at,' +
      'sources:song_sources(source),tags:song_tags(grp,tag),files:song_files(kind,label,path,mime,sort)';
    const all = [];
    for (let from = 0; ; from += 1000) {
      const get = () => fetch(`${SUPABASE_URL}/rest/v1/songs?select=${cols}&order=number.asc`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Range: `${from}-${from + 999}` },
      });
      let r = await get();
      if (r.status === 401) { token = await accessToken(true); r = await get(); }
      if (!r.ok) throw new Error(`Supabase ${r.status}`);
      const page = await r.json();
      all.push(...page);
      if (page.length < 1000) break;
    }
    return all;
  }

  function setSongs(list) {
    allSongs = list;
    for (const s of allSongs) {
      s._t = norm(s.title);
      s._a = norm(s.author);
    }
    applySource();
  }
  // Filtro por fonte: "todas", ou só uma (ex.: só o Cancioneiro original, como era antes)
  function applySource() {
    // "Cancioneiro" = cânticos do site original e os promovidos por um Maestro
    const has = (s, k) => k === 'original' ? inCancioneiro(s) : srcOf(s).includes(k);
    const f = lvl() < 2 ? 'original' : prefs.src || 'todas';
    songs = f === 'todas' ? allSongs : allSongs.filter(s => has(s, f));
    lyrIndex = null;
    const extra = lvl() < 2 ? colExtra() : new Set();
    bySlug = new Map((lvl() < 2 ? allSongs.filter(s => inCancioneiro(s) || extra.has(s.slug)) : allSongs).map(s => [s.slug, s]));
    const present = new Set(allSongs.flatMap(srcOf));
    const sel = $('src-filter');
    if (sel) {
      sel.innerHTML = `<option value="todas">Tudo (${allSongs.length})</option>` +
        Object.entries(SOURCES).filter(([k]) => present.has(k))
          .map(([k, v]) => `<option value="${k}">${esc(v)} (${allSongs.filter(s => has(s, k)).length})</option>`).join('');
      sel.value = present.has(f) ? f : 'todas';
    }
    $('info-count').textContent = `${songs.length} cânticos${f !== 'todas' ? ' (' + (SOURCES[f] || f) + ')' : ''} · versão ${APP_VERSION}`;
  }

  async function load() {
    const cached = store.get(CACHE_KEY, null);
    if (cached && cached.length) { setSongs(cached); route(); }
    try {
      const fresh = await fetchSongs();
      if (!fresh.length) { // a base de dados só devolve cânticos a emails autorizados
        await logout(`A conta ${session && session.user.email || ''} ainda não tem acesso ao Cancioneiro. O pedido foi enviado ao administrador; tente de novo depois de ser autorizado.`);
        return;
      }
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
      // palavras da letra: resultados do servidor (lyricHits), com o trecho da linha encontrada
      const h = lyricHits.q === nq && lyricHits.map.get(s.slug);
      if (h) { score += h.score; if (!inTitle) snip = h.snip; }
      if (score) out.push({ s, score, snip });
    }
    return out.sort((a, b) => b.score - a.score || a.s.title.localeCompare(b.s.title, 'pt'));
  }
  let lyricHits = { q: '', map: new Map() };
  let lyricTimer = null;
  function searchLyricsRemote(q) {
    const nq = norm(q).trim();
    clearTimeout(lyricTimer);
    if (nq.length < 3 || lyricHits.q === nq) return;
    lyricTimer = setTimeout(async () => {
      try {
        const d = await api('search', { q });
        lyricHits = { q: nq, map: new Map(d.hits.map(h => [h.slug, h])) };
        if (norm($('search').value).trim() === nq && !$('view-list').hidden) showList((lastListHash.match(/^#\/lista\/(.+)$/) || [])[1]);
      } catch (e) {
        if (e instanceof Limit) $('status').textContent = e.message;
      }
    }, 350);
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
  // (no modo de teste local; em produção a correspondência é feita no servidor, ver matchRemote)
  let lyrIndex = null; // [{s, wins:[{words:Set, bigrams:Set, line}]}], idf
  function buildLyricIndex() {
    const df = new Map(), items = [];
    for (const s of demoFull.values()) {
      const sources = [(s.lyrics_edit || s.lyrics || []).flatMap(st => st.lines.map(stripChords)), (s.translation || []).flatMap(st => st.lines)];
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
    const N = demoFull.size;
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
      if (best) out.push({ slug: s.slug, score: best / total, snip: bestLine });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8).filter((r, i) => i === 0 ? r.score > 0.12 : r.score > 0.2);
  }
  async function matchRemote(text) {
    const d = await api('match', { text });
    return (d.matches || []).map(m => ({ s: bySlug.get(m.slug), score: m.score, snip: m.snip })).filter(m => m.s);
  }

  // Gravação: microfone -> PCM 16 kHz -> Whisper (worker) a cada ~2,5 s -> correspondência.
  // Pára sozinho quando um cântico se destaca claramente (ou aos 15 s).
  // Captura: primeira tentativa aos 8 s (texto suficiente), última aos 10 s; guarda até 15 s de áudio
  const FIRST_SECONDS = 8, MAX_SECONDS = 10, BUFFER_SECONDS = 15, TARGET_RATE = 16000;
  // Línguas a experimentar (null = deteção automática do Whisper); a última que resultou vai à frente
  const LANG_ORDER = ['portuguese', null, 'italian', 'latin', 'spanish', 'english', 'french'];
  function langQueue() {
    const last = prefs.lastLang;
    return last && LANG_ORDER.includes(last) ? [last, ...LANG_ORDER.filter(l => l !== last)] : LANG_ORDER.slice();
  }
  let worker = null, modelReady = false, modelFailed = false, busy = false;
  // Transcrição na nuvem (Supabase Edge Function -> Groq Whisper large); o modelo no telemóvel fica como alternativa
  let cloudFailed = false, cloudError = '';
  // Língua: automática por omissão; o utilizador pode fixar uma para ajudar a transcrição
  const LISTEN_LANGS = [['auto', 'Auto', null], ['pt', 'PT', 'portuguese'], ['it', 'IT', 'italian'], ['la', 'LA', 'latin'], ['es', 'ES', 'spanish'], ['en', 'EN', 'english'], ['fr', 'FR', 'french']];
  const chosenLang = () => LISTEN_LANGS.find(l => l[0] === (prefs.listenLang || 'auto')) || LISTEN_LANGS[0];
  function renderLangs() {
    $('listen-langs').innerHTML = LISTEN_LANGS.map(([code, lbl]) =>
      `<button data-l="${code}" class="${chosenLang()[0] === code ? 'on' : ''}" aria-pressed="${chosenLang()[0] === code}">${lbl}</button>`).join('');
    $('listen-langs').querySelectorAll('button').forEach(b => b.onclick = () => {
      prefs.listenLang = b.dataset.l; applyFont(); renderLangs();
      if (rec) { rec.lang = undefined; rec.best = null; rec.lastSent = 0; } // recomeça a transcrição com a nova língua
    });
  }
  const TRANSCRIBE_URL = () => window.CANCIONEIRO_CONFIG.SUPABASE_URL + '/functions/v1/transcribe';
  // Som distante: amplifica até o pico ficar perto do máximo (limita a 30x para não amplificar só ruído)
  function normalize(pcm) {
    let peak = 0; for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
    const gain = peak > 0 ? Math.min(30, 0.9 / peak) : 1;
    if (gain <= 1.05) return pcm;
    const out = new Float32Array(pcm.length); for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * gain;
    return out;
  }
  function encodeWav(pcm) {
    pcm = normalize(pcm);
    const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, TARGET_RATE, true); v.setUint32(28, TARGET_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([buf], { type: 'audio/wav' });
  }
  async function sendCloud(blob, id) {
    const K = CFG.SUPABASE_ANON_KEY;
    try {
      const token = await accessToken();
      const lc = chosenLang()[0];
      const r = await fetch(TRANSCRIBE_URL() + (lc !== 'auto' ? '?lang=' + lc : ''), { method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + token, 'Content-Type': blob.type || 'audio/wav' }, body: blob });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
      busy = false;
      if (rec && rec.id === id) { rec.done++; onTranscript(d.text, null); }
    } catch (e) {
      busy = false; cloudFailed = true; cloudError = String(e.message || e);
      if (rec) { $('listen-hint').textContent = `Transcrição na nuvem indisponível (${cloudError}); a usar o modelo do telemóvel.`; getWorker(); }
    }
  }
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
        if (rec && m.id === rec.id) { rec.done++; onTranscript(m.text, m.language); }
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

  // Equalizador (mostra que o som está mesmo a chegar) + diagnóstico
  function drawEq() {
    if (!rec || !rec.analyser) return;
    const cv = $('listen-eq'), g = cv.getContext('2d');
    const data = new Uint8Array(rec.analyser.frequencyBinCount);
    rec.analyser.getByteFrequencyData(data);
    const bars = 28, w = cv.width / bars, useful = Math.floor(data.length * 0.22);
    g.clearRect(0, 0, cv.width, cv.height);
    let peak = 0;
    for (let i = 0; i < bars; i++) {
      let v = 0; const s = Math.floor(i * useful / bars), e = Math.floor((i + 1) * useful / bars);
      for (let k = s; k < e; k++) v = Math.max(v, data[k]);
      peak = Math.max(peak, v);
      const h = Math.max(3, (v / 255) * cv.height);
      g.fillStyle = v > 20 ? '#1fb385' : '#cfd8d4';
      g.beginPath();
      if (g.roundRect) g.roundRect(i * w + 2, (cv.height - h) / 2, w - 4, h, 2); else g.rect(i * w + 2, (cv.height - h) / 2, w - 4, h);
      g.fill();
    }
    rec.peak = peak;
    rec.raf = requestAnimationFrame(drawEq);
  }
  function diag() {
    if (!rec) return;
    const secs = ((performance.now() - rec.started) / 1000).toFixed(0);
    const model = modelReady ? 'pronto' : modelFailed ? 'erro' : (() => {
      const v = Object.values(loadProgress); if (!v.length) return 'a carregar';
      const [l, t] = v.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]); return Math.round(100 * l / t) + '%';
    })();
    const engine = cloudFailed ? `telemóvel (${model})` : 'nuvem';
    $('listen-diag').textContent = `${APP_VERSION} · microfone: ${rec.stream ? 'ok' : '…'} · áudio: ${rec.ctx.state}, ${rec.chunks.length} blocos, rec ${rec.mrChunks ? rec.mrChunks.length : 0} · transcrição: ${engine}, ${rec.done || 0} · ${secs}s`;
  }
  function resumeAudio() {
    if (rec && rec.ctx.state !== 'running') rec.ctx.resume().catch(() => {});
  }

  async function openListen() {
    $('listen').hidden = false; $('listen-text').textContent = ''; $('listen-hint').textContent = ''; $('listen-diag').textContent = '';
    renderLangs();
    const cv = $('listen-eq'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.Worker) {
      listenMsg('Não disponível'); $('listen-text').textContent = 'Este navegador não permite gravar som.'; return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    // Criar e retomar o áudio ainda dentro do toque (o iPhone exige-o)
    const ctx = new AC();
    ctx.resume().catch(() => {});
    rec = { id: Date.now(), ctx, chunks: [], started: performance.now(), stream: null, lastSent: 0, queue: langQueue(), qi: 0, lang: undefined, best: null, done: 0 };
    const me = rec;
    listenMsg('A pedir o microfone…');
    if (cloudFailed) getWorker();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      if (rec !== me) { stream.getTracks().forEach(t => t.stop()); return; }
      rec.stream = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.6;
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = e => { if (rec === me) me.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      src.connect(analyser); src.connect(proc); proc.connect(ctx.destination);
      rec.analyser = analyser; rec.src = src; rec.proc = proc;
      // Gravador nativo (o mais fiável no iPhone), usado se o PCM não chegar
      rec.mrChunks = [];
      if (window.MediaRecorder) {
        try {
          const mr = new MediaRecorder(stream);
          mr.ondataavailable = e => { if (e.data && e.data.size) me.mrChunks.push(e.data); };
          mr.start(1000); rec.mr = mr;
        } catch (e) { /* sem MediaRecorder */ }
      }
      resumeAudio();
      ctx.onstatechange = () => { if (rec === me && ctx.state !== 'running') showTapToStart(); };
      rec.started = performance.now();
      if (ctx.state !== 'running') showTapToStart(); else listenMsg('A ouvir…', true);
      drawEq();
      rec.timer = setInterval(() => { tick(); diag(); }, 500);
    } catch (e) {
      stopRecording();
      listenMsg('Sem acesso ao microfone');
      $('listen-text').textContent = /iPhone|iPad|iPod/.test(navigator.userAgent)
        ? 'Autorize o microfone: toque em "aA" na barra do Safari › Definições do site › Microfone › Permitir (ou Definições › Apps › Safari › Microfone).'
        : 'Autorize o microfone nas definições do navegador.';
      $('listen-diag').textContent = String(e && e.name || e);
    }
  }
  // Se o iPhone deixou o áudio parado, um toque volta a ativá-lo
  function showTapToStart() {
    listenMsg('Toque no microfone para começar');
    $('listen-hint').textContent = 'O iPhone pausou o áudio — toque no círculo verde.';
  }
  $('listen-pulse').onclick = () => {
    if (!rec) return;
    rec.ctx.resume().then(() => { if (rec && rec.ctx.state === 'running') { listenMsg('A ouvir…', true); $('listen-hint').textContent = ''; } }).catch(() => {});
  };
  function tick() {
    if (!rec || !rec.stream) return;
    if (rec.ctx.state !== 'running') resumeAudio();
    const secs = (performance.now() - rec.started) / 1000;
    $('listen-bar').style.width = Math.min(100, Math.round(100 * secs / MAX_SECONDS)) + '%';
    // termina depois da tentativa final (aos 10 s); limite de segurança se a rede demorar
    if (!busy && (secs >= MAX_SECONDS && rec.lastSent >= MAX_SECONDS - 0.01 || secs >= MAX_SECONDS + 6)) { finish(); return; }
    const useCloud = !cloudFailed;
    if (!useCloud && !modelReady) return;
    if (busy || secs < FIRST_SECONDS) return;
    if (rec.lastSent && secs < MAX_SECONDS) return; // entre os 8 s e os 10 s só uma tentativa
    if (!busy && secs < FIRST_SECONDS + 0.5 && !heard) listenMsg('A transcrever…', true);
    const pcm = rec.chunks.length ? downsample(rec.chunks, rec.ctx.sampleRate).slice(-TARGET_RATE * BUFFER_SECONDS) : null;
    const pcmLevel = pcm ? rms(pcm.subarray(-TARGET_RATE * 3)) : 0;
    const hasMr = rec.mr && rec.mrChunks.length > 0;
    if (!(pcm && pcmLevel >= 0.0015) && !hasMr) {
      listenMsg(pcm ? 'Não oiço nada — aproxime o telemóvel' : 'Não está a chegar som do microfone', true);
      return;
    }
    rec.lastSent = Math.max(secs, rec.lastSent ? MAX_SECONDS : 0); busy = true;
    if (!heard) listenMsg('A ouvir e a transcrever…', true);
    if (useCloud) {
      const blob = pcm && pcmLevel >= 0.0015 ? encodeWav(pcm) : new Blob(rec.mrChunks, { type: rec.mr.mimeType || 'audio/mp4' });
      sendCloud(blob, rec.id);
    } else {
      if (!pcm) { busy = false; return; }
      const forced = chosenLang()[2];
      const language = forced || (rec.lang !== undefined ? rec.lang : rec.queue[rec.qi++ % rec.queue.length]);
      getWorker().postMessage({ type: 'transcribe', id: rec.id, audio: normalize(pcm), language });
    }
  }
  async function onTranscript(raw, language) {
    const t = cleanText(raw || '');
    if (!t || HALLUCINATIONS.test(t)) return;
    let res = [];
    try { res = await matchRemote(t); }
    catch (e) { if (e instanceof Limit) { listenMsg(e.message); stopRecording(); return; } }
    if (!rec) { if (!heard || (res[0] && res[0].score >= (lastMatch.score || 0))) { heard = t; lastMatch = { text: t, res, score: res[0] ? res[0].score : 0 }; } return; }
    const words = tok(t).length;
    const top = res[0], second = res[1];
    const score = top ? top.score : 0;
    if (!rec.best || score >= rec.best.score) { rec.best = { text: t, score, language }; lastMatch = { text: t, res, score }; }
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
    clearInterval(rec.timer); cancelAnimationFrame(rec.raf);
    try { if (rec.mr && rec.mr.state !== 'inactive') rec.mr.stop(); } catch (e) {}
    try { rec.src && rec.src.disconnect(); rec.proc && rec.proc.disconnect(); } catch (e) {}
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
  let lastMatch = { text: '', res: [], score: 0 };
  async function finishListening() {
    let res = lastMatch.text === heard ? lastMatch.res : null;
    if (!res) { try { res = await matchRemote(heard); } catch (e) { res = []; } }
    listenResult = { text: heard, res };
    heard = '';
    $('listen').hidden = true;
    $('search').value = ''; $('search-clear').hidden = true;
    if (location.hash === '#/ouvir') route(); else location.hash = '#/ouvir';
  }
  function closeListen() { stopRecording(); heard = ''; $('listen').hidden = true; }
  function showListenResults() {
    show('view-list');
    $('btn-back-list').hidden = false;
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
  window.cancioneiroMatch = matchRemote; // útil para testes
  window.cancioneiroHeard = t => { heard = t; finishListening(); };
  $('btn-mic').onclick = openListen;
  $('listen-cancel').onclick = closeListen;
  $('listen-stop').onclick = () => { if (rec) { if (heard) finish(); else listenMsg('Ainda a ouvir…', true); } else if (heard) finishListening(); else openListen(); };
  $('listen').addEventListener('click', e => { if (e.target === $('listen')) closeListen(); });

  // ---------- Vistas ----------
  function show(id) {
    for (const v of ['view-list', 'view-song', 'view-admin']) $(v).hidden = v !== id;
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
    if (q.trim()) {
      searchLyricsRemote(q);
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
        if (!n) return '';
        return (c.head ? `<li class="cat-head">${esc(c.head)}</li>` : '') +
          `<li><a href="#/lista/${c.id}"><span class="t">${esc(c.label)}</span><span class="n">${n}</span>${chev}</a></li>`;
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
    if (catId.startsWith('colecao-')) { showCollection(catId.slice(8)); return; }
    const bk = BOOKS_LIST.find(b => b.id === catId && b.id !== 'favoritos');
    if (bk) {
      title.hidden = false;
      title.textContent = bk.label;
      // livros pela ordem das páginas; os outros por título
      const pool = lvl() >= 2 ? allSongs : allSongs.filter(inCancioneiro);
      const list = pool.filter(bk.test).sort(bk.book
        ? (a, b) => pageIn(a, bk.book) - pageIn(b, bk.book) || a.title.localeCompare(b.title, 'pt')
        : (a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }));
      rows.innerHTML = list.map(s => bk.book ? songRow({ ...s, book_page: pageIn(s, bk.book) || null }) : songRow(s)).join('');
      return;
    }
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];
    title.hidden = false;
    const book = BOOKS.find(b => cat.id.startsWith(b.id + '-'));
    title.textContent = cat.id.startsWith('momento-') ? 'Coro — ' + cat.label : book ? book.head + ' — ' + cat.label : cat.label;
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
    const data = hasLyrics(slug) ? lyr.get(slug) : null;
    let wait = '';
    if (!data) {
      wait = '<p class="note lyr-wait">A carregar a letra…</p>';
      getLyrics(slug).then(() => { if (lastSongSlug === slug && !$('view-song').hidden) { const y = window.scrollY; showSong(slug); window.scrollTo(0, y); } })
        .catch(e => { const w = $('song').querySelector('.lyr-wait'); if (w) w.textContent = e instanceof Limit ? e.message : 'Não foi possível carregar a letra. Verifique a ligação à internet.'; });
    }
    const mode = s.has_translation ? (songView[slug] || 'orig') : 'orig';
    const langName = LANGS[s.language] || s.language;
    const trName = LANGS[s.translation_language] || 'Português';
    const sw = s.has_translation
      ? `<div class="lang-switch" role="group" aria-label="Idioma">
           <button data-mode="orig" class="${mode === 'orig' ? 'on' : ''}">${esc(langName)}</button>
           <button data-mode="trad" class="${mode === 'trad' ? 'on' : ''}">Tradução · ${esc(trName)}</button>
         </div>`
      : `<span class="lang-chip">${esc(langName)}</span>`;
    const scores = scoresOf(s);
    const pdf = scores.map((sc, i) => {
      const lbl = scores.length > 1 || pageOf(sc) ? `${sc.label}${scores.filter(x => x.label === sc.label).length > 1 ? ' ' + (i + 1) : ''}` : 'Partitura';
      return sc.url && /^https?:/.test(sc.url)
        ? `<a class="pdf" href="${esc(sc.url)}" target="_blank" rel="noopener">${esc(lbl)}</a>`
        : `<a class="pdf" href="#/cantico/${encodeURIComponent(slug)}/partitura${i ? '/' + i : ''}">${esc(lbl)}</a>`;
    }).join('');
    const srcs = (extrasOn() ? srcOf(s) : []).map(k => `<span class="src-chip src-${esc(k)}">${esc(SOURCES[k] || k)}</span>`).join('');
    const moments = (extrasOn() ? s.tags || [] : []).filter(t => t.grp === 'Coro CLU — momento').map(t => t.tag);
    const recs = filesOf(s, 'recording');
    const recHtml = recs.length ? `<section class="recs"><h2>Gravações</h2><ul>${recs.map((f, i) =>
      `<li><button class="rec" data-i="${i}" aria-label="Ouvir ${esc(f.label)}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button><span class="rl">${esc(f.label)}</span></li>`).join('')}</ul></section>` : '';
    // o perfil Cancioneiro não vê acordes
    const plain = st => lvl() < 2 ? (st || []).map(x => ({ ...x, lines: x.lines.map(stripChords) })) : st;
    const lyrics = plain(data ? data.lyrics : []);
    const body = plain((mode === 'trad' ? data && data.translation : lyrics) || []);
    const note = mode === 'trad' ? '<p class="note">Tradução</p>' : '';
    const edited = !!s.is_edited;
    const rights = extrasOn() && s.rights ? `<p class="rights">${esc(s.rights)}</p>` : '';
    // editar e promover: perfil Maestro ou superior (escondido na vista "Cancioneiro", que mostra os cânticos como eram)
    const canEdit = data && mode === 'orig' && lvl() >= 3 && extrasOn();
    const original = srcOf(s).includes('original');
    const editBar = canEdit
      ? `<p class="edit-bar">${edited ? `<span>Letra editada${s.edited_by ? ' por ' + esc(s.edited_by.split('@')[0]) : ''}${s.edited_at ? ' em ' + new Date(s.edited_at).toLocaleDateString('pt-PT') : ''}</span><button class="revert-link" id="btn-revert">Repor original</button>` : ''}<button class="edit-btn" id="btn-edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>Editar letra</button></p>`
      : '';
    $('song').innerHTML = `
      <h1>${esc(s.title)}</h1>
      ${s.author ? `<p class="author">${esc(s.author)}</p>` : ''}
      ${rights}
      <div class="meta">${sw}${pdf}</div>
      ${note}
      ${wait}
      ${renderStanzas(body)}
      ${editBar}
      ${recHtml}
      <p class="srcs">${srcs}${moments.length ? `<span class="moments">${esc(moments.join(' · '))}</span>` : ''}</p>
      <p class="num">${s.number}${s.book_page ? ` · pág. ${s.book_page} do livro` : ''}</p>`;
    $('song').querySelectorAll('button.rec').forEach(b => b.onclick = () => playRec(b, recs[+b.dataset.i]));
    $('song').classList.toggle('show-chords', prefs.chords && mode === 'orig');
    $('btn-chords').hidden = !(lyrics.some(st => st.lines.some(l => l.includes('['))) && mode === 'orig');
    if ($('btn-edit')) $('btn-edit').onclick = () => openEditor(slug);
    // o perfil Cancioneiro não pode copiar a letra (botão); ninguém pode selecionar o texto
    $('btn-copy').hidden = lvl() < 2;
    $('btn-copy').onclick = () => { if (data && lvl() >= 2) copyLyrics(s, body); };
    if ($('btn-revert')) $('btn-revert').onclick = () => revertLyrics(slug);
    const fb = $('btn-fav');
    fb.dataset.slug = slug;
    fb.onclick = () => lvl() >= 3 ? openSongCollections(slug) : toggleFav(slug);
    refreshFavUI();
    $('btn-chords').classList.toggle('on', prefs.chords);
    $('song').querySelectorAll('.lang-switch button').forEach(b => b.onclick = () => {
      songView[slug] = b.dataset.mode;
      const y = window.scrollY;
      showSong(slug);
      window.scrollTo(0, y);
    });
  }

  // ---------- Copiar letra (título, autor e a letra que está a ser mostrada, sem acordes) ----------
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 1800);
  }
  async function copyLyrics(s, stanzas) {
    // só as palavras: sem acordes (entre [ ] ou soltos), sem linhas só de acordes, sem sinais de repetição
    const CH = '(?:Do|Dó|Re|Ré|Mi|Fa|Fá|Sol|La|Lá|Si|[A-G])(?:#|b|♯|♭)?(?:m|-|maj7?|M7|sus\\d?|dim|aug|add\\d|\\+|º|°|\\d)*(?:/(?:Do|Re|Mi|Fa|Sol|La|Si|[A-G])(?:#|b)?)?';
    const onlyChords = new RegExp('^\\(?\\s*' + CH + '(?:\\s+\\(?' + CH + '\\)?)*\\s*\\)?$'); // sensível a maiúsculas: "la la la" é letra, não acordes
    const clean = l => stripChords(l).replace(/\|:|:\||[♪♫𝄆𝄇]/g, '').replace(new RegExp('\\(\\s*' + CH + '\\s*\\)', 'g'), '').replace(/\s+/g, ' ').trim();
    const text = [s.title, s.author || ''].filter(Boolean).join('\n') + '\n\n' +
      (stanzas || []).map(st => st.lines.map(clean).filter(l => l && !onlyChords.test(l)).join('\n')).filter(Boolean).join('\n\n') + '\n';
    try { await navigator.clipboard.writeText(text); }
    catch (e) { // alternativa para browsers sem acesso à área de transferência
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } finally { ta.remove(); }
    }
    toast('Letra copiada');
  }

  // ---------- Editar letra (guardada em lyrics_edit; histórico na tabela song_edits) ----------
  // Formato de texto: estrofes separadas por linha em branco; refrão começa por "R:"; acordes entre [ ].
  const toText = st => st.map(x => (x.type === 'chorus' ? 'R: ' : '') + x.lines.join('\n')).join('\n\n');
  function fromText(t) {
    return t.replace(/\r/g, '').split(/\n\s*\n/).map(b => b.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim()))
      .filter(b => b.length).map(b => {
        const chorus = /^R:\s*/i.test(b[0]);
        if (chorus) b[0] = b[0].replace(/^R:\s*/i, '');
        return { type: chorus ? 'chorus' : 'verse', lines: b.filter(l => l.trim()) };
      }).filter(x => x.lines.length);
  }
  let editSlug = null;
  function openEditor(slug) {
    const s = bySlug.get(slug);
    editSlug = slug;
    $('edit-title').textContent = s.title;
    $('edit-text').value = toText(lyricsOf(s));
    $('edit-msg').textContent = '';
    $('edit-reset').hidden = !s.is_edited;
    $('editor').showModal();
  }
  async function saveLyrics(value) {
    const s = bySlug.get(editSlug);
    $('edit-msg').textContent = 'A guardar…';
    for (const b of document.querySelectorAll('#editor button')) b.disabled = true;
    try {
      const d = await api('save', { slug: editSlug, lyrics_edit: value });
      Object.assign(s, { edited_by: d.edited_by, edited_at: d.edited_at, is_edited: !!d.is_edited });
      store.set(CACHE_KEY, allSongs.map(({ _t, _a, ...x }) => x));
      lyr.delete(editSlug); saveLyrCache(); // volta a pedir a letra (editada ou original)
      lyrIndex = null;
      $('editor').close();
      showSong(editSlug);
    } catch (e) {
      const msg = 'Não foi possível guardar: ' + (e.message || e);
      if ($('editor').open) $('edit-msg').textContent = msg; else alert(msg);
    } finally {
      for (const b of document.querySelectorAll('#editor button')) b.disabled = false;
    }
  }
  $('edit-save').onclick = () => {
    const st = fromText($('edit-text').value);
    if (!st.length) { $('edit-msg').textContent = 'A letra não pode ficar vazia.'; return; }
    saveLyrics(st);
  };
  function revertLyrics(slug) {
    if (!confirm('Repor a letra original deste cântico (como no site / pasta do Coro)? A edição fica no histórico.')) return;
    editSlug = slug;
    saveLyrics(null);
  }
  $('edit-reset').onclick = () => revertLyrics(editSlug);

  // ---------- Promover ao Cancioneiro (perfil Maestro) ----------
  async function promote(slug, on) {
    const s = bySlug.get(slug);
    if (!on && !confirm('Retirar este cântico do Cancioneiro? Quem tem o perfil Cancioneiro deixa de o ver.')) return;
    const b = $('btn-promo'); if (b) b.disabled = true;
    try {
      const d = await api('promote', { slug, on });
      Object.assign(s, d);
      store.set(CACHE_KEY, allSongs.map(({ _t, _a, ...x }) => x));
      applySource();
      toast(on ? 'Cântico promovido ao Cancioneiro' : 'Cântico retirado do Cancioneiro');
    } catch (e) { alert(e instanceof Limit ? e.message : 'Não foi possível guardar: ' + e.message); }
    if (lastSongSlug === slug && !$('view-song').hidden) { const y = window.scrollY; showSong(slug); window.scrollTo(0, y); }
  }

  // ---------- Perfis ----------
  const perfilKey = () => 'cancioneiro.perfil.' + (session ? session.user.id : 'anon');
  function applyPerfil() {
    const p = PERFIS[lvl() - 1];
    // quem só tem o perfil Cancioneiro não escolhe perfil: o botão é o "i" da informação
    const solo = rankOf(maxRole) <= 1;
    document.body.classList.toggle('solo', solo);
    $('btn-perfil').classList.toggle('info', solo);
    $('btn-perfil').querySelector('svg').innerHTML = p.icon;
    $('btn-perfil').setAttribute('aria-label', 'Perfil: ' + p.label);
    $('btn-perfil').title = 'Perfil: ' + p.label;
    if (solo) { $('btn-perfil').setAttribute('aria-label', 'Informação'); $('btn-perfil').title = 'Informação'; }
    for (const x of PERFIS) document.body.classList.toggle('perfil-' + x.id, x === p);
    document.body.classList.toggle('lvl-1', lvl() < 2);
    document.body.classList.toggle('lvl-lt3', lvl() < 3);
    document.body.classList.toggle('lvl-lt4', lvl() < 4);
    // informação: só os perfis que esta pessoa pode usar
    $('perfil-list').innerHTML = rankOf(maxRole) > 1 ? ' (' + PERFIS.slice(0, rankOf(maxRole)).map(x =>
      `<span class="nw"><svg class="ic perfil-ic" viewBox="0 0 24 24" aria-hidden="true">${x.icon}</svg>&nbsp;${esc(x.label)}</span>`).join(', ') + ')' : '';
    lyricHits = { q: '', map: new Map() };
    if (allSongs.length) applySource();
  }
  function setPerfil(id, save) {
    if (!rankOf(id) || rankOf(id) > rankOf(maxRole)) id = maxRole;
    const changed = id !== perfil;
    perfil = id;
    store.set(perfilKey(), { max: maxRole, active: perfil });
    applyPerfil();
    if (changed) route();
    if (save && session && !DEMO) sb.auth.updateUser({ data: { cancioneiro_perfil: id } }).catch(() => {});
  }
  // perfil da pessoa: guardado no telemóvel para abrir logo, e confirmado no servidor
  async function loadPerfil() {
    const c = store.get(perfilKey(), null);
    if (c && c.max) { maxRole = c.max; setPerfil(c.active); }
    let role = null;
    if (DEMO) role = new URLSearchParams(location.search).get('perfil') || 'gestor';
    else {
      try { const { data, error } = await sb.rpc('my_role'); if (error) return; role = data; } catch (e) { return; } // sem rede: fica o guardado
    }
    if (!rankOf(role)) return; // sem acesso: a lista vem vazia e load() termina a sessão
    maxRole = role;
    const meta = !DEMO && session && session.user.user_metadata || {};
    setPerfil((c && c.active) || meta.cancioneiro_perfil || maxRole);
  }
  function openPerfis() {
    const cur = PERFIS[lvl() - 1].id;
    $('perfis-list').innerHTML = PERFIS.slice(0, rankOf(maxRole)).map(p =>
      `<button class="perfil-opt${p.id === cur ? ' on' : ''}" data-p="${p.id}"><svg viewBox="0 0 24 24" class="perfil-ic">${p.icon}</svg><span><b>${esc(p.label)}</b><small>${esc(p.desc)}</small></span></button>`).join('') +
      (rankOf(cur) >= 3 ? `<a class="perfil-admin" href="#/gestao">Gestão de utilizadores ${chev}</a>` : '') +
      (rankOf(maxRole) && rankOf(maxRole) < PERFIS.length ? `<p class="small">O seu perfil é <b>${esc(PERFIS[rankOf(maxRole) - 1].label)}</b>. Pode usar este e os anteriores.</p>` : '');
    $('perfis-list').querySelectorAll('.perfil-opt').forEach(b => b.onclick = () => { setPerfil(b.dataset.p, true); $('perfis').close(); });
    $('perfis-list').querySelector('.perfil-admin')?.addEventListener('click', () => $('perfis').close());
    $('perfis').showModal();
  }
  $('btn-perfil').onclick = () => { if (rankOf(maxRole) <= 1) { $('info').showModal(); $('info').scrollTop = 0; } else openPerfis(); };

  // ninguém pode selecionar nem copiar o texto da letra (o botão de copiar, do perfil Coro para cima, continua a funcionar)
  const inSong = e => e.target && e.target.closest && e.target.closest('#song');
  for (const ev of ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart']) document.addEventListener(ev, e => { if (inSong(e)) e.preventDefault(); });

  // Modo claro / escuro: segue o telemóvel; o botão nas páginas dos cânticos escolhe o contrário
  // (se a escolha coincidir com a do telemóvel, volta a segui-lo)
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    if (prefs.theme) document.documentElement.dataset.theme = prefs.theme; else delete document.documentElement.dataset.theme;
  }
  $('btn-theme').onclick = () => {
    const dark = prefs.theme ? prefs.theme === 'dark' : darkMq.matches;
    const want = dark ? 'light' : 'dark';
    prefs.theme = (want === 'dark') === darkMq.matches ? undefined : want;
    applyTheme(); store.set('cancioneiro.prefs', prefs);
  };
  applyTheme();
  $('perfis-close').onclick = () => $('perfis').close();
  $('perfil-info').onclick = () => { $('perfis').close(); $('info').showModal(); $('info').scrollTop = 0; };
  $('perfil-info').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('perfil-info').click(); } };
  $('perfis').addEventListener('click', e => { if (e.target === $('perfis')) $('perfis').close(); });

  // ---------- Gestão de utilizadores (perfil Gestor) ----------
  const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-PT') : '';
  const roleSelect = (cur, attrs, max = 4) => `<select ${attrs}>${PERFIS.slice(0, max).map(p => `<option value="${p.id}"${p.id === cur ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select>`;
  async function showAdmin() {
    show('view-admin');
    const box = $('admin');
    if (lvl() < 3) { box.innerHTML = '<p class="note">Só os perfis Maestro e Gestor podem gerir utilizadores.</p>'; return; }
    const gestor = lvl() >= 4; // o Maestro só muda perfis entre Cancioneiro e Maestro (não vê os Gestores)
    if (!box.dataset.ready) box.innerHTML = '<p class="note">A carregar…</p>';
    let d;
    try { d = await api('users', {}); }
    catch (e) { box.innerHTML = `<p class="note">${esc(e instanceof Limit ? e.message : 'Não foi possível carregar: ' + e.message)}</p>`; return; }
    box.dataset.ready = '1';
    const users = d.users.slice().sort((a, b) => rankOf(b.role) - rankOf(a.role) || (a.name || a.email).localeCompare(b.name || b.email, 'pt'));
    box.innerHTML =
      (gestor && d.requests.length ? `<h2>Pedidos de acesso</h2><ul class="adm-list">${d.requests.map(q => `
        <li data-req="${esc(q.id)}" data-email="${esc(q.email)}"><div class="adm-who"><b>${esc(q.name || '(sem nome)')}</b><span>${esc(q.email)}</span><small>${fmtDate(q.created_at)}</small></div>
          <div class="adm-act">${roleSelect('cancioneiro', 'class="req-role" aria-label="Perfil"')}<button class="adm-ok">Autorizar</button><button class="adm-no">Recusar</button></div></li>`).join('')}</ul>` : '') +
      `<h2>Utilizadores (${users.length})</h2><ul class="adm-list">${users.map(u => `
        <li data-email="${esc(u.email)}"><div class="adm-who"><svg viewBox="0 0 24 24" class="perfil-ic">${PERFIS[rankOf(u.role) - 1].icon}</svg>
          <b class="adm-name"${gestor && !u.google_name ? ' role="button" tabindex="0" title="Mudar o nome (até a pessoa entrar com o Google)"' : ''}>${esc(u.name || u.google_name || '(sem nome)')}</b><span>${esc(u.email)}</span>
          <small>${u.last_sign_in_at ? 'Última entrada: ' + fmtDate(u.last_sign_in_at) : 'Ainda não entrou'}${u.email === d.me ? ' · (eu)' : ''}</small></div>
          ${u.role === 'gestor' && !d.owner && u.email !== d.me ? '<div class="adm-act"><small class="adm-lock">Só o administrador muda outro Gestor</small></div>'
            : `<div class="adm-act">${roleSelect(u.role, 'class="usr-role" aria-label="Perfil"', gestor ? 4 : 3)}${gestor ? '<button class="adm-del" aria-label="Retirar acesso">Retirar</button>' : ''}</div>`}</li>`).join('')}</ul>
      ${gestor ? `<h2>Acrescentar utilizador</h2>
      <form class="adm-add" id="adm-add">
        <input id="add-name" placeholder="Nome (o Google substitui ao entrar)" autocomplete="off" maxlength="80">
        <input id="add-email" type="email" placeholder="Email (conta Google)" autocomplete="off" required>
        ${roleSelect('cancioneiro', 'id="add-role" aria-label="Perfil"')}
        <button type="submit">Acrescentar</button>
      </form>` : ''}
      <p class="small">Os perfis são hierárquicos: <b>Cancioneiro</b> (só os cânticos do Cancioneiro, sem acordes, partituras nem gravações) &lt; <b>Coro</b> (tudo, sem editar) &lt; <b>Maestro</b> (edita letras, promove cânticos ao Cancioneiro e muda perfis entre Cancioneiro e Maestro) &lt; <b>Gestor</b> (gere todos os utilizadores; recebe os pedidos de acesso por email).</p>`;
    const call = async (op, body, msg) => {
      try { await api(op, body); if (msg) toast(msg); } catch (e) { alert(e instanceof Limit ? e.message : e.message); }
      showAdmin();
    };
    box.querySelectorAll('li[data-req]').forEach(li => {
      li.querySelector('.adm-ok').onclick = () => call('user', { email: li.dataset.email, role: li.querySelector('.req-role').value, name: li.querySelector('b').textContent.replace('(sem nome)', '') }, 'Acesso autorizado');
      li.querySelector('.adm-no').onclick = () => { if (confirm('Recusar este pedido? A conta fica bloqueada.')) call('reject', { id: li.dataset.req }, 'Pedido recusado'); };
    });
    box.querySelectorAll('li[data-email]:not([data-req])').forEach(li => {
      const email = li.dataset.email, sel = li.querySelector('.usr-role');
      if (!sel) return; // Gestor protegido
      const was = sel.value;
      sel.onchange = () => {
        if (!confirm(`Mudar o perfil de ${email} para ${PERFIS[rankOf(sel.value) - 1].label}?`)) { sel.value = was; return; }
        call('user', { email, role: sel.value }, 'Perfil alterado');
      };
      if (!gestor) return;
      li.querySelector('.adm-del').onclick = () => { if (confirm(`Retirar o acesso de ${email} ao Cancioneiro?`)) call('user', { email, remove: true }, 'Acesso retirado'); };
      const nm = li.querySelector('.adm-name[role=button]');
      if (!nm) return; // o nome vem do Google
      const rename = () => { const v = prompt('Nome:', nm.textContent === '(sem nome)' ? '' : nm.textContent); if (v !== null) call('user', { email, role: was, name: v }, 'Nome alterado'); };
      nm.onclick = rename; nm.onkeydown = e => { if (e.key === 'Enter') rename(); };
    });
    if (gestor) $('adm-add').onsubmit = e => {
      e.preventDefault();
      const email = $('add-email').value.trim().toLowerCase();
      if (users.some(u => u.email === email)) { alert('Este email já tem acesso.'); return; }
      call('user', { email, role: $('add-role').value, name: $('add-name').value.trim() }, 'Utilizador acrescentado');
    };
  }
  $('admin-back').onclick = () => { location.hash = '#/'; };
  $('edit-cancel').onclick = () => $('editor').close();

  // ---------- Ficheiros do Coro (gravações e partituras no Storage privado "coro") ----------
  const signed = new Map();
  // devolve { url } ou, nos livros, { pages: [{ n, url }] } (só as páginas do cântico)
  async function fileSrc(f) {
    if (f.url) return { url: f.url };
    const hit = signed.get(f.path);
    if (hit && hit.until > Date.now()) return hit.src;
    const src = await api('file', { path: f.path });
    signed.set(f.path, { src, until: Date.now() + 3300e3 });
    return src;
  }
  async function playRec(btn, f) {
    const li = btn.closest('li');
    let a = li.querySelector('audio');
    if (a) { if (a.paused) a.play(); else a.pause(); return; }
    document.querySelectorAll('.recs audio').forEach(x => x.pause());
    btn.classList.add('busy');
    try {
      a = document.createElement('audio');
      a.controls = true; a.preload = 'auto';
      a.src = (await fileSrc(f)).url;
      li.appendChild(a);
      a.addEventListener('play', () => { document.querySelectorAll('.recs audio').forEach(x => { if (x !== a) x.pause(); }); btn.classList.add('on'); });
      a.addEventListener('pause', () => btn.classList.remove('on'));
      await a.play().catch(() => {});
    } catch (e) {
      li.insertAdjacentHTML('beforeend', `<span class="rec-err">${esc(e instanceof Limit ? e.message : 'Não foi possível abrir a gravação.')}</span>`);
    }
    btn.classList.remove('busy');
  }

  // ---------- Partitura (PDF) dentro da app ----------
  // No iPhone, com a app no ecrã principal, abrir o PDF diretamente não deixa voltar atrás;
  // por isso os PDFs guardados no site são mostrados aqui, com botão "Voltar".
  const PDFJS = new URL('vendor/pdfjs/', location.href).href; // pdf.js 4.10.38 (cópia local)
  let pdfjs = null, pdfDoc = null, pdfBook = null, pdfZoom = 1, pdfRender = 0, pdfSlug = null, pdfUrl = null, pdfPage = 0;
  const pageOf = f => { const m = (f.path || '').match(/#p=(\d+)/); return m ? +m[1] : 0; };
  // Recortes do cântico no livro: "&c=364:0,0.044,0.5,0.47|365:…" (frações da página: x0,y0,x1,y1)
  const cropsOf = f => { const m = (f.path || '').match(/[#&]c=([^&]+)/); return m ? m[1].split('|').map(r => { const [pg, b] = r.split(':'); return [+pg, ...b.split(',').map(Number)]; }) : null; };
  let pdfCrops = null, pdfWhole = false;
  let lastSongSlug = null, songScroll = 0;
  async function loadPdfJs() {
    if (!pdfjs) {
      pdfjs = await import(PDFJS + 'pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
    }
    return pdfjs;
  }
  // src: { url } (um PDF ou imagem) ou { pages: [{ n, url }] } (páginas soltas de um livro, cada uma um PDF de 1 página)
  async function openPdf(src, title, slug, mime, page = 0, crops = null) {
    const key = JSON.stringify(src.pages ? src.pages.map(p => p.n) : src.url);
    const sameCrops = JSON.stringify(crops) === JSON.stringify(pdfCrops);
    pdfCrops = crops; pdfWhole = false;
    pdfSlug = slug;
    $('pdfview').hidden = false;
    document.body.classList.add('pdf-open');
    $('pdf-title').textContent = title;
    if (pdfUrl === key && (pdfDoc || pdfBook)) { if (pdfPage !== page || !sameCrops) { pdfPage = page; pdfZoom = 1; renderPdf(); } return; }
    pdfUrl = key; pdfDoc = null; pdfBook = null; pdfZoom = 1; pdfPage = page;
    $('pdfpages').innerHTML = '<p class="pdf-msg">A abrir a partitura…</p>';
    try {
      if (!src.pages && /^image\//.test(mime || '')) {
        $('pdfpages').innerHTML = `<img class="score-img" alt="" src="${esc(src.url)}">`;
        return;
      }
      const lib = await loadPdfJs();
      if (src.pages) {
        const docs = await Promise.all(src.pages.map(p => lib.getDocument({ url: p.url, isEvalSupported: false }).promise));
        pdfBook = new Map(src.pages.map((p, i) => [p.n, docs[i]]));
      } else pdfDoc = await lib.getDocument({ url: src.url, isEvalSupported: false }).promise;
      await renderPdf();
    } catch (e) {
      $('pdfpages').innerHTML = '<p class="pdf-msg">Não foi possível mostrar a partitura.</p>';
    }
  }
  // página n: num livro cada página é um PDF à parte (página 1 desse PDF)
  const pdfPageN = async n => pdfBook ? (pdfBook.has(n) ? pdfBook.get(n).getPage(1) : null) : (n >= 1 && n <= pdfDoc.numPages ? pdfDoc.getPage(n) : null);
  async function renderPdf() {
    try { await renderPdfInner(); } catch (e) { console.error('renderPdf', e); }
  }
  async function renderPdfInner() {
    if (!pdfDoc && !pdfBook) return;
    const id = ++pdfRender, box = $('pdfpages');
    box.innerHTML = '';
    const width = Math.min(box.clientWidth - 16, 900);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (pdfCrops && !pdfWhole) {
      // só a parte da página (ou páginas) onde está o cântico
      for (const [pg, x0, y0, x1, y1] of pdfCrops) {
        const page = await pdfPageN(pg);
        if (id !== pdfRender) return;
        if (!page) continue;
        const v1 = page.getViewport({ scale: 1 });
        const cw = (x1 - x0) * v1.width, chh = (y1 - y0) * v1.height;
        const scale = width / cw * pdfZoom;
        let r = dpr;
        while (r > 1 && cw * scale * r * chh * scale * r > 12e6) r -= 0.5;
        const vp = page.getViewport({ scale: scale * r });
        const c = document.createElement('canvas');
        c.width = Math.floor(cw * scale * r); c.height = Math.floor(chh * scale * r);
        c.style.width = Math.floor(cw * scale) + 'px'; c.style.height = Math.floor(chh * scale) + 'px';
        box.appendChild(c);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: [1, 0, 0, 1, -x0 * vp.width, -y0 * vp.height] }).promise;
      }
      if (id !== pdfRender) return;
      const more = document.createElement('p');
      more.className = 'pdf-more';
      more.innerHTML = '<button type="button">Ver a página inteira</button>';
      more.firstChild.onclick = () => { pdfWhole = true; renderPdf(); };
      box.appendChild(more);
      return;
    }
    // num livro mostra só as páginas do cântico (as que o servidor enviou)
    const list = pdfBook ? [...pdfBook.keys()].sort((a, b) => a - b) : Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);
    for (const i of list) {
      const page = await pdfPageN(i);
      if (id !== pdfRender) return;
      if (!page) continue;
      const v1 = page.getViewport({ scale: 1 });
      const scale = width / v1.width * pdfZoom;
      let r = dpr;
      while (r > 1 && v1.width * scale * r * v1.height * scale * r > 12e6) r -= 0.5; // limite de memória do iPhone
      const vp = page.getViewport({ scale: scale * r });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.width = Math.floor(vp.width / r) + 'px'; c.style.height = Math.floor(vp.height / r) + 'px';
      box.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  }
  function closePdf() {
    if ($('pdfview').hidden) return;
    $('pdfview').hidden = true;
    document.body.classList.remove('pdf-open');
    pdfRender++;
  }
  $('pdf-back').onclick = () => {
    if (history.length > 1 && lastSongSlug === pdfSlug) history.back();
    else location.hash = '#/cantico/' + encodeURIComponent(pdfSlug);
  };
  const zoomImg = () => { const im = $('pdfpages').querySelector('.score-img'); if (im) im.style.width = (pdfZoom * 100) + '%'; };
  $('pdf-zoom-in').onclick = () => { pdfZoom = Math.min(3, pdfZoom + 0.5); renderPdf(); zoomImg(); };
  $('pdf-zoom-out').onclick = () => { pdfZoom = Math.max(1, pdfZoom - 0.5); renderPdf(); zoomImg(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('pdfview').hidden) $('pdf-back').click(); });
  let pdfResize;
  addEventListener('resize', () => { if (!$('pdfview').hidden) { clearTimeout(pdfResize); pdfResize = setTimeout(renderPdf, 250); } });

  // ---------- Router ----------
  let lastListHash = '#/';
  function route() {
    if (!session) return;
    const h = location.hash || '#/';
    const m = h.match(/^#\/cantico\/([^/]+)(\/partitura(?:\/(\d+))?)?$/);
    if (m) {
      const slug = decodeURIComponent(m[1]);
      if (m[2]) {
        if (lastSongSlug !== slug || $('view-song').hidden) showSong(slug);
        songScroll = window.scrollY;
        const s = bySlug.get(slug);
        const sc = s && scoresOf(s)[+(m[3] || 0)];
        if (sc) {
          const key = h;
          (async () => {
            try {
              const src = await fileSrc(sc);
              if (location.hash === key) openPdf(src, s.title, slug, sc.mime, pageOf(sc), cropsOf(sc));
            } catch (e) {
              $('pdfview').hidden = false; document.body.classList.add('pdf-open'); $('pdf-title').textContent = s.title;
              $('pdfpages').innerHTML = `<p class="pdf-msg">${esc(e instanceof Limit ? e.message : 'Não foi possível abrir a partitura.')}</p>`;
            }
          })();
        }
        return;
      }
      const back = !$('pdfview').hidden && lastSongSlug === slug;
      closePdf();
      showSong(slug); lastSongSlug = slug;
      window.scrollTo(0, back ? songScroll : 0);
      return;
    }
    closePdf();
    if (h === '#/gestao') { showAdmin(); window.scrollTo(0, 0); return; }
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
  // ---------- Coleções (criadas por um Maestro, para o Cancioneiro ou o Coro, por um tempo limitado) ----------
  const DURS = { '24h': ['24 horas', 864e5], '48h': ['48 horas', 1728e5], '1w': ['1 semana', 6048e5], '1m': ['1 mês', 2592e6] };
  let cols = [];
  const colsKey = () => 'cancioneiro.colecoes.' + (session ? session.user.id : 'anon');
  const expired = c => Date.parse(c.expires_at) <= Date.now();
  const colVisible = c => (lvl() >= 3 || !expired(c)) && (c.audience === 'cancioneiro' || lvl() >= 2);
  const colSongs = c => (c.songs || []).slice().sort((a, b) => a.position - b.position);
  const colFits = () => true; // qualquer cântico pode entrar numa coleção (o público Cancioneiro passa a vê-lo enquanto a coleção durar)
  // cânticos de coleções ativas para o Cancioneiro: visíveis também no perfil Cancioneiro
  const colExtra = () => new Set(cols.filter(c => !expired(c) && c.audience === 'cancioneiro').flatMap(c => (c.songs || []).map(x => x.song_slug)));
  async function loadCollections() {
    if (!cols.length) cols = store.get(colsKey(), []);
    if (DEMO) { cols = store.get('cancioneiro.demo.cols', []); return; }
    try {
      const { data, error } = await sb.from('collections').select('id,title,audience,duration,expires_at,created_by,songs:collection_songs(song_slug,position)').order('created_at');
      if (!error && data) { cols = data; store.set(colsKey(), cols); }
    } catch (e) { /* sem rede: fica a cópia */ }
    if (lvl() < 2 && allSongs.length) applySource();
  }
  const demoSave = () => store.set('cancioneiro.demo.cols', cols);
  function renderCollectionsMenu() {
    const vis = cols.filter(colVisible);
    if (!vis.length && lvl() < 3) return '';
    return vis.map(c => `<li><a href="#/lista/colecao-${c.id}"><span class="t">${esc(c.title)}${expired(c) ? ' <small>(expirada)</small>' : ''}</span><span class="n">${colSongs(c).filter(x => bySlug.has(x.song_slug)).length}</span>${chev}</a></li>`).join('') +
      (lvl() >= 3 ? `<li><button class="col-new"><span class="t">+ Nova coleção</span></button></li>` : '');
  }
  function showCollection(id) {
    const c = cols.find(x => x.id === id);
    const title = $('list-title'), rows = $('rows');
    title.hidden = false;
    if (!c || !colVisible(c)) { title.textContent = 'Coleção'; rows.innerHTML = ''; $('status').textContent = c ? 'Esta coleção já não está disponível.' : 'A carregar…'; if (!c) loadCollections().then(() => { if (location.hash === '#/lista/colecao-' + id) showCollection(id); }); return; }
    const can = lvl() >= 3;
    const fim = new Date(c.expires_at);
    title.innerHTML = `${esc(c.title)}${can ? ' <button class="col-edit" id="col-edit">Editar</button>' : ''}<small class="col-meta">${c.audience === 'coro' ? 'Coro' : 'Cancioneiro'} · ${expired(c) ? 'expirou' : 'até'} ${fim.toLocaleDateString('pt-PT')} ${fim.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</small>`;
    const list = colSongs(c).map(x => bySlug.get(x.song_slug)).filter(Boolean);
    rows.innerHTML = list.map((s, i) => {
      const row = songRow(s);
      if (!can) return row;
      return row.replace('<li>', `<li class="swipe" data-slug="${esc(s.slug)}"><div class="sw-actions"><button data-a="up" aria-label="Subir"${i ? '' : ' disabled'}>↑</button><button data-a="down" aria-label="Descer"${i < list.length - 1 ? '' : ' disabled'}>↓</button><button data-a="del" class="sw-del" aria-label="Remover da coleção"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg></button></div><button class="sw-more" aria-label="Opções">⋯</button>`);
    }).join('');
    if (!list.length) $('status').textContent = can ? 'Coleção vazia. Abra um cântico e use "Adicionar a uma coleção".' : 'Coleção vazia.';
    if (can) {
      $('col-edit').onclick = () => openCollectionDlg(c);
      rows.querySelectorAll('li.swipe').forEach(li => bindSwipe(li, c));
    }
  }
  // deslizar para a esquerda mostra: Remover, Subir, Descer (no computador: botão ⋯)
  function bindSwipe(li, c) {
    const a = li.querySelector('a'); let x0 = null, dx = 0;
    const close = () => li.classList.remove('open');
    a.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; dx = 0; a.style.transition = 'none'; li.classList.add('drag'); }, { passive: true });
    a.addEventListener('touchmove', e => { if (x0 == null) return; dx = e.touches[0].clientX - x0; if (dx < 0 || li.classList.contains('open')) a.style.transform = `translateX(${Math.max(-144, Math.min(0, dx + (li.classList.contains("open") ? -144 : 0)))}px)`; }, { passive: true });
    a.addEventListener('touchend', () => { a.style.transition = ''; a.style.transform = ''; setTimeout(() => li.classList.remove('drag'), 220); if (dx < -40) { $('rows').querySelectorAll('li.open').forEach(x => x !== li && x.classList.remove('open')); li.classList.add('open'); } else if (dx > 30) close(); x0 = null; });
    a.addEventListener('click', e => { if (Math.abs(dx) > 10 || li.classList.contains('open')) { e.preventDefault(); if (Math.abs(dx) <= 10) close(); } });
    li.querySelector('.sw-more').onclick = e => { e.stopPropagation(); li.classList.toggle('open'); };
    li.querySelectorAll('.sw-actions button').forEach(b => b.onclick = e => {
      e.stopPropagation(); // o toque nos botões não fecha a linha
      // remover pede confirmação: o caixote passa a ✓ e é preciso tocar outra vez
      if (b.dataset.a === 'del' && !b.classList.contains('confirm')) {
        b.classList.add('confirm'); b.setAttribute('aria-label', 'Confirmar remoção');
        b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
        setTimeout(() => { if (b.isConnected && b.classList.contains('confirm')) { b.classList.remove('confirm'); b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>'; } }, 4000);
        return;
      }
      colAction(c, li.dataset.slug, b.dataset.a);
    });
  }
  async function colAction(c, slug, act) {
    const list = colSongs(c), i = list.findIndex(x => x.song_slug === slug);
    try {
      if (act === 'del') {
        if (!DEMO) { const { error } = await sb.from('collection_songs').delete().eq('collection_id', c.id).eq('song_slug', slug); if (error) throw error; }
        c.songs = c.songs.filter(x => x.song_slug !== slug);
      } else {
        const j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= list.length) return;
        const A = list[i], B = list[j], pa = A.position, pb = B.position === pa ? pa + (act === 'up' ? -1 : 1) : B.position;
        if (!DEMO) {
          const r1 = await sb.from('collection_songs').update({ position: pb }).eq('collection_id', c.id).eq('song_slug', A.song_slug);
          const r2 = await sb.from('collection_songs').update({ position: pa }).eq('collection_id', c.id).eq('song_slug', B.song_slug);
          if (r1.error || r2.error) throw (r1.error || r2.error);
        }
        A.position = pb; B.position = pa;
      }
      if (DEMO) demoSave(); else store.set(colsKey(), cols);
    } catch (e) { alert('Não foi possível guardar: ' + (e.message || e)); }
    showCollection(c.id);
  }
  // criar / editar uma coleção
  let dlgCol = null;
  function openCollectionDlg(c) {
    dlgCol = c;
    $('col-dlg-title').textContent = c ? 'Editar coleção' : 'Nova coleção';
    $('col-name').value = c ? c.title : '';
    $('col-aud').value = c ? c.audience : 'coro';
    $('col-dur').value = c ? c.duration : '1w';
    $('col-del').hidden = !c;
    $('col-msg').textContent = (c ? `Ao guardar, a coleção fica disponível durante ${DURS[c.duration][0]} a partir de agora. ` : '') + 'Um mês depois de expirar, a coleção é apagada.';
    $('col-dlg').showModal();
  }
  async function saveCollection() {
    const title = $('col-name').value.trim().slice(0, 80);
    if (!title) { $('col-msg').textContent = 'Escreva um título.'; return; }
    const audience = $('col-aud').value, duration = $('col-dur').value;
    const row = { title, audience, duration, expires_at: new Date(Date.now() + DURS[duration][1]).toISOString() };
    try {
      if (DEMO) {
        if (dlgCol) Object.assign(dlgCol, row); else cols.push({ id: 'demo' + Date.now(), ...row, songs: [] });
        demoSave();
      } else if (dlgCol) {
        const { error } = await sb.from('collections').update(row).eq('id', dlgCol.id); if (error) throw error;
        Object.assign(dlgCol, row);
      } else {
        const { data, error } = await sb.from('collections').insert(row).select('id,title,audience,duration,expires_at,created_by').single(); if (error) throw error;
        cols.push({ ...data, songs: [] });
      }
      if (!DEMO) store.set(colsKey(), cols);
      $('col-dlg').close();
      const id = dlgCol ? dlgCol.id : cols[cols.length - 1].id;
      location.hash = '#/lista/colecao-' + id; route();
    } catch (e) { $('col-msg').textContent = 'Não foi possível guardar: ' + (e.message || e); }
  }
  async function deleteCollection() {
    if (!dlgCol || !confirm(`Apagar a coleção «${dlgCol.title}»? Os cânticos não são apagados.`)) return;
    try {
      if (!DEMO) { const { error } = await sb.from('collections').delete().eq('id', dlgCol.id); if (error) throw error; }
      cols = cols.filter(x => x !== dlgCol); if (DEMO) demoSave(); else store.set(colsKey(), cols);
      $('col-dlg').close(); location.hash = '#/';
    } catch (e) { $('col-msg').textContent = 'Não foi possível apagar: ' + (e.message || e); }
  }
  $('col-save').onclick = saveCollection;
  $('col-cancel').onclick = () => $('col-dlg').close();
  $('col-del').onclick = deleteCollection;
  // no cântico: adicionar a uma coleção (ou escolher entre várias)
  const fitting = s => cols.filter(c => colVisible(c) && colFits(c, s));
  function colLabel(s) {
    const f = fitting(s), inn = f.filter(c => (c.songs || []).some(x => x.song_slug === s.slug));
    if (f.length === 1) return inn.length ? `Na coleção «${esc(f[0].title)}» ✓ — retirar` : `Adicionar à coleção «${esc(f[0].title)}»`;
    return inn.length ? `Em ${inn.length} coleç${inn.length > 1 ? 'ões' : 'ão'} ✓ — gerir` : 'Adicionar a uma coleção';
  }
  async function toggleInCollection(c, slug, on) {
    if (on) {
      const pos = Math.max(0, ...(c.songs || []).map(x => x.position)) + 1;
      if (!DEMO) { const { error } = await sb.from('collection_songs').insert({ collection_id: c.id, song_slug: slug, position: pos }); if (error && !/duplicate/i.test(error.message)) throw error; }
      c.songs = (c.songs || []).filter(x => x.song_slug !== slug).concat({ song_slug: slug, position: pos });
    } else {
      if (!DEMO) { const { error } = await sb.from('collection_songs').delete().eq('collection_id', c.id).eq('song_slug', slug); if (error) throw error; }
      c.songs = (c.songs || []).filter(x => x.song_slug !== slug);
    }
    if (DEMO) demoSave(); else store.set(colsKey(), cols);
  }
  async function openAddToCollection(slug) {
    const s = bySlug.get(slug), f = fitting(s);
    const refresh = () => { if (lastSongSlug === slug && !$('view-song').hidden) { const y = window.scrollY; showSong(slug); window.scrollTo(0, y); } };
    if (!f.length) { if (confirm('Ainda não há coleções onde este cântico possa entrar. Criar uma nova coleção?')) openCollectionDlg(null); return; }
    if (f.length === 1) {
      const on = !(f[0].songs || []).some(x => x.song_slug === slug);
      try { await toggleInCollection(f[0], slug, on); toast(on ? 'Adicionado à coleção' : 'Retirado da coleção'); } catch (e) { alert('Não foi possível guardar: ' + (e.message || e)); }
      refresh(); return;
    }
    $('col-pick-list').innerHTML = f.map(c => `<label class="col-pick"><input type="checkbox" data-id="${esc(c.id)}"${(c.songs || []).some(x => x.song_slug === slug) ? ' checked' : ''}><span>${esc(c.title)}<small>${c.audience === 'coro' ? 'Coro' : 'Cancioneiro'}</small></span></label>`).join('');
    $('col-pick-list').querySelectorAll('input').forEach(i => i.onchange = async () => {
      try { await toggleInCollection(cols.find(c => c.id === i.dataset.id), slug, i.checked); } catch (e) { i.checked = !i.checked; alert('Não foi possível guardar: ' + (e.message || e)); }
      refresh();
    });
    $('col-pick').showModal();
  }
  $('col-pick-close').onclick = () => $('col-pick').close();
  // Maestro: livro no cântico → Preferidos, Cancioneiro (promover/retirar) e coleções ativas
  function openSongCollections(slug) {
    const s = bySlug.get(slug); if (!s) return;
    const original = srcOf(s).includes('original');
    const act = cols.filter(c => !expired(c) && colVisible(c));
    const item = (key, label, sub, checked, disabled) => `<label class="col-pick${disabled ? ' dis' : ''}"><input type="checkbox" data-k="${esc(key)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>`;
    $('col-pick-list').innerHTML =
      item('fav', 'Preferidos', 'Os seus cânticos preferidos', isFav(slug), false) +
      item('cancioneiro', 'Cancioneiro', original ? 'Do Cancioneiro original' : inCancioneiro(s) ? 'Promovido' + (s.promoted_by ? ' por ' + s.promoted_by.split('@')[0] : '') : 'Promover ao Cancioneiro', inCancioneiro(s), original) +
      act.map(c => item('c:' + c.id, c.title, `${c.audience === 'coro' ? 'Coro' : 'Cancioneiro'} · até ${new Date(c.expires_at).toLocaleDateString('pt-PT')}`, (c.songs || []).some(x => x.song_slug === slug), false)).join('') +
      `<button class="col-pick-new" id="col-pick-new">+ Nova coleção</button>`;
    const refresh = () => { refreshFavUI(); if (lastSongSlug === slug && !$('view-song').hidden) { const y = window.scrollY; showSong(slug); window.scrollTo(0, y); } };
    $('col-pick-list').querySelectorAll('input').forEach(i => i.onchange = async () => {
      const k = i.dataset.k;
      try {
        if (k === 'fav') { if (isFav(slug) !== i.checked) await toggleFav(slug); }
        else if (k === 'cancioneiro') { await promote(slug, i.checked); i.checked = inCancioneiro(bySlug.get(slug)); }
        else await toggleInCollection(cols.find(c => c.id === k.slice(2)), slug, i.checked);
      } catch (e) { i.checked = !i.checked; alert('Não foi possível guardar: ' + (e.message || e)); }
      refresh();
    });
    $('col-pick-new').onclick = () => { $('col-pick').close(); openCollectionDlg(null); };
    $('col-pick').showModal();
  }
  document.addEventListener('click', e => { if (!e.target.closest('li.swipe')) document.querySelectorAll('#rows li.open').forEach(x => x.classList.remove('open')); });

  // Gaveta: os livros (Preferidos, Cancioneiro e, do perfil Coro para cima, Coro, Songbook e CANTI 2024)
  const BOOKS_LIST = [
    { id: 'favoritos', label: 'Preferidos', icon: '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6 6.7 19.5l1.1-5.9L3.4 9.5l6-.8z"/>', test: s => isFav(s.slug) },
    { id: 'livro-cancioneiro', label: 'Cancioneiro', test: s => inCancioneiro(s) },
    { id: 'livro-coro', label: 'Coro', coro: true, test: s => srcOf(s).includes('coro_clu') },
    { id: 'livro-songbook', label: 'Songbook', coro: true, book: 'songbook', test: s => srcOf(s).includes('songbook') },
    { id: 'livro-canti', label: 'CANTI 2024', coro: true, book: 'canti2024', test: s => srcOf(s).includes('canti2024') },
  ];
  // página de um cântico num livro (do endereço da página: livros/<livro>.pdf#p=N)
  const pageIn = (s, book) => { const f = (s.files || []).find(f => f.path.startsWith(`livros/${book}.pdf`)); return f ? +(f.path.match(/[#&]p=(\d+)/) || [])[1] || 0 : 0; };
  function renderBooks() {
    $('az').innerHTML = BOOKS_LIST.filter(b => !b.coro || lvl() >= 2).map(b => {
      const n = allSongs.filter(s => (lvl() >= 2 || inCancioneiro(s)) && b.test(s)).length;
      return `<li><a href="#/lista/${b.id}">${b.icon ? `<svg class="book-ic" viewBox="0 0 24 24">${b.icon}</svg>` : ''}<span class="t">${esc(b.label)}</span><span class="n">${n}</span>${chev}</a></li>`;
    }).join('') + renderCollectionsMenu();
    const nb = $('az').querySelector('.col-new'); if (nb) nb.onclick = () => { closeDrawer(); openCollectionDlg(null); };
  }
  function openDrawer() {
    renderBooks(); loadCollections().then(() => { if ($('drawer').classList.contains('open')) renderBooks(); });
    $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); }
  $('btn-menu').onclick = () => { $('search').value = ''; $('search-clear').hidden = true; openDrawer(); };
  $('drawer-close').onclick = closeDrawer;
  $('drawer-scrim').onclick = closeDrawer;
  $('az').addEventListener('click', e => { if (e.target.closest('a')) closeDrawer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  const closeInfo = () => $('info').close();
  $('info-x').onclick = closeInfo;
  $('info-close').onclick = closeInfo;
  $('info').addEventListener('click', e => { // toque fora da janela (no fundo escurecido)
    const r = $('info').getBoundingClientRect();
    if (e.target === $('info') && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) closeInfo();
  });
  // Vista escolhida no ⓘ (Tudo / Cancioneiro / Coro / …): guardada na conta de cada pessoa (user_metadata),
  // para ser a mesma em todos os seus dispositivos e não passar para outra pessoa no mesmo telemóvel
  function setSource(v) {
    prefs.src = v; store.set('cancioneiro.prefs', prefs);
    applySource(); route();
    if (session && !DEMO) sb.auth.updateUser({ data: { cancioneiro_vista: v } }).catch(() => {});
  }
  function useSource(meta) {
    const v = (meta || {}).cancioneiro_vista || 'todas';
    if (v !== prefs.src) { prefs.src = v; store.set('cancioneiro.prefs', prefs); if (allSongs.length) { applySource(); route(); } }
  }
  async function restoreSource() {
    useSource(session && session.user.user_metadata); // já (da sessão guardada)…
    try { const { data } = await sb.auth.getUser(); if (data && data.user) useSource(data.user.user_metadata); } catch (e) { /* sem rede */ } // …e confirmado no servidor
  }
  $('src-filter').onchange = e => setSource(e.target.value);
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

  // texto de ajuda da pesquisa ajustado à largura do ecrã
  function fitPlaceholder() {
    const w = innerWidth;
    $('search').placeholder = w < 380 ? 'PROCURAR' : w < 520 ? 'PROCURAR CÂNTICO OU LETRA' : 'PROCURAR CÂNTICO, AUTOR OU LETRA';
  }
  fitPlaceholder();
  addEventListener('resize', fitPlaceholder);
  addEventListener('orientationchange', fitPlaceholder);
  applyFont();
  // Capa verde com "CANCIONEIRO" durante 2 s ao abrir (não quando se regressa do Google)
  const fromGoogle = /[?&](code|error)=/.test(location.search);
  const splashDone = new Promise(r => setTimeout(r, fromGoogle ? 0 : 2000));
  $('btn-logout').onclick = () => logout();
  sb.auth.onAuthStateChange((event, s) => {
    if (DEMO) return;
    session = s;
    if (event === 'SIGNED_OUT' && $('view-login').hidden) showLogin();
  });
  (async () => {
    await accessToken(); // também troca o ?code= do regresso do Google pela sessão
    if (location.search.includes('code=') || location.search.includes('error')) {
      const err = new URLSearchParams(location.search).get('error_description');
      history.replaceState(null, '', location.pathname + location.hash);
      if (err && !session) { showLogin('Não foi possível entrar: ' + err); return; }
    }
    await splashDone;
    if (!session) { showLogin(); return; }
    $('view-login').hidden = true;
    $('splash').classList.add('gone');
    $('info-user').textContent = 'Sessão: ' + session.user.email;
    loadLyrCache();
    await Promise.race([loadPerfil(), new Promise(r => setTimeout(r, 1500))]); // sem esperar muito se a rede estiver lenta
    if (!DEMO) restoreSource();
    showList();
    load();
    loadFavs();
    loadCollections();
    loadSyncInfo();
  })();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  // se a folha de estilos falhou (página sem formatação), recarrega uma vez
  addEventListener('load', () => {
    const styled = getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)';
    try {
      if (!styled && !sessionStorage.getItem('cancioneiro.reload')) { sessionStorage.setItem('cancioneiro.reload', '1'); location.reload(); }
      else if (styled) sessionStorage.removeItem('cancioneiro.reload');
    } catch (e) {}
  });

  // Sem zoom com dois dedos nas páginas da app (só nas partituras); o iPhone ignora user-scalable, por isso trava-se o gesto
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => { if ($('pdfview').hidden) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 && $('pdfview').hidden) e.preventDefault(); }, { passive: false });

  // ---------- Puxar para baixo, segurar 5 s e largar: atualiza a app para a versão mais recente ----------
  // (o service worker vai sempre primeiro à rede, por isso recarregar traz a última versão publicada)
  const ptr = document.createElement('div');
  ptr.className = 'ptr'; ptr.setAttribute('aria-hidden', 'true');
  ptr.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  document.body.appendChild(ptr);
  const PULL = 80, HOLD = 5000; // px a puxar e tempo a segurar
  let pullY = null, pulled = 0, holdTimer = null, ready = false, refreshing = false;
  const blocked = () => refreshing || document.querySelector('dialog[open]') || !$('pdfview').hidden || !$('listen').hidden || $('drawer').classList.contains('open') || !$('splash').classList.contains('gone');
  const resetPull = () => { clearTimeout(holdTimer); holdTimer = null; ready = false; ptr.classList.remove('on'); };
  addEventListener('touchstart', e => { resetPull(); pullY = window.scrollY <= 0 && e.touches.length === 1 && !blocked() ? e.touches[0].clientY : null; pulled = 0; }, { passive: true });
  addEventListener('touchmove', e => {
    if (pullY == null) return;
    if (window.scrollY > 0) { pullY = null; resetPull(); return; }
    pulled = Math.max(0, e.touches[0].clientY - pullY);
    if (pulled >= PULL && !holdTimer && !ready) holdTimer = setTimeout(() => { if (pullY != null) { ready = true; ptr.classList.add('on'); } }, HOLD);
    else if (pulled < PULL && !ready) { clearTimeout(holdTimer); holdTimer = null; }
  }, { passive: true });
  // o iPhone cancela o toque quando a página passa a deslizar: nesse caso não há atualização
  addEventListener('touchcancel', () => { pullY = null; resetPull(); }, { passive: true });
  addEventListener('touchend', async () => {
    if (pullY == null) { resetPull(); return; }
    pullY = null;
    if (!ready) { resetPull(); return; }
    refreshing = true;
    // procura a versão nova; se houver, espera que fique ativa antes de recarregar (senão os ficheiros podem falhar a meio da troca)
    try {
      const r = await navigator.serviceWorker?.getRegistration(); await r?.update();
      if (r && (r.installing || r.waiting)) await new Promise(res => { navigator.serviceWorker.addEventListener('controllerchange', res, { once: true }); setTimeout(res, 4000); });
    } catch (e) { /* sem rede */ }
    location.reload();
  });
})();
