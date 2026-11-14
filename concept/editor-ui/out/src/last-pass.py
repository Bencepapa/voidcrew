from pathlib import Path
S=Path(__file__).parent
for p in S.glob('*.html'):
 if p.name=='document.html':continue
 s=p.read_text(encoding='utf-8')
 if '1440' in p.name:s=s.replace('Prop crate1 #12 · Cell 8, 6</span>','Prop crate1 #12 · Cell 8, 6 · Hover 9, 6 / Floor</span>')
 if p.stem=='global-select-1440':s=s.replace('<body class="','<body class="sel-light ')
 p.write_text(s,encoding='utf-8')
