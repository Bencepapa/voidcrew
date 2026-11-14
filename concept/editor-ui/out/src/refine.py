from pathlib import Path
S=Path(__file__).parent
for name in ['mobile-landscape','mobile-portrait']:
 p=S/(name+'.html'); s=p.read_text(encoding='utf-8');start=s.index('<div class="panel inspector">');end=s.index('<div class="selection">',start)
 sheet='<div class="panel inspector mobile-sheet"><div class="grip"></div><header>Prop <small>Inspector</small><b>⌄</b></header><div class="identity"><i class="thumb" style="background-image:url(assets/crate1.png)"></i><div><strong>crate1</strong><small>Cell 8, 6 · #12</small></div></div><div class="field"><label>Rotation</label><span>90° · Rotate ↻</span></div><div class="field"><label>Height</label><span>− &nbsp; 0.00 &nbsp; +</span></div><div class="more">More settings · Scale, Texture, Logic ▸</div><div class="actions"><button>Duplicate</button><button>Delete</button><button>Done</button></div></div>'
 p.write_text(s[:start]+sheet+s[end:],encoding='utf-8')
# Native vector diagrams and fields keep labels legible in the PDF.
p=S/'document.html';s=p.read_text(encoding='utf-8')
for n in ['inspectors','icons','handles']:
 source=(S/(n+'.html')).read_text(encoding='utf-8'); body=source.split('<main class="board">')[1].split('</main>')[0]
 # Page heading already introduces it. Retain only its main diagram.
 if n=='inspectors':body='<div class="cards">'+body.split('<div class="cards">')[1]
 elif n=='icons':body='<div class="icon-grid">'+body.split('<div class="icon-grid">')[1].split('<p class="intro">')[0]
 else:body='<div class="handle-grid">'+body.split('<div class="handle-grid">')[1]
 s=s.replace('<img class="hero" src="../mockups/'+n+'.png">','<div class="diagram '+n+'">'+body+'</div>')
p.write_text(s,encoding='utf-8')
