from pathlib import Path
from playwright.sync_api import sync_playwright
import json, sys
S=Path(__file__).parent.resolve(); O=S.parent
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,args=['--allow-file-access-from-files','--hide-scrollbars','--disable-gpu'])
 page=browser.new_page(viewport={'width':1440,'height':860},device_scale_factor=1)
 report=[]
 for src in ([] if '--pdf-only' in sys.argv else S.glob('*.html')):
  if src.stem=='document':continue
  w,h=(1024,768) if '1024' in src.stem else (900,600) if src.stem=='mobile-landscape' else (390,844) if src.stem=='mobile-portrait' else (1440,860)
  page.set_viewport_size({'width':w,'height':h});page.goto(src.as_uri());page.wait_for_load_state('networkidle')
  page.screenshot(path=str(O/'mockups'/(src.stem+'.png')))
  errors=page.evaluate('''() => Array.from(document.images).filter(i=>!i.complete || !i.naturalWidth).map(i=>i.src)''')
  report.append({'file':src.stem,'width':w,'height':h,'broken_images':errors})
 page.set_viewport_size({'width':1123,'height':794});page.goto((S/'document.html').as_uri());page.wait_for_load_state('networkidle');page.emulate_media(media='print')
 page.pdf(path=str(O/'editor-ui-design.pdf'),format='A4',landscape=True,print_background=True,prefer_css_page_size=True,display_header_footer=False)
 # Page previews come from the same HTML and print styles, independently inspectable.
 (O/'qa').mkdir(exist_ok=True)
 for i,el in enumerate(page.locator('.page').all()):el.screenshot(path=str(O/'qa'/f'page-{i+1:02}.png'))
 report.append({'document_pages':page.locator('.page').count(),'overflow':page.evaluate('''() => [...document.querySelectorAll('.page')].map((p,i)=>({page:i+1,bottom:Math.max(...[...p.children].filter(e=>!e.classList.contains('pagefoot')).map(e=>e.getBoundingClientRect().bottom-p.getBoundingClientRect().top)),footer:p.querySelector('.pagefoot').getBoundingClientRect().top-p.getBoundingClientRect().top}))''')})
 (O/'qa'/'render-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 browser.close()
 print('Rendered mockups, PDF and QA previews')
