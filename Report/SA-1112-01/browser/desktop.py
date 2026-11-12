from pathlib import Path
from playwright.sync_api import sync_playwright
import json,time,traceback
out=Path(__file__).resolve().parent;meta=json.loads(Path('/tmp/sa-mobile-acceptance-runtime.json').read_text());base=f'http://127.0.0.1:{meta["port"]}'
errors=[];cases=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader']);context=browser.new_context(viewport={'width':1440,'height':900});page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    def click(id):
        page.wait_for_function('(id)=>sa.ui.getMobileActions().some(h=>h.id===id)',arg=id)
        pt=page.evaluate('(id)=>{const h=sa.ui.getMobileActions().find(h=>h.id===id),r=view.getBoundingClientRect();return {x:r.x+(h.x1+h.x2)/2*r.width/800,y:r.y+(h.y1+h.y2)/2*r.height/600}}',id)
        page.mouse.click(pt['x'],pt['y']);page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def wait(name):page.wait_for_function('(name)=>sa.screen.constructor.name===name',arg=name,timeout=30000)
    try:
        page.goto(base+'/');wait('LoginScreen');assert not page.locator('html.sa-mobile').count();page.wait_for_timeout(400)
        page.screenshot(path=str(out/'final-desktop-login.png'));page.locator('#mobile-mode-switch').evaluate('(e)=>e.style.visibility="hidden"');page.screenshot(path=str(out/'final-desktop-login-comparison.png'));page.locator('#mobile-mode-switch').evaluate('(e)=>e.style.visibility=""')
        click('register');inputs=page.locator('input:visible');account='desk'+str(int(time.time()))[-7:]
        for i,v in enumerate((account,'DesktopTest2026!','DesktopTest2026!','desktopsecret')):inputs.nth(i).fill(v)
        click('dlg-ok');wait('LineScreen');click('item0');click('item0');wait('CharSelectScreen');click('new0');click('chr0');click('menu0');wait('MakeEditScreen');page.locator('input:visible').fill('D'+str(int(time.time()))[-6:])
        for _ in range(10):click('a0+')
        click('ok');wait('HomeTownScreen');click('town0');wait('FieldScreen');page.wait_for_timeout(700)
        cases.append({'case':'desktop-original-mouse-register-create-enter','pass':True})
        for id,prop in (('tb-status','statusOpen'),('tb-item','items.open'),('tb-pet','petWnd.open'),('tb-map','mapOpen'),('tb-system','systemOpen')):
            click(id);assert page.evaluate('sa.screen.menus.'+prop);page.screenshot(path=str(out/('desktop-'+id+'.png')))
            if id=='tb-status':click('st-close')
            elif id=='tb-item':click('inv-close')
            elif id=='tb-pet':click('pet-close')
            elif id=='tb-map':click('map-close')
            elif id=='tb-system':click('sys-close')
            assert not page.evaluate('sa.screen.menus.'+prop)
        cases.append({'case':'desktop-original-canvas-five-menus','pass':True})
        page.keyboard.press('Enter');page.locator('input:visible').fill('桌面键盘聊天');page.keyboard.press('Enter');page.wait_for_timeout(250);assert not page.locator('input:visible').count();cases.append({'case':'desktop-enter-chat-and-submit','pass':True})
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(250);assert not page.locator('html.sa-mobile').count();r=page.locator('.stage').bounding_box();assert abs(r['width']/r['height']-4/3)<.001;cases.append({'case':'narrow-fine-pointer-stays-desktop','pass':True})
        assert not errors,errors
    except Exception as exc:
        cases.append({'case':'failure','pass':False,'error':str(exc)});page.screenshot(path=str(out/'desktop-failure.png'));raise
    finally:
        (out/'desktop.json').write_text(json.dumps({'cases':cases,'page_errors':errors},ensure_ascii=False,indent=2)+'\n');browser.close()
