"""Marca nos quadros de opções qual foi a escolhida e se já está implementada.
Uso: python3 tools/screens/opcoes-estado.py  (edita design/artefactos/mapa/project/Opcoes*.dc.html; idempotente)
Para mudar o estado, editar ESTADO abaixo e voltar a correr."""
import re, pathlib
P = pathlib.Path(__file__).resolve().parents[2] / 'design/artefactos/mapa/project'
VERDE = '#0b6b4b'
# quadro: (texto da faixa, [(estado, rótulo) por coluna, pela ordem]); estado: 'sim' | 'parcial' | 'nao'
ESTADO = {
  'Opcoes.dc.html': (
    'Decidido: <b>maiúsculas mantidas</b> (opção 2 não escolhida) e <b>verde mais escuro, opção 3A</b>. '
    '<b>Implementado na v149.</b>',
    [('parcial', 'Maiúsculas mantidas · cor substituída por 3A'), ('nao', 'Não escolhida'),
     ('sim', '✓ Escolhida · implementada na v149'), ('nao', 'Não escolhida')]),
  'OpcoesRodape.dc.html': (
    'Decidido a 11 out 2026: <b>Atual</b> — uma linha, larguras iguais; se não couberem, <b>A — coluna à direita</b>. '
    'Botão principal sempre à esquerda ou em cima: Guardar | Cancelar | Apagar (a implementar).',
    [('sim', '✓ Escolhida · ordem a mudar: Guardar à esquerda'), ('nao', 'Não escolhida'),
     ('parcial', 'Escolhida como recurso · a implementar'), ('nao', 'Não escolhida')]),
  'OpcoesSeccoes.dc.html': (
    'Decidido a 10 out 2026: <b>B — título em Marcellus</b>, igual na página inicial, nas folhas e no menu. '
    '<b>Implementado na v154.</b>',
    [('nao', 'Não escolhida'), ('nao', 'Não escolhida'),
     ('sim', '✓ Escolhida · implementada na v154'), ('nao', 'Não escolhida')]),
}
EXTRA = 112  # altura da faixa + espaço

def pill(estado, rot):
  if estado == 'sim':
    st = f'background: {VERDE}; color: #fff; border: 1px solid {VERDE}'
  elif estado == 'parcial':
    st = f'background: #fff; color: {VERDE}; border: 1px solid {VERDE}'
  else:
    st = 'background: #e4e9e7; color: #5b6b64; border: 1px solid #e4e9e7'
  return (f'<p data-estado style="margin: 0; display: inline-flex; align-self: flex-start; padding: 4px 12px; '
          f'border-radius: 999px; {st}; font-size: 13px; font-weight: 700">{rot}</p>')

for nome, (faixa, cols) in ESTADO.items():
  f = P / nome
  h = f.read_text()
  # limpar marcações anteriores (idempotente)
  h = re.sub(r'<div data-faixa.*?</div>\n', '', h, flags=re.S)
  h = re.sub(r'<p data-estado[^>]*>.*?</p>', '', h)
  h = re.sub(r' data-col="[a-z]+"', '', h)
  h = re.sub(r'; (outline|opacity)[^;"]*(; outline-offset: 8px)?', '', h)
  # faixa de decisão depois do bloco do título
  banner = (f'<div data-faixa style="display: flex; align-items: center; gap: 16px; padding: 18px 24px; border-radius: 14px; '
            f'background: {VERDE}; color: #fff; max-width: 1704px"><span style="flex: none; padding: 4px 12px; border-radius: 999px; '
            f'background: #fff; color: {VERDE}; font-size: 13px; font-weight: 700; letter-spacing: 1.2px">DECIDIDO</span>'
            f'<p style="margin: 0; font-size: 17px; line-height: 25px">{faixa}</p></div>\n')
  i = h.index('</h1>'); i = h.index('</div>\n', i) + len('</div>\n')
  h = h[:i] + banner + h[i:]
  # pílula por coluna, depois do título de cada coluna (o 1.º <p> 18px de cada coluna)
  k = 0
  def add(m):
    global k
    e, r = cols[k]; k += 1
    return m.group(0) + pill(e, r)
  h = re.sub(r'<p style="margin: 0; font-size: 18px; font-weight: 700[^"]*">[^<]*</p>', add, h)
  assert k == 4, (nome, k)
  # imagens: contorno na escolhida, esbatidas nas outras; colunas = posição dentro de cada fila de 4 (ou 2 por coluna)
  imgs = list(re.finditer(r'<img [^>]*>', h))
  n = len(imgs)
  def col(j):
    return (j // 2) if nome == 'Opcoes.dc.html' else (j % 4)
  out, last = [], 0
  for j, m in enumerate(imgs):
    e = cols[col(j)][0]
    tag = m.group(0)
    extra = (f'; outline: 4px solid {VERDE}; outline-offset: 8px' if e == 'sim' else f'; outline: 2px dashed {VERDE}; outline-offset: 8px' if e == 'parcial' else '; opacity: 0.5')
    tag = tag.replace('rgba(0,0,0,0.12)"', 'rgba(0,0,0,0.12)' + extra + '"')
    out.append(h[last:m.start()]); out.append(tag); last = m.end()
  out.append(h[last:]); h = ''.join(out)
  # altura do quadro
  base = {'Opcoes.dc.html': 2180, 'OpcoesSeccoes.dc.html': 3112, 'OpcoesRodape.dc.html': 1155}[nome]
  # imagens empilhadas na mesma coluna: espaço para o contorno não se tocar
  h = h.replace('gap: 14px; width: 390px', 'gap: 24px; width: 390px')
  h = re.sub(r'(width: 1832px; height: )\d+px', rf'\g<1>{base + EXTRA}px', h)
  h = re.sub(r'("height":)\d+', rf'\g<1>{base + EXTRA}', h)
  f.write_text(h)
  print(nome, base + EXTRA, n, 'imagens')
