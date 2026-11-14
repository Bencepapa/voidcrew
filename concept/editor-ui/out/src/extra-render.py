from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image,ImageOps,ImageDraw
S=Path('out/src').resolve(); O=S.parent
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,args=['--allow-file-access-from-files','--hide-scrollbars'])
 page=b.new_page(viewport={'width':1440,'height':860})
 for n in ['mobile-layouts-1440','status-1440']:
  page.goto((S/(n+'.html')).as_uri());page.wait_for_load_state('networkidle');page.screenshot(path=str(O/'mockups'/(n+'.png')))
 page.goto((S/'document.html').as_uri());page.emulate_media(media='print')
 print('Diagram overflow:',page.evaluate('''()=>[...document.querySelectorAll('.diagram')].map(e=>({type:e.className,overflow:e.scrollHeight-e.clientHeight}))'''))
 print('Broken PDF images:',page.evaluate('''()=>[...document.images].filter(e=>!e.naturalWidth).length'''))
 b.close()
fs=list((O/'qa').glob('pdf-page-*.png'));sheet=Image.new('RGB',(1500,4*380),'#adb2b8');d=ImageDraw.Draw(sheet)
for i,f in enumerate(fs):
 sheet.paste(ImageOps.contain(Image.open(f),(490,350)),((i%3)*500,(i//3)*380+24));d.text(((i%3)*500+6,(i//3)*380+5),f.stem,fill='black')
sheet.save(O/'qa'/'pdf-contact.png')
fs=list((O/'mockups').glob('*.png'));sheet=Image.new('RGB',(1500,((len(fs)+3)//4)*260),'#adb2b8');d=ImageDraw.Draw(sheet)
for i,f in enumerate(fs):
 sheet.paste(ImageOps.contain(Image.open(f),(368,225)),((i%4)*375,(i//4)*260+25));d.text(((i%4)*375+4,(i//4)*260+6),f.stem,fill='black')
sheet.save(O/'qa'/'mockup-contact.png')
