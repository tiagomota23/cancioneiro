#!/usr/bin/env python3
# Quadro «Opções — cores por perfil» do mapa (design/artefactos/mapa/project/OpcoesPerfis.dc.html).
# Imagens: tools/screens/opcoes-perfis.mjs → out/opcoes4; ids em design/artefactos/mapa/blobs/opcoes.json.
# Uso: python3 tools/screens/opcoes-perfis-board.py  (escreve o quadro e a altura em canvas.json)
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
MAPA = ROOT / 'design/artefactos/mapa'
BLOBS = json.loads((MAPA / 'blobs/opcoes.json').read_text())

PERFIS = [  # (chave da imagem, nome, nota, fichas de cor)
  ('cancioneiro', 'Cancioneiro — verde (atual)', 'Sem alterações.',
   [('brand', '#10835c'), ('brand-deep', '#0b6b4b'), ('on-brand', '#ffffff'), ('accent', '#0e7f58'), ('tint', '#e3f5ec'), ('border', '#ccd8d2')]),
  ('coro-claro', 'Coro — azul-bebé (claro)', 'Fundo claro: texto e símbolos sobre a marca passam a escuros (8,4:1). Destaque azul médio a 5,7:1 em branco.',
   [('brand', '#a9d3ef'), ('brand-deep', '#8fc2e6'), ('on-brand', '#12324a'), ('accent', '#1f6aa8'), ('tint', '#e4f0fa'), ('border', '#c9d8e4')]),
  ('maestro-medio', 'Maestro — vermelho (médio)', 'Texto branco sobre a marca (4,8:1). Destaque a 5,9:1 em branco.',
   [('brand', '#b35650'), ('brand-deep', '#93433e'), ('on-brand', '#ffffff'), ('accent', '#a8453f'), ('tint', '#fbe7e5'), ('border', '#e2cfcd')]),
  ('gestor-claro', 'Gestor — cinzento (claro)', 'Fundo claro: texto e símbolos sobre a marca passam a escuros (10,2:1). Destaque cinzento a 6,3:1 em branco.',
   [('brand', '#d6dadd'), ('brand-deep', '#c3c9cd'), ('on-brand', '#262b2f'), ('accent', '#56626a'), ('tint', '#eceef0'), ('border', '#d0d5d9')]),
]
ECRAS = [
  ('indice', 'Página inicial'), ('gaveta', 'Menu ☰'), ('folha', 'Folha'), ('folha-edicao', 'Editar folha — janela, chips e segmentado'),
  ('folha-nova', 'Nova folha — segmentado e botões'), ('perfis', 'Perfil — linhas de opção e botão cheio'), ('cantico-acordes', 'Cântico — acordes e ligações'),
]
AJUSTAR = [
  ('Títulos das janelas', 'Hoje usam brand-deep. Com o azul e o cinzento claros ficariam ilegíveis, por isso nas maquetas usam o destaque (accent) em todos os perfis. Proposta: passar a regra para accent.'),
  ('Vermelho do Maestro e botões de perigo', 'O destaque #a8453f fica perto do vermelho de perigo #c0392b (Apagar). No Maestro, «Cancelar» e «Apagar» ficam quase da mesma cor. Opções: puxar o vermelho do Maestro para um tom mais rosado ou acastanhado, ou manter o destaque verde só no Maestro e mudar apenas o fundo.'),
  ('Cinzento do Gestor', 'Com o destaque cinzento, ligações e botões podem parecer desativados. Alternativa: fundo cinzento com destaque verde.'),
  ('O que muda com o perfil', 'Só os tokens de cor: brand, brand-deep, on-brand, accent, chord, pdf-title, tint, tint-soft, border, border-dash, line e meter-idle. A estrela, o perigo, os avisos e o modo escuro das páginas dos cânticos ficam iguais (o modo escuro tem destaques próprios definidos, mas não estão nas maquetas).'),
  ('Fora dos tokens', 'Ícone da app, cor da barra do telemóvel (theme-color) e ecrã de arranque continuam verdes: são fixos e aparecem antes de se saber o perfil.'),
  ('Conteúdo', 'Todas as maquetas mostram o conteúdo do Gestor, para comparar só a cor. A app não foi alterada.'),
]

def ficha(nome, cor):
  borda = 'border: 1px solid #c9d2ce;' if cor.lower() in ('#ffffff',) else ''
  return (f'<div style="display: flex; align-items: center; gap: 8px"><span style="width: 28px; height: 28px; border-radius: 8px; background: {cor}; {borda} flex: none"></span>'
          f'<span style="font-size: 13px; line-height: 16px"><b>{nome}</b><br><span style="color: #4a5a53">{cor}</span></span></div>')

def coluna(k, nome, nota, fichas):
  return (f'<div style="width: 390px; display: flex; flex-direction: column; gap: 10px">'
          f'<p style="margin: 0; font-size: 20px; font-weight: 700">{nome}</p>'
          f'<p style="margin: 0; font-size: 14px; line-height: 21px; color: #4a5a53; min-height: 63px">{nota}</p>'
          f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px">{"".join(ficha(*f) for f in fichas)}</div></div>')

linhas = []
for e, titulo in ECRAS:
  imgs = ''.join(f'<img src="/_blob/{BLOBS[f"opcoes4/{e}-{k}.png"]}" alt="{titulo} — {n}" style="width: 390px; height: 844px; border-radius: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.12)">' for k, n, _, _ in PERFIS)
  linhas.append(f'<div style="display: flex; flex-direction: column; gap: 14px"><h2 style="margin: 0; font-family: Marcellus, Georgia, serif; font-weight: 400; font-size: 24px; letter-spacing: 2px; color: #0f7a57">{titulo}</h2><div style="display: flex; gap: 48px">{imgs}</div></div>')

ajustes = ''.join(f'<p style="margin: 0; font-size: 15px; line-height: 23px"><b>{t}</b> — {x}</p>' for t, x in AJUSTAR)
H = 7240  # medido no navegador (7218 px) com folga; acertar se o texto mudar
html = f'''<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>Opções: cores por perfil</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&amp;family=Lato:wght@400;700&amp;display=swap">
<style>
body{{margin:0}}
a{{color:#0f7a57}}a:hover{{color:#0a5a40}}
</style>
</helmet>
<div style="width: 1832px; height: {H}px; box-sizing: border-box; padding: 64px; background: #f3f5f4; color: #1d2b25; font-family: Lato, 'Helvetica Neue', sans-serif; display: flex; flex-direction: column; gap: 24px">
<div style="display: flex; flex-direction: column; gap: 8px; max-width: 1500px">
<h1 style="margin: 0; font-family: Marcellus, Georgia, serif; font-weight: 400; font-size: 36px; letter-spacing: 3px; color: #0f7a57">Opções: cores por perfil</h1>
<p style="margin: 0; font-size: 16px; line-height: 24px; color: #4a5a53">Teste: a app real (v202) com os tokens de cor trocados conforme o perfil. Variantes escolhidas pelo Tiago a 21 out 2026: azul claro, vermelho médio, cinzento claro. Por afinar; não implementado.</p>
</div>
<div data-faixa style="display: flex; align-items: center; gap: 16px; padding: 18px 24px; border-radius: 14px; background: #fff8e3; color: #5a4600; border: 1px solid #f0d58a; max-width: 1704px"><span style="flex: none; padding: 4px 12px; border-radius: 999px; background: #8a5a00; color: #fff; font-size: 13px; font-weight: 700; letter-spacing: 1.2px">EM TESTE</span><p style="margin: 0; font-size: 17px; line-height: 25px">Comente nos ecrãs o que ajustar (cor, contraste, botões, chips). Os valores abaixo são o ponto de partida.</p></div>
<div style="display: flex; gap: 48px">{"".join(coluna(*p) for p in PERFIS)}</div>
<div style="display: flex; flex-direction: column; gap: 8px; max-width: 1704px; padding: 20px 24px; border-radius: 14px; background: #fff; border: 1px solid #dfe6e2"><p style="margin: 0 0 4px; font-size: 13px; font-weight: 700; letter-spacing: 1.2px; color: #4a5a53">POR DECIDIR</p>{ajustes}</div>
{"".join(linhas)}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1832,"height":{H}}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
'''
(MAPA / 'project/OpcoesPerfis.dc.html').write_text(html)
c = json.loads((MAPA / 'project/canvas.json').read_text())
r = c['boards']['OpcoesRodape.dc.html']
c['boards']['OpcoesPerfis.dc.html'] = {'x': r['x'], 'y': r['y'] + r['h'] + 120, 'w': 1832, 'h': H, 'title': 'Opções — cores por perfil'}
if 'OpcoesPerfis.dc.html' not in c['order']: c['order'].insert(c['order'].index('OpcoesRodape.dc.html') + 1, 'OpcoesPerfis.dc.html')
(MAPA / 'project/canvas.json').write_text(json.dumps(c, ensure_ascii=False))
print('OpcoesPerfis', H)
