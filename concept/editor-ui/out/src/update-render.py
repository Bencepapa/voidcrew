from pathlib import Path
p=Path('out/src/render.py');s=p.read_text(encoding='utf-8-sig').replace('import json','import json, sys').replace("for src in S.glob('*.html'):","for src in ([] if '--pdf-only' in sys.argv else S.glob('*.html')):");p.write_text(s,encoding='utf-8')
p=Path('out/src/README.md');s=p.read_text(encoding='utf-8-sig').replace('python out/src/render.py','python out/src/extras.py\npython out/src/render.py');p.write_text(s,encoding='utf-8')
