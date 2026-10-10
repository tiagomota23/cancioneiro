# Quadro «Fluxo de navegação» do mapa (canvas): a árvore de navegação a partir da entrada, com as imagens dos ecrãs.
# As imagens vêm de design/artefactos/mapa/blobs/ecras.json (ecrã → id do asset no canvas).
# Uso: python3 tools/screens/fluxo.py > design/artefactos/mapa/project/Fluxo.dc.html
import sys, json, os
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BLOB=json.load(open(os.path.join(ROOT,'design/artefactos/mapa/blobs/ecras.json')))  # ecrã → asset no canvas
W,H=2490,3180
ROW={1:200,2:810,3:1420,4:2030,5:2640}
CW,CH=180,450
def L(c): return 64+240*c
def CX(c): return L(c)+CW//2
COL='#7d8f87'
cards=[
(1,4,'login','Entrar com Google','ou «Entrar no Cancioneiro»',''),
(1,5,'indice','Índice','página inicial',''),
(1,6,'tutorial','Tutorial','na 1.ª entrada; depois em Informação',''),
(2,2,'gaveta','Menu ☰','livros e folhas',''),
(2,6,'perfis','Perfil','símbolo no canto superior direito',''),
(2,8,'pesquisa','Pesquisa','escrever na barra de procura',''),
(2,9,'categoria','Categoria','tocar numa categoria',''),
(3,0,'preferidos','Preferidos','Menu › Preferidos',''),
(3,1,'livro','Livro','Menu › um livro',''),
(3,2,'novos','Novos Cânticos','Menu › Novos Cânticos',''),
(3,3,'folha','Folha','Menu › uma folha',''),
(3,4,'folha-nova','Nova folha','Menu › + Nova folha',''),
(3,5,'info','Informação','Perfil › i (ajuda e versão)',''),
(3,6,'novo-cantico','Novo cântico','Perfil › Acrescentar um cântico',''),
(3,7,'gestao','Gestão de utilizadores','Perfil › Gestão (Gestor)',''),
(4,3,'partilhado','Cântico partilhado','abre sem conta, só letra e tradução',''),
(4,4,'cantico-traducao','Cântico','aberto de qualquer lista','hub'),
(5,2,'cantico-acordes','Com acordes','botão de acordes',''),
(5,3,'gravacao','A ouvir uma gravação','tocar numa gravação',''),
(5,4,'partitura','Partitura','tocar numa partitura',''),
(5,5,'folha-adicionar','Adicionar a uma folha','escolher a folha',''),
(5,6,'editor','Editar cântico','Maestro e Gestor',''),
(1,8,'indice-cancioneiro','Índice · Cancioneiro','perfil com menos categorias','var'),
(1,9,'indice-escuro','Índice · modo escuro','botão ☾ ou o telemóvel','var'),
(5,0,'cantico-escuro','Cântico · modo escuro','botão ☾ ou o telemóvel','var'),
(5,1,'cantico-cancioneiro','Cântico · Cancioneiro','sem acordes, gravações nem partituras','var'),
(5,8,'cantico-novo','Cântico novo por aprovar','aberto de Novos Cânticos','var'),
(5,9,'folha-edicao','Folha em edição','Folha › Editar (Maestro e Gestor)','var'),
]
bands=[('Outras vistas do índice',1,8,9),('Outras vistas do cântico',5,0,1),('Outros estados',5,8,9)]
out=[]; mk=[0]
def svg(left,top,w,h,d,head,col=None,dash=''):
    col=col or COL
    defs=mid=''
    COLX=col
    if head:
        mk[0]+=1; i=mk[0]
        defs=f'<defs><marker id="dc-arrow-head-filled-{i}" orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible"><path d="M0 0 L4 2 L0 4 Z" fill="{COLX}" stroke="none" style="stroke: none; fill: {COLX}; fill: context-stroke"/></marker></defs>'
        mid=f' marker-end="url(#dc-arrow-head-filled-{i})"'
    out.append(f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" preserveAspectRatio="none" style="position: absolute; left: {left}px; top: {top}px; width: {w}px; height: {h}px; overflow: visible; fill: none; stroke: {col}; stroke-width: 2;{dash} stroke-linecap: round; stroke-linejoin: round">{defs}<path d="{d}"{mid}></path></svg>')
def hseg(x1,x2,y,head=False,left=False,**k):  # left end x1
    n=x2-x1; h=4 if head else 0
    svg(x1,y-4,n,8,f'M {n} 4 L {h} 4' if left else f'M 0 4 L {n-h} 4',head,**k)
def vseg(x,y1,y2,head=False,**k):  # top to bottom
    n=y2-y1; h=4 if head else 0
    svg(x-4,y1,8,n,f'M 4 0 L 4 {n-h}',head,**k)
def bot(r): return ROW[r]+CH
def one_to_many(pr,pc,cr,cols):
    y0=bot(pr); yb=y0+80
    vseg(CX(pc),y0,yb)
    xs=[CX(c) for c in cols]+[CX(pc)]
    hseg(min(xs),max(xs),yb)
    for c in cols: vseg(CX(c),yb,ROW[cr]-1,True)

# bands first
for name,r,c1,c2 in bands:
    l=L(c1)-16; t=ROW[r]-40; w=L(c2)+CW+16-l; h=CH+56
    out.append(f'<div style="position: absolute; left: {l}px; top: {t}px; width: {w}px; height: {h}px; box-sizing: border-box; background: #e9efec; border: 2px dashed #c3d0ca; border-radius: 20px"></div>')
# arrows
for c in (4,5):
    y=ROW[1]+CH//2
    hseg(L(c)+CW,L(c+1)-1,y,True)
one_to_many(1,5,2,[2,6,8,9])
one_to_many(2,2,3,[0,1,2,3,4])
one_to_many(2,6,3,[5,6,7])
yb=bot(3)+80
for c in (0,1,2): vseg(CX(c),bot(3),yb)
vseg(L(3)+60,bot(3),yb)
for c in (8,9): vseg(CX(c),bot(2),yb)
hseg(CX(0),CX(9),yb)
G='#12966a'
vseg(L(3)+120,bot(3),ROW[4]-1,True,col=G,dash=' stroke-dasharray: 6 6;')
PM=ROW[4]+CH//2
hseg(L(2)+CW+1,L(3),PM,True,left=True)
vseg(CX(4),yb,ROW[4]-1,True)
one_to_many(4,4,5,[2,3,4,5,6])
# labels
out.append(f'<div style="position: absolute; left: {L(3)+132}px; top: {(bot(3)+80+ROW[4])//2-8}px; width: 64px; font-size: 13px; line-height: 16px; font-weight: 700; color: #0f7a57">Partilhar</div>')
for name,r,c1,c2 in bands:
    out.append(f'<div style="position: absolute; left: {L(c1)}px; top: {ROW[r]-28}px; font-size: 12px; line-height: 16px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #5d6e66">{name}</div>')
out.append('<h2 style="position: absolute; left: 64px; top: 56px; margin: 0; font-family: Marcellus, Georgia, serif; font-weight: 400; font-size: 34px; line-height: 44px; letter-spacing: 3px; color: #0f7a57">Fluxo de navegação</h2>')
out.append('<p style="position: absolute; left: 64px; top: 108px; width: 1500px; margin: 0; font-size: 16px; line-height: 24px; color: #4a5a53">Cada seta é um toque que leva de um ecrã ao seguinte, a partir da entrada. A seta verde tracejada é um endereço enviado a outra pessoa. As caixas tracejadas mostram o mesmo ecrã noutro perfil, modo ou estado.</p>')
out.append(f'<div style="position: absolute; left: {L(2)}px; top: {PM-44}px; width: {CW}px; height: 88px; box-sizing: border-box; padding: 10px 14px; display: flex; align-items: center; background: #ffffff; border: 1px solid #c3d0ca; border-radius: 12px; font-size: 13px; line-height: 17px; color: #4a5a53"><span><b style="font-size: 15px; line-height: 20px; color: #1d2b25">Página de entrada</b><br>«Entrar no Cancioneiro» leva à entrada e ao Índice</span></div>')
for r,c,blob,t,n,k in cards:
    ol={'hub':'; outline: 3px solid #12966a; outline-offset: 3px','var':'; outline: 2px dashed #7d8f87; outline-offset: 3px'}.get(k,'')
    out.append(f'<div style="position: absolute; left: {L(c)}px; top: {ROW[r]}px; width: {CW}px; height: {CH}px; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px"><img src="/_blob/{BLOB[blob]}" alt="{t}" style="display: block; flex: none; width: 180px; height: 390px; object-fit: cover; object-position: top; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.12){ol}"><span style="font-size: 13px; line-height: 17px; color: #4a5a53"><b style="font-size: 15px; line-height: 20px; color: #1d2b25">{t}</b><br>{n}</span></div>')
body='\n'.join(out)
print(f'''<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>Fluxo de navegação</title>
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
<div style="position: relative; width: {W}px; height: {H}px; background: #f3f5f4; color: #1d2b25; font-family: Lato, 'Helvetica Neue', sans-serif">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{W},"height":{H}}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>''')
