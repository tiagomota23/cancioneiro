#!/usr/bin/env python3
# Quadro «Opções — botões da folha» do mapa (design/artefactos/mapa/project/OpcoesFolhaTopo.dc.html).
# Imagens: tools/screens/opcoes-folha-topo.mjs → out/opcoes5; ids em design/artefactos/mapa/blobs/opcoes.json.
# Uso: python3 tools/screens/opcoes-folha-topo-board.py  (escreve o quadro e a sua posição em canvas.json)
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
MAPA = ROOT / 'design/artefactos/mapa'
BLOBS = json.loads((MAPA / 'blobs/opcoes.json').read_text())
OPC = [  # (chave, nome, nota)
  ('atual', 'Atual — no fim da folha', 'Botões de 40 px depois do último cântico. Numa folha comprida, o Maestro tem de ir ao fim para editar ou publicar.'),
  ('a', 'A — no topo, como primeira linha ✓', 'Escolhida. Os mesmos botões de 40 px, por baixo do título e da data, antes das secções. Segue as regras 11 e 12 sem exceções; a lista desce cerca de 50 px.'),
  ('b', 'B — no topo, dentro do título', 'Botões pequenos (32 px) logo por baixo da data, como parte do cabeçalho. Mais compacto, mas abre uma exceção: hoje o botão pequeno é só para linhas densas.'),
]
CASOS = [('por-publicar', 'Folha por publicar — Editar folha e Publicar'), ('publicada', 'Folha publicada — só Editar folha')]
H = 2320  # medido no navegador (2300 px) com folga; acertar se o texto mudar
def col(k, nome, nota):
  return (f'<div style="width: 390px; display: flex; flex-direction: column; gap: 6px; min-height: 120px">'
          f'<p style="margin: 0; font-size: 18px; font-weight: 700">{nome}</p>'
          f'<p style="margin: 0; font-size: 14px; line-height: 21px; color: #4a5a53">{nota}</p></div>')
linhas = ''.join(
  f'<div style="display: flex; flex-direction: column; gap: 14px"><h2 style="margin: 0; font-family: Marcellus, Georgia, serif; font-weight: 400; font-size: 24px; letter-spacing: 2px; color: #0f7a57">{t}</h2>'
  f'<div style="display: flex; gap: 48px">' + ''.join(
    f'<img src="/_blob/{BLOBS[f"opcoes5/{c}-{k}.png"]}" alt="{t} — {n}" style="width: 390px; height: 844px; border-radius: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.12)">' for k, n, _ in OPC)
  + '</div></div>' for c, t in CASOS)
html = f'''<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>Opções: botões da folha</title>
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
<div style="width: 1366px; height: {H}px; box-sizing: border-box; padding: 64px; background: #f3f5f4; color: #1d2b25; font-family: Lato, 'Helvetica Neue', sans-serif; display: flex; flex-direction: column; gap: 24px">
<div style="display: flex; flex-direction: column; gap: 8px">
<h1 style="margin: 0; font-family: Marcellus, Georgia, serif; font-weight: 400; font-size: 36px; letter-spacing: 3px; color: #0f7a57">Opções: botões da folha</h1>
<p style="margin: 0; font-size: 16px; line-height: 24px; color: #4a5a53">Onde ficam «✎ Editar folha» e «Publicar» na folha vista pelo Maestro (e Gestor). A app real (v206, perfil Maestro), só com a barra mudada de sítio. Pedido do Tiago a 24 out 2026.</p>
</div>
<div data-faixa style="display: flex; align-items: center; gap: 16px; padding: 18px 24px; border-radius: 14px; background: #0b6b4b; color: #fff"><span style="flex: none; padding: 4px 12px; border-radius: 999px; background: #fff; color: #0b6b4b; font-size: 13px; font-weight: 700; letter-spacing: 1.2px">DECIDIDO</span><p style="margin: 0; font-size: 17px; line-height: 25px">Decidido a 24 out 2026: <b>A — no topo, como primeira linha</b>. Enviado à app; a marcar como implementado quando sair a versão.</p></div>
<div style="display: flex; gap: 48px">{"".join(col(*o) for o in OPC)}</div>
{linhas}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1366,"height":{H}}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
'''
(MAPA / 'project/OpcoesFolhaTopo.dc.html').write_text(html)
c = json.loads((MAPA / 'project/canvas.json').read_text())
r = c['boards']['OpcoesPerfis.dc.html']
c['boards']['OpcoesFolhaTopo.dc.html'] = {'x': r['x'], 'y': r['y'] + r['h'] + 120, 'w': 1366, 'h': H, 'title': 'Opções — botões da folha'}
if 'OpcoesFolhaTopo.dc.html' not in c['order']: c['order'].insert(c['order'].index('OpcoesPerfis.dc.html') + 1, 'OpcoesFolhaTopo.dc.html')
(MAPA / 'project/canvas.json').write_text(json.dumps(c, ensure_ascii=False))
print('OpcoesFolhaTopo', H)
