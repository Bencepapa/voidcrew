from pathlib import Path
from PIL import Image
import zipfile,json,html
O=Path('out').resolve(); fs=sorted((O/'mockups').glob('*.png'))
rows=[]
for f in fs:
 w,h=Image.open(f).size;rows.append({'path':str(f),'size':f'{w}x{h}'})
(O/'mockups'/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
(O/'index.html').write_text('<!doctype html><html lang="hu"><meta charset="utf-8"><title>voidcrew editor UI</title><style>body{font:16px Segoe UI;background:#12161b;color:#eee;margin:40px}a{color:#e5b85b}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}img{width:100%;height:220px;object-fit:contain;background:#080c11;border-radius:8px}small{color:#aaa}</style><h1>voidcrew / Editor UI</h1><p>12 oldalas magyar terv, eredeti assetekkel; minden új funkció TERV jelölést kapott.</p><p><a href="editor-ui-design.pdf">PDF</a> · <a href="editor-ui-package.zip">Teljes csomag</a> · <a href="src/README.md">Források / újrarenderelés</a></p><div class="grid">'+''.join('<article><a href="mockups/'+f.name+'"><img src="mockups/'+f.name+'"><p>'+f.name+'</p></a><small>'+str(Image.open(f).size)+'</small></article>' for f in fs)+'</div></html>',encoding='utf-8')
probe=O/'src'/'probe.txt'
if probe.exists():probe.unlink()
with zipfile.ZipFile(O/'editor-ui-package.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in [O/'editor-ui-design.pdf',O/'index.html']+list((O/'mockups').glob('*'))+list((O/'src').rglob('*')):
  if p.is_file() and '__pycache__' not in str(p):z.write(p,p.relative_to(O))
print('PDF:',O/'editor-ui-design.pdf');print('PNG count:',len(fs));print('Package MB:',round((O/'editor-ui-package.zip').stat().st_size/1024**2,1))
