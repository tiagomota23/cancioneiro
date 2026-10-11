(() => {
  'use strict';
  // a app não pode ser mostrada dentro de outra página (evita cliques enganados)
  if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.location.href; } catch (e) {} throw new Error('framed'); } // não pode ser mostrado dentro de outra página

  const LANGS = {
    pt: 'Português', it: 'Italiano', en: 'Inglês', la: 'Latim', es: 'Espanhol', fr: 'Francês',
    gl: 'Galego-português', cu: 'Eslavo eclesiástico', fur: 'Friulano', nap: 'Napolitano', ln: 'Lingala', ru: 'Russo', sw: 'Suaíli', de: 'Alemão', xx: 'Outra língua',
  };
  // Fontes dos cânticos (tabela song_sources). "original" = cancioneiro.marriaga.com
  const SOURCES = { original: 'Cancioneiro', coro_clu: 'Coro', songbook: 'Songbook', canti2024: 'CANTI 2024', novos: 'Novos Cânticos' };
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
    { id: 'maestro', label: 'Maestro', desc: 'Editar letras e promover cânticos ao Cancioneiro', icon: '<circle cx="12" cy="12" r="7.5" style="fill:currentColor"/>' + letter('M').replace('fill:currentColor', 'fill:var(--ic-bg)') },
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
    { id: 'todos', label: 'Todos os cânticos', short: 'Todos os cânticos', test: () => true },
    { id: 'pt', lang: 'pt', label: 'Cânticos em português', test: s => s.language === 'pt' || s.language === 'gl' },
    { id: 'it', lang: 'it', label: 'Cânticos italianos', test: s => s.language === 'it' || s.language === 'nap' || s.language === 'fur' },
    { id: 'la', lang: 'la', label: 'Cânticos em latim', test: s => s.language === 'la' },
    { id: 'en', lang: 'en', label: 'Cânticos ingleses, irlandeses e americanos', test: s => s.language === 'en' },
    { id: 'es', lang: 'es', label: 'Cânticos espanhóis e sul-americanos', test: s => s.language === 'es' },
    { id: 'fr', lang: 'fr', label: 'Cânticos franceses', test: s => s.language === 'fr' },
    { id: 'outros', lang: 'xx', label: 'Outras línguas', test: s => ['cu', 'ln', 'ru', 'sw', 'de', 'xx'].includes(s.language) },
    { id: 'traducao', label: 'Cânticos com tradução', test: s => !!s.has_translation },
    { id: 'acordes', label: 'Cânticos com acordes', test: s => lvl() >= 2 && s.has_chords },
    { id: 'partituras', label: 'Cânticos com partitura', test: s => scoresOf(s).length > 0 },
    { id: 'gravacoes', label: 'Cânticos com gravações das vozes', test: s => filesOf(s, 'recording').length > 0 },
    { id: 'copyright', label: 'Cânticos com copyright', test: s => extrasOn() && !!s.rights },
    { id: 'coro-missa', tg: ['Coro CLU', 'Para a Missa'], head: 'Coro', label: 'Coro — para a Missa', test: s => hasTag(s, 'Coro CLU', 'Para a Missa') },
    { id: 'coro-gestos', tg: ['Coro CLU', 'Para Gestos'], label: 'Coro — para Gestos', test: s => hasTag(s, 'Coro CLU', 'Para Gestos') },
    { id: 'coro-outras', tg: ['Coro CLU', 'Outras'], label: 'Coro — outras músicas', test: s => hasTag(s, 'Coro CLU', 'Outras') },
    ...MOMENTS.map((m, i) => ({ id: 'momento-' + m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '-'), head: i === 0 ? 'Momentos da Missa' : null, tg: ['Coro CLU — momento', m], label: m, test: s => hasTag(s, 'Coro CLU — momento', m) })),
    ...BOOKS.flatMap(b => b.secs.map((sec, i) => ({ id: b.id + '-' + i, head: i === 0 ? b.head : null, tg: [b.grp, sec], label: sec, test: s => hasTag(s, b.grp, sec) }))),
  ];

  // nome curto (a secção já diz o resto): sem "Cânticos", "Coro — para (a)", "Canti" nem "songs"
  const catName = c => {
    if (c.short) return c.short;
    const t = c.label.replace(/^Cânticos\s+/i, '').replace(/^Coro — (para (a )?)?/i, '').replace(/^Canti\s+/i, '').replace(/[\s-]songs$/i, '');
    return t ? t[0].toUpperCase() + t.slice(1) : c.label;
  };
  // secção da categoria (o título por cima dela na página inicial); as primeiras são do Cancioneiro
  const catHead = c => c.id === 'todos' ? 'Cancioneiro' : c.head;
  const catSection = id => { let h = 'Cancioneiro'; for (const c of allCategories()) { if (catHead(c)) h = catHead(c); if (c.id === id) return h; } return h; };
  // categorias próprias (dos cânticos novos): etiquetas do grupo "Categoria"
  const allCategories = () => {
    const own = [...new Set(allSongs.flatMap(s => (s.tags || []).filter(t => t.grp === 'Categoria').map(t => t.tag)))].sort((a, b) => a.localeCompare(b, 'pt'));
    const i = CATEGORIES.findIndex(c => c.id === 'copyright') + 1; // depois das automáticas (que são do Cancioneiro)
    return [...CATEGORIES.slice(0, i), ...own.map((t, k) => ({ id: 'cat-' + norm(t).replace(/[^a-z0-9]+/g, '-'), head: k === 0 ? 'Outras categorias' : null, tg: ['Categoria', t], label: t, test: s => (s.tags || []).some(x => x.grp === 'Categoria' && x.tag === t) })), ...CATEGORIES.slice(i)];
  };
  const APP_VERSION = '2026-10-11 v185';
  const CACHE_KEY = 'cancioneiro.songs.v2'; // só a lista (sem letras)
  try { localStorage.removeItem('cancioneiro.songs.v1'); } catch (e) {} // versão antiga guardava todas as letras
  const $ = id => document.getElementById(id);
  { const sv = $('splash-ver'); if (sv) sv.textContent = APP_VERSION.split(' ').pop(); } // número da versão na capa
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
  // convite ("Partilhar a app"): guarda-se até a pessoa entrar, para ficar junto ao seu pedido de acesso
  const INV_KEY = 'cancioneiro.convite';
  try {
    const q = new URLSearchParams(location.search), cv = q.get('convite');
    if (cv && /^[A-Za-z0-9_-]{16,64}$/.test(cv)) { localStorage.setItem(INV_KEY, cv); q.delete('convite'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }
  } catch (e) {}
  async function accessToken(renew) {
    if (DEMO) { if (new URLSearchParams(location.search).has('semconta')) return ''; session = { user: { id: 'demo', email: 'demo@localhost' }, access_token: '' }; return ''; }
    // nunca fica à espera para sempre (rede lenta ao abrir no iPhone): ao fim de 6 s usa a sessão guardada
    const slow = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
    const saved = () => { try { const v = JSON.parse(localStorage.getItem(`sb-${new URL(CFG.SUPABASE_URL).hostname.split('.')[0]}-auth-token`)); return v && v.access_token ? v : null; } catch (e) { return null; } };
    let res = await slow(sb.auth.getSession(), 6000);
    let data = res && res.data ? res.data : { session: saved() };
    // Renova a sessão se já expirou (ou expira dentro de 1 min), ou se o servidor a recusou
    if (data.session && (renew || (data.session.expires_at || 0) * 1000 < Date.now() + 60000)) {
      const r = await slow(sb.auth.refreshSession(), 6000);
      if (r && r.data && r.data.session) data = r.data;
    }
    session = data.session;
    return session ? session.access_token : null;
  }
  function showLogin(msg) {
    for (const v of ['view-list', 'view-song', 'view-admin']) $(v).hidden = true;
    $('view-login').hidden = false;
    let inv = null; try { inv = localStorage.getItem(INV_KEY); } catch (e) {}
    $('login-msg').textContent = msg || (inv ? 'Recebeu um convite para o Cancioneiro. Entre com a sua conta Google; um Gestor confirma o acesso.' : '');
    splashDone.then(() => $('splash').classList.add('gone'));
  }
  // No computador, o Google abre numa janela à parte (num separador afixado do Safari, sair do site abre outro separador
  // e a sessão ficava lá). Essa janela fecha-se sozinha ao voltar e esta página entra (evento storage, mais abaixo).
  // No telemóvel e na app instalada, e se o browser bloquear a janela, continua tudo na mesma página.
  const LOGIN_WIN = 'cancioneiro-login', LOGIN_FLAG = 'cancioneiro.login-janela';
  let popupLogin = false; // esta página abriu a janela do Google e espera pela sessão
  $('btn-google').onclick = async () => {
    $('login-msg').textContent = 'A abrir o Google…';
    try { if (/^#\/(cantico|p)\//.test(location.hash)) sessionStorage.setItem('cancioneiro.depois', location.hash); } catch (e) {}
    let w = null;
    if (!matchMedia('(pointer: coarse)').matches && !standalone()) {
      const W = 500, H = 640, x = Math.max(0, (screen.availWidth - W) / 2), y = Math.max(0, (screen.availHeight - H) / 2);
      try { w = window.open('', LOGIN_WIN, `popup,width=${W},height=${H},left=${x},top=${y}`); } catch (e) { w = null; }
    }
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' }, skipBrowserRedirect: !!w },
    });
    if (error) { if (w) w.close(); $('login-msg').textContent = 'Erro: ' + error.message; return; }
    if (w) { try { localStorage.setItem(LOGIN_FLAG, String(Date.now())); } catch (e) {} w.location.href = data.url; popupLogin = true; $('login-msg').textContent = 'Continue na janela do Google que se abriu.'; }
  };
  // a janela do Google guardou a sessão (localStorage é partilhado): esta página recarrega e entra
  addEventListener('storage', e => {
    if (popupLogin && !$('view-login').hidden && e.newValue && e.key === `sb-${new URL(CFG.SUPABASE_URL).hostname.split('.')[0]}-auth-token`) location.reload();
  });
  async function logout(msg) {
    try { await sb.auth.signOut(); } catch (e) { /* sem rede */ }
    try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(lyrKey()); } catch (e) {}
    try { await caches.delete('cancioneiro-media'); } catch (e) {} // ficheiros guardados das coleções
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
      appAlert('Não foi possível guardar o preferido. Verifique a ligação à internet.');
    }
    refreshFavUI();
  }
  // No cântico: ☆ (preferido) ou, do perfil Maestro para cima, um livro que abre as coleções do cântico
  const ICON_STAR = '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6 6.7 19.5l1.1-5.9L3.4 9.5l6-.8z"/>';
  const ICON_PAGE = '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14 3v5h5"/>';
  const ICON_PAGE_DRAFT = '<path d="M12 21H6V3h8.5L19 7.5V11"/><path d="M14 3v5h5"/><path d="M19.2 13.3l2 2-5.7 5.7h-2v-2z"/>'; // folha com lápis: por publicar
  const PDF_IC = `<svg class="pdf-ic" viewBox="0 0 24 24" aria-hidden="true">${ICON_PAGE}</svg>`;
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
    if (op === 'share') return { token: 'demo_' + b.slug, expires_at: new Date(Date.now() + 864e5).toISOString() };
    if (op === 'share' && b.collection) return { token: 'demoC_' + b.collection, expires_at: new Date(Date.now() + 864e5).toISOString() };
    if (op === 'shared' && b.token.startsWith('demoC_')) {
      const c = store.get('cancioneiro.demo.cols', []).find(x => x.id === b.token.slice(6));
      if (!c) throw new Error('Esta folha já não está disponível.');
      if (b.slug) return demoApi('shared', { token: 'demo_' + b.slug });
      if (!demoFull.size) { const full = await (await fetch('songs.json')).json(); demoFull = new Map(full.map(x => [x.slug, x])); }
      const items = withSongs(colItems(c)).map(it => it.k === 'sec' ? { k: 'sec', title: it.ref.title } : { k: 'song', slug: it.key, title: demoFull.get(it.key).title, author: demoFull.get(it.key).author, number: demoFull.get(it.key).number });
      const songs = b.songs ? await Promise.all(items.filter(it => it.k === 'song').map(async it => { const x = await demoApi('shared', { token: 'demo_' + it.slug }); delete x.expires_at; return x; })) : undefined;
      return { collection: { id: c.id, title: c.title }, expires_at: c.expires_at, items, songs };
    }
    if (op === 'shared') {
      if (!demoFull.size) { const full = await (await fetch('songs.json')).json(); demoFull = new Map(full.map(x => [x.slug, x])); }
      const s = demoFull.get(b.token.replace(/^demo_/, ''));
      if (!s) throw new Error('Este endereço já não é válido (os endereços partilhados duram 24 horas).');
      return { slug: s.slug, title: s.title, author: s.author, language: s.language, translation_language: s.translation_language, number: s.number,
        lyrics: (s.lyrics_edit || s.lyrics || []).map(x => ({ ...x, lines: x.lines.map(stripChords) })), translation: s.translation || null, expires_at: new Date(Date.now() + 864e5).toISOString() };
    }
    if (op === 'match') return { matches: matchLyrics(b.text) };
    if (op === 'file') {
      const [path, frag = ''] = b.path.split('#');
      const book = { 'livros/songbook.pdf': 'livros/songbook', 'livros/canti2024.pdf': 'livros/canti2024' }[path];
      if (!book) return { url: 'drive-coro-clu/out/' + path };
      const p = +(frag.match(/(?:^|&)p=(\d+)/) || [])[1] || 1, c = (frag.match(/(?:^|&)c=([^&]+)/) || [])[1];
      const pages = c ? [...new Set(c.split('|').map(r => +r.split(':')[0]))] : [p, p + 1];
      return { pages: pages.map(n => ({ n, url: `drive-coro-clu/out/${book}/p${String(n).padStart(3, '0')}.pdf` })) };
    }
    if (op === 'upload') return { path: 'demo', url: null };
    if (op === 'invite') return { token: 'democonvite' + b.role.padEnd(10, 'x'), role: b.role };
    if (op === 'editsong') { const x = demoFull.get(b.slug); if (x) Object.assign(x, { title: b.title, author: b.author || null, language: b.language }); return { ok: true }; }
    if (op === 'scrape') throw new Error('No modo de demonstração não se leem páginas.');
    if (op === 'similar') { const n = norm(b.title); return { similar: [...demoFull.values()].filter(x => n && norm(x.title).includes(n)).slice(0, 5).map(x => ({ slug: x.slug, title: x.title, author: x.author, why: 'título' })) }; }
    if (op === 'addsong') {
      const nv = store.get('cancioneiro.demo.novos', []), slug = 'novo_' + Date.now();
      nv.push({ slug, number: 9000 + nv.length, title: b.title, author: b.author || null, language: b.language, lyrics: b.lyrics, translation: null, cancioneiro: false,
        approved: false, added_by: 'demo@localhost', parecidos: [...demoFull.values()].filter(x => norm(b.title) && norm(x.title).includes(norm(b.title))).slice(0, 5).map(x => ({ slug: x.slug, title: x.title, author: x.author, why: 'título' })), sources: [{ source: 'novos' }], tags: [], files: [] });
      nv[nv.length - 1].tags = b.tag ? [b.tag] : [];
      store.set('cancioneiro.demo.novos', nv); return { slug, approved: false };
    }
    if (op === 'coro') { const nv = store.get('cancioneiro.demo.novos', []); store.set('cancioneiro.demo.novos', nv.map(x => x.slug === b.slug ? { ...x, sources: b.on ? [...x.sources, { source: 'coro_clu' }] : x.sources.filter(y => y.source !== 'coro_clu') } : x)); return { ok: true }; }
    if (op === 'approvesong' || op === 'delsong') {
      const nv = store.get('cancioneiro.demo.novos', []);
      store.set('cancioneiro.demo.novos', op === 'delsong' ? nv.filter(x => x.slug !== b.slug) : nv.map(x => x.slug === b.slug ? { ...x, approved: true } : x)); return { ok: true };
    }
    if (op === 'addfile') return { kind: b.kind, label: b.label, path: 'enviados/demo/' + Date.now() + '-abcdef12.pdf', _blob: b._blob, mime: b.mime, sort: 99 };
    if (op === 'save') { const s = demoFull.get(b.slug); s.lyrics_edit = b.lyrics_edit; return { edited_by: 'demo', edited_at: new Date().toISOString(), is_edited: !!b.lyrics_edit }; }
    if (op === 'promote') { const nv = store.get('cancioneiro.demo.novos', []); if (nv.some(x => x.slug === b.slug)) store.set('cancioneiro.demo.novos', nv.map(x => x.slug === b.slug ? { ...x, cancioneiro: b.on } : x)); }
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
      const full = [...await (await fetch('songs.json')).json(), ...store.get('cancioneiro.demo.novos', [])];
      demoFull = new Map(full.map(s => [s.slug, s]));
      return full.map(({ lyrics, translation, lyrics_edit, ...x }) => ({ ...x, has_translation: !!translation, is_edited: !!lyrics_edit }));
    }
    const cols = 'slug,number,book_page,title,author,language,translation_language,has_chords,has_translation,pdf_url,rights,is_edited,edited_by,edited_at,cancioneiro,promoted_by,promoted_at,approved,added_by,added_at,parecidos,' +
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
    const ok = allSongs.filter(s => s.approved !== false); // cânticos novos por aprovar: só em "Novos Cânticos"
    songs = f === 'todas' ? ok : ok.filter(s => has(s, f));
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

  async function claimInvite() {
    let inv = null; try { inv = localStorage.getItem(INV_KEY); } catch (e) {}
    if (!inv || DEMO) return null;
    try {
      const r = await fetch(CFG.SUPABASE_URL + '/functions/v1/notify', { method: 'POST',
        headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'claim', invite: inv }) });
      const d = await r.json().catch(() => ({}));
      if (d.ok || r.status === 410) localStorage.removeItem(INV_KEY);
      return d.ok ? d : null;
    } catch (e) { return null; }
  }
  async function load() {
    try { const h = sessionStorage.getItem('cancioneiro.depois'); if (h) { sessionStorage.removeItem('cancioneiro.depois'); history.replaceState(null, '', location.pathname + h); } } catch (e) {}
    const cached = store.get(CACHE_KEY, null);
    if (cached && cached.length) { setSongs(cached); route(); }
    try {
      const fresh = await fetchSongs();
      if (!fresh.length) { // a base de dados só devolve cânticos a emails autorizados
        const inv = await claimInvite();
        await logout(`A conta ${session && session.user.email || ''} ainda não tem acesso ao Cancioneiro. ${inv ? `O pedido (convite de ${inv.inviter}) foi enviado aos Gestores` : 'O pedido foi enviado ao administrador'}; tente de novo depois de ser autorizado.`);
        return;
      }
      try { localStorage.removeItem(INV_KEY); } catch (e) {} // já tem acesso: o convite não é preciso
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

  // Cores do tema (theme.css), para o que é desenhado à mão: microfone e PDF
  const themeColor = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const themeRgb = (n, dflt) => { const h = themeColor(n).replace('#', ''); const p = h.length === 3 ? [...h].map(c => c + c) : h.match(/../g) || [];
    const v = p.slice(0, 3).map(x => parseInt(x, 16) / 255); return v.length === 3 && v.every(x => x >= 0) ? v : dflt; };
  // Equalizador (mostra que o som está mesmo a chegar) + diagnóstico
  function drawEq() {
    if (!rec || !rec.analyser) return;
    const cv = $('listen-eq'), g = cv.getContext('2d'), on = themeColor('--brand') || '#1fb385', idle = themeColor('--meter-idle') || '#cfd8d4';
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
      g.fillStyle = v > 20 ? on : idle;
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
    const pend = s.approved === false ? '<small class="pend">por aprovar</small>' : ''; // à direita, por cima do número
    return `<li><a href="#/cantico/${encodeURIComponent(s.slug)}"><span class="t">${title}${author}${sn}</span><span class="n">${pend}${s.approved === false ? '' : s.number}${s.book_page ? `<span class="bp">pág. ${s.book_page}</span>` : ''}</span></a></li>`;
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
      // o título da secção vai por cima da primeira categoria da secção que tenha cânticos
      let pending = null;
      rows.innerHTML = allCategories().map(c => {
        if (catHead(c)) pending = catHead(c);
        const n = songs.filter(c.test).length;
        if (!n) return '';
        // no perfil Cancioneiro só há esta secção: sem o título "Cancioneiro"
        const head = pending === 'Cancioneiro' && lvl() < 2 ? null : pending;
        pending = null;
        return (head ? `<li class="cat-head">${esc(head)}</li>` : '') +
          `<li><a href="#/lista/${c.id}"><span class="t">${esc(catName(c))}</span><span class="n">${n}</span>${chev}</a></li>`;
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
      const NF = { todos: () => true, pendentes: s => s.approved === false,
        canc: s => inCancioneiro(s), 'so-coro': s => s.approved !== false && !inCancioneiro(s) }; // os aprovados vão todos para o Coro; «Só no Coro» = aprovados fora do Cancioneiro
      const nf = bk.novos && NF[prefs.novosFiltro] ? prefs.novosFiltro : 'todos';
      const list = pool.filter(bk.test).filter(bk.novos ? NF[nf] : () => true).sort(bk.book
        ? (a, b) => pageIn(a, bk.book) - pageIn(b, bk.book) || a.title.localeCompare(b.title, 'pt')
        : (a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }));
      rows.innerHTML = list.map(s => bk.book ? songRow({ ...s, book_page: pageIn(s, bk.book) || null }) : songRow(s)).join('') +
        (bk.novos && lvl() >= 2 ? '<li class="col-add-sec"><button id="novo-cantico">+ Novo cântico</button></li>' : '');
      if (bk.novos) {
        const pend = pool.filter(bk.test).filter(s => s.approved === false).length;
        const opts = [['todos', 'Todos'], ['pendentes', 'Por aprovar'], ['so-coro', 'Só no Coro'], ['canc', 'No Cancioneiro']]; // aprovados: no Coro e talvez no Cancioneiro
        title.innerHTML = `${esc(bk.label)}${pend ? `<small class="col-meta">${pend} por aprovar${lvl() >= 3 ? ' — abra o cântico para aprovar ou recusar' : ''}</small>` : ''}` +
          `<select class="novos-filtro" id="novos-filtro" aria-label="Mostrar">${opts.map(([v, l]) => `<option value="${v}"${v === nf ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
        $('novos-filtro').onchange = e => { prefs.novosFiltro = e.target.value; store.set('cancioneiro.prefs', prefs); showList('livro-novos'); };
        if (!list.length) $('status').textContent = 'Nenhum cântico novo com este filtro.';
        if ($('novo-cantico')) $('novo-cantico').onclick = () => openNewSong();
      }
      return;
    }
    const cat = allCategories().find(c => c.id === catId) || CATEGORIES[0];
    title.hidden = false;
    // no perfil Cancioneiro só há uma secção: sem o nome da secção por cima
    title.innerHTML = `${lvl() >= 2 ? `<small class="list-kicker">${esc(catSection(cat.id))}</small>` : ''}${esc(catName(cat))}`;
    rows.innerHTML = songs.filter(cat.test)
      .sort((a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }))
      .map(s => songRow(s)).join('');
  }

  // cânticos só com a página do livro: "(letra no livro X, pág. N — abrir)" com "abrir" a ligar à página
  function bookNote(stanzas, s, scores) {
    const lines = (stanzas || []).flatMap(st => st.lines);
    const m = lines.length === 1 && lines[0].match(/^\(letra no livro (.+?), pág\. (\d+)(?: — abrir o livro)?\)$/);
    if (!m) return '';
    const i = scores.findIndex(sc => (sc.label || '').startsWith(m[1]));
    const link = i >= 0 ? ` — <a class="book-open" href="#/cantico/${encodeURIComponent(s.slug)}/partitura${i ? '/' + i : ''}">abrir</a>` : '';
    return `<div class="stanza verse"><div class="line">(letra no livro ${esc(m[1])}, pág. ${esc(m[2])}${link})</div></div>`;
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
    // letra digitalizada em mais do que um livro (Songbook e CANTI): um só botão, que mostra as duas juntas
    const scans = scores.filter(isBookScan);
    const pdf = scores.map((sc, i) => {
      if (scans.length > 1 && isBookScan(sc)) return sc === scans[0] ? `<a class="pdf" href="#/cantico/${encodeURIComponent(slug)}/partitura${i ? '/' + i : ''}">${PDF_IC}${esc(scans.map(x => x.label.split(',')[0]).join(' + '))}</a>` : '';
      const lbl = scores.length > 1 || pageOf(sc) ? `${sc.label}${scores.filter(x => x.label === sc.label).length > 1 ? ' ' + (i + 1) : ''}` : 'Partitura';
      return sc.url && /^https?:/.test(sc.url)
        ? `<a class="pdf" href="${esc(sc.url)}" target="_blank" rel="noopener">${PDF_IC}${esc(lbl)}</a>`
        : `<a class="pdf" href="#/cantico/${encodeURIComponent(slug)}/partitura${i ? '/' + i : ''}">${PDF_IC}${esc(lbl)}</a>`;
    }).join('');
    const srcs = (extrasOn() ? srcOf(s) : []).map(k => `<span class="src-chip src-${esc(k)}">${esc(SOURCES[k] || k)}</span>`).join('');
    const moments = (extrasOn() ? s.tags || [] : []).filter(t => t.grp === 'Coro CLU — momento').map(t => t.tag);
    const recs = filesOf(s, 'recording');
    const recHtml = recs.length ? `<section class="recs"><h2>Gravações</h2><ul>${recs.map((f, i) =>
      `<li><button class="rec" data-i="${i}" data-path="${esc(f.path || '')}" aria-label="Ouvir ${esc(f.label)}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button><span class="rl">${esc(f.label)}</span></li>`).join('')}</ul></section>` : '';
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
    // cântico novo por aprovar: o Maestro aprova ou recusa; quem o acrescentou pode retirá-lo
    const mine = session && s.added_by === session.user.email;
    const sims = (s.approved === false && Array.isArray(s.parecidos) ? s.parecidos : []).filter(x => x.slug !== s.slug);
    const simHtml = sims.length ? `<div class="sim-list"><b>Atenção: parecido com cânticos que já existem</b>${sims.map(x => `<a href="#/cantico/${encodeURIComponent(x.slug)}">${esc(x.title)}${x.author ? ' — ' + esc(x.author) : ''}<small>${esc(x.why)}</small></a>`).join('')}</div>` : '';
    // só o Maestro / Gestor aprova, recusa ou apaga cânticos novos
    const pendHtml = s.approved === false
      ? `<div class="pend-bar"><p>Cântico novo por aprovar${s.added_by ? ` · acrescentado por ${esc(s.added_by.split('@')[0])}` : ''}</p>${simHtml}${lvl() >= 3 ? '<p><button class="edit-btn" id="song-approve">Aprovar</button><button class="edit-btn danger-btn" id="song-reject">Recusar</button></p>' : ''}</div>`
      : ''; // apagar um cântico novo já aprovado: em «Editar cântico»
    // Maestro / Gestor: acrescentar gravações e partituras (Coro, nos cânticos novos que acrescentou; o Maestro / Gestor faz isto em "Editar cântico")
    const canFiles = lvl() === 2 && mine && srcOf(s).includes('novos') && extrasOn(); // Maestro / Gestor: em "Editar cântico"
    const fileBtns = canFiles ? `<button class="edit-btn" id="btn-add-rec"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Gravação</button><button class="edit-btn" id="btn-add-score"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Partitura</button>` : '';
    // ficheiros enviados pela app: o Maestro / Gestor pode apagá-los (os importados ficam)
    const ups = canFiles ? (s.files || []).filter(f => /^enviados\//.test(f.path || '')) : [];
    const upHtml = ups.length ? `<ul class="up-files">${ups.map(f => `<li><span>${f.kind === 'recording' ? 'Gravação' : 'Partitura'}: ${esc(f.label || '')}</span><button class="up-del" data-path="${esc(f.path)}" aria-label="Apagar ${esc(f.label || '')}">${TRASH}</button></li>`).join('')}</ul>` : '';
    const editBar = canEdit || canFiles
      ? `<p class="edit-bar">${canEdit && edited ? `<span>Letra editada${s.edited_by ? ' por ' + esc(s.edited_by.split('@')[0]) : ''}${s.edited_at ? ' em ' + new Date(s.edited_at).toLocaleDateString('pt-PT') : ''}</span><button class="revert-link" id="btn-revert">Repor original</button>` : ''}${canEdit ? '<button class="edit-btn" id="btn-edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>Editar cântico</button>' : ''}${fileBtns ? `<span class="file-btns">${fileBtns}</span>` : ''}</p>`
      : '';
    $('song').innerHTML = `
      ${s.approved === false ? '<small class="pend pend-top">Por aprovar</small>' : ''}<h1>${esc(s.title)}</h1>
      ${s.author ? `<p class="author">${esc(s.author)}</p>` : ''}
      ${rights}
      <div class="meta">${sw}</div>${pdf ? `<div class="scores">${pdf}</div>` : ''}
      ${note}
      ${wait}
      ${bookNote(body, s, scores) || renderStanzas(body)}
      ${pendHtml}
      ${editBar}
      ${upHtml}
      ${recHtml}
      <p class="srcs">${srcs}${moments.length ? `<span class="moments">${esc(moments.join(' · '))}</span>` : ''}</p>
      <p class="num">${s.number}${s.book_page ? ` · pág. ${s.book_page} do livro` : ''}</p>`;
    $('song').querySelectorAll('button.rec').forEach(b => b.onclick = () => playRec(b, recs[+b.dataset.i]));
    if (nowRec && nowRec.slug === slug) { const b = [...$('song').querySelectorAll('button.rec')].find(x => x.dataset.path === nowRec.path); if (b) b.closest('li').appendChild(nowRec.a); }
    miniUpdate();
    $('song').classList.toggle('show-chords', prefs.chords && mode === 'orig');
    $('btn-chords').hidden = !(lyrics.some(st => st.lines.some(l => l.includes('['))) && mode === 'orig');
    if ($('btn-edit')) $('btn-edit').onclick = () => openSongEdit(slug);
    if ($('song-approve')) $('song-approve').onclick = () => decideSong(s, true, $('song-approve'));
    if ($('song-reject')) $('song-reject').onclick = () => { if (tapConfirm($('song-reject'), 'Confirmar: apagar')) decideSong(s, false, $('song-reject')); };
    $('song').querySelectorAll('.up-del').forEach(b => b.onclick = () => { if (tapConfirm(b, 'Apagar?')) delFile(s, b.dataset.path); });
    if ($('btn-add-rec')) { $('btn-add-rec').onclick = () => addFiles(s, 'recording', $('btn-add-rec')); $('btn-add-score').onclick = () => addFiles(s, 'score', $('btn-add-score')); }
    // Partilhar: copiar a letra (não no perfil Cancioneiro) ou o endereço do cântico; ninguém pode selecionar o texto
    $('btn-share').onclick = () => shareSong(s, data ? body : null);
    if ($('btn-revert')) $('btn-revert').onclick = () => revertLyrics(slug, $('btn-revert'));
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
    await copyText(text); toast('Letra copiada');
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { // alternativa para browsers sem acesso à área de transferência
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } finally { ta.remove(); }
    }
  }
  async function shareSong(s, stanzas) {
    const list = [];
    if (lvl() >= 2 && stanzas) list.push({ value: 'letra', label: 'Copiar letra', sub: 'Título e letra, sem acordes' });
    list.push({ value: 'url', label: urlLabel(), sub: 'Qualquer pessoa pode abrir durante 24 horas (sem conta: só a letra e a tradução)' });
    const v = await appChoose('Partilhar', list);
    if (v === 'letra') copyLyrics(s, stanzas);
    else if (v === 'url') copyShareUrl(api('share', { slug: s.slug }), 'válido 24 horas', s.title);
  }
  // o endereço é pedido antes de copiar; no iPhone a cópia tem de vir logo a seguir ao toque, por isso usa-se uma promessa
  // Partilhar endereço: menu de partilha do sistema (iPhone, iPad, Android, Safari…); nos outros, copia e avisa
  const canShare = () => !!navigator.share && (matchMedia('(pointer: coarse)').matches || /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent));
  const urlLabel = () => canShare() ? 'Partilhar endereço' : 'Copiar endereço';
  async function copyShareUrl(req, until, title) {
    let u;
    try { u = location.origin + location.pathname + '#/p/' + (await req).token; }
    catch (e) { appAlert(e instanceof Limit ? e.message : (e.message && !/fetch|HTTP/i.test(e.message) ? e.message : 'Não foi possível criar o endereço. Verifique a ligação à internet.')); return; }
    return shareOrCopy(u, until, title);
  }
  async function shareOrCopy(u, until, title) {
    const share = () => navigator.share({ title: title || 'Cancioneiro', text: (title ? title + ' — ' : '') + 'Cancioneiro (' + until + ')', url: u });
    if (canShare()) {
      try { await share(); return; }
      catch (e) {
        if (e.name === 'AbortError') return; // fechou o menu
        // o sistema só abre o menu logo a seguir a um toque: pede mais um toque
        if (e.name === 'NotAllowedError' && await appDialog({ title: 'Endereço pronto', msg: `O endereço está pronto (${until}).`, ok: 'Partilhar', cancel: 'Fechar' })) {
          try { await share(); return; } catch (e2) { if (e2.name === 'AbortError') return; }
        }
      }
    }
    try { await copyText(u); await appAlert(`O endereço foi copiado para a área de transferência (${until}). Cole-o onde o quiser enviar.`, 'Endereço copiado'); }
    catch (e) { await appDialog({ title: 'Endereço', msg: `Copie este endereço (${until}):`, input: u, ok: 'Fechar', cancel: null }); }
  }
  async function shareCollection(c) {
    const fim = new Date(c.expires_at).toLocaleString('pt-PT', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
    const list = [{ value: 'url', label: urlLabel(), sub: `Qualquer pessoa pode abrir até ${fim}, quando a folha expira (sem conta: só a letra e a tradução)` },
      { value: 'pdf', label: 'Gerar PDF', sub: 'Título, secções, títulos e letras dos cânticos' }];
    list.push({ value: 'coro', label: 'Gerar PDF para Coro', sub: 'Também com os acordes e as partituras' });
    const v = await appChoose('Partilhar folha', list);
    if (v === 'url') copyShareUrl(api('share', { collection: c.id }), 'válido até ' + fim, c.title);
    else if (v) collectionPdf(c, v === 'coro');
  }

  // ---------- Endereço partilhado (#/p/<código>[/<cântico>]): sem conta, ou sem acesso ao cântico / coleção → só letra e tradução ----------
  const sharedCache = new Map(); let sharedMode = 'orig', sharedBack = null;
  // endereços partilhados guardados no telemóvel até expirarem (a lista de uma folha traz a letra de todos os cânticos)
  const SHARED_KEY = 'cancioneiro.partilhados';
  const sharedStore = () => { const all = store.get(SHARED_KEY, {}), now = Date.now(); let gone = false;
    for (const k of Object.keys(all)) if (!(Date.parse(all[k].expires_at) > now)) { delete all[k]; gone = true; }
    if (gone) store.set(SHARED_KEY, all); return all; };
  function sharedKeep(token, d) {
    const all = sharedStore(), exp = d.expires_at;
    if (!exp) return;
    if (d.items) {
      for (const sg of d.songs || []) sharedCache.set(token + '/' + sg.slug, { ...sg, expires_at: exp, collection: d.collection });
      all[token] = { expires_at: exp, list: { ...d, songs: undefined }, songs: d.songs || [] };
    } else if (d.slug) all[token + (d.collection ? '/' + d.slug : '')] = { expires_at: exp, song: d };
    try { store.set(SHARED_KEY, all); } catch (e) { /* sem espaço: fica só em memória */ }
  }
  function sharedFromStore(key) {
    const all = sharedStore(), [token, slug] = key.split('/');
    if (all[key]?.song) return all[key].song;
    const e = all[token];
    if (!e) return null;
    if (!slug) return e.list;
    const sg = e.songs.find(x => x.slug === slug);
    return sg ? { ...sg, expires_at: e.expires_at, collection: e.list.collection } : null;
  }
  async function apiShared(token, slug) {
    if (DEMO) return demoApi('shared', { token, slug, songs: !slug });
    const r = await fetch(CFG.SUPABASE_URL + '/functions/v1/conteudo', { method: 'POST',
      headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'shared', token, slug, songs: !slug }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'Não foi possível abrir este endereço.');
    return d;
  }
  async function showShared(token, slug) {
    const key = token + (slug ? '/' + slug : ''), here = () => location.hash === '#/p/' + key;
    sharedBack = slug ? '#/p/' + token : null;
    let d = sharedCache.get(key);
    // a lista de uma folha vem sempre da rede quando há ligação (pode ter mudado); o resto, do que já está guardado
    if (!d && (slug || !navigator.onLine)) { d = sharedFromStore(key); if (d) { sharedCache.set(key, d); if (d.items) sharedCache.set(token + ':col', 1); } }
    if (!d) {
      if (session && !allSongs.length) return; // espera pela lista de cânticos (route() volta a ser chamada)
      sharedView(!slug && sharedCache.get(token + ':col'));
      if (!$('view-song').hidden) $('song').innerHTML = '<p class="note lyr-wait">A carregar…</p>'; else { $('rows').innerHTML = ''; $('status').textContent = 'A carregar…'; }
      let err = null;
      try { d = await apiShared(token, slug); sharedCache.set(key, d); if (d.items) sharedCache.set(token + ':col', 1); sharedKeep(token, d); }
      catch (e) {
        err = e;
        const kept = !navigator.onLine || /fetch|network|Load failed/i.test(e.message) ? sharedFromStore(key) : null; // sem rede: o que ficou guardado
        if (kept) { d = kept; sharedCache.set(key, d); if (d.items) sharedCache.set(token + ':col', 1); }
      }
      if (!d) { const e = { message: navigator.onLine ? (err && err.message) || 'Não foi possível abrir este endereço.' : 'Sem ligação à internet.' }; if (here()) { sharedView(false); $('song').innerHTML = `<h1>Cancioneiro</h1><p class="note">${esc(e.message.replace('coleção', 'folha'))}</p>${sharedFoot()}`; bindSharedLogin(); } return; }
      if (!here()) return;
    }
    if (d.items) return showSharedCollection(token, d);
    // quem tem conta e vê o cântico abre a página normal do cântico (do perfil Coro para cima: completa)
    if (session && bySlug.has(d.slug)) { location.replace('#/cantico/' + encodeURIComponent(d.slug)); return; }
    sharedView(false);
    const tr = !!(d.translation && d.translation.length), mode = tr ? sharedMode : 'orig';
    const sw = tr ? `<div class="lang-switch" role="group" aria-label="Idioma">
        <button data-mode="orig" class="${mode === 'orig' ? 'on' : ''}">${esc(LANGS[d.language] || d.language || 'Original')}</button>
        <button data-mode="trad" class="${mode === 'trad' ? 'on' : ''}">Tradução · ${esc(LANGS[d.translation_language] || 'Português')}</button></div>`
      : (d.language ? `<span class="lang-chip">${esc(LANGS[d.language] || d.language)}</span>` : '');
    const body = (mode === 'trad' ? d.translation : d.lyrics) || [];
    $('song').innerHTML = `<h1>${esc(d.title)}</h1>${d.author ? `<p class="author">${esc(d.author)}</p>` : ''}
      <div class="meta">${sw}</div>${mode === 'trad' ? '<p class="note">Tradução</p>' : ''}
      ${body.length ? renderStanzas(body) : '<p class="note">Letra não disponível.</p>'}
      ${slug ? '' : sharedFoot(d.expires_at)}`;
    $('song').querySelectorAll('.lang-switch button').forEach(b => b.onclick = () => { sharedMode = b.dataset.mode; const y = window.scrollY; showShared(token, slug); window.scrollTo(0, y); });
    bindSharedLogin();
  }
  async function showSharedCollection(token, d) {
    // quem tem conta e vê a coleção abre a página normal da coleção
    if (session) {
      if (!cols.length) await loadCollections();
      const c = cols.find(x => x.id === d.collection.id);
      if (c && colVisible(c)) { location.replace('#/lista/colecao-' + c.id); return; }
    }
    sharedView(true);
    $('list-title').hidden = false; $('list-title').textContent = d.collection.title;
    $('rows').innerHTML = d.items.map(it => it.k === 'sec'
      ? `<li class="col-sec"><a href="#" class="sec-line" tabindex="-1">${esc(it.title)}</a></li>`
      : `<li><a href="#/p/${token}/${encodeURIComponent(it.slug)}"><span class="t">${esc(it.title)}${it.author ? `<span class="a">${esc(it.author)}</span>` : ''}</span><span class="n">${it.number}</span></a></li>`).join('');
    $('rows').querySelectorAll('a.sec-line').forEach(a => a.onclick = e => e.preventDefault());
    $('status').innerHTML = sharedFoot(d.expires_at); bindSharedLogin();
  }
  function sharedView(list) {
    document.body.classList.add('shared-view'); document.body.classList.toggle('no-session', !session); document.body.classList.toggle('shared-sub', !!sharedBack);
    $('view-login').hidden = true; $('splash').classList.add('gone'); show(list ? 'view-list' : 'view-song');
  }
  const sharedFoot = exp => `<p class="shared-foot">Partilhado do Cancioneiro${exp ? ` · válido até ${new Date(exp).toLocaleString('pt-PT', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}</p>` +
    (session ? '' : '<p class="shared-foot"><button class="revert-link" id="shared-login">Entrar no Cancioneiro</button></p>');
  function bindSharedLogin() { const b = $('shared-login'); if (b) b.onclick = () => { document.body.classList.remove('shared-view', 'no-session', 'shared-sub'); history.replaceState(null, '', location.pathname); showLogin(); }; }

  // ---------- PDF de uma coleção (gerado no telemóvel com pdf-lib): letras em 2 colunas, se possível em 2 páginas ----------
  // "para Coro": com os acordes por cima da letra e, no fim, as partituras de cada cântico
  let pdfLibP = null;
  const loadPdfLib = () => pdfLibP || (pdfLibP = new Promise((ok, ko) => {
    const sc = document.createElement('script'); sc.src = 'vendor/pdf-lib/pdf-lib.min.js';
    sc.onload = () => ok(window.PDFLib); sc.onerror = () => { pdfLibP = null; ko(new Error('pdf-lib')); }; document.head.appendChild(sc);
  }));
  // as fontes base do PDF só têm o alfabeto latino (WinAnsi): o resto perde os acentos ou é omitido
  const WIN = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);
  const pdfSafe = t => [...String(t || '').normalize('NFC')].map(ch => {
    const c = ch.codePointAt(0);
    if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN.has(ch)) return ch;
    const b = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return /^[\x20-\x7e]+$/.test(b) ? b : (c === 9 ? ' ' : '');
  }).join('');
  let pdfGen = null; // { blob, name, title } do PDF gerado que está a ser mostrado
  async function collectionPdf(c, coro) {
    const title = c.title + (coro ? ' (Coro)' : '');
    pdfGen = null; pdfUrl = null; $('pdf-download').hidden = true;
    $('pdfview').hidden = false; document.body.classList.add('pdf-open'); $('pdf-title').textContent = title;
    const msg = t => { $('pdfpages').innerHTML = `<p class="pdf-msg">${esc(t)}</p>`; };
    msg('A gerar o PDF…');
    try {
      const L = await loadPdfLib();
      const items = withSongs(colItems(c).filter(it => it.k === 'sec' || bySlug.has(it.key)));
      const songsIn = items.filter(it => it.k === 'song').map(it => bySlug.get(it.key));
      let n = 0;
      for (const s of songsIn) { msg(`A preparar as letras… (${++n}/${songsIn.length})`); try { await getLyrics(s.slug); } catch (e) { if (e instanceof Limit) throw e; } }
      const doc = await L.PDFDocument.create();
      doc.setTitle(pdfSafe(c.title)); doc.setCreator('Cancioneiro');
      const F = { r: await doc.embedFont(L.StandardFonts.Helvetica), b: await doc.embedFont(L.StandardFonts.HelveticaBold), i: await doc.embedFont(L.StandardFonts.HelveticaOblique) };
      layoutLyrics(L, doc, F, c.title, items, coro);
      if (coro) await appendScores(L, doc, F, songsIn, msg);
      const bytes = await doc.save();
      if ($('pdfview').hidden) return; // fechado entretanto
      const blob = new Blob([bytes], { type: 'application/pdf' });
      pdfGen = { blob, title, name: (c.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'colecao') + (coro ? '-coro' : '') + '.pdf' };
      pdfUrl = null;
      await openPdf({ blob }, title, null, 'application/pdf');
      $('pdf-download').hidden = false;
    } catch (e) {
      console.error(e);
      msg(e instanceof Limit ? e.message : 'Não foi possível gerar o PDF. Verifique a ligação à internet.');
    }
  }
  const GREEN = () => themeRgb('--light-accent', [0.06, 0.5, 0.35]); // PDF em papel branco: sempre a cor do modo claro
  function layoutLyrics(L, doc, F, colTitle, items, coro) {
    const W = 595.28, H = 841.89, M = 34, GAP = 18;
    // título da coleção: centrado, a toda a largura da 1.ª página, com um traço por baixo
    const TS = 20, tLines = (() => { const words = pdfSafe(colTitle).split(' '), out = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && F.b.widthOfTextAtSize(t, TS) > W - 2 * M) { out.push(cur); cur = w; } else cur = t; }
      out.push(cur); return out; })();
    const headH = tLines.length * TS * 1.2 + 22;
    const green = L.rgb(...GREEN()), grey = L.rgb(0.45, 0.45, 0.45), ink = L.rgb(0.1, 0.1, 0.1);
    // blocos que não se partem: secção + título + 1.ª estrofe ficam juntos; estrofes curtas também
    const build = (fs, colW) => {
      const units = []; let pend = [];
      const wrap = (text, font, size, width, indent = fs * 0.9) => {
        const words = text.split(/(\s+)/), out = []; let cur = '';
        for (const w of words) {
          const t = cur + w, max = out.length ? width - indent : width;
          if (cur && font.widthOfTextAtSize(t.trimEnd(), size) > max && w.trim()) { out.push(cur.trimEnd()); cur = w.trimStart(); }
          else cur = t;
        }
        if (cur.trim() || !out.length) out.push(cur.trimEnd());
        return out;
      };
      const textRow = (t, font, size, color, h, indent = 0) => ({ h, draw: (pg, x, y) => pg.drawText(t, { x: x + indent, y: y - size, size, font, color }) });
      const sizeT = fs * 1.15, sizeA = fs * 0.82, sizeS = fs * 1.05, sizeC = fs * 0.78;
      for (const it of items) {
        if (it.k === 'sec') {
          const t = pdfSafe(it.ref.title.toUpperCase());
          pend.push({ h: sizeS * 2.1, draw: (pg, x, y) => {
            pg.drawText(t, { x, y: y - sizeS * 1.5, size: sizeS, font: F.b, color: green });
            pg.drawLine({ start: { x, y: y - sizeS * 1.85 }, end: { x: x + colW, y: y - sizeS * 1.85 }, thickness: 0.6, color: green });
          } });
          continue;
        }
        const s = bySlug.get(it.key);
        const head = [];
        wrap(pdfSafe(s.title), F.b, sizeT, colW, 0).forEach((t, i) => head.push(textRow(t, F.b, sizeT, ink, sizeT * 1.25, i ? fs * 0.9 : 0)));
        if (s.author) wrap(pdfSafe(s.author), F.i, sizeA, colW, 0).forEach(t => head.push(textRow(t, F.i, sizeA, grey, sizeA * 1.3)));
        // espaço antes de cada cântico (e antes de uma secção), que cai quando fica no topo de uma coluna
        const sp = fs * 2.4;
        if (units.length) { const r = pend.length ? pend : head; r[0] = { ...r[0], h: r[0].h + sp, pad: sp }; }
        const st = (lyr.get(s.slug) || {}).lyrics || [];
        const stanzas = [];
        for (const x of st) {
          const rows = [], font = x.type === 'chorus' ? F.i : F.r;
          for (const raw of x.lines) {
            const line = raw.replace(/\s*—\s*abrir o livro\)$/, ')').replace(/\|:|:\||[♪♫𝄆𝄇]/g, '');
            const bookRef = /^\(letra no livro /.test(line);
            if (!coro || !line.includes('[')) {
              const t = pdfSafe(stripChords(line)).replace(/\s+/g, ' ').trim();
              if (!t && !coro) continue;
              wrap(t, bookRef ? F.i : font, fs, colW).forEach((p, i) => rows.push(textRow(p, bookRef ? F.i : font, fs, bookRef ? grey : ink, fs * 1.22, i ? fs * 0.9 : 0)));
              continue;
            }
            // acordes: posições no texto sem acordes
            let text = '', chords = [];
            line.split(/(\[[^\]]*\])/).forEach(p => { const m = p.match(/^\[([^\]]*)\]$/); if (m) chords.push({ i: text.length, c: pdfSafe(m[1]) }); else text += p; });
            text = pdfSafe(text);
            const segs = wrap(text, font, fs, colW); let start = 0;
            segs.forEach((seg, si) => {
              const idx = text.indexOf(seg, start), end = si === segs.length - 1 ? Infinity : idx + seg.length;
              const ind = si ? fs * 0.9 : 0;
              const mine = chords.filter(ch => ch.i >= (si ? idx : 0) && ch.i < end);
              const pos = []; let minX = 0;
              for (const ch of mine) { let cx = ind + font.widthOfTextAtSize(text.slice(idx, Math.max(idx, ch.i)), fs); cx = Math.max(cx, minX); pos.push([cx, ch.c]); minX = cx + F.b.widthOfTextAtSize(ch.c, sizeC) + fs * 0.35; }
              start = idx + seg.length;
              rows.push({ h: (pos.length ? sizeC * 1.15 : 0) + fs * 1.22, draw: (pg, x, y) => {
                let yy = y;
                if (pos.length) { pos.forEach(([cx, t]) => pg.drawText(t, { x: x + cx, y: yy - sizeC, size: sizeC, font: F.b, color: green })); yy -= sizeC * 1.15; }
                if (seg.trim()) pg.drawText(seg, { x: x + ind, y: yy - fs, size: fs, font, color: ink });
              } });
            });
          }
          if (rows.length) stanzas.push(rows);
        }
        if (!stanzas.length) stanzas.push([textRow('(letra não disponível)', F.i, fs, grey, fs * 1.22)]);
        stanzas.forEach((rows, k) => { if (k) rows[0] = { ...rows[0], h: rows[0].h + fs * 0.55, pad: fs * 0.55 }; });
        // um cântico pode continuar na coluna seguinte, mas nunca a meio de uma estrofe;
        // a secção e o título ficam sempre juntos com a 1.ª estrofe
        units.push({ rows: [...pend, ...head, ...stanzas[0]], keep: true }); pend = [];
        stanzas.slice(1).forEach(rows => units.push({ rows, keep: true }));
      }
      // secções sem cânticos no fim ficavam soltas: não entram (cada secção vai sempre junta com o cântico seguinte)
      return units;
    };
    // posiciona: devolve [{ page, x, y, row }]; o espaço por cima (pad) cai no topo de uma coluna
    const place = (fs, ncol) => {
      const colW = (W - 2 * M - GAP * (ncol - 1)) / ncol, top = H - M, bottom = M + 14;
      const units = build(fs, colW), out = [];
      let page = 0, col = 0;
      const start = () => page === 0 ? top - headH : top;
      let y = start();
      const next = () => { col++; if (col >= ncol) { col = 0; page++; } y = start(); };
      for (const u of units) {
        const uh = u.rows.reduce((a, r) => a + r.h, 0);
        if (u.keep && y - uh < bottom && uh <= top - bottom - headH) next();
        for (const r of u.rows) {
          const pad = r.pad || 0;
          let gap = y === start() ? 0 : pad;
          if (y - gap - (r.h - pad) < bottom) { next(); gap = 0; }
          out.push({ page, x: M + col * (colW + GAP), y: y - gap, row: r });
          y -= gap + r.h - pad;
        }
      }
      return { out, pages: page + 1 };
    };
    // a maior letra que cabe em 2 páginas (no máximo 2 páginas, sempre); com 6 ou mais cânticos experimenta
    // também 3 e 4 colunas e fica com o número de colunas que dá a letra maior (em empate, menos colunas)
    const nSongs = items.filter(it => it.k === 'song').length;
    let best = null;
    for (const ncol of nSongs >= 6 ? [2, 3, 4] : [2]) {
      let fit = null;
      for (let fs = 11; fs >= 2.5; fs -= 0.25) { const p = place(fs, ncol); if (p.pages <= 2) { fit = { ...p, fs, ncol }; break; } }
      if (fit && (!best || fit.fs > best.fs || (best.pages > 2 && fit.pages <= 2))) best = fit;
    }
    if (!best) best = { ...place(2.5, 2), fs: 2.5, ncol: 2 };
    const pages = Array.from({ length: best.pages }, () => doc.addPage([W, H]));
    tLines.forEach((t, i) => pages[0].drawText(t, { x: (W - F.b.widthOfTextAtSize(t, TS)) / 2, y: H - M - TS - i * TS * 1.2, size: TS, font: F.b, color: green }));
    pages[0].drawLine({ start: { x: M, y: H - M - headH + 8 }, end: { x: W - M, y: H - M - headH + 8 }, thickness: 1, color: green });
    for (const { page, x, y, row } of best.out) row.draw(pages[page], x, y);
    pages.forEach((pg, i) => pg.drawText(pdfSafe(`Cancioneiro · ${colTitle}${pages.length > 1 ? ` · ${i + 1}/${pages.length}` : ''}`), { x: M, y: M - 12, size: 7, font: F.r, color: grey }));
  }
  // página de um PDF como imagem PNG (com pdf.js), opcionalmente só um recorte (box em pontos do PDF, origem em baixo)
  async function rasterPage(bytes, i, box) {
    const lib = await loadPdfJs();
    const d = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise, page = await d.getPage(i + 1);
    const v1 = page.getViewport({ scale: 1 }), scale = Math.min(2.5, 2400 / v1.width), vp = page.getViewport({ scale });
    const b = box || { left: 0, bottom: 0, right: v1.width, top: v1.height };
    const c = document.createElement('canvas');
    c.width = Math.round((b.right - b.left) * scale); c.height = Math.round((b.top - b.bottom) * scale);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -b.left * scale, -(v1.height - b.top) * scale] }).promise;
    return new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
  }
  async function appendScores(L, doc, F, songsIn, msg) {
    const W = 595.28, H = 841.89, M = 30, grey = L.rgb(0.45, 0.45, 0.45), green = L.rgb(...GREEN());
    const bytesOf = async x => x.blob ? new Uint8Array(await x.blob.arrayBuffer()) : new Uint8Array(await (await fetch(x.url)).arrayBuffer());
    let page = null, y = 0;
    const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
    const put = (ep, w, h, label) => { // peça (página ou recorte) à largura da página, várias por página se couberem
      const labelH = label ? 18 : 0, maxH = H - 2 * M - 18;
      const sc = Math.min((W - 2 * M) / w, maxH / h);
      if (!page || y - labelH - h * sc < M) newPage();
      if (label) { page.drawText(label, { x: M, y: y - 12, size: 10, font: F.b, color: green }); y -= labelH; }
      if (ep.kind === 'img') page.drawImage(ep.v, { x: M, y: y - h * sc, width: w * sc, height: h * sc });
      else page.drawPage(ep.v, { x: M, y: y - h * sc, xScale: sc, yScale: sc });
      y -= h * sc + 10;
    };
    let n = 0;
    const total = songsIn.filter(s => scoresOf(s).length).length;
    for (const s of songsIn) {
      const scores = scoresOf(s); if (!scores.length) continue;
      msg(`A juntar as partituras… (${++n}/${total})`);
      let first = true;
      // letra digitalizada nos livros (Songbook, CANTI): tudo numa só página, um bloco por livro, à mesma escala
      const scans = scores.filter(isBookScan);
      if (scans.length) {
        try {
          const blocks = [];
          for (const sc of scans) {
            const src = await fileSrc(sc), pieces = [];
            for (const [n, x0, y0, x1, y1] of cropsOf(sc)) {
              const p = (src.pages || []).find(q => q.n === n); if (!p) continue;
              const bytes = await bytesOf(p), d = await L.PDFDocument.load(bytes.slice(), { ignoreEncryption: true });
              // as frações dos recortes são da área visível da página (CropBox), como no pdf.js
              const pg = d.getPage(0), cb = pg.getCropBox(), width = cb.width, height = cb.height;
              const rel = { left: x0 * width, right: x1 * width, bottom: (1 - y1) * height, top: (1 - y0) * height };
              const box = { left: cb.x + rel.left, right: cb.x + rel.right, bottom: cb.y + rel.bottom, top: cb.y + rel.top };
              let ep; try { ep = await doc.embedPage(pg, box); await ep.embed(); ep = { kind: 'pdf', v: ep }; }
              catch (e) { doc.embeddedPages = (doc.embeddedPages || []).filter(x => x.alreadyEmbedded); ep = { kind: 'img', v: await doc.embedPng(await rasterPage(bytes, 0, rel)) }; }
              pieces.push({ ep, w: rel.right - rel.left, h: rel.top - rel.bottom, pw: width });
            }
            if (pieces.length) blocks.push({ label: pdfSafe(sc.label), pieces, Lc: cropLayout(pieces) });
          }
          if (blocks.length) {
            const PAD = 8, LAB = 16, GAPB = 12, titleH = 20;
            const avW = W - 2 * M - 2 * PAD, avH = H - 2 * M - titleH - blocks.length * (LAB + 2 * PAD) - (blocks.length - 1) * GAPB;
            const sc2 = Math.min(avW / Math.max(...blocks.map(b => b.Lc.W)), avH / blocks.reduce((t, b) => t + b.Lc.H, 0));
            newPage();
            page.drawText(pdfSafe(s.title), { x: M, y: y - 12, size: 11, font: F.b, color: green }); y -= titleH;
            for (const b of blocks) {
              const bw = Math.max(b.Lc.W * sc2 + 2 * PAD, 140), bh = LAB + b.Lc.H * sc2 + 2 * PAD;
              const bx = M + (W - 2 * M - bw) / 2;
              // contorno verde com cantos arredondados
              const rr = 8, x0 = 0, y0 = 0;
              page.drawSvgPath(`M ${rr} 0 H ${bw - rr} Q ${bw} 0 ${bw} ${rr} V ${bh - rr} Q ${bw} ${bh} ${bw - rr} ${bh} H ${rr} Q 0 ${bh} 0 ${bh - rr} V ${rr} Q 0 0 ${rr} 0 Z`,
                { x: bx + x0, y: y - y0, borderColor: green, borderWidth: 1 });
              page.drawText(b.label, { x: bx + PAD, y: y - PAD - 9, size: 8.5, font: F.b, color: green });
              const cx = bx + PAD + ((bw - 2 * PAD) - b.Lc.W * sc2) / 2, top = y - PAD - LAB;
              b.pieces.forEach((p, i) => {
                const px = cx + b.Lc.pos[i].x * sc2, py = top - (b.Lc.pos[i].y + p.h) * sc2;
                if (p.ep.kind === 'img') page.drawImage(p.ep.v, { x: px, y: py, width: p.w * sc2, height: p.h * sc2 });
                else page.drawPage(p.ep.v, { x: px, y: py, xScale: sc2, yScale: sc2 });
              });
              y -= bh + GAPB;
            }
            page = null; first = false;
          }
        } catch (e) { if (e instanceof Limit) throw e; console.warn('letra digitalizada', s.slug, e); }
      }
      for (const sc of scores) {
        try {
          if (isBookScan(sc)) continue;
          const src = await fileSrc(sc);
          const label = first ? pdfSafe(s.title + (scores.length > 1 ? ' — ' + sc.label : '')) : (scores.length > 1 ? pdfSafe(s.title + ' — ' + sc.label) : '');
          first = false;
          if (/^image\//.test(sc.mime || '')) {
            const b = await bytesOf(src), png = b[0] === 0x89;
            const img = png ? await doc.embedPng(b) : await doc.embedJpg(b);
            put({ kind: 'img', v: img }, img.width, img.height, label); continue;
          }
          const parts = src.pages ? [...src.pages].sort((a, b) => a.n - b.n) : [src];
          const crops = cropsOf(sc);

          let lab = label;
          for (const p of parts) {
            const bytes = await bytesOf(p);
            const d = await L.PDFDocument.load(bytes.slice(), { ignoreEncryption: true });
            // embute já (para um PDF com defeito não estragar o resto); se falhar, a página entra como imagem (pdf.js)
            const embed = async (pg, i, box) => {
              try { const ep = await doc.embedPage(pg, box); await ep.embed(); return { kind: 'pdf', v: ep }; }
              catch (e) {
                doc.embeddedPages = (doc.embeddedPages || []).filter(x => !x.alreadyEmbedded ? false : true);
                return { kind: 'img', v: await doc.embedPng(await rasterPage(bytes, i, box)) };
              }
            };
            const idxs = src.pages ? [0] : d.getPageIndices().slice(0, 8);
            for (const i of idxs) {
              const pg = d.getPage(i), { width, height } = pg.getSize();
              const cs = src.pages && crops ? crops.filter(cr => cr[0] === p.n) : [];
              if (cs.length) {
                for (const [, x0, y0, x1, y1] of cs) {
                  const box = { left: x0 * width, right: x1 * width, bottom: (1 - y1) * height, top: (1 - y0) * height };
                  put(await embed(pg, i, box), box.right - box.left, box.top - box.bottom, lab); lab = '';
                }
              } else if (!(src.pages && crops)) { put(await embed(pg, i), width, height, lab); lab = ''; }
            }
          }
        } catch (e) { if (e instanceof Limit) throw e; console.warn('partitura', s.slug, e); }
      }
    }
  }

  // ---------- Novos Cânticos (perfil Coro para cima): escrever, ler de um endereço ou de um PDF ----------
  let newPdf = null;
  let editSong = null; // cântico a editar (null = cântico novo)
  // obrigatórios: título; num cântico novo, também a letra (ou um PDF)
  const snGate = reqGate($('sn-save'), () => !!$('sn-title').value.trim() && (!!editSong || !!$('sn-text').value.trim() || !!newPdf), $('song-new'));
  function openNewSong() {
    if (lvl() < 2) return;
    newPdf = null; editSong = null;
    $('sn-h2').textContent = 'Novo cântico'; $('sn-gen').hidden = false; $('sn-files').hidden = true; $('sn-del').hidden = true;
    for (const id of ['sn-title', 'sn-author', 'sn-text']) $(id).value = '';
    fillCats('');
    $('sn-lang').innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    $('sn-lang').value = 'pt'; $('sn-pdf-name').textContent = ''; $('sn-msg').textContent = '';
    $('sn-hint').textContent = 'Fica em "Novos Cânticos" até um Maestro o aprovar.';
    $('sn-text-req').hidden = false; snGate();
    $('song-new').showModal();
  }
  // ---------- Editar cântico (Maestro / Gestor): título, autor, categoria, idioma, letra, gravações e partituras ----------
  function currentCat(s) {
    const c = allCategories().find(c => !AUTO_CATS.includes(c.id) && c.tg && (s.tags || []).some(t => t.grp === c.tg[0] && t.tag === c.tg[1]));
    return c ? catValue(c) : 'lang:' + (LANG_IDS.includes(s.language) ? s.language : 'outros');
  }
  function renderEditFiles() {
    const s = editSong; if (!s) return;
    const fs = [...scoresOf(s).map(f => ({ ...f, kind: 'score' })), ...filesOf(s, 'recording')];
    $('sn-flist').innerHTML = fs.length ? fs.map((f, i) => `<li><span>${f.kind === 'recording' ? 'Gravação' : 'Partitura'}: ${esc(f.label || '')}</span>${f.path && (s.files || []).some(x => x.path === f.path) ? `<button type="button" class="up-del" data-i="${i}" aria-label="Tirar ${esc(f.label || '')}">${TRASH}</button>` : ''}</li>`).join('') : '<li class="small">Sem gravações nem partituras.</li>';
    $('sn-flist').querySelectorAll('.up-del').forEach(b => b.onclick = async () => {
      if (!tapConfirm(b, /^enviados\//.test(fs[+b.dataset.i].path) ? 'Apagar?' : 'Tirar?')) return;
      const f = fs[+b.dataset.i];
      try {
        if (!DEMO) await api('unlinkfile', { slug: s.slug, path: f.path });
        s.files = (s.files || []).filter(x => x.path !== f.path); store.set(CACHE_KEY, allSongs);
        renderEditFiles(); toast('Ficheiro tirado do cântico');
      } catch (e) { appAlert(e.message || 'Não foi possível.'); }
    });
  }
  function openSongEdit(slug) {
    const s = bySlug.get(slug); if (!s || lvl() < 3) return;
    editSong = s; newPdf = null;
    $('sn-h2').textContent = 'Editar cântico'; $('sn-gen').hidden = true; $('sn-files').hidden = false;
    $('sn-del').disabled = false; $('sn-del').hidden = !srcOf(s).includes('novos'); // só os cânticos acrescentados na app se podem apagar
    $('sn-title').value = s.title || ''; $('sn-author').value = s.author || '';
    $('sn-lang').innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    $('sn-lang').value = s.language || 'pt';
    fillCats(currentCat(s)); $('sn-cat').dataset.orig = $('sn-cat').value;
    $('sn-text').value = toText(lyricsOf(s)); $('sn-text').dataset.orig = $('sn-text').value;
    $('sn-pdf-name').textContent = ''; $('sn-msg').textContent = '';
    $('sn-hint').textContent = s.is_edited ? 'A letra já foi editada; a original pode ser reposta na página do cântico.' : '';
    renderEditFiles();
    $('sn-text-req').hidden = true; snGate(); // a editar, a letra pode ficar vazia (cânticos só com partitura)
    $('song-new').showModal();
  }
  $('sn-del').onclick = async () => {
    const s = editSong; if (!s || !(await appConfirm(`Apagar o cântico «${s.title}»? Não se pode desfazer.`, 'Apagar'))) return;
    $('song-new').close(); decideSong(s, false, $('sn-del'));
  };
  $('sn-add-rec').onclick = async () => { await addFiles(editSong, 'recording', $('sn-add-rec')); renderEditFiles(); };
  $('sn-add-score').onclick = async () => { await addFiles(editSong, 'score', $('sn-add-score')); renderEditFiles(); };
  async function saveSongEdit() {
    const s = editSong, title = $('sn-title').value.trim(), text = $('sn-text').value.trim();
    if (!title) { $('sn-msg').textContent = 'Falta o título.'; return; }
    const b = $('sn-save'); b.disabled = true; $('sn-msg').textContent = 'A guardar…';
    try {
      const cat = $('sn-cat').value, orig = $('sn-cat').dataset.orig;
      const asTag = v => v && v.startsWith('tag:') ? (([grp, tag]) => ({ grp, tag }))(v.slice(4).split('||')) : null;
      await api('editsong', { slug: s.slug, title, author: $('sn-author').value.trim(), language: $('sn-lang').value,
        removeTag: cat !== orig ? asTag(orig) : null, addTag: cat !== orig ? asTag(cat) : null });
      if (text !== $('sn-text').dataset.orig.trim()) {
        if (!text) throw new Error('A letra não pode ficar vazia (use "Repor original" para voltar à original).');
        await api('save', { slug: s.slug, lyrics_edit: fromText(text) });
        lyr.delete(s.slug); saveLyrCache(); lyrIndex = null;
      }
      $('song-new').close(); toast('Cântico guardado');
      await load();
      if (lastSongSlug === s.slug) { const y = window.scrollY; showSong(s.slug); window.scrollTo(0, y); }
    } catch (e) { $('sn-msg').textContent = e instanceof Limit ? e.message : (e.message || 'Não foi possível guardar.'); }
    finally { b.disabled = false; }
  }
  // categorias: todas as da página inicial (língua, Coro, momentos, Songbook, CANTI e as próprias), menos as automáticas
  const AUTO_CATS = ['todos', 'traducao', 'acordes', 'partituras', 'gravacoes', 'copyright'];
  const catValue = c => c.lang ? 'lang:' + c.id : 'tag:' + c.tg[0] + '||' + c.tg[1];
  function fillCats(sel) {
    const list = allCategories().filter(c => !AUTO_CATS.includes(c.id) && (c.lang || c.tg));
    if (sel && sel.startsWith('tag:') && !list.some(c => catValue(c) === sel)) { const [g, t] = sel.slice(4).split('||'); list.push({ id: 'nova', tg: [g, t], label: t, head: 'Outras categorias' }); }
    let html = '', open = false;
    for (const c of list) {
      const head = c.lang ? null : c.head;
      if (head) { html += (open ? '</optgroup>' : '') + `<optgroup label="${esc(head)}">`; open = true; }
      html += `<option value="${esc(catValue(c))}">${esc(catName(c))}</option>`;
    }
    $('sn-cat').innerHTML = html + (open ? '</optgroup>' : '') + '<option value="nova">+ Nova categoria…</option>';
    $('sn-cat').value = sel || 'lang:' + (LANG_IDS.includes($('sn-lang').value) ? $('sn-lang').value : 'pt');
    $('sn-cat').dataset.prev = $('sn-cat').value;
  }
  const LANG_IDS = ['pt', 'it', 'la', 'en', 'es', 'fr'];
  $('sn-cat').onchange = async () => {
    const v = $('sn-cat').value;
    if (v === 'nova') {
      const t = (await appPrompt('Nova categoria', '', 'Por exemplo: Cânticos de Natal'))?.replace(/\s+/g, ' ').replace(/\|/g, '').trim().slice(0, 60);
      fillCats(t ? 'tag:Categoria||' + t : $('sn-cat').dataset.prev); return;
    }
    if (v.startsWith('lang:') && v !== 'lang:outros') $('sn-lang').value = v.slice(5);
    $('sn-cat').dataset.prev = v;
  };
  $('sn-lang').onchange = () => { if ($('sn-cat').value.startsWith('lang:')) fillCats('lang:' + (LANG_IDS.includes($('sn-lang').value) ? $('sn-lang').value : 'outros')); };
  // idioma provável de uma letra (palavras mais comuns de cada língua)
  const STOPW = { pt: 'o a os as de do da que e em um uma não meu minha tu teu nós é são ao pelo para com senhor coração', it: 'il lo la gli le di del della che e è non un una io mio mia noi per con sono nel signore cuore più', es: 'el la los las de del que y en un una no mi yo por con es son al señor corazón más muy', fr: 'le la les de du des que et en un une ne pas je nous vous est sont au pour avec seigneur', en: 'the a of and to in is you i my your we he she it not with for be are on all lord heart', la: 'et in est non ad cum qui quae quod deus dominus domine nobis nos tibi mea sanctus gloria' };
  function guessLang(text) {
    const w = norm(text).match(/[a-z']+/g) || []; let best = 'pt', top = 0;
    for (const [l, list] of Object.entries(STOPW)) { const set = new Set(norm(list).split(' ')); const n = w.filter(x => set.has(x)).length; if (n > top) { top = n; best = l; } }
    return best;
  }
  // gerar: preenche título, autor, letra e idioma / categoria (o que for encontrado)
  const fill = d => {
    if (d.title) $('sn-title').value = d.title;
    if (d.author) $('sn-author').value = d.author;
    if (d.text) {
      $('sn-text').value = d.text;
      $('sn-lang').value = guessLang(d.title + '\n' + d.text);
      if ($('sn-cat').value.startsWith('lang:')) fillCats('lang:' + $('sn-lang').value);
    }
    snGate();
  };
  $('sn-url-go').onclick = async () => {
    const u = (await appPrompt('Gerar de URL', '', 'Endereço (URL) de uma página com a letra do cântico'))?.trim(); if (!u) return;
    const b = $('sn-url-go'); b.disabled = true; $('sn-msg').textContent = 'A ler a página…';
    try { const d = await api('scrape', { url: u }); fill(d); $('sn-msg').textContent = 'Gerado a partir da página: confira o título, o autor, a categoria e a letra antes de guardar.'; }
    catch (e) { $('sn-msg').textContent = e.message || 'Não foi possível ler essa página.'; }
    finally { b.disabled = false; }
  };
  $('sn-pdf').onclick = async () => {
    const [f] = await pickFiles('application/pdf', false); if (!f) return;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { $('sn-msg').textContent = 'Escolha um ficheiro PDF.'; return; }
    newPdf = f; snGate(); $('sn-pdf-name').textContent = 'PDF: ' + f.name + ' (fica junto ao cântico)'; $('sn-msg').textContent = 'A ler o texto do PDF…';
    try {
      const lib = await loadPdfJs(), doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
      const out = [];
      for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
        const tc = await (await doc.getPage(i)).getTextContent(); let lastY = null, line = '', gap = 0;
        for (const it of tc.items) {
          const y = it.transform[5], h = it.height || 10;
          if (lastY !== null && Math.abs(y - lastY) > h * 0.5) { out.push(line.trim()); if (Math.abs(y - lastY) > h * 1.9) out.push(''); line = ''; }
          line += it.str; lastY = y; gap = h;
        }
        if (line.trim()) out.push(line.trim()); out.push('');
      }
      const text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      const lines = text.split('\n').filter(l => l.trim());
      // título: a 1.ª linha com letras (não números de página nem cabeçalhos curtos)
      const ti = lines.findIndex(l => /\p{L}{3}/u.test(l) && l.length <= 80);
      if (lines.length) { fill({ title: ti >= 0 ? lines[ti] : '', text: text.split('\n').slice(text.split('\n').indexOf(lines[Math.max(ti, 0)]) + (ti >= 0 ? 1 : 0)).join('\n').replace(/^\n+/, '') }); $('sn-msg').textContent = 'Texto do PDF copiado para o formulário: confira-o. O PDF fica junto ao cântico.'; }
      else $('sn-msg').textContent = 'O PDF não tem texto (é uma imagem): escreva a letra ou guarde só com o PDF.';
    } catch (e) { $('sn-msg').textContent = 'Não foi possível ler o PDF; ele fica na mesma junto ao cântico.'; }
  };
  $('sn-cancel').onclick = () => $('song-new').close();
  $('sn-save').onclick = async () => {
    if (editSong) return saveSongEdit();
    const title = $('sn-title').value.trim(), text = $('sn-text').value.trim();
    if (!title) { $('sn-msg').textContent = 'Falta o título.'; $('sn-title').focus(); return; }
    if (!text && !newPdf) { $('sn-msg').textContent = 'Escreva a letra, leia-a de um endereço ou junte um PDF.'; return; }
    const b = $('sn-save'); b.disabled = true; $('sn-msg').textContent = 'A procurar cânticos parecidos…';
    try {
      // já há cânticos com título ou letra parecidos? quem cria tem de confirmar (e quem aprova também é avisado)
      const sim = (await api('similar', { title, lines: text.split('\n') })).similar || [];
      if (sim.length && !(await appConfirm(`Já existem cânticos parecidos:\n\n${sim.map(x => `• ${x.title}${x.author ? ' — ' + x.author : ''} (${x.why} parecido${x.why.includes(' e ') ? 's' : ''})`).join('\n')}\n\nQuer mesmo acrescentar este cântico?${lvl() >= 3 ? '' : ' Quem aprovar também vai ver este aviso.'}`, 'Criar mesmo assim', 'Cânticos parecidos'))) { $('sn-msg').textContent = ''; return; }
      $('sn-msg').textContent = 'A guardar…';
      const cat = $('sn-cat').value;
      const [cgrp, ctag] = cat.startsWith('tag:') ? cat.slice(4).split('||') : [];
      const d = await api('addsong', { title, author: $('sn-author').value.trim(), language: $('sn-lang').value, tag: ctag ? { grp: cgrp, tag: ctag } : null, lyrics: text ? fromText(text) : [], hasPdf: !!newPdf });
      if (newPdf) {
        $('sn-msg').textContent = 'A enviar o PDF…';
        const up = await api('upload', { slug: d.slug, kind: 'score', mime: 'application/pdf', size: newPdf.size });
        if (up.url) { const r = await fetch(up.url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: newPdf }); if (!r.ok) throw new Error('O envio do PDF falhou (' + r.status + ').'); }
        await api('addfile', { slug: d.slug, kind: 'score', mime: 'application/pdf', size: newPdf.size, path: up.path, label: 'Partitura', ...(DEMO ? { _blob: newPdf } : {}) });
      }
      $('song-new').close();
      toast(d.approved ? 'Cântico acrescentado' : 'Cântico acrescentado — fica à espera de aprovação');
      await load();
      location.hash = '#/cantico/' + encodeURIComponent(d.slug);
    } catch (e) { $('sn-msg').textContent = e instanceof Limit ? e.message : (e.message || 'Não foi possível guardar.'); }
    finally { b.disabled = false; }
  };
  async function decideSong(s, ok, btn) {
    const sims = Array.isArray(s.parecidos) ? s.parecidos : [];
    // aprovar: para o Cancioneiro (todos os perfis) ou para o livro do Coro; depois confirmar (com os parecidos, se houver)
    const dest = ok ? await appChoose('Aprovar para…', [
      { value: 'cancioneiro', label: 'Cancioneiro', sub: 'Todos os perfis veem o cântico (fica também no livro do Coro)' },
      { value: 'coro', label: 'Coro', sub: 'Só no livro do Coro (perfis Coro, Maestro e Gestor)' }]) : null;
    if (ok && !dest) return;
    if (ok) {
      const where = dest === 'coro' ? 'para o livro do Coro' : 'para o Cancioneiro (todos os perfis o veem)';
      const sim = sims.length ? `Atenção: parece-se com\n${sims.map(x => `• ${x.title}${x.author ? ' — ' + x.author : ''} (${x.why})`).join('\n')}\n\n` : '';
      if (!(await appConfirm(`${sim}Aprovar «${s.title}» ${where}?`, sims.length ? 'Aprovar mesmo assim' : 'Aprovar', 'Aprovar cântico'))) return;
    }
    btn.disabled = true;
    try {
      await api(ok ? 'approvesong' : 'delsong', { slug: s.slug });
      if (dest) await api('coro', { slug: s.slug, on: true }); // todos os aprovados vão para o livro do Coro
      if (dest === 'cancioneiro') await api('promote', { slug: s.slug, on: true });
      toast(!ok ? 'Cântico apagado' : dest === 'coro' ? 'Cântico aprovado — no livro do Coro' : 'Cântico aprovado — no Cancioneiro');
      await load();
      location.hash = ok ? '#/cantico/' + encodeURIComponent(s.slug) : '#/lista/livro-novos';
      if (ok) route();
    } catch (e) { appAlert(e.message || 'Não foi possível.'); btn.disabled = false; }
  }

  // ---------- Acrescentar gravações e partituras (Maestro / Gestor) ----------
  // Partitura: um PDF, ou fotografias/imagens das páginas, que são juntas num só PDF (uma página por imagem)
  function pickFiles(accept, multiple) {
    return new Promise(res => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
      inp.style.display = 'none'; document.body.appendChild(inp);
      inp.onchange = () => { res([...inp.files]); inp.remove(); };
      addEventListener('focus', () => setTimeout(() => { if (!inp.files.length) { res([]); inp.remove(); } }, 1500), { once: true });
      inp.click();
    });
  }
  // imagem (também HEIC/WebP, se o browser a abrir) → JPEG com no máximo 2400 px
  async function toJpeg(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
      const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      return { w: c.width, h: c.height, bytes: new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85))).arrayBuffer()) };
    } finally { URL.revokeObjectURL(url); }
  }
  async function imagesToPdf(files) {
    const L = await loadPdfLib(), doc = await L.PDFDocument.create();
    for (const f of files) {
      const j = await toJpeg(f), img = await doc.embedJpg(j.bytes);
      const W = 595.28, H = 841.89, M = 18, sc = Math.min((W - 2 * M) / j.w, (H - 2 * M) / j.h);
      doc.addPage([W, H]).drawImage(img, { x: (W - j.w * sc) / 2, y: H - M - j.h * sc, width: j.w * sc, height: j.h * sc });
    }
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }
  const audioMime = f => f.type || ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg' }[(f.name.split('.').pop() || '').toLowerCase()] || '');
  async function addFiles(s, kind, btn) {
    const rec = kind === 'recording';
    const files = await pickFiles(rec ? 'audio/*,.mp3,.m4a,.wav' : 'application/pdf,image/*', !rec);
    if (!files.length) return;
    let blob, mime;
    const orig = btn.innerHTML; btn.disabled = true; btn.textContent = 'A preparar…';
    try {
      if (rec) { blob = files[0]; mime = audioMime(files[0]).replace('audio/x-m4a', 'audio/mp4').replace('audio/m4a', 'audio/mp4'); }
      else if (files.length === 1 && files[0].type === 'application/pdf') { blob = files[0]; mime = 'application/pdf'; }
      else { const imgs = files.filter(f => f.type !== 'application/pdf'); if (!imgs.length) throw new Error('Escolha um PDF ou fotografias das páginas.'); blob = await imagesToPdf(imgs); mime = 'application/pdf'; }
      btn.innerHTML = orig; btn.disabled = false;
      const def = rec ? (files[0].name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Gravação') : 'Partitura';
      const label = await appPrompt(rec ? 'Nome da gravação' : 'Nome da partitura', def, rec ? 'Por exemplo: Sopranos, Tenores, Todas as vozes' : (files.length > 1 ? `${files.length} páginas, juntas num PDF` : ''));
      if (label === null) return;
      btn.disabled = true; btn.textContent = 'A enviar…';
      const up = await api('upload', { slug: s.slug, kind, mime, size: blob.size });
      if (up.url) {
        const r = await fetch(up.url, { method: 'PUT', headers: { 'Content-Type': mime, 'x-upsert': 'false' }, body: blob });
        if (!r.ok) throw new Error('O envio falhou (' + r.status + ').');
      }
      const row = await api('addfile', { slug: s.slug, kind, mime, size: blob.size, path: up.path, label: label.trim(), ...(DEMO ? { _blob: blob } : {}) });
      s.files = [...(s.files || []), row];
      const all = allSongs.find(x => x.slug === s.slug); if (all && all !== s) all.files = s.files;
      store.set(CACHE_KEY, allSongs);
      toast(rec ? 'Gravação acrescentada' : 'Partitura acrescentada');
      if (lastSongSlug === s.slug && !$('view-song').hidden) { const y = window.scrollY; showSong(s.slug); window.scrollTo(0, y); }
    } catch (e) {
      appAlert(e instanceof Limit ? e.message : (e.message || 'Não foi possível acrescentar o ficheiro.'));
    } finally { if (document.body.contains(btn)) { btn.innerHTML = orig; btn.disabled = false; } }
  }

  async function delFile(s, path) {
    try {
      if (!DEMO) await api('delfile', { path });
      s.files = (s.files || []).filter(f => f.path !== path);
      signed.delete(path); store.set(CACHE_KEY, allSongs);
      try { const c = await caches.open(MEDIA); await c.delete(mkey(path)); } catch (e) {}
      toast('Ficheiro apagado');
      if (lastSongSlug === s.slug && !$('view-song').hidden) { const y = window.scrollY; showSong(s.slug); window.scrollTo(0, y); }
    } catch (e) { appAlert(e instanceof Limit ? e.message : (e.message || 'Não foi possível apagar o ficheiro.')); }
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
      if ($('editor').open) $('edit-msg').textContent = msg; else appAlert(msg);
    } finally {
      for (const b of document.querySelectorAll('#editor button')) b.disabled = false;
    }
  }
  $('edit-save').onclick = () => {
    const st = fromText($('edit-text').value);
    if (!st.length) { $('edit-msg').textContent = 'A letra não pode ficar vazia.'; return; }
    saveLyrics(st);
  };
  function revertLyrics(slug, btn) {
    if (!btn || !tapConfirm(btn, 'Confirmar: repor original')) return;
    editSlug = slug;
    saveLyrics(null);
  }
  $('edit-reset').onclick = () => revertLyrics(editSlug, $('edit-reset'));

  // ---------- Janelas da app (em vez de alert/confirm/prompt do sistema, para manter o aspeto) ----------
  function appDialog({ title = '', msg = '', html = '', input = null, list = null, ok = 'OK', okHtml = '', cancel = 'Cancelar', extra = '', optional = false }) {
    return new Promise(resolve => {
      const d = $('app-dlg');
      $('app-dlg-title').textContent = title; $('app-dlg-title').hidden = !title;
      if (html) $('app-dlg-msg').innerHTML = html; else $('app-dlg-msg').textContent = msg; // html: só texto da própria app
      $('app-dlg-msg').hidden = !msg && !html;
      const inp = $('app-dlg-input'); inp.hidden = input === null; inp.value = input ?? '';
      d.classList.toggle('top-dlg', input !== null); // com caixa de texto: fica no topo (o teclado não a faz saltar)
      const lst = $('app-dlg-list'); lst.hidden = !list;
      lst.innerHTML = (list || []).map((o, i) => `<button class="tpl-apply" data-i="${i}"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('');
      // confirmações que apagam ou deitam fora (Apagar, Remover, Retirar, Recusar, Sair sem guardar): botão vermelho
      $('app-dlg-ok').classList.toggle('danger-fill', input === null && !list && /^(Apagar|Remover|Retirar|Recusar|Sair sem guardar)/.test(ok || ''));
      if (okHtml) $('app-dlg-ok').innerHTML = okHtml; else $('app-dlg-ok').textContent = ok; $('app-dlg-ok').hidden = !!list || ok === null;
      $('app-dlg-cancel').textContent = cancel || ''; $('app-dlg-cancel').hidden = !cancel;
      $('app-dlg-extra').textContent = extra; $('app-dlg-extra').hidden = !extra; // botão à esquerda: devolve { extra, value }
      const done = v => { d.close(); resolve(v); };
      // caixa de texto obrigatória: OK desativado enquanto estiver vazia
      const need = input !== null && !optional, gate = () => { $('app-dlg-ok').disabled = need && !inp.value.trim(); };
      inp.oninput = gate; gate();
      $('app-dlg-ok').onclick = () => done(input !== null ? inp.value : true);
      $('app-dlg-cancel').onclick = () => done(input !== null || list ? null : false);
      lst.querySelectorAll('button').forEach(b => b.onclick = () => done(list[+b.dataset.i].value));
      $('app-dlg-extra').onclick = () => done({ extra: true, value: inp.value });
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (!$('app-dlg-ok').disabled) done(inp.value); } };
      d.oncancel = e => { e.preventDefault(); done(input !== null || list ? null : false); };
      d.showModal();
      if (input !== null) setTimeout(() => { inp.focus(); inp.select(); }, 50);
    });
  }
  // Rodapés das janelas: numa linha com larguras iguais; se algum texto não cabe, passa a coluna (.stack).
  // Mede sempre em linha (sem a classe), para não oscilar. Volta a medir quando o tamanho ou o texto mudam.
  function fitActions(el) {
    el.classList.remove('stack'); el.classList.add('measure'); // .measure: cada botão com a largura do seu texto
    const bs = [...el.querySelectorAll(':scope > button, :scope > span > button')].filter(b => b.offsetParent);
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    // larguras iguais: cabe se o texto mais largo (com 8 px de cada lado), vezes o número de botões, cabe na linha
    const txt = b => { const cs = getComputedStyle(b); return b.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 16; };
    const need = bs.length ? Math.max(...bs.map(txt)) * bs.length + gap * (bs.length - 1) : 0;
    el.classList.remove('measure');
    if (need > el.clientWidth + 1) el.classList.add('stack');
  }
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(es => es.forEach(e => fitActions(e.target))), mo = new MutationObserver(ms => new Set(ms.map(m => m.target.closest('.edit-actions'))).forEach(el => el && fitActions(el)));
    document.querySelectorAll('.edit-actions').forEach(el => { ro.observe(el); mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] }); });
  }
  const appAlert = (msg, title = '') => appDialog({ title, msg, cancel: null });
  const appConfirm = (msg, ok = 'Sim', title = '') => appDialog({ title, msg, ok });
  const appPrompt = (title, value = '', msg = '', optional = false) => appDialog({ title, msg, input: value, optional });
  // Campos obrigatórios (* vermelho a seguir ao nome): o botão de guardar fica desativado até estarem preenchidos.
  // Devolve a função que volta a verificar (chamar depois de preencher os campos por código).
  function reqGate(btn, ok, root) { const f = () => { btn.disabled = !ok(); }; root.addEventListener('input', f); root.addEventListener('change', f); return f; }
  const appChoose = (title, list, msg = '') => appDialog({ title, msg, list });

  // Confirmação em dois toques dentro das janelas (no iPhone, o confirm() do sistema não aparece com uma janela aberta):
  // o 1.º toque põe o botão vermelho a pedir confirmação; o 2.º (em 4 s) confirma
  function tapConfirm(btn, label) {
    if (btn.dataset.armed) { clearTimeout(+btn.dataset.armed); delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = btn.dataset.orig; return true; }
    btn.dataset.orig = btn.innerHTML; btn.textContent = label; btn.classList.add('armed');
    btn.dataset.armed = setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = btn.dataset.orig; }, 4000);
    return false;
  }

  // ---------- Promover ao Cancioneiro (perfil Maestro) ----------
  async function promote(slug, on, confirmed) {
    const s = bySlug.get(slug);
    if (!on && !confirmed && !(await appConfirm('Retirar este cântico do Cancioneiro? Quem tem o perfil Cancioneiro deixa de o ver.', 'Retirar'))) return;
    const b = $('btn-promo'); if (b) b.disabled = true;
    try {
      const d = await api('promote', { slug, on });
      Object.assign(s, d);
      store.set(CACHE_KEY, allSongs.map(({ _t, _a, ...x }) => x));
      applySource();
      toast(on ? 'Cântico promovido ao Cancioneiro' : 'Cântico retirado do Cancioneiro');
    } catch (e) { appAlert(e instanceof Limit ? e.message : 'Não foi possível guardar: ' + e.message); }
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
  // Adicionar ao ecrã principal: no Android o browser oferece a instalação; no iPhone/iPad só pelo menu Partilhar
  let installEvt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  document.body.classList.toggle('standalone', standalone());
  addEventListener('appinstalled', () => { installEvt = null; document.body.classList.add('standalone'); store.set('cancioneiro.instalada', 1); });
  // 1.ª vez que abre a app no browser do telemóvel: propõe instalar; 2.ª vez (se ainda não instalou): mostra onde se faz,
  // no menu do canto superior direito (Perfil, ou o "i" para quem só tem o perfil Cancioneiro). Depois não volta a insistir.
  // ---------- Tutorial: corre na 1.ª vez (adaptado ao perfil); pode ver-se de novo no "i" ----------
  const TOUR_KEY = 'cancioneiro.tutorial';
  // cada passo pode abrir a página de que fala (go) e destacar um elemento dela (el); diz também como lá chegar
  const closeAllDialogs = () => document.querySelectorAll('dialog[open]:not(.tour)').forEach(d => d.close());
  const waitFor = async (sel, ms = 2500) => { for (let t = 0; t < ms; t += 100) { const e = document.querySelector(sel); if (e && e.offsetParent) return e; await new Promise(r => setTimeout(r, 100)); } return null; };
  const goHome = async () => { closeAllDialogs(); closeDrawer(); if ((location.hash || '#/') !== '#/') { location.hash = '#/'; await new Promise(r => setTimeout(r, 400)); } window.scrollTo(0, 0); };
  function tourSong(L) {
    const pool = allSongs.filter(s => s.approved !== false && (L >= 2 || inCancioneiro(s)));
    return (L >= 2 && (pool.find(s => s.has_chords && filesOf(s, 'recording').length && scoresOf(s).length) || pool.find(s => filesOf(s, 'recording').length)))
      || pool.find(s => s.has_translation) || pool[0];
  }
  function tourSteps() {
    const L = rankOf(maxRole) || 1, solo = document.body.classList.contains('solo'), song = tourSong(L);
    const openSong = async () => { closeAllDialogs(); closeDrawer(); if (song) { location.hash = '#/cantico/' + encodeURIComponent(song.slug); await waitFor('#song h1'); window.scrollTo(0, 0); } };
    const st = [
      { go: goHome, msg: 'Bem-vindo ao Cancioneiro! Uma volta rápida pelo que pode fazer: vamos abrir as várias páginas da app.' },
      { go: goHome, el: '.search', msg: 'Na página inicial, procure qualquer cântico pelo título, autor, número ou por palavras da letra.' },
      { go: goHome, el: '#btn-mic', msg: 'Toque no microfone e deixe o telemóvel ouvir uns segundos de um cântico: a app descobre qual é.' },
      { go: goHome, el: '#btn-menu', msg: 'Este botão, à esquerda da pesquisa, abre as coleções. Vamos abri-las…' },
      { go: async () => { closeAllDialogs(); openDrawer(); await new Promise(r => setTimeout(r, 450)); }, el: '.drawer-panel',
        msg: L >= 2 ? 'As coleções: os seus Preferidos, o Cancioneiro, o Coro, o Songbook, o CANTI 2024, os Novos Cânticos e as folhas preparadas para cada Missa.' : 'As coleções: os seus Preferidos, o Cancioneiro e as folhas preparadas para cada Missa.' },
    ];
    if (song) {
      st.push({ go: openSong, el: '#view-song .songbar', msg: `Toque num cântico de qualquer lista para o abrir — por exemplo, «${song.title}». No topo: ${L >= 3 ? 'o livro põe-no nos Preferidos, no Cancioneiro, no Coro ou numa folha' : '☆ guarda-o nos Preferidos'}; partilhar envia-o a alguém (o endereço vale 24 horas); ☾ alterna claro / escuro; A− / A+ muda o tamanho da letra.` });
      if (L >= 2) {
        st.push({ go: openSong, el: '#btn-chords', msg: 'Mostra ou esconde os acordes por cima da letra.' });
        st.push({ go: openSong, el: '#song .meta a.pdf', msg: 'As partituras (e as páginas dos livros) abrem aqui, por baixo do título; dentro, amplie com dois dedos.' });
        st.push({ go: async () => { await openSong(); const r = await waitFor('#song .recs'); if (r) r.scrollIntoView({ block: 'center' }); }, el: '#song .recs', msg: 'As gravações de cada voz: toque para ouvir. Pode sair do cântico que a gravação continua, com um botão por cima da app para a parar.' });
      }
      if (L >= 3) st.push({ go: async () => { await openSong(); const e = await waitFor('#btn-edit'); if (e) e.scrollIntoView({ block: 'center' }); }, el: '#btn-edit', msg: 'No fim de cada cântico, «Editar cântico» muda a letra, o título, a categoria, as gravações e as partituras.' });
    }
    st.push({ go: goHome, el: '#btn-perfil', msg: solo ? 'Este símbolo, no canto superior direito, abre a ajuda («i»). Vamos abri-la…' : 'Este símbolo, no canto superior direito, abre o seu Perfil. Vamos abri-lo…' });
    if (solo) {
      st.push({ go: async () => { await goHome(); $('btn-perfil').click(); await waitFor('#info-install'); }, el: '#info-install', msg: 'Aqui pode instalar a app no ecrã principal…' });
      st.push({ go: async () => { if (!$('info').open) { await goHome(); $('btn-perfil').click(); } await waitFor('#info-share-app'); }, el: '#info-share-app', msg: '…partilhá-la com quem quiser, e rever este tutorial («Ver o tutorial»).' });
    } else {
      const openPerfil = async () => { if (!$('perfis').open) { await goHome(); $('btn-perfil').click(); } await waitFor('#perfis-list'); };
      st.push({ go: openPerfil, el: '#perfis-list', msg: 'No Perfil pode usar um perfil mais simples (por exemplo, ver só o Cancioneiro).' });
      st.push({ go: openPerfil, el: '#perfis-install', msg: 'Instalar a app no ecrã principal do telemóvel.' });
      if (L >= 2) st.push({ go: openPerfil, el: '#perfis-newsong', msg: 'Acrescentar um cântico que falta: escreva-o ou gere-o de uma página da internet ou de um PDF.' + (L >= 3 ? '' : ' Um Maestro aprova-o.') });
      if (L >= 3) st.push({ go: openPerfil, el: '.perfil-admin', msg: L >= 4 ? '«Gestão de utilizadores»: autorizar pedidos de acesso, mudar perfis e retirar acessos.' : '«Gestão de utilizadores»: mudar o perfil das pessoas entre Cancioneiro, Coro e Maestro.' });
      st.push({ go: openPerfil, el: '#perfil-info', msg: 'O «i» tem a ajuda, partilhar a app (com convite para um perfil) e «Ver o tutorial», para rever esta volta.' });
    }
    if (L >= 3) st.push({ go: async () => { closeAllDialogs(); openDrawer(); await waitFor('.col-new'); }, el: '.col-new', msg: 'Nas coleções, «+ Nova folha» cria a folha de uma Missa: escolhe um template ao criá-la (ex.: Missa) e começa em edição (só os Maestros a veem), com «+ Adicionar cântico» em cada secção; «Publicar» mostra-a ao Coro, e depois pode partilhá-la e gerar o PDF. Os cânticos novos esperam aqui pela sua aprovação, em «Novos Cânticos».' });
    st.push({ go: goHome, msg: 'Pronto! Pode rever este tutorial quando quiser no «i» → «Ver o tutorial».' });
    return st;
  }
  function startTour(force) {
    if (!force && store.get(TOUR_KEY, 0)) { installCoach(); return; }
    if (!force && ($('view-list').hidden || document.querySelector('dialog[open]'))) { installCoach(); return; }
    const steps = tourSteps(); let i = 0, busy = false;
    // o tutorial é ele próprio uma janela (fica por cima das janelas que abre, como o Perfil)
    const ov = document.createElement('dialog'); ov.className = 'tour';
    ov.innerHTML = '<div class="tour-hole"></div><div class="tour-box" aria-live="polite"><p class="tour-msg"></p><div class="tour-nav"><span class="tour-n"></span><button type="button" class="tour-skip">Saltar</button><button type="button" class="tour-next">Seguinte</button></div></div>';
    document.body.appendChild(ov);
    const hole = ov.querySelector('.tour-hole'), box = ov.querySelector('.tour-box');
    const end = async () => { ov.close(); ov.remove(); removeEventListener('resize', place); store.set(TOUR_KEY, 1); await goHome(); if (!force) installCoach(); };
    function place() {
      const st = steps[i], t = st.el && document.querySelector(st.el);
      if (t && t.offsetParent) {
        const r = t.getBoundingClientRect(), pad = 6;
        Object.assign(hole.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px' });
        ov.classList.remove('center');
        const below = r.bottom + 200 < innerHeight;
        box.style.top = below ? Math.min(r.bottom + 14, innerHeight - 190) + 'px' : ''; box.style.bottom = below ? '' : Math.max(innerHeight - r.top + 14, 12) + 'px';
        if (!below && r.top < 200) { box.style.bottom = '16px'; }
      } else { hole.style.display = 'none'; ov.classList.add('center'); box.style.top = box.style.bottom = ''; }
    }
    async function show() {
      if (busy) return; busy = true;
      const st = steps[i];
      if (ov.open) ov.close();
      try { if (st.go) await st.go(); } catch (e) { console.warn('tutorial', e); }
      if (st.el) await waitFor(st.el, 1500);
      ov.querySelector('.tour-msg').textContent = st.msg;
      ov.querySelector('.tour-n').textContent = `${i + 1} / ${steps.length}`;
      ov.querySelector('.tour-next').textContent = i === steps.length - 1 ? 'Terminar' : 'Seguinte';
      ov.showModal(); place(); busy = false;
    }
    ov.querySelector('.tour-next').onclick = () => { if (busy) return; if (++i >= steps.length) end(); else show(); };
    ov.querySelector('.tour-skip').onclick = () => { if (!busy) end(); };
    ov.addEventListener('cancel', e => { e.preventDefault(); if (!busy) end(); });
    addEventListener('resize', place);
    show();
  }
  function installCoach() {
    if (standalone()) { store.set('cancioneiro.instalada', 1); return; }
    if (!matchMedia('(pointer: coarse)').matches || store.get('cancioneiro.instalada', 0)) return;
    // quem já usava a app antes desta proposta também a vê uma vez (recomeça a contagem, só uma vez)
    if (!store.get('cancioneiro.instalar.v2', 0)) { store.set('cancioneiro.instalar.v2', 1); store.set('cancioneiro.aberturas', 0); }
    const n = store.get('cancioneiro.aberturas', 0) + 1;
    store.set('cancioneiro.aberturas', n);
    if (n === 1) setTimeout(async () => {
      if (document.querySelector('dialog[open]')) return;
      const plus = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>';
      const okIc = '<svg class="btn-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>';
      if (await appDialog({ title: 'Instalar a app', okHtml: okIc + 'Instalar', html: `Pode instalar o Cancioneiro no ecrã principal do telemóvel ou do tablet: passa a abrir como uma app, em ecrã inteiro e mais depressa. Pode fazê-lo também mais tarde, no menu do canto superior direito (${plus} «Adicionar a app ao ecrã principal»).` })) installApp();
    }, 1500);
    else if (n === 2) setTimeout(() => {
      if (document.querySelector('dialog[open]')) return;
      $('btn-perfil').click(); // abre o Perfil (ou o "i")
      setTimeout(() => {
        const btn = $('perfis').open ? $('perfis-install') : $('info-install'), line = btn && btn.closest('p');
        if (!line || !line.offsetParent) return;
        line.classList.add('coach');
        const hint = document.createElement('p'); hint.className = 'coach-hint';
        hint.textContent = 'Ainda não instalou a app no ecrã principal? Toque aqui. Pode sempre fazê-lo neste menu, que se abre no símbolo do canto superior direito.';
        line.before(hint); line.scrollIntoView({ block: 'center' });
        const dlg = line.closest('dialog');
        dlg.addEventListener('close', () => { hint.remove(); line.classList.remove('coach'); }, { once: true });
      }, 400);
    }, 1500);
  }
  async function installApp() {
    if (installEvt) { const e = installEvt; installEvt = null; e.prompt(); await e.userChoice.catch(() => null); return; }
    const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    appAlert(ios ? 'No Safari, toque em Partilhar (o quadrado com a seta para cima, em baixo ou no topo do ecrã) e escolha «Adicionar ao ecrã principal». A app fica com o ícone do Cancioneiro e abre em ecrã inteiro.'
      : /Android/.test(ua) ? 'No menu do browser (⋮, no canto de cima), escolha «Adicionar ao ecrã principal» ou «Instalar app».'
      : 'No telemóvel ou tablet, abra este endereço no browser e escolha «Adicionar ao ecrã principal» (iPhone/iPad: no menu Partilhar; Android: no menu ⋮).', 'Adicionar ao ecrã principal');
  }
  // Partilhar a app: o endereço da página de entrada (quem não tem acesso pode pedi-lo lá)
  // com um convite para um perfil até ao de quem partilha (o perfil Cancioneiro só convida para Cancioneiro)
  $('info-share-app').onclick = async () => {
    const mine = rankOf(maxRole) || 1;
    let role = 'cancioneiro';
    if (mine > 1) {
      role = await appChoose('Partilhar a app', PERFIS.slice(0, mine).reverse().map(p => ({ value: p.id, label: p.label, sub: p.desc })), 'Para que perfil é o convite? Quem o receber pede acesso e um Gestor confirma.');
      if (!role) return;
    }
    let url;
    try { url = location.origin + location.pathname + '?convite=' + (await api('invite', { role })).token; }
    catch (e) { appAlert(e instanceof Limit ? e.message : 'Não foi possível criar o convite. Verifique a ligação à internet.'); return; }
    const label = (PERFIS.find(p => p.id === role) || {}).label || role;
    await shareOrCopy(url, 'convite para o perfil ' + label + ', válido 30 dias', 'Cancioneiro');
  };
  $('perfis-install').onclick = installApp;
  $('info-tour').onclick = () => { $('info').close(); setTimeout(() => startTour(true), 300); };
  $('perfis-newsong').onclick = () => { $('perfis').close(); openNewSong(); }; $('info-install').onclick = installApp;
  $('perfil-info').onclick = () => { $('perfis').close(); $('info').showModal(); $('info').scrollTop = 0; };
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
        <label class="adm-req"><input id="add-email" type="email" placeholder="Email (conta Google)" autocomplete="off" required aria-required="true"><span class="req" aria-hidden="true">*</span></label>
        ${roleSelect('cancioneiro', 'id="add-role" aria-label="Perfil"')}
        <button type="submit">Acrescentar</button>
      </form>` : ''}
      <p class="small">Os perfis são hierárquicos: <b>Cancioneiro</b> (só os cânticos do Cancioneiro, sem acordes, partituras nem gravações) &lt; <b>Coro</b> (tudo, sem editar) &lt; <b>Maestro</b> (edita letras, promove cânticos ao Cancioneiro e muda perfis entre Cancioneiro e Maestro) &lt; <b>Gestor</b> (gere todos os utilizadores; recebe os pedidos de acesso por email).</p>`;
    const call = async (op, body, msg) => {
      try { await api(op, body); if (msg) toast(msg); } catch (e) { appAlert(e instanceof Limit ? e.message : e.message); }
      showAdmin();
    };
    box.querySelectorAll('li[data-req]').forEach(li => {
      li.querySelector('.adm-ok').onclick = () => call('user', { email: li.dataset.email, role: li.querySelector('.req-role').value, name: li.querySelector('b').textContent.replace('(sem nome)', '') }, 'Acesso autorizado');
      li.querySelector('.adm-no').onclick = e => { if (tapConfirm(e.currentTarget, 'Confirmar')) call('reject', { id: li.dataset.req }, 'Pedido recusado'); };
    });
    box.querySelectorAll('li[data-email]:not([data-req])').forEach(li => {
      const email = li.dataset.email, sel = li.querySelector('.usr-role');
      if (!sel) return; // Gestor protegido
      const was = sel.value;
      sel.onchange = () => {
        appConfirm(`Mudar o perfil de ${email} para ${PERFIS[rankOf(sel.value) - 1].label}?`, 'Mudar').then(okd => { if (okd) call('user', { email, role: sel.value }, 'Perfil alterado'); else sel.value = was; });
      };
      if (!gestor) return;
      li.querySelector('.adm-del').onclick = e => { if (tapConfirm(e.currentTarget, 'Confirmar')) call('user', { email, remove: true }, 'Acesso retirado'); };
      const nm = li.querySelector('.adm-name[role=button]');
      if (!nm) return; // o nome vem do Google
      const rename = async () => { const v = await appPrompt('Nome', nm.textContent === '(sem nome)' ? '' : nm.textContent, '', true); if (v !== null) call('user', { email, role: was, name: v }, 'Nome alterado'); };
      nm.onclick = rename; nm.onkeydown = e => { if (e.key === 'Enter') rename(); };
    });
    if (gestor) reqGate($('adm-add').querySelector('button[type=submit]'), () => /^\S+@\S+\.\S+$/.test($('add-email').value.trim()), $('adm-add'))(); // email obrigatório
    if (gestor) $('adm-add').onsubmit = e => {
      e.preventDefault();
      const email = $('add-email').value.trim().toLowerCase();
      if (users.some(u => u.email === email)) { appAlert('Este email já tem acesso.'); return; }
      call('user', { email, role: $('add-role').value, name: $('add-name').value.trim() }, 'Utilizador acrescentado');
    };
  }
  $('admin-back').onclick = () => { location.hash = '#/'; };
  $('edit-cancel').onclick = () => $('editor').close();

  // ---------- Ficheiros do Coro (gravações e partituras no Storage privado "coro") ----------
  const signed = new Map();
  // devolve { url } ou, nos livros, { pages: [{ n, url }] } (só as páginas do cântico)
  // Ficheiros dos cânticos das coleções: guardados no telemóvel (cache "cancioneiro-media") para abrirem logo
  const MEDIA = 'cancioneiro-media';
  const mkey = k => 'https://media.cancioneiro.local/' + encodeURIComponent(k);
  async function mediaGet(f) {
    if (!('caches' in window) || !f.path) return null;
    try {
      const c = await caches.open(MEDIA), m = await c.match(mkey(f.path));
      if (!m) return null;
      if ((m.headers.get('content-type') || '').includes('json')) { // livro: lista das páginas guardadas
        const ns = await m.json(), pages = [];
        for (const n of ns) { const r = await c.match(mkey(f.path + '@' + n)); if (!r) return null; pages.push({ n, blob: await r.blob() }); }
        return { pages };
      }
      return { blob: await m.blob() };
    } catch (e) { return null; }
  }
  async function mediaSave(f) {
    if (!('caches' in window) || !f.path) return;
    const c = await caches.open(MEDIA);
    if (await c.match(mkey(f.path))) return;
    const src = await fileSrc(f, true);
    if (src.pages) {
      for (const p of src.pages) { const r = await fetch(p.url); if (!r.ok) throw new Error('HTTP ' + r.status); await c.put(mkey(f.path + '@' + p.n), r); }
      await c.put(mkey(f.path), new Response(JSON.stringify(src.pages.map(p => p.n)), { headers: { 'content-type': 'application/json' } }));
    } else if (src.url) {
      const r = await fetch(src.url); if (!r.ok) throw new Error('HTTP ' + r.status); await c.put(mkey(f.path), r);
    }
  }
  async function fileSrc(f, network) {
    if (f.url) return { url: f.url };
    if (f._blob) return { blob: f._blob }; // modo de demonstração
    if (!network) { const m = await mediaGet(f); if (m) return m; }
    const hit = signed.get(f.path);
    if (hit && hit.until > Date.now()) return hit.src;
    const src = await api('file', { path: f.path });
    signed.set(f.path, { src, until: Date.now() + 3300e3 });
    return src;
  }
  // Gravação a tocar: um só leitor; um painel por cima da app deixa pausar / parar mesmo depois de sair do cântico
  let nowRec = null; // { a, path, slug, title, label }
  function miniUpdate() {
    const on = !!nowRec;
    $('mini-player').hidden = !on; document.body.classList.toggle('has-mini', on);
    document.querySelectorAll('.recs button.rec').forEach(b => b.classList.toggle('on', on && b.dataset.path === nowRec.path && !nowRec.a.paused));
    if (!on) return;
    $('mini-title').textContent = nowRec.title; $('mini-label').textContent = nowRec.label || 'Gravação';
    const playing = !nowRec.a.paused;
    $('mini-play').classList.toggle('playing', playing); $('mini-play').setAttribute('aria-label', playing ? 'Pausa' : 'Tocar');
  }
  function stopRec() {
    if (!nowRec) return;
    const a = nowRec.a; nowRec = null;
    a.pause(); a.remove(); a.removeAttribute('src'); try { a.load(); } catch (e) {}
    miniUpdate();
  }
  async function playRec(btn, f) {
    const li = btn.closest('li'), s = bySlug.get(lastSongSlug) || {};
    if (nowRec && nowRec.path === f.path) { if (nowRec.a.parentNode !== li) li.appendChild(nowRec.a); if (nowRec.a.paused) nowRec.a.play().catch(() => {}); else nowRec.a.pause(); return; }
    stopRec();
    btn.classList.add('busy');
    try {
      const a = document.createElement('audio');
      a.controls = true; a.preload = 'auto';
      const src = await fileSrc(f);
      a.src = src.blob ? URL.createObjectURL(src.blob) : src.url;
      li.appendChild(a);
      nowRec = { a, path: f.path, slug: s.slug, title: s.title || '', label: f.label };
      for (const ev of ['play', 'pause', 'ended']) a.addEventListener(ev, miniUpdate);
      await a.play().catch(() => {});
      miniUpdate();
    } catch (e) {
      li.insertAdjacentHTML('beforeend', `<span class="rec-err">${esc(e instanceof Limit ? e.message : 'Não foi possível abrir a gravação.')}</span>`);
    }
    btn.classList.remove('busy');
  }
  $('mini-play').onclick = () => { if (!nowRec) return; if (nowRec.a.paused) nowRec.a.play().catch(() => {}); else nowRec.a.pause(); };
  $('mini-stop').onclick = stopRec;
  $('mini-info').onclick = e => { e.preventDefault(); if (nowRec && nowRec.slug) location.hash = '#/cantico/' + encodeURIComponent(nowRec.slug); };

  // ---------- Partitura (PDF) dentro da app ----------
  // No iPhone, com a app no ecrã principal, abrir o PDF diretamente não deixa voltar atrás;
  // por isso os PDFs guardados no site são mostrados aqui, com botão "Voltar".
  const PDFJS = new URL('vendor/pdfjs/', location.href).href; // pdf.js 4.10.38 (cópia local)
  let pdfjs = null, pdfDoc = null, pdfBook = null, pdfZoom = 1, pdfRender = 0, pdfSlug = null, pdfUrl = null, pdfPage = 0;
  const pageOf = f => { const m = (f.path || '').match(/#p=(\d+)/); return m ? +m[1] : 0; };
  // Recortes do cântico no livro: "&c=364:0,0.044,0.5,0.47|365:…" (frações da página: x0,y0,x1,y1)
  const cropsOf = f => { const m = (f.path || '').match(/[#&]c=([^&]+)/); return m ? m[1].split('|').map(r => { const [pg, b] = r.split(':'); return [+pg, ...b.split(',').map(Number)]; }) : null; };
  let pdfCrops = null, pdfWhole = false, pdfMulti = null;
  // letra digitalizada de um livro (página do Songbook / CANTI com recorte do cântico); as partituras ficam como estão
  const isBookScan = sc => /^livros\//.test(sc.path || '') && !!cropsOf(sc);
  // Junta os recortes de um cântico numa só página: recortes de uma coluna do livro ficam lado a lado (2 colunas,
  // pela ordem, a 1.ª coluna até metade da altura total); recortes largos ficam uns por baixo dos outros.
  // pieces: [{ w, h }] em pontos; devolve { W, H, pos: [{ x, y }] }
  function cropLayout(pieces) {
    const GAP = 14, maxW = Math.max(...pieces.map(p => p.w));
    const narrow = pieces.length > 1 && pieces.every(p => p.w <= maxW * 1.05 && p.w < 0.62 * pieces[0].pw);
    if (!narrow) { let y = 0; const pos = pieces.map(p => { const q = { x: (maxW - p.w) / 2, y }; y += p.h + GAP; return q; }); return { W: maxW, H: y - GAP, pos }; }
    const total = pieces.reduce((a, p) => a + p.h, 0); let y = 0, col = 0; const cols = [0, 0];
    const pos = pieces.map((p, i) => {
      if (col === 0 && i > 0 && y + p.h / 2 > total / 2) { col = 1; y = 0; }
      const q = { x: col * (maxW + GAP), y }; y += p.h + GAP; cols[col] = y - GAP; return q;
    });
    return { W: col ? 2 * maxW + GAP : maxW, H: Math.max(...cols), pos };
  }
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
    const key = JSON.stringify(src.pages ? src.pages.map(p => p.n) : src.url || title + page);
    const sameCrops = JSON.stringify(crops) === JSON.stringify(pdfCrops);
    pdfCrops = crops; pdfWhole = false; pdfMulti = null;
    pdfSlug = slug;
    $('pdfview').hidden = false;
    document.body.classList.add('pdf-open');
    $('pdf-title').textContent = title;
    if (pdfUrl === key && (pdfDoc || pdfBook)) { if (pdfPage !== page || !sameCrops) { pdfPage = page; pdfZoom = 1; renderPdf(); } return; }
    pdfUrl = key; pdfDoc = null; pdfBook = null; pdfZoom = 1; pdfPage = page;
    $('pdfpages').innerHTML = '<p class="pdf-msg">A abrir a partitura…</p>';
    try {
      if (!src.pages && /^image\//.test(mime || '')) {
        $('pdfpages').innerHTML = `<img class="score-img" alt="" src="${esc(src.blob ? URL.createObjectURL(src.blob) : src.url)}">`;
        return;
      }
      const lib = await loadPdfJs();
      // guardado no telemóvel: abre a partir dos dados; senão, pelo endereço
      const open = async x => lib.getDocument(x.blob ? { data: new Uint8Array(await x.blob.arrayBuffer()), isEvalSupported: false } : { url: x.url, isEvalSupported: false }).promise;
      if (src.pages) {
        const docs = await Promise.all(src.pages.map(open));
        pdfBook = new Map(src.pages.map((p, i) => [p.n, docs[i]]));
      } else pdfDoc = await open(src);
      await renderPdf();
    } catch (e) {
      $('pdfpages').innerHTML = '<p class="pdf-msg">Não foi possível mostrar a partitura.</p>';
    }
  }
  // várias digitalizações de livros do mesmo cântico na mesma página, cada uma com a sua origem
  async function openBooks(list, title, slug) {
    pdfSlug = slug; pdfCrops = null; pdfWhole = false; pdfDoc = null; pdfBook = null; pdfZoom = 1; pdfUrl = 'multi:' + slug;
    $('pdfview').hidden = false; document.body.classList.add('pdf-open'); $('pdf-title').textContent = title;
    $('pdfpages').innerHTML = '<p class="pdf-msg">A abrir…</p>';
    try {
      const lib = await loadPdfJs();
      const open = async x => lib.getDocument(x.blob ? { data: new Uint8Array(await x.blob.arrayBuffer()), isEvalSupported: false } : { url: x.url, isEvalSupported: false }).promise;
      pdfMulti = [];
      for (const b of list) {
        const docs = await Promise.all(b.src.pages.map(open));
        pdfMulti.push({ label: b.label, crops: b.crops, book: new Map(b.src.pages.map((p, i) => [p.n, docs[i]])) });
      }
      await renderPdf();
    } catch (e) { $('pdfpages').innerHTML = '<p class="pdf-msg">Não foi possível mostrar a letra.</p>'; }
  }
  async function renderMulti(id, box, width, dpr) {
    const blocks = [];
    for (const b of pdfMulti) {
      const parts = [];
      const regs = pdfWhole ? [...b.book.keys()].sort((x, y) => x - y).map(n => [n, 0, 0, 1, 1]) : b.crops;
      for (const [pg, x0, y0, x1, y1] of regs) {
        const d = b.book.get(pg); if (!d) continue;
        const page = await d.getPage(1); if (id !== pdfRender) return;
        const v1 = page.getViewport({ scale: 1 });
        parts.push({ page, x0, y0, w: (x1 - x0) * v1.width, h: (y1 - y0) * v1.height, pw: v1.width });
      }
      if (parts.length) blocks.push({ label: b.label, parts, L: pdfWhole ? cropLayout(parts.map(p => ({ ...p, pw: 0 }))) : cropLayout(parts) });
    }
    // a mesma escala para todos os blocos (letra do mesmo tamanho)
    const scale = (width - 22) / Math.max(...blocks.map(b => b.L.W)) * pdfZoom;
    for (const b of blocks) {
      const blk = document.createElement('div'); blk.className = 'pdf-block'; box.appendChild(blk);
      const lab = document.createElement('p'); lab.className = 'pdf-src'; lab.textContent = b.label; blk.appendChild(lab);
      let r = dpr;
      while (r > 1 && b.L.W * scale * r * b.L.H * scale * r > 12e6) r -= 0.5;
      const c = document.createElement('canvas');
      c.width = Math.floor(b.L.W * scale * r); c.height = Math.floor(b.L.H * scale * r);
      c.style.width = Math.floor(b.L.W * scale) + 'px'; c.style.height = Math.floor(b.L.H * scale) + 'px';
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      blk.appendChild(c);
      for (let i = 0; i < b.parts.length; i++) {
        const p = b.parts[i], vp = p.page.getViewport({ scale: scale * r });
        const pc = document.createElement('canvas'); pc.width = Math.ceil(p.w * scale * r); pc.height = Math.ceil(p.h * scale * r);
        await p.page.render({ canvasContext: pc.getContext('2d'), viewport: vp, transform: [1, 0, 0, 1, -p.x0 * vp.width, -p.y0 * vp.height] }).promise;
        if (id !== pdfRender) return;
        ctx.drawImage(pc, Math.round(b.L.pos[i].x * scale * r), Math.round(b.L.pos[i].y * scale * r));
      }
    }
    const more = document.createElement('p'); more.className = 'pdf-more';
    more.innerHTML = `<button type="button">${pdfWhole ? 'Ver só a letra do cântico' : 'Ver as páginas inteiras'}</button>`;
    more.firstChild.onclick = () => { pdfWhole = !pdfWhole; renderPdf(); };
    box.appendChild(more);
  }
  // página n: num livro cada página é um PDF à parte (página 1 desse PDF)
  const pdfPageN = async n => pdfBook ? (pdfBook.has(n) ? pdfBook.get(n).getPage(1) : null) : (n >= 1 && n <= pdfDoc.numPages ? pdfDoc.getPage(n) : null);
  async function renderPdf() {
    try { await renderPdfInner(); } catch (e) { console.error('renderPdf', e); }
  }
  async function renderPdfInner() {
    if (!pdfDoc && !pdfBook && !pdfMulti) return;
    const id = ++pdfRender, box = $('pdfpages');
    box.innerHTML = '';
    const width = Math.min(box.clientWidth - 16, 900);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (pdfMulti) return renderMulti(id, box, width, dpr);
    if (pdfCrops && !pdfWhole) {
      // só a parte da página (ou páginas) onde está o cântico, tudo junto numa só página
      const parts = [];
      for (const [pg, x0, y0, x1, y1] of pdfCrops) {
        const page = await pdfPageN(pg);
        if (id !== pdfRender) return;
        if (!page) continue;
        const v1 = page.getViewport({ scale: 1 });
        parts.push({ page, x0, y0, w: (x1 - x0) * v1.width, h: (y1 - y0) * v1.height, pw: v1.width, ph: v1.height });
      }
      if (parts.length) {
        const L = cropLayout(parts);
        const scale = width / L.W * pdfZoom;
        let r = dpr;
        while (r > 1 && L.W * scale * r * L.H * scale * r > 12e6) r -= 0.5;
        const c = document.createElement('canvas');
        c.width = Math.floor(L.W * scale * r); c.height = Math.floor(L.H * scale * r);
        c.style.width = Math.floor(L.W * scale) + 'px'; c.style.height = Math.floor(L.H * scale) + 'px';
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        box.appendChild(c);
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i], vp = p.page.getViewport({ scale: scale * r });
          const pc = document.createElement('canvas'); pc.width = Math.ceil(p.w * scale * r); pc.height = Math.ceil(p.h * scale * r);
          await p.page.render({ canvasContext: pc.getContext('2d'), viewport: vp, transform: [1, 0, 0, 1, -p.x0 * vp.width, -p.y0 * vp.height] }).promise;
          if (id !== pdfRender) return;
          ctx.drawImage(pc, Math.round(L.pos[i].x * scale * r), Math.round(L.pos[i].y * scale * r));
        }
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
    $('pdf-download').hidden = true; pdfGen = null;
    $('pdfview').hidden = true;
    document.body.classList.remove('pdf-open');
    pdfRender++;
  }
  $('pdf-download').onclick = async () => {
    if (!pdfGen) return;
    const f = new File([pdfGen.blob], pdfGen.name, { type: 'application/pdf' });
    // no telemóvel: folha de partilha (Guardar em Ficheiros, enviar…); no computador: descarregar
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: pdfGen.title }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(pdfGen.blob); a.download = pdfGen.name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  };
  $('pdf-back').onclick = () => {
    if (!pdfSlug) { closePdf(); return; } // PDF gerado de uma coleção: volta à coleção
    if (history.length > 1 && lastSongSlug === pdfSlug) history.back();
    else location.hash = '#/cantico/' + encodeURIComponent(pdfSlug);
  };
  const zoomImg = () => { const im = $('pdfpages').querySelector('.score-img'); if (im) im.style.width = (pdfZoom * 100) + '%'; };
  $('pdf-zoom-in').onclick = () => { pdfZoom = Math.min(4, pdfZoom + 0.5); renderPdf(); zoomImg(); };
  // dois dedos: amplia / reduz à volta do ponto entre os dedos (pré-visualização imediata, depois desenha nítido)
  (() => {
    const pp = $('pdfpages'); let P = null;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    pp.addEventListener('touchstart', e => {
      if (e.touches.length !== 2) return;
      const r = pp.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      P = { d0: dist(e.touches), z0: pdfZoom, k: 1, mx, my, ox: pp.scrollLeft + mx, oy: pp.scrollTop + my };
      pp.style.transformOrigin = `${mx}px ${my}px`;
    }, { passive: true });
    pp.addEventListener('touchmove', e => {
      if (!P || e.touches.length !== 2) return;
      e.preventDefault();
      P.k = Math.max(1 / P.z0, Math.min(4 / P.z0, dist(e.touches) / P.d0));
      pp.style.transform = `scale(${P.k})`;
    }, { passive: false });
    const end = async () => {
      if (!P) return;
      const p = P; P = null;
      const z = Math.max(1, Math.min(4, p.z0 * p.k));
      pp.style.transform = ''; pp.style.transformOrigin = '';
      if (Math.abs(z - p.z0) < 0.02) return;
      pdfZoom = z; zoomImg(); await renderPdf();
      const f = z / p.z0; pp.scrollLeft = p.ox * f - p.mx; pp.scrollTop = p.oy * f - p.my;
    };
    pp.addEventListener('touchend', e => { if (e.touches.length < 2) end(); });
    pp.addEventListener('touchcancel', end);
  })();
  $('pdf-zoom-out').onclick = () => { pdfZoom = Math.max(1, pdfZoom - 0.5); renderPdf(); zoomImg(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('pdfview').hidden) $('pdf-back').click(); });
  let pdfResize;
  addEventListener('resize', () => { if (!$('pdfview').hidden) { clearTimeout(pdfResize); pdfResize = setTimeout(renderPdf, 250); } });

  // ---------- Router ----------
  let lastListHash = '#/';
  // endereço com % mal formado (ex.: copiado a meio): usa o texto tal como está em vez de rebentar
  const safeDecode = t => { try { return decodeURIComponent(t); } catch (e) { return t; } };
  function route() {
    const h = location.hash || '#/';
    const p = h.match(/^#\/p\/([A-Za-z0-9_-]+)(?:\/([^/]+))?$/);
    if (p) { closePdf(); showShared(p[1], p[2] ? safeDecode(p[2]) : null); window.scrollTo(0, 0); return; }
    document.body.classList.remove('shared-view', 'no-session', 'shared-sub'); sharedBack = null;
    if (!session) return;
    const m = h.match(/^#\/cantico\/([^/]+)(\/partitura(?:\/(\d+))?)?$/);
    if (m) {
      const slug = safeDecode(m[1]);
      if (m[2]) {
        if (lastSongSlug !== slug || $('view-song').hidden) showSong(slug);
        songScroll = window.scrollY;
        const s = bySlug.get(slug);
        const sc = s && scoresOf(s)[+(m[3] || 0)];
        if (sc) {
          const key = h;
          (async () => {
            try {
              const scans = scoresOf(s).filter(isBookScan);
              if (isBookScan(sc) && scans.length > 1) {
                const srcs = await Promise.all(scans.map(x => fileSrc(x)));
                if (location.hash === key && pdfUrl !== 'multi:' + slug) openBooks(scans.map((x, i) => ({ label: x.label, src: srcs[i], crops: cropsOf(x) })), s.title, slug);
                else if (location.hash === key) { $('pdfview').hidden = false; document.body.classList.add('pdf-open'); }
                return;
              }
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
  $('btn-back').onclick = () => { location.hash = sharedBack || lastListHash; };
  $('btn-back-list').onclick = () => {
    if ($('search').value) { $('search').value = ''; $('search-clear').hidden = true; route(); }
    else location.hash = '#/';
  };
  // ---------- Coleções (criadas por um Maestro, para o Cancioneiro ou o Coro, por um tempo limitado) ----------
  const DURS = { '24h': ['24 horas', 864e5], '48h': ['48 horas', 1728e5], '1w': ['1 semana', 6048e5], '1m': ['1 mês', 2592e6] };
  let cols = [];
  const colsKey = () => 'cancioneiro.colecoes.' + (session ? session.user.id : 'anon');
  const expired = c => Date.parse(c.expires_at) <= Date.now();
  const colVisible = c => (lvl() >= 3 || (!expired(c) && c.published !== false)) && (c.audience === 'cancioneiro' || lvl() >= 2);
  const colSongs = c => (c.songs || []).slice().sort((a, b) => a.position - b.position);
  const colFits = () => true; // qualquer cântico pode entrar numa coleção (o público Cancioneiro passa a vê-lo enquanto a coleção durar)
  // cânticos de coleções ativas para o Cancioneiro: visíveis também no perfil Cancioneiro
  const colExtra = () => new Set(cols.filter(c => !expired(c) && c.published !== false && c.audience === 'cancioneiro').flatMap(c => (c.songs || []).map(x => x.song_slug)));
  // Ao abrir: descarrega as letras e (do perfil Coro para cima) partituras, páginas dos livros e gravações
  // dos cânticos das coleções ativas e dos Preferidos; apaga ficheiros guardados de cânticos que já não estão em nenhuma
  let prefetching = false;
  async function prefetchCollections() {
    if (prefetching || DEMO || !navigator.onLine) return; prefetching = true;
    try {
      const slugs = [...new Set([...cols.filter(c => colVisible(c) && !expired(c)).flatMap(c => (c.songs || []).map(x => x.song_slug)), ...favs])].filter(sl => bySlug.has(sl));
      const keep = new Set();
      for (const sl of slugs) {
        try { await getLyrics(sl); } catch (e) { if (e instanceof Limit) break; }
        if (lvl() < 2) continue;
        const s = bySlug.get(sl);
        for (const f of [...scoresOf(s), ...filesOf(s, 'recording')]) {
          if (!f.path) continue;
          keep.add(mkey(f.path));
          try { await mediaSave(f); } catch (e) { if (e instanceof Limit) return; }
        }
      }
      if ('caches' in window && lvl() >= 2) { // limpeza
        const c = await caches.open(MEDIA);
        for (const r of await c.keys()) { const base = r.url.split('%40')[0]; if (!keep.has(base) && !keep.has(r.url)) await c.delete(r); }
      }
    } catch (e) { /* sem rede: fica para a próxima */ } finally { prefetching = false; }
  }
  async function loadCollections() {
    if (!cols.length) cols = store.get(colsKey(), []);
    if (DEMO) { cols = store.get('cancioneiro.demo.cols', []); return; }
    try {
      const { data, error } = await sb.from('collections').select('id,title,audience,duration,expires_at,created_by,published,songs:collection_songs(song_slug,position),sections:collection_sections(id,title,position)').order('created_at');
      if (!error && data) { cols = data; store.set(colsKey(), cols); }
    } catch (e) { /* sem rede: fica a cópia */ }
    if (lvl() < 2 && allSongs.length) applySource();
  }
  const demoSave = () => store.set('cancioneiro.demo.cols', cols);
  function renderCollectionsMenu() {
    const vis = cols.filter(colVisible);
    if (!vis.length && lvl() < 3) return '';
    // folha por publicar (só Maestro / Gestor a vê): folha com lápis em vez da folha simples
    return vis.map(c => `<li><a href="#/lista/colecao-${c.id}">${c.published === false ? `<svg class="book-ic outline" viewBox="0 0 24 24" role="img" aria-label="Não publicada"><title>Não publicada</title>${ICON_PAGE_DRAFT}</svg>` : `<svg class="book-ic outline" viewBox="0 0 24 24">${ICON_PAGE}</svg>`}<span class="t">${expired(c) ? `<s title="Expirada">${esc(c.title)}</s>` : esc(c.title)}</span><span class="n">${colSongs(c).filter(x => bySlug.has(x.song_slug)).length}</span>${chev}</a></li>`).join('') +
      (lvl() >= 3 ? `<li><button class="col-new"><span class="t">+ Nova folha</span>${vis.length ? '' : `<svg class="book-ic outline" viewBox="0 0 24 24">${ICON_PAGE}</svg>`}</button></li>` : '');
  }
  // itens de uma coleção pela ordem: cânticos e secções (linhas separadoras) partilham a mesma numeração
  const withSongs = items => items.filter((it, i) => it.k !== 'sec' || (items[i + 1] && items[i + 1].k === 'song'));
  function colItems(c) {
    return [...(c.songs || []).map(x => ({ k: 'song', key: x.song_slug, pos: x.position, ref: x })),
            ...(c.sections || []).map(x => ({ k: 'sec', key: 'sec:' + x.id, pos: x.position, ref: x }))]
      .sort((a, b) => a.pos - b.pos || (a.k === 'sec' ? -1 : 1));
  }
  const ICON_CHECK = '<path d="M5 12.5l4.5 4.5L19 7"/>';
  const TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>';
  // Folha: na página, sempre só leitura (só as secções com cânticos). Maestro / Gestor: «Editar folha» no fim (como
  // «Editar cântico») abre a edição por cima (janela col-ed): público, título, duração, cânticos e secções; cada mudança
  // fica logo gravada. Enquanto está em edição a folha fica escondida (published = false) até «Publicar».
  const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>';
  const colUntil = c => { const fim = new Date(c.expires_at); return `${expired(c) ? 'expirou' : 'até'} ${fim.toLocaleDateString('pt-PT')} ${fim.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`; };
  function showCollection(id) {
    const c = cols.find(x => x.id === id);
    const title = $('list-title'), rows = $('rows');
    title.hidden = false; $('status').textContent = '';
    if (!c || !colVisible(c)) { title.textContent = 'Folha'; rows.innerHTML = ''; $('status').textContent = c ? 'Esta folha já não está disponível.' : 'A carregar…'; if (!c) loadCollections().then(() => { if (location.hash === '#/lista/colecao-' + id) showCollection(id); }); return; }
    const can = lvl() >= 3, draft = c.published === false;
    const meta = `<small class="col-meta">${c.audience === 'coro' ? 'Coro' : 'Cancioneiro'} · ${colUntil(c)}</small>`;
    // partilhar: só Maestro / Gestor, e só a folha publicada com cânticos
    const shareBtn = can && !draft && colSongs(c).some(x => bySlug.has(x.song_slug)) ? '<button class="col-share" id="col-share" aria-label="Partilhar folha" title="Partilhar"><svg viewBox="0 0 24 24"><path d="M12 3.5v11"/><path d="M8 7.5l4-4 4 4"/><path d="M8.5 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2"/></svg></button>' : '';
    // por publicar (só Maestro / Gestor a vê): etiqueta amarela por cima do título, como «por aprovar»
    title.innerHTML = `${can && draft ? '<small class="pend pend-top">Por publicar</small>' : ''}${esc(c.title)}${shareBtn}${can ? meta : ''}`;
    const all = colItems(c).filter(it => it.k === 'sec' || bySlug.has(it.key));
    const items = withSongs(all);
    rows.innerHTML = items.map(it => it.k === 'sec'
      ? `<li class="col-sec"><a href="#" class="sec-line" tabindex="-1">${esc(it.ref.title)}</a></li>`
      : songRow(bySlug.get(it.key))).join('') +
      (can ? `<li class="col-edit-bar"><p class="edit-bar"><button class="edit-btn" id="col-mode">${PENCIL}Editar folha</button>${draft ? '<button class="edit-btn col-pub" id="col-pub">Publicar</button>' : ''}</p></li>` : '');
    rows.querySelectorAll('a.sec-line').forEach(a => a.onclick = e => e.preventDefault());
    if (!items.some(it => it.k === 'song')) $('status').textContent = 'Folha vazia.';
    if ($('col-share')) $('col-share').onclick = () => shareCollection(c);
    if (can) $('col-mode').onclick = () => openColEditor(c);
    // uma folha sem cânticos não se publica
    if ($('col-pub')) $('col-pub').onclick = async () => {
      if (!colSongs(c).some(x => bySlug.has(x.song_slug))) return appAlert('Uma folha sem cânticos não pode ser publicada. Acrescente pelo menos um cântico em «Editar folha».');
      if (await appConfirm(`Publicar a folha «${c.title}»? ${c.audience === 'coro' ? 'O Coro' : 'Todos os perfis'} passa${c.audience === 'coro' ? '' : 'm'} a vê-la até ${new Date(c.expires_at).toLocaleDateString('pt-PT')}.`, 'Publicar')) colSetPublished(c, true);
    };
    if (edCol && $('col-ed').open) renderColEditor(edCol);
  }
  // ---------- Editar folha (janela por cima da folha) ----------
  // Trabalha numa cópia (edCol, _draft): nada vai para a base de dados até «Guardar»; «Cancelar» deita a cópia fora.
  // Guardar alterações volta a pôr a folha por publicar (só os Maestros a veem até «Publicar»).
  const colStore = () => { if (DEMO) demoSave(); else store.set(colsKey(), cols); };
  const live = c => !DEMO && !c._draft; // a cópia de trabalho da janela de edição só se grava em «Guardar»
  const ceGate = (() => { const f = () => { $('ce-save').disabled = !$('ce-name').value.trim(); }; $('ce-name').addEventListener('input', f); return f; })(); // título obrigatório
  let edCol = null, edOrig = null, ceSel = null; // cópia de trabalho; a folha original; item escolhido (mostra as ações)
  const ICON_UP = '<path d="M12 19V5M6 11l6-6 6 6"/>', ICON_DOWN = '<path d="M12 5v14M6 13l6 6 6-6"/>';
  function openColEditor(c) {
    edOrig = c; ceSel = null;
    edCol = { ...c, _draft: true, songs: (c.songs || []).map(x => ({ ...x })), sections: (c.sections || []).map(x => ({ ...x })) };
    $('ce-msg').textContent = '';
    $('ce-name').value = c.title;
    renderColEditor(edCol); ceGate();
    $('col-ed').showModal();
  }
  function renderColEditor(c) {
    $('ce-aud').querySelectorAll('button').forEach(b => { const on = b.dataset.v === c.audience; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    if (document.activeElement !== $('ce-name')) $('ce-name').value = c.title;
    $('ce-dur').value = c.duration;
    const until = c.duration !== edOrig.duration ? { expires_at: new Date(Date.now() + DURS[c.duration][1]).toISOString() } : c;
    $('ce-until').textContent = `Disponível ${colUntil(until)}. Mudar a duração conta a partir de quando guardar; um mês depois de expirar, a folha é apagada.`;
    const all = colItems(c).filter(it => it.k === 'sec' || bySlug.has(it.key));
    // «+ Adicionar cântico» depois do último cântico de cada secção (e dos cânticos antes da primeira secção, se houver)
    const addLine = secId => `<li class="col-add"><button type="button" data-sec="${esc(secId || '')}">+ Adicionar cântico</button></li>`;
    // item escolhido: subir, descer e apagar por cima da linha, à direita
    const acts = (i, sec) => `<span class="ce-acts"><button type="button" data-act="up" aria-label="Subir"${i === 0 ? ' disabled' : ''}><svg viewBox="0 0 24 24">${ICON_UP}</svg></button>` +
      `<button type="button" data-act="down" aria-label="Descer"${i === all.length - 1 ? ' disabled' : ''}><svg viewBox="0 0 24 24">${ICON_DOWN}</svg></button>` +
      `<button type="button" data-act="del" class="del" aria-label="${sec ? 'Apagar secção' : 'Remover da folha'}">${TRASH}</button>` +
      `<button type="button" data-act="ok" class="ok" aria-label="Fechar as ações"><svg viewBox="0 0 24 24">${ICON_CHECK}</svg></button></span>`;
    let html = '', cur = null, open = false;
    all.forEach((it, i) => {
      const sel = it.key === ceSel;
      if (it.k === 'sec') { if (open) html += addLine(cur); cur = it.ref.id; open = true;
        html += `<li class="col-sec${sel ? ' sel' : ''}" data-key="${esc(it.key)}"><div class="sec-line" role="button" tabindex="0" aria-expanded="${sel}">${sel ? `<button type="button" class="ce-name" aria-label="Mudar o nome da secção ${esc(it.ref.title)}">${PENCIL}${esc(it.ref.title)}</button>` : esc(it.ref.title)}</div>${sel ? acts(i, true) : ''}</li>`; }
      else { open = true; html += songRow(bySlug.get(it.key)).replace('<li>', `<li data-key="${esc(it.key)}"${sel ? ' class="sel"' : ''}>`).replace(/<\/li>$/, (sel ? acts(i, false) : '') + '</li>'); }
    });
    if (open || !all.length) html += addLine(cur);
    const rows = $('ce-rows');
    rows.innerHTML = html + '<li class="col-add col-add-end"><button type="button" id="col-add-sec">+ Adicionar secção</button></li>';
    rows.querySelectorAll('li.col-add button[data-sec]').forEach(b => b.onclick = () => openSectionAdd(c, b.dataset.sec || null, false, true));
    rows.querySelectorAll('li[data-key]').forEach(li => li.addEventListener('click', async e => {
      e.preventDefault();
      const key = li.dataset.key, b = e.target.closest('button[data-act]');
      if (b && b.dataset.act === 'ok') { ceSel = null; renderColEditor(c); return; }
      if (b) { // subir / descer; apagar pede confirmação
        const it = all.find(x => x.key === key), sec = it.k === 'sec';
        if (b.dataset.act === 'del') {
          if (!(await appConfirm(sec ? `Apagar a secção «${it.ref.title}»? Os cânticos ficam na folha.` : `Remover «${bySlug.get(key).title}» da folha?`, sec ? 'Apagar' : 'Remover'))) return;
          ceSel = null;
        }
        return colAction(c, key, b.dataset.act);
      }
      if (e.target.closest('.ce-name')) { // nome da secção: mudar
        const it = all.find(x => x.key === key);
        const t = await appPrompt('Nome da secção', it.ref.title);
        if (t && t.trim() && t.trim() !== it.ref.title) colSaveSection(c, it.ref, t.trim().slice(0, 60));
        return;
      }
      ceSel = ceSel === key ? null : key; renderColEditor(c);
    }));
    rows.querySelectorAll('.sec-line[role=button]').forEach(d => d.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); d.click(); } });
    $('col-add-sec').onclick = async () => { const v = await appPrompt('Nova secção', '', 'Por exemplo: Entrada, Comunhão'); if (v && v.trim()) colSaveSection(c, null, v.trim().slice(0, 60)); };
  }
  // o que mudou entre a folha e a cópia de trabalho
  function colDiff(o, d) {
    const meta = {};
    if (d.title !== o.title) meta.title = d.title;
    if (d.audience !== o.audience) meta.audience = d.audience;
    if (d.duration !== o.duration) { meta.duration = d.duration; meta.expires_at = new Date(Date.now() + DURS[d.duration][1]).toISOString(); }
    const oS = new Map((o.songs || []).map(x => [x.song_slug, x])), dS = new Set(d.songs.map(x => x.song_slug));
    const oX = new Map((o.sections || []).map(x => [x.id, x])), dX = new Set(d.sections.map(x => x.id));
    const r = {
      meta,
      delSongs: [...oS.keys()].filter(k => !dS.has(k)),
      addSongs: d.songs.filter(x => !oS.has(x.song_slug)),
      movSongs: d.songs.filter(x => oS.has(x.song_slug) && oS.get(x.song_slug).position !== x.position),
      delSecs: [...oX.keys()].filter(k => !dX.has(k)),
      addSecs: d.sections.filter(x => !oX.has(x.id)),
      updSecs: d.sections.filter(x => oX.has(x.id) && (oX.get(x.id).title !== x.title || oX.get(x.id).position !== x.position)),
    };
    r.changed = Object.keys(meta).length > 0 || ['delSongs', 'addSongs', 'movSongs', 'delSecs', 'addSecs', 'updSecs'].some(k => r[k].length);
    return r;
  }
  async function colCommit(o, d) {
    const r = colDiff(o, d);
    if (!r.changed) return false;
    const meta = { ...r.meta, published: false };
    if (!DEMO) {
      const chk = res => { if (res.error) throw res.error; return res; };
      if (r.delSongs.length) chk(await sb.from('collection_songs').delete().eq('collection_id', o.id).in('song_slug', r.delSongs));
      if (r.delSecs.length) chk(await sb.from('collection_sections').delete().in('id', r.delSecs));
      if (r.addSongs.length) chk(await sb.from('collection_songs').insert(r.addSongs.map(x => ({ collection_id: o.id, song_slug: x.song_slug, position: x.position }))));
      if (r.addSecs.length) {
        const { data } = chk(await sb.from('collection_sections').insert(r.addSecs.map(x => ({ collection_id: o.id, title: x.title, position: x.position }))).select('id,title,position'));
        r.addSecs.forEach(x => { const n = data.find(y => y.position === x.position); if (n) x.id = n.id; }); // ids verdadeiros
      }
      (await Promise.all([
        ...r.movSongs.map(x => sb.from('collection_songs').update({ position: x.position }).eq('collection_id', o.id).eq('song_slug', x.song_slug)),
        ...r.updSecs.map(x => sb.from('collection_sections').update({ title: x.title, position: x.position }).eq('id', x.id)),
      ])).forEach(chk);
      chk(await sb.from('collections').update(meta).eq('id', o.id));
    }
    Object.assign(o, meta, { songs: d.songs, sections: d.sections });
    colStore();
    return true;
  }
  // público, título e duração: só na cópia (gravados em «Guardar»)
  $('ce-aud').onclick = e => { const b = e.target.closest('button[data-v]'); if (b && edCol) { edCol.audience = b.dataset.v; renderColEditor(edCol); } };
  $('ce-name').oninput = () => { const t = $('ce-name').value.trim().slice(0, 80); if (edCol && t) edCol.title = t; };
  $('ce-dur').onchange = () => { if (edCol) { edCol.duration = $('ce-dur').value; renderColEditor(edCol); } };
  const ceDone = () => { $('col-ed').close(); edCol = edOrig = null; };
  $('ce-save').onclick = async () => {
    if (!edCol || $('ce-save').disabled || !$('ce-name').value.trim()) return;
    if (!$('ce-name').value.trim()) { $('ce-msg').textContent = 'Escreva um título.'; return; }
    $('ce-save').disabled = true;
    try {
      const o = edOrig, changed = await colCommit(o, edCol);
      ceDone(); showCollection(o.id);
      toast(changed ? 'Folha guardada — por publicar' : 'Sem alterações');
    } catch (e) { $('ce-msg').textContent = 'Não foi possível guardar: ' + (e.message || e); await loadCollections(); }
    finally { ceGate(); }
  };
  // cancelar: pede confirmação se houver alterações
  async function ceCancel() {
    if (!edCol) return;
    if (colDiff(edOrig, edCol).changed && !(await appConfirm('Sair sem guardar as alterações a esta folha?', 'Sair sem guardar'))) return;
    const id = edOrig.id; ceDone(); showCollection(id);
  }
  $('ce-cancel').onclick = ceCancel;
  $('col-ed').addEventListener('cancel', e => { e.preventDefault(); ceCancel(); }); // tecla Esc
  $('ce-del').onclick = async () => {
    const c = edOrig; if (!c || !(await appConfirm(`Apagar a folha «${c.title}»? Não se pode desfazer.`, 'Apagar'))) return;
    try {
      if (!DEMO) { const { error } = await sb.from('collections').delete().eq('id', c.id); if (error) throw error; }
      cols = cols.filter(x => x !== c); colStore();
      ceDone(); location.hash = '#/';
    } catch (e) { $('ce-msg').textContent = 'Não foi possível apagar: ' + (e.message || e); }
  };
  // Editar ↔ Publicar (só Maestro / Gestor): grava o estado da folha
  async function colSetPublished(c, on, quiet) {
    try {
      if (!DEMO) { const { error } = await sb.from('collections').update({ published: on }).eq('id', c.id); if (error) throw error; }
      c.published = on; colStore();
      if (!quiet) toast(on ? 'Folha publicada' : 'Folha em edição — escondida até a publicar');
    } catch (e) { appAlert('Não foi possível mudar: ' + (e.message || e)); }
    showCollection(c.id);
  }
  // grava as posições que mudaram (cânticos e secções numerados 1, 2, 3… pela nova ordem)
  async function colPersist(c, items) {
    const songUp = [], secUp = [];
    items.forEach((it, n) => { if (it.ref.position !== n + 1) { it.ref.position = n + 1; (it.k === 'song' ? songUp : secUp).push(it.ref); } });
    if (live(c)) {
      const res = await Promise.all([
        ...songUp.map(x => sb.from('collection_songs').update({ position: x.position }).eq('collection_id', c.id).eq('song_slug', x.song_slug)),
        ...secUp.map(x => sb.from('collection_sections').update({ position: x.position }).eq('id', x.id)),
      ]);
      const bad = res.find(r => r.error); if (bad) throw bad.error;
    }
  }
  async function colAction(c, key, act) {
    let items = colItems(c);
    const i = items.findIndex(it => it.key === key); if (i < 0) return;
    const it = items[i];
    try {
      if (act === 'del') {
        if (it.k === 'song') {
          if (live(c)) { const { error } = await sb.from('collection_songs').delete().eq('collection_id', c.id).eq('song_slug', it.key); if (error) throw error; }
          c.songs = c.songs.filter(x => x.song_slug !== it.key);
        } else { // apagar a secção tira só a linha; os cânticos ficam
          if (live(c)) { const { error } = await sb.from('collection_sections').delete().eq('id', it.ref.id); if (error) throw error; }
          c.sections = c.sections.filter(x => x !== it.ref);
        }
      } else if (it.k === 'song') { // o cântico troca com o item vizinho (pode passar para o outro lado de uma linha de secção)
        const j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j], items[i]];
        await colPersist(c, items);
      } else { // a secção move-se com os seus cânticos, para antes/depois da secção vizinha
        const end = n => { let k = n + 1; while (k < items.length && items[k].k !== 'sec') k++; return k; };
        const block = items.slice(i, end(i));
        if (act === 'up') {
          if (i === 0) return;
          let p = i - 1; while (p > 0 && items[p].k !== 'sec') p--; // início da secção anterior (ou o topo)
          items = [...items.slice(0, p), ...block, ...items.slice(p, i), ...items.slice(end(i))];
        } else {
          const nx = end(i);
          if (nx >= items.length) { // não há secção abaixo: a linha desce um lugar (o cântico seguinte fica acima dela)
            if (i >= items.length - 1) return;
            [items[i], items[i + 1]] = [items[i + 1], items[i]];
          } else {
            const nb = items.slice(nx, end(nx));
            items = [...items.slice(0, i), ...nb, ...block, ...items.slice(end(nx))];
          }
        }
        await colPersist(c, items);
      }
      if (DEMO) demoSave(); else store.set(colsKey(), cols);
    } catch (e) { appAlert('Não foi possível guardar: ' + (e.message || e)); }
    showCollection(c.id);
  }
  // ---------- Templates (conjuntos de secções pré-definidas; só Maestro / Gestor) ----------
  let tpls = null;
  async function loadTemplates() {
    if (DEMO) { tpls = store.get('cancioneiro.demo.tpls', null) || [{ id: 'demo-missa', title: 'Missa', sections: ['Entrada', 'Ofertório', 'Comunhão', 'Ação de Graças', 'Nossa Senhora'] }]; return; }
    const { data, error } = await sb.from('collection_templates').select('id,title,sections').order('title');
    if (error) throw error; tpls = data;
  }
  async function openTemplates(c) {
    $('tpl-list').innerHTML = '<p class="small">A carregar…</p>';
    $('tpl-hint').textContent = c ? 'Toque num template para acrescentar as suas secções no fim da folha.' : 'Toque num template para o usar na nova folha.';
    $('tpl-dlg').showModal();
    try { await loadTemplates(); } catch (e) { $('tpl-list').innerHTML = `<p class="small">Não foi possível carregar: ${esc(e.message || e)}</p>`; return; }
    $('tpl-list').innerHTML = tpls.map(t => `<div class="tpl-row" data-id="${esc(t.id)}"><button class="tpl-apply"><b>${esc(t.title)}</b><small>${esc(t.sections.join(' · '))}</small></button><button class="tpl-edit">Editar</button></div>`).join('') +
      `<button class="col-pick-new" id="tpl-new">+ Novo template</button>`;
    $('tpl-list').querySelectorAll('.tpl-row').forEach(r => {
      const t = tpls.find(x => x.id === r.dataset.id);
      r.querySelector('.tpl-apply').onclick = () => c ? applyTemplate(c, t) : ($('tpl-dlg').close(), fillTplSelect(t.id));
      r.querySelector('.tpl-edit').onclick = () => openTemplateEditor(c, t);
    });
    $('tpl-new').onclick = () => openTemplateEditor(c, null);
  }
  // aplicar: acrescenta no fim as secções do template que a coleção ainda não tem
  async function applyTemplate(c, t, quiet) {
    const have = new Set((c.sections || []).map(x => norm(x.title)));
    const add = t.sections.filter(x => !have.has(norm(x)));
    if (!add.length) { toast('A folha já tem estas secções'); $('tpl-dlg').close(); return; }
    let pos = Math.max(0, ...colItems(c).map(x => x.pos));
    try {
      const rows = add.map(title => ({ collection_id: c.id, title, position: ++pos }));
      if (DEMO) rows.forEach((r, i) => { r.id = 'demo' + Date.now() + i; });
      else { const { data, error } = await sb.from('collection_sections').insert(rows).select('id,title,position'); if (error) throw error; rows.splice(0, rows.length, ...data); }
      c.sections = (c.sections || []).concat(rows);
      if (DEMO) demoSave(); else store.set(colsKey(), cols);
      $('tpl-dlg').close(); toast(`Template «${t.title}» aplicado`);
    } catch (e) { appAlert('Não foi possível aplicar: ' + (e.message || e)); }
    showCollection(c.id);
  }
  let tplEditing = null, tplCol = null;
  const tplGate = reqGate($('tpl-save'), () => !!$('tpl-name').value.trim() && $('tpl-secs').value.split('\n').some(x => x.trim()), $('tpl-edit'));
  function openTemplateEditor(c, t) {
    tplEditing = t; tplCol = c;
    $('tpl-edit-title').textContent = t ? 'Editar template' : 'Novo template';
    $('tpl-name').value = t ? t.title : '';
    $('tpl-secs').value = t ? t.sections.join('\n') : '';
    $('tpl-del').hidden = !t;
    $('tpl-msg').textContent = ''; tplGate();
    $('tpl-dlg').close(); $('tpl-edit').showModal();
  }
  async function saveTemplate() {
    const title = $('tpl-name').value.trim().slice(0, 60);
    const sections = $('tpl-secs').value.split('\n').map(x => x.trim().slice(0, 60)).filter(Boolean);
    if (!title || !sections.length) { $('tpl-msg').textContent = 'Escreva um nome e pelo menos uma secção.'; return; }
    try {
      if (DEMO) {
        if (tplEditing) Object.assign(tplEditing, { title, sections }); else tpls.push({ id: 'demo' + Date.now(), title, sections });
        store.set('cancioneiro.demo.tpls', tpls);
      } else if (tplEditing) { const { error } = await sb.from('collection_templates').update({ title, sections }).eq('id', tplEditing.id); if (error) throw error; }
      else { const { error } = await sb.from('collection_templates').insert({ title, sections }); if (error) throw error; }
      $('tpl-edit').close(); openTemplates(tplCol);
    } catch (e) { $('tpl-msg').textContent = 'Não foi possível guardar: ' + (e.message || e); }
  }
  async function deleteTemplate() {
    if (!tplEditing || !tapConfirm($('tpl-del'), 'Confirmar: apagar')) return;
    try {
      if (DEMO) { tpls = tpls.filter(x => x !== tplEditing); store.set('cancioneiro.demo.tpls', tpls); }
      else { const { error } = await sb.from('collection_templates').delete().eq('id', tplEditing.id); if (error) throw error; }
      $('tpl-edit').close(); openTemplates(tplCol);
    } catch (e) { $('tpl-msg').textContent = 'Não foi possível apagar: ' + (e.message || e); }
  }
  $('tpl-close').onclick = () => $('tpl-dlg').close();
  $('tpl-save').onclick = saveTemplate;
  $('tpl-cancel').onclick = () => { $('tpl-edit').close(); openTemplates(tplCol); };
  $('tpl-del').onclick = deleteTemplate;

  // põe um cântico (acabado de acrescentar no fim) no fim da secção escolhida ('' = antes da primeira secção)
  // "+" numa secção da folha: procurar um cântico e acrescentá-lo no fim dessa secção
  // pick = true: botão no topo da folha, com a escolha da secção
  // fixed: secção já escolhida (pode ser null = antes da primeira secção), sem o seletor de secção
  function openSectionAdd(c, secId, pick, fixed) {
    const secs = colItems(c).filter(it => it.k === 'sec').map(it => it.ref);
    if (!pick && !fixed && !secs.some(x => x.id === secId)) return;
    $('sa-sec').hidden = !pick || !secs.length;
    if (pick) {
      $('sa-sel').innerHTML = '<option value="">No início (sem secção)</option>' + secs.map(x => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('');
      $('sa-sel').value = secId && secs.some(x => x.id === secId) ? secId : secs.length ? secs[secs.length - 1].id : ''; // "+" numa secção: essa secção
    }
    const curSec = () => pick ? ($('sa-sel').value || null) : secId;
    const secName = () => (secs.find(x => x.id === curSec()) || {}).title;
    $('sa-title').textContent = secId && secName() ? 'Acrescentar a «' + secName() + '»' : 'Acrescentar cântico';
    $('sa-q').value = ''; $('sa-list').innerHTML = ''; $('sa-msg').textContent = 'Escreva parte do título, do autor ou o número.';
    const pool = allSongs.filter(s => s.approved !== false && (lvl() >= 2 || inCancioneiro(s)));
    // secção com o nome de um momento da Missa (ex.: template «Missa»): mostra logo os cânticos desse momento
    const momentOf = name => name ? MOMENTS.find(m => norm(m) === norm(name)) : null;
    const render = () => {
      const q = norm($('sa-q').value).trim();
      const inCol = new Set((c.songs || []).map(x => x.song_slug));
      let hits;
      if (q.length < 2) {
        const m = momentOf(secName());
        if (!m) { $('sa-list').innerHTML = ''; $('sa-msg').textContent = 'Escreva parte do título, do autor ou o número.'; return; }
        hits = pool.filter(s => hasTag(s, 'Coro CLU — momento', m)).sort((a, b) => a.title.localeCompare(b.title, 'pt'));
        $('sa-msg').textContent = hits.length ? `Cânticos de «${m}» (Momentos da Missa). Escreva para procurar outros.` : 'Escreva parte do título, do autor ou o número.';
      } else {
        hits = pool.filter(s => s._t.includes(q) || (s._a || '').includes(q) || String(s.number) === q)
          .sort((a, b) => (a._t.startsWith(q) ? 0 : 1) - (b._t.startsWith(q) ? 0 : 1) || a.title.localeCompare(b.title, 'pt')).slice(0, 40);
        $('sa-msg').textContent = hits.length ? '' : 'Nenhum cântico encontrado.';
      }
      $('sa-list').innerHTML = hits.map(s => `<li><button type="button" data-slug="${esc(s.slug)}"${inCol.has(s.slug) ? ' disabled' : ''}><b>${esc(s.title)}</b>${s.author ? `<small>${esc(s.author)}</small>` : ''}${inCol.has(s.slug) ? '<small>já está na folha</small>' : ''}</button></li>`).join('');
      $('sa-list').querySelectorAll('button:not([disabled])').forEach(b => b.onclick = async () => {
        b.disabled = true;
        try {
          const sid = curSec();
          await toggleInCollection(c, b.dataset.slug, true);
          await placeInSection(c, b.dataset.slug, sid);
          $('sec-add').close(); toast(sid ? 'Acrescentado a «' + secName() + '»' : 'Acrescentado à folha');
          if (location.hash === '#/lista/colecao-' + c.id) showCollection(c.id);
        } catch (e) { b.disabled = false; appAlert(/máximo/.test(e.message) ? e.message : 'Não foi possível acrescentar: ' + (e.message || e)); }
      });
    };
    $('sa-q').oninput = render;
    $('sa-sel').onchange = render;
    $('sa-close').onclick = () => $('sec-add').close();
    render();
    $('sec-add').showModal(); setTimeout(() => $('sa-q').focus(), 50);
  }
  async function placeInSection(c, slug, secId) {
    let items = colItems(c);
    const me = items.find(it => it.key === slug); items = items.filter(it => it !== me);
    let at;
    if (!secId) at = items.findIndex(it => it.k === 'sec');
    else { const si = items.findIndex(it => it.key === 'sec:' + secId); at = items.findIndex((it, n) => n > si && it.k === 'sec'); }
    if (at < 0) at = items.length;
    items.splice(at, 0, me);
    await colPersist(c, items);
    if (DEMO) demoSave(); else store.set(colsKey(), cols);
  }
  // nova secção (no fim) ou mudar o nome
  async function colSaveSection(c, sec, title) {
    try {
      if (sec) {
        if (live(c)) { const { error } = await sb.from('collection_sections').update({ title }).eq('id', sec.id); if (error) throw error; }
        sec.title = title;
      } else {
        const pos = Math.max(0, ...colItems(c).map(x => x.pos)) + 1;
        let row = { id: 'demo' + Date.now(), collection_id: c.id, title, position: pos };
        if (live(c)) { const { data, error } = await sb.from('collection_sections').insert({ collection_id: c.id, title, position: pos }).select('id,title,position').single(); if (error) throw error; row = data; }
        c.sections = (c.sections || []).concat(row);
      }
      if (DEMO) demoSave(); else store.set(colsKey(), cols);
    } catch (e) { appAlert('Não foi possível guardar: ' + (e.message || e)); }
    showCollection(c.id);
  }
  // nova folha: público, título, duração e template (o template só se escolhe aqui); depois abre a edição
  let newAud = 'coro';
  const colGate = reqGate($('col-save'), () => !!$('col-name').value.trim(), $('col-dlg'));
  const setNewAud = v => { newAud = v; $('col-aud').querySelectorAll('button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); };
  $('col-aud').onclick = e => { const b = e.target.closest('button[data-v]'); if (b) setNewAud(b.dataset.v); };
  function openCollectionDlg() {
    $('col-name').value = ''; setNewAud('coro'); $('col-dur').value = '1w';
    $('col-msg').textContent = 'Um mês depois de expirar, a folha é apagada.';
    colGate();
    fillTplSelect();
    $('col-dlg').showModal();
  }
  async function fillTplSelect(sel) {
    const s = $('col-tpl-sel');
    s.innerHTML = '<option value="">Sem template</option>';
    try { await loadTemplates(); } catch (e) { /* sem rede: fica só «Sem template» */ }
    s.innerHTML = '<option value="">Sem template</option>' + (tpls || []).map(t => `<option value="${esc(t.id)}">${esc(t.title)} — ${esc(t.sections.join(', '))}</option>`).join('') +
      '<option value="gerir">Criar ou mudar templates…</option>';
    s.value = sel && (tpls || []).some(t => t.id === sel) ? sel : '';
    s.dataset.prev = s.value;
  }
  $('col-tpl-sel').onchange = e => {
    if (e.target.value !== 'gerir') { e.target.dataset.prev = e.target.value; return; }
    e.target.value = e.target.dataset.prev || '';
    openTemplates(null); // gerir os templates; escolher um volta à nova folha com ele selecionado
  };
  async function saveCollection() {
    const title = $('col-name').value.trim().slice(0, 80);
    if (!title) { $('col-msg').textContent = 'Escreva um título.'; return; }
    const duration = $('col-dur').value;
    const row = { title, audience: newAud, duration, expires_at: new Date(Date.now() + DURS[duration][1]).toISOString() };
    try {
      let c;
      if (DEMO) { c = { id: 'demo' + Date.now(), ...row, published: false, songs: [], sections: [] }; cols.push(c); }
      else {
        const { data, error } = await sb.from('collections').insert(row).select('id,title,audience,duration,expires_at,created_by,published').single(); if (error) throw error;
        c = { ...data, songs: [], sections: [] }; cols.push(c);
      }
      colStore();
      $('col-dlg').close();
      const tpl = (tpls || []).find(t => t.id === $('col-tpl-sel').value);
      if (tpl) await applyTemplate(c, tpl, true);
      location.hash = '#/lista/colecao-' + c.id; route();
      openColEditor(c); // folhas novas começam em edição
    } catch (e) { $('col-msg').textContent = 'Não foi possível guardar: ' + (e.message || e); }
  }
  $('col-save').onclick = saveCollection;
  $('col-cancel').onclick = () => $('col-dlg').close();
  // no cântico: adicionar a uma coleção (ou escolher entre várias)
  const fitting = s => cols.filter(c => colVisible(c) && colFits(c, s));
  function colLabel(s) {
    const f = fitting(s), inn = f.filter(c => (c.songs || []).some(x => x.song_slug === s.slug));
    if (f.length === 1) return inn.length ? `Na folha «${esc(f[0].title)}» ✓ — retirar` : `Adicionar à folha «${esc(f[0].title)}»`;
    return inn.length ? `Em ${inn.length} folha${inn.length > 1 ? 's' : ''} ✓ — gerir` : 'Adicionar a uma folha';
  }
  const COL_MAX = 10; // máximo de cânticos numa coleção (também travado na base de dados)
  const colFull = c => (c.songs || []).length >= COL_MAX;
  const fullMsg = c => `A folha «${c.title}» já tem ${COL_MAX} cânticos (o máximo). Retire um antes de acrescentar outro.`;
  async function toggleInCollection(c, slug, on) {
    if (on && colFull(c) && !(c.songs || []).some(x => x.song_slug === slug)) throw new Error(fullMsg(c));
    if (on) {
      const pos = Math.max(0, ...colItems(c).map(x => x.pos)) + 1;
      if (live(c)) { const { error } = await sb.from('collection_songs').insert({ collection_id: c.id, song_slug: slug, position: pos }); if (error && !/duplicate/i.test(error.message)) throw error; }
      c.songs = (c.songs || []).filter(x => x.song_slug !== slug).concat({ song_slug: slug, position: pos });
    } else {
      if (live(c)) { const { error } = await sb.from('collection_songs').delete().eq('collection_id', c.id).eq('song_slug', slug); if (error) throw error; }
      c.songs = (c.songs || []).filter(x => x.song_slug !== slug);
    }
    if (DEMO) demoSave(); else store.set(colsKey(), cols);
  }
  $('col-pick-close').onclick = () => $('col-pick').close();
  // Maestro: livro no cântico → «Coleções» (Cancioneiro, Preferidos) e «Folhas» (as ativas); o Coro não se escolhe aqui
  // (os cânticos novos aprovados vão todos para o livro do Coro);
  // cada uma é uma linha de opção, cheia quando o cântico lá está; tocar acrescenta ou retira
  function openSongCollections(slug) {
    const s = bySlug.get(slug); if (!s) return;
    const act = cols.filter(c => !expired(c) && colVisible(c));
    const row = (k, label, sub, on, fixed) => `<button type="button" class="col-pick${on ? ' on' : ''}" data-k="${esc(k)}" aria-pressed="${on}"${fixed ? ' aria-disabled="true"' : ''}><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${on ? `<svg class="pick-ok" viewBox="0 0 24 24" aria-hidden="true">${ICON_CHECK}</svg>` : ''}</button>`;
    const render = () => {
      const sg = bySlug.get(slug), original = srcOf(sg).includes('original'), inC = inCancioneiro(sg);
      $('col-pick-list').innerHTML = '<p class="pick-head">Coleções</p>' +
        row('cancioneiro', 'Cancioneiro', original ? 'Faz parte do Cancioneiro original — não pode ser retirado' : inC ? 'Tocar para retirar' : 'Tocar para acrescentar', inC, original) +
        row('fav', 'Preferidos', 'Só para si', isFav(slug)) +
        '<p class="pick-head">Folhas</p>' +
        act.map(c => row('c:' + c.id, c.title, `${c.published === false ? 'Por publicar · ' : ''}${c.audience === 'coro' ? 'Coro' : 'Cancioneiro'} · até ${new Date(c.expires_at).toLocaleDateString('pt-PT')}`, (c.songs || []).some(x => x.song_slug === slug))).join('') +
        `<button class="col-pick-new" id="col-pick-new">+ Nova folha</button>`;
      $('col-pick-list').querySelectorAll('.col-pick').forEach(b => b.onclick = () => pick(b.dataset.k, b.classList.contains('on'), b));
      $('col-pick-new').onclick = () => { $('col-pick').close(); openCollectionDlg(); };
    };
    const refresh = () => { refreshFavUI(); if (lastSongSlug === slug && !$('view-song').hidden) { const y = window.scrollY; showSong(slug); window.scrollTo(0, y); } };
    async function pick(k, was, b) {
      if (b.getAttribute('aria-disabled') === 'true' || b.dataset.busy) return;
      b.dataset.busy = 1;
      try {
        if (k === 'fav') await toggleFav(slug);
        else if (k === 'cancioneiro') await promote(slug, !was); // retirar pede confirmação
        else {
          const col = cols.find(c => c.id === k.slice(2));
          if (!was && colFull(col)) { appAlert(fullMsg(col)); return; }
          let sec; // com secções: escolher em que secção fica o cântico
          if (!was && (col.sections || []).length) {
            const secs = colItems(col).filter(it => it.k === 'sec').map(it => it.ref);
            sec = await appChoose('Em que secção?', [{ value: '', label: 'No início (sem secção)' }, ...secs.map(x => ({ value: x.id, label: x.title }))]);
            if (sec === null) return;
          }
          await toggleInCollection(col, slug, !was);
          if (!was && sec !== undefined) await placeInSection(col, slug, sec);
          // ao acrescentar a uma folha, abre essa folha
          if (!was) { $('col-pick').close(); toast('Adicionado à folha'); location.hash = '#/lista/colecao-' + col.id; return; }
          toast('Retirado da folha');
        }
      } catch (e) { appAlert(/máximo|max/.test(e.message || '') ? e.message : 'Não foi possível guardar: ' + (e.message || e)); }
      finally { delete b.dataset.busy; }
      render(); refresh();
    }
    render();
    $('col-pick').querySelector('h2').textContent = 'Coleções e folhas';
    $('col-pick').showModal();
  }

  // Gaveta: os livros (Preferidos, Cancioneiro e, do perfil Coro para cima, Coro, Songbook e CANTI 2024)
  const BOOKS_LIST = [
    { id: 'favoritos', label: 'Preferidos', icon: '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6 6.7 19.5l1.1-5.9L3.4 9.5l6-.8z"/>', test: s => isFav(s.slug) },
    // acrescentados na app (ficam aqui mesmo depois de passarem para o Cancioneiro)
    { id: 'livro-novos', label: 'Novos Cânticos', coro: true, novos: true, icon: '<path d="M10.5 3.5c.7 4.6 2.9 6.8 7.5 7.5-4.6.7-6.8 2.9-7.5 7.5-.7-4.6-2.9-6.8-7.5-7.5 4.6-.7 6.8-2.9 7.5-7.5z"/><path d="M18.5 14.5c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3z"/>', test: s => srcOf(s).includes('novos') },
    { id: 'livro-cancioneiro', label: 'Cancioneiro', test: s => inCancioneiro(s) },
    { id: 'livro-coro', label: 'Coro', coro: true, test: s => srcOf(s).includes('coro_clu') },
    { id: 'livro-songbook', label: 'Songbook', coro: true, book: 'songbook', test: s => srcOf(s).includes('songbook') },
    { id: 'livro-canti', label: 'CANTI 2024', coro: true, book: 'canti2024', test: s => srcOf(s).includes('canti2024') },
  ];
  // página de um cântico num livro (do endereço da página: livros/<livro>.pdf#p=N)
  const pageIn = (s, book) => { const f = (s.files || []).find(f => f.path.startsWith(`livros/${book}.pdf`)); return f ? +(f.path.match(/[#&]p=(\d+)/) || [])[1] || 0 : 0; };
  function renderBooks() {
    const row = b => {
      const n = allSongs.filter(s => (lvl() >= 2 || inCancioneiro(s)) && b.test(s)).length;
      return `<li><a href="#/lista/${b.id}">${b.icon ? `<svg class="book-ic" viewBox="0 0 24 24">${b.icon}</svg>` : `<svg class="book-ic outline" viewBox="0 0 24 24">${ICON_BOOK}</svg>`}<span class="t">${esc(b.label)}</span><span class="n">${n}</span>${chev}</a></li>`;
    };
    // no topo, sem título: Preferidos e Novos Cânticos; depois as secções Livros e Folhas (uma secção vazia não aparece)
    const sec = (title, body) => body ? `<li class="cat-head">${title}</li>${body}` : '';
    const books = BOOKS_LIST.filter(b => !b.coro || lvl() >= 2), top = b => b.id === 'favoritos' || b.novos;
    $('az').innerHTML = books.filter(top).map(row).join('') +
      (lvl() >= 2 ? sec('Livros', books.filter(b => !top(b)).map(row).join('')) : books.filter(b => !top(b)).map(row).join('')) + // perfil Cancioneiro: só o Cancioneiro, sem título
      sec('Folhas', renderCollectionsMenu());
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
  // Capa verde com "CANCIONEIRO" durante 2 s ao abrir (também ao regressar do Google, depois de entrar)
  const fromGoogle = /[?&](code|error)=/.test(location.search);
  const splashDone = new Promise(r => setTimeout(r, 2000));
  $('btn-logout').onclick = () => logout();
  sb.auth.onAuthStateChange((event, s) => {
    if (DEMO) return;
    session = s;
    if (event === 'SIGNED_OUT' && $('view-login').hidden) showLogin();
    if (event === 'SIGNED_IN' && s && popupLogin && !$('view-login').hidden) location.reload(); // sessão vinda da janela do Google
  });
  // Se algo falhar ou demorar ao abrir, a capa sai na mesma (nunca fica presa na capa verde)
  let started = false;
  function rescue(msg) {
    if (started) return; started = true;
    $('splash').classList.add('gone');
    if (!session) { if (location.hash.startsWith('#/p/')) route(); else showLogin(msg || ''); return; }
    $('view-login').hidden = true;
    showList(); load(); loadFavs(); loadCollections();
    if (msg) $('status').textContent = msg;
  }
  setTimeout(() => rescue(), 10000);
  (async () => { try {
    await accessToken(); // também troca o ?code= do regresso do Google pela sessão
    if (location.search.includes('code=') || location.search.includes('error')) {
      const err = new URLSearchParams(location.search).get('error_description');
      history.replaceState(null, '', location.pathname + location.hash);
      if (err && !session) { showLogin('Não foi possível entrar: ' + err); return; }
    }
    if (fromGoogle) {
      // regresso na janela do Google aberta pelo computador: com a sessão guardada, fecha-se (a página que a abriu entra)
      // (fromGoogle: o supabase-js já tirou o ?code= do endereço)
      // (o nome da janela perde-se ao passar pelo Google: a marca fica no localStorage, partilhado com a página que a abriu)
      let flag = 0; try { flag = +localStorage.getItem(LOGIN_FLAG) || 0; localStorage.removeItem(LOGIN_FLAG); } catch (e) {}
      if (session && Date.now() - flag < 15 * 60e3) {
        window.close(); await new Promise(r => setTimeout(r, 500));
        // o browser não deixou fechar: só um aviso (a app já entrou na página de onde se clicou)
        started = true; $('splash').classList.add('gone'); $('view-login').hidden = false;
        $('btn-google').hidden = true; $('login-msg').textContent = 'Sessão iniciada ✓ — pode fechar esta janela.';
        return;
      }
    }
    await splashDone;
    if (!session) { started = true; if (location.hash.startsWith('#/p/')) route(); else showLogin(); return; }
    $('view-login').hidden = true;
    $('splash').classList.add('gone'); started = true;
    $('info-user').textContent = 'Sessão: ' + session.user.email;
    loadLyrCache();
    await Promise.race([loadPerfil(), new Promise(r => setTimeout(r, 1500))]); // sem esperar muito se a rede estiver lenta
    if (!DEMO) restoreSource();
    showList();
    load();
    // descarrega os cânticos das folhas e dos Preferidos, depois de saber quais são
    Promise.allSettled([loadFavs(), loadCollections()]).then(() => setTimeout(prefetchCollections, 3000));
    loadSyncInfo();
    startTour(); // 1.ª vez: tutorial (no fim, a proposta de instalar)
    started = true;
  } catch (e) { console.error(e); rescue('Houve um problema ao abrir. Se a lista não aparecer, feche e volte a abrir a app.'); } })();

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
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault(), { passive: false }); // no visor de partituras há o zoom da app
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 && $('pdfview').hidden) e.preventDefault(); }, { passive: false });

})();
