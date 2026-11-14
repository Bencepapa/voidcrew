from pathlib import Path
S=Path(__file__).parent
for n in ['build-1440','build-1024']:
 p=S/(n+'.html');s=p.read_text(encoding='utf-8');start=s.index('<div class="panel inspector">');end=s.index('<div class="selection">',start)
 panel='<div class="panel inspector"><header>Map Settings <b>›</b></header><div class="group">Void Fantasy</div>'
 for k,v in [('Name','Dungeon'),('Size','16 × 16'),('Map','Dungeon ▾'),('Light density','1.00'),('Relief','1.00'),('Accent','Stone ▾')]:panel+='<div class="field"><label>'+k+'</label><span>'+v+'</span></div>'
 panel+='<div class="group">▸ Map Attributes</div><div class="group">▸ Lights</div><div class="group">▸ Texture Defaults</div><div class="group">▸ Variation & Mood</div><footer>New <span style="color:#c9a24a">Save as…</span></footer></div>'
 p.write_text(s[:start]+panel+s[end:],encoding='utf-8')
p=S/'toolbar-c.html';s=p.read_text(encoding='utf-8')
for n in ['Dig-Fill','Height','Paint']:
 start=s.index('<button title="'+n+'"');end=s.index('</button>',start)+9;s=s[:start]+s[end:]
p.write_text(s,encoding='utf-8')
