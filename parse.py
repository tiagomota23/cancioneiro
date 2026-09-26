import re, json, html, sys
from collections import Counter
src = open(sys.argv[1], encoding='utf-8').read()
divs = re.findall(r'<div id="([^"]+)" class="linkTopNav">(.*?)</div>', src, re.S)

STOP = {
 'pt': 'o a os as de do da dos das que e em um uma não nao meu minha tu teu tua nós vós é são ao pelo pela para com senhor deus coração amor vem vinde eu'.split(),
 'it': 'il lo la gli le di del della che e è non un una io tu mio mia noi per con sono nel nella signore cuore amore più ti ci'.split(),
 'es': 'el la los las de del que y en un una no mi tu yo nosotros por con es son al señor corazón amor más te muy soy pues vuestra vuestro mí qué pues'.split(),
 'fr': 'le la les de du des que et en un une ne pas je tu nous vous est sont au pour avec seigneur coeur cœur amour plus te'.split(),
 'en': 'the a of and to in is you i my your we he she it not with for be are on all lord heart love will me'.split(),
 'la': 'et in est non ad cum qui quae quod deus dominus domine nobis nos tibi mea meum sanctus gloria pater mater mei nostri eius ave es sum ut per tuum tua nostra caeli coeli regina alleluia salve virgo christe christi spiritus amen quia sicut deo nobis dei super vita ergo'.split(),
 'pl': 'i w na nie się z do jest to że ty mnie ja my panie bóg boże serce jak'.split(),
 'de': 'der die das und ist nicht ich du wir ein eine mit zu im den dem herr gott'.split(),
}
def lang_of(text):
    words = re.findall(r"[a-zà-ÿœąęłńśźżó]+", text.lower())
    sc = {l: sum(w in set(s) for w in words) for l, s in STOP.items()}
    if re.search(r'[ąęłńśźż]', text.lower()): sc['pl'] += 10
    if re.search(r'[ãõç]', text.lower()): sc['pt'] += 3
    if re.search(r'ñ|¿|¡', text.lower()): sc['es'] += 3
    return max(sc, key=sc.get)

def clean(s):
    return html.unescape(re.sub(r'\s+', ' ', s)).strip()

def para_lines(inner):
    inner = re.sub(r'<span chord="([^"]*)"\s*>\s*</span>', lambda m: '[' + html.unescape(m.group(1)).strip() + ']', inner)
    parts = re.split(r'<br\s*/?>', inner)
    lines = [clean(p) for p in parts]
    while lines and not lines[-1]: lines.pop()
    return lines

def split_translation(txt):
    txt = html.unescape(txt).strip()
    raw = [l.strip() for l in txt.split('\n')]
    lines = []
    for r in raw:
        if not r: continue
        if '/' in r:
            lines += [x.strip() for x in r.split('/') if x.strip()]
        else:
            lines += [x.strip() for x in re.split(r'(?<=[.;!?])\s+', r) if x.strip()]
    return lines

OVERRIDE = {'ave_o_vergjine_canto_friulano':'fur','o_surdato_nnammurato':'nap','salelaka_mokonzi_congo':'ln',
 'rosa_das_rosas_afonso_sec_xiii':'gl','santa_maria_strela_do_dia_das_cantigas_santa_maria':'gl','madonna_de_la_grazia':'it',
 'vuestra_soy_teresa_avila_canto_venezuelano':'es','lela':'gl',
 'dulcis_christe_michelangelo_grancini_sec_xvii':'la','nitida_stella_melodia_checa_sec_xviii':'la','o_bone_jesu_palestrina_sec_xvi':'la',
 'o_quam_amabilis_anonimo':'la','o_sanctissima_canto_siciliano':'la','panis_angelicus_cesar_frank':'la',
 'salve_mater_misericordiae_pothier_sec_xix':'la','matir_nieba_i_zimli':'cu','pod_tvoju_milost_dimitrij_bortnjanskij':'cu'}

def align(tr_lines, stanzas):
    # distribute the (prose) translation over the same stanza/line layout as the original
    olines = [re.sub(r'\[[^\]]*\]', '', l) for s in stanzas for l in s['lines']]
    N = len(olines)
    words, brk = [], []
    for li, l in enumerate(tr_lines):
        ws = l.split()
        for wi, w in enumerate(ws):
            words.append(w); brk.append(2 if wi == len(ws)-1 else 0)
    W = len(words)
    O = sum(len(x) for x in olines) or 1
    T = sum(len(w)+1 for w in words)
    if N == 0 or W < N or not (0.55 < T/O < 1.8): return None
    pre = [0]
    for w in words: pre.append(pre[-1]+len(w)+1)
    def bpen(j):  # penalty for breaking after word j-1
        if j == W: return 0
        w = words[j-1]
        if brk[j-1] == 2: return 0
        if w[-1] in '.;!?': return 0.05
        if w[-1] in ',:': return 0.2
        return 0.9
    INF = 1e18
    dp = [[INF]*(W+1) for _ in range(N+1)]; bk = [[0]*(W+1) for _ in range(N+1)]
    dp[0][0] = 0
    for i in range(1, N+1):
        exp = len(olines[i-1]) * T / O
        for j in range(i, W-(N-i)+1):
            best, bj = INF, 0
            for k in range(max(i-1, j-40), j):
                if dp[i-1][k] >= INF: continue
                ln = pre[j]-pre[k]
                c = dp[i-1][k] + ((ln-exp)/(exp+8))**2 + bpen(j)
                if c < best: best, bj = c, k
            dp[i][j] = best; bk[i][j] = bj
    cuts, j = [], W
    for i in range(N, 0, -1):
        k = bk[i][j]; cuts.append((k, j)); j = k
    cuts.reverse()
    lines = [' '.join(words[a:b]) for a, b in cuts]
    out, k = [], 0
    for s in stanzas:
        n = len(s['lines']); out.append({'type': s['type'], 'lines': lines[k:k+n]}); k += n
    return out

songs = []
for i, (slug, body) in enumerate(divs, 1):
    tm = re.search(r'<p class="title">(.*?)</p>', body, re.S)
    title_html = tm.group(1)
    pdf = re.search(r'href="([^"]+\.pdf)"', title_html)
    title = clean(re.sub(r'<[^>]+>', '', title_html))
    am = re.search(r'<p class="artist">(.*?)</p>', body, re.S)
    author = clean(re.sub(r'<[^>]+>', '', am.group(1))) if am else None
    stanzas = []
    for cls, inner in re.findall(r'<p class="(verse|chorus)[^"]*">(.*?)</p>', body, re.S):
        stanzas.append({'type': cls, 'lines': para_lines(inner)})
    trm = re.search(r'<p class="translation">(.*?)</p>', body, re.S)
    translation = None
    if trm:
        tl = split_translation(trm.group(1))
        nlines = sum(len(s['lines']) for s in stanzas)
        # if line counts match, mirror the original stanza structure
        if len(tl) == nlines:
            translation, k = [], 0
            for s in stanzas:
                n = len(s['lines']); translation.append({'type': s['type'], 'lines': tl[k:k+n]}); k += n
        else:
            translation = align(tl, stanzas) or [{'type': 'verse', 'lines': tl}]
    plain = ' '.join(re.sub(r'\[[^\]]*\]', '', l) for s in stanzas for l in s['lines'])
    lang = OVERRIDE.get(slug) or lang_of(title + ' ' + plain)
    songs.append({
        'slug': slug, 'number': i, 'title': title, 'author': author, 'language': lang,
        'lyrics': stanzas, 'translation': translation,
        'translation_language': 'pt' if translation else None,
        'has_chords': any('[' in l for s in stanzas for l in s['lines']),
        'pdf_url': pdf.group(1) if pdf else None,
    })
json.dump(songs, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print(len(songs), Counter(s['language'] for s in songs), sum(s['has_chords'] for s in songs), 'chords')
tr = [s for s in songs if s['translation']]
print('translations', len(tr), 'mirrored', sum(len(s['translation'])>1 or len(s['lyrics'])==1 for s in tr))
print('translation-lang not pt:', [ (s['slug'],s['language']) for s in tr if s['language']=='pt'][:20])
