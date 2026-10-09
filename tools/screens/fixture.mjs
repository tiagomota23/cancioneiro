// Dados fictícios para o mapa visual da app (modo ?demo). Só textos de domínio público
// (hinos latinos antigos, canções tradicionais) ou títulos genéricos — nunca letras da base de dados.
const v = (...lines) => ({ type: 'verse', lines });
const c = (...lines) => ({ type: 'chorus', lines });
const rec = (slug, voices) => voices.map((label, i) => ({ kind: 'recording', label, path: `demo/${slug}-${i}.mp3`, mime: 'audio/mpeg', sort: i }));
const score = slug => ({ kind: 'score', label: 'Partitura', path: `demo/${slug}.pdf`, mime: 'application/pdf', sort: 6 });
const coro = (...moments) => [{ grp: 'Coro CLU', tag: 'Para a Missa' }, ...moments.map(m => ({ grp: 'Coro CLU — momento', tag: m }))];

let n = 0;
const song = o => ({
  number: ++n, book_page: null, author: null, language: 'pt', translation_language: null, has_chords: false, pdf_url: null, rights: null,
  edited_by: null, edited_at: null, cancioneiro: true, promoted_by: null, promoted_at: null, approved: true, added_by: null, added_at: null,
  parecidos: null, sources: [{ source: 'original' }], tags: [], files: [], lyrics: [v('(letra de exemplo)')], translation: null, lyrics_edit: null,
  ...o, translation_language: o.translation ? 'pt' : null,
});

const songs = [
  song({ slug: 'salve_regina', title: 'Salve Regina', author: 'Antífona mariana', language: 'la',
    sources: [{ source: 'original' }, { source: 'coro_clu' }], tags: coro('Nossa Senhora'),
    files: [...rec('salve_regina', ['Todos', 'Soprano', 'Contralto', 'Tenor', 'Baixo']), score('salve_regina')],
    lyrics: [v('Salve, Regina, mater misericordiae,', 'vita, dulcedo et spes nostra, salve.'),
      v('Ad te clamamus, exsules filii Hevae.', 'Ad te suspiramus, gementes et flentes', 'in hac lacrimarum valle.'),
      v('Eia ergo, advocata nostra,', 'illos tuos misericordes oculos ad nos converte.'),
      v('Et Iesum, benedictum fructum ventris tui,', 'nobis post hoc exsilium ostende.', 'O clemens, o pia, o dulcis Virgo Maria.')],
    translation: [v('Salve, Rainha, mãe de misericórdia,', 'vida, doçura e esperança nossa, salve.'),
      v('A vós bradamos, os degredados filhos de Eva.', 'A vós suspiramos, gemendo e chorando', 'neste vale de lágrimas.'),
      v('Eia, pois, advogada nossa,', 'esses vossos olhos misericordiosos a nós volvei.'),
      v('E depois deste desterro mostrai-nos Jesus,', 'bendito fruto do vosso ventre.', 'Ó clemente, ó piedosa, ó doce sempre Virgem Maria.')] }),
  song({ slug: 'amazing_grace', title: 'Amazing Grace', author: 'John Newton (1779)', language: 'en', has_chords: true,
    sources: [{ source: 'original' }, { source: 'songbook' }], tags: [{ grp: 'Songbook', tag: 'Hymns' }],
    files: [{ kind: 'score', label: 'Songbook, pág. 12', path: 'livros/songbook.pdf#p=12', mime: 'application/pdf', sort: 6 }],
    lyrics: [v('A[G]mazing grace, how [C]sweet the [G]sound', 'That saved a wretch like [D]me.', 'I [G]once was lost, but [C]now am [G]found,', 'Was [Em]blind, but [D]now I [G]see.'),
      v('’Twas [G]grace that taught my [C]heart to [G]fear,', 'And grace my fears re[D]lieved;', 'How [G]precious did that [C]grace ap[G]pear', 'The [Em]hour I [D]first be[G]lieved.')] }),
  song({ slug: 'adoro_te_devote', title: 'Adoro te devote', author: 'S. Tomás de Aquino', language: 'la',
    sources: [{ source: 'original' }, { source: 'coro_clu' }], tags: coro('Comunhão'), files: [score('adoro_te_devote')],
    lyrics: [v('Adoro te devote, latens Deitas,', 'quae sub his figuris vere latitas:', 'tibi se cor meum totum subicit,', 'quia te contemplans totum deficit.'),
      v('Visus, tactus, gustus in te fallitur,', 'sed auditu solo tuto creditur;', 'credo quidquid dixit Dei Filius:', 'nil hoc verbo Veritatis verius.')],
    translation: [v('Adoro-te devotamente, Deus escondido,', 'que sob estas figuras verdadeiramente te ocultas:', 'a ti o meu coração todo se submete,', 'porque, ao contemplar-te, todo desfalece.'),
      v('A vista, o tacto, o gosto em ti se enganam,', 'só no ouvido se crê com segurança;', 'creio em tudo o que disse o Filho de Deus:', 'nada mais verdadeiro que esta palavra da Verdade.')] }),
  song({ slug: 'ave_verum_corpus', title: 'Ave verum corpus', author: 'Hino eucarístico (séc. XIV)', language: 'la', sources: [{ source: 'coro_clu' }], cancioneiro: false,
    tags: coro('Comunhão'), files: rec('ave_verum_corpus', ['Soprano', 'Contralto']),
    lyrics: [v('Ave verum corpus, natum de Maria Virgine,', 'vere passum, immolatum in cruce pro homine,'), v('cuius latus perforatum fluxit aqua et sanguine:', 'esto nobis praegustatum in mortis examine.')] }),
  song({ slug: 'veni_creator_spiritus', title: 'Veni Creator Spiritus', author: 'Rabano Mauro (séc. IX)', language: 'la',
    lyrics: [v('Veni, creator Spiritus,', 'mentes tuorum visita,', 'imple superna gratia,', 'quae tu creasti pectora.'), v('Qui diceris Paraclitus,', 'altissimi donum Dei,', 'fons vivus, ignis, caritas,', 'et spiritalis unctio.')] }),
  song({ slug: 'santa_lucia', title: 'Santa Lucia', author: 'Teodoro Cottrau (1849)', language: 'it', has_chords: true,
    sources: [{ source: 'original' }, { source: 'canti2024' }], tags: [{ grp: 'CANTI 2024', tag: 'Canti popolari regionali' }],
    files: [{ kind: 'score', label: 'CANTI 2024, pág. 160', path: 'livros/canti2024.pdf#p=160', mime: 'application/pdf', sort: 6 }],
    lyrics: [v('Sul [C]mare luccica l’astro d’ar[G]gento,', 'placida è l’onda, prospero il [C]vento.'), c('Ve[F]nite all’agile [C]barchetta mia,', 'Santa Lu[G]cia! Santa Lu[C]cia!')] }),
  song({ slug: 'be_thou_my_vision', title: 'Be Thou My Vision', author: 'Tradicional irlandês', language: 'en',
    lyrics: [v('Be Thou my vision, O Lord of my heart;', 'naught be all else to me, save that Thou art.', 'Thou my best thought, by day or by night,', 'waking or sleeping, Thy presence my light.')] }),
  song({ slug: 'frere_jacques', title: 'Frère Jacques', author: 'Tradicional', language: 'fr',
    lyrics: [v('Frère Jacques, frère Jacques,', 'dormez-vous ? dormez-vous ?', 'Sonnez les matines, sonnez les matines,', 'ding, dang, dong ! ding, dang, dong !')] }),
  song({ slug: 'de_colores', title: 'De colores', author: 'Tradicional', language: 'es',
    lyrics: [c('De colores, de colores se visten los campos en la primavera.', 'De colores, de colores son los pajaritos que vienen de afuera.')] }),
  song({ slug: 'gaudeamus_igitur', title: 'Gaudeamus igitur', author: 'Tradicional (séc. XVIII)', language: 'la',
    lyrics: [v('Gaudeamus igitur,', 'iuvenes dum sumus.', 'Post iucundam iuventutem,', 'post molestam senectutem', 'nos habebit humus.')] }),
  song({ slug: 'pange_lingua', title: 'Pange lingua', author: 'S. Tomás de Aquino', language: 'la', sources: [{ source: 'coro_clu' }], cancioneiro: false, tags: coro('Ação de Graças'),
    lyrics: [v('Pange, lingua, gloriosi', 'corporis mysterium,', 'sanguinisque pretiosi,', 'quem in mundi pretium', 'fructus ventris generosi', 'Rex effudit gentium.')] }),
  song({ slug: 'cantico_por_transcrever', title: 'Cântico por transcrever', language: 'pt', sources: [{ source: 'coro_clu' }], cancioneiro: false,
    rights: '© os autores · protegido por direitos de autor — uso privado', tags: [{ grp: 'Coro CLU', tag: 'Outras' }],
    files: rec('cantico_por_transcrever', ['Todos']), lyrics: [v('(letra por transcrever — ouvir as gravações)')] }),
  song({ slug: 'cantico_no_livro', title: 'Cântico no livro', language: 'it', sources: [{ source: 'canti2024' }], cancioneiro: false,
    files: [{ kind: 'score', label: 'CANTI 2024, pág. 46', path: 'livros/canti2024.pdf#p=46', mime: 'application/pdf', sort: 6 }],
    lyrics: [v('(letra no livro CANTI 2024, pág. 46 — abrir o livro)')] }),
  song({ slug: 'novo_por_aprovar', title: 'Cântico acrescentado (por aprovar)', author: 'Exemplo', sources: [{ source: 'novos' }], cancioneiro: false, approved: false,
    added_by: 'coro@exemplo.pt', added_at: '2026-10-01T10:00:00Z', tags: [{ grp: 'Categoria', tag: 'Juventude' }],
    lyrics: [v('(letra de exemplo de um cântico novo)')] }),
];
// títulos genéricos para dar corpo às listas
const fill = [['Hino da manhã', 'pt'], ['Cântico de entrada', 'pt'], ['Cântico de ofertório', 'pt'], ['Aleluia', 'pt'], ['Santo', 'pt'], ['Cordeiro de Deus', 'pt'],
  ['Kyrie eleison', 'la'], ['Gloria in excelsis', 'la'], ['Agnus Dei', 'la'], ['Canzone popolare', 'it'], ['Canto di montagna', 'it'], ['Folk song', 'en'], ['Spiritual', 'en'], ['Canción popular', 'es']];
for (const [title, language] of fill) songs.push(song({ slug: 'exemplo_' + n, title, language, lyrics: [v('(letra de exemplo)')] }));

export default songs;
