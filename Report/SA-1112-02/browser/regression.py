"""Real Chromium regression for input review. Uses isolated SA_RUNTIME JSON (port/account/password).
Default: /tmp/sa-release-review-runtime.json. Never logs credentials or changes game state via evaluate.
IME uses synthetic composition/keydown; this is not physical-device IME certification.
SA_REVIEW_OUT can select a separate evidence directory for a candidate/final run.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os

meta = json.loads(Path(os.environ.get('SA_RUNTIME', '/tmp/sa-release-review-runtime.json')).read_text())
base = f'http://127.0.0.1:{meta["port"]}'
out = Path(os.environ.get('SA_REVIEW_OUT', str(Path(__file__).resolve().parent)))
out.mkdir(parents=True, exist_ok=True)
results, errors, sent = [], [], []
with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    def socket(ws):
        def frame(data):
            try: sent.append(json.loads(data))
            except (ValueError, TypeError): pass
        ws.on('framesent', frame)
    page.on('websocket', socket)
    def settle(): page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def action(id): page.locator(f'[data-action="{id}"]').tap(); settle()
    def tool(label):
        page.locator('.mobile-shell-toolbar').get_by_role('button', name=label, exact=True).tap()
        page.wait_for_timeout(100)
    def state():
        return page.evaluate('({x:sa.field.self.x,y:sa.field.self.y,target:sa.field.target,want:sa.field.wantDir,layout:document.querySelector(".mobile-shell").dataset.layout})')
    def check(name, passed, **evidence):
        results.append({'case':name, 'pass':bool(passed), **evidence})
        print(('PASS' if passed else 'FAIL'), name, json.dumps(evidence, ensure_ascii=False), flush=True)
    try:
        page.goto(base)
        page.wait_for_function('globalThis.sa && sa.screen.constructor.name==="LoginScreen"', timeout=90000)
        username = page.get_by_label('账号', exact=True)
        username.fill(meta['account']); username.focus(); page.keyboard.press('Enter')
        check('native-login-enter-keeps-original-password-focus', page.get_by_label('密码',exact=True).evaluate('(e)=>document.activeElement===e'))
        page.get_by_label('密码',exact=True).fill('DefinitelyIncorrectReviewPassword!'); page.keyboard.press('Enter')
        page.wait_for_function('sa.ui.getMobileActions().some(h=>h.id==="modal-ok")')
        page.locator('[data-action="modal-ok"]').press('Escape'); page.wait_for_timeout(250)
        check('login-modal-escape-dismisses-and-restores-inputs',not page.evaluate('sa.ui.getMobileActions().some(h=>h.id.startsWith("modal-"))') and page.locator('input:visible').count()==2)
        page.get_by_label('密码',exact=True).fill(meta['password']); page.keyboard.press('Enter')
        page.wait_for_function('sa.screen.constructor.name==="LineScreen"')
        action('item0'); action('item0'); page.wait_for_function('sa.screen.constructor.name==="CharSelectScreen"')
        action('login0'); page.wait_for_function('sa.screen.constructor.name==="FieldScreen" && sa.field.self', timeout=30000)
        page.wait_for_timeout(500)
        # Read map and projected coordinates; the tap goes through the actual touch path.
        candidate = page.evaluate('()=>{const f=sa.field,s=f.self,r=view.getBoundingClientRect(),v=document.querySelector("#mobile-viewport").getBoundingClientRect();for(let dx=-9;dx<=9;dx++)for(let dy=-9;dy<=9;dy++){if(Math.max(Math.abs(dx),Math.abs(dy))<7)continue;let gx=s.x+dx,gy=s.y+dy;if(!f.canEnter(gx,gy))continue;let route=f.findPath(s.x,s.y,gx,gy);if(route.length<7)continue;let [x,y]=f.gridToScreen(gx,gy,performance.now(),400,324);let sx=r.x+x*r.width/800,sy=r.y+y*r.height/600;if(sx>v.left+20&&sx<v.right-20&&sy>v.top+40&&sy<v.bottom-20)return {gx,gy,sx,sy,route:route.length}}return null}')
        assert candidate, 'No visible seven-step fixture path; use an open floor fixture'
        page.touchscreen.tap(candidate['sx'],candidate['sy']); page.wait_for_timeout(120)
        before = state(); tool('状态'); opened = state(); index=len(sent)
        page.wait_for_timeout(900); after=state(); moves=[m for m in sent[index:] if m.get('t')=='Move']
        check('mobile-panel-cancels-existing-route', before['target'] is not None and opened['target'] is None and after['want']==-1 and not moves, before=before, opened=opened, after=after, moves_after_panel=moves)
        page.screenshot(path=str(out/'route-panel.png')); tool('返回')
        # Actual CDP touch hold/release on D-pad.
        rect=page.get_by_role('button',name='向下移动',exact=True).bounding_box()
        cdp=context.new_cdp_session(page);point={'x':rect['x']+rect['width']/2,'y':rect['y']+rect['height']/2,'id':1}
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point]});page.wait_for_timeout(280)
        held=state();cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(400)
        released=state();page.wait_for_timeout(350);stopped=state()
        check('dpad-real-touch-release', held['want']==0 and released['want']==-1 and stopped['want']==-1 and (released['x'],released['y'])==(stopped['x'],stopped['y']),held=held,released=released,stopped=stopped)
        tool('聊天'); box=page.locator('input:visible');box.fill('组合确认不应提交')
        ime=[]
        for kind,events in [('isComposing',[('keydown',{'key':'Enter','code':'Enter','isComposing':True})]),('keyCode229',[('keydown',{'key':'Enter','keyCode':229})]),('composition-tracked',[('compositionstart',{'data':'zuhe'}),('keydown',{'key':'Enter','code':'Enter','isComposing':False,'keyCode':13})])]:
            start=len(sent)
            for event,payload in events:box.dispatch_event(event,payload)
            page.wait_for_timeout(100)
            ime.append({'kind':kind,'visible':page.locator('input:visible').count(),'sent':[m for m in sent[start:] if m.get('t')=='Chat']})
        box.dispatch_event('compositionend',{'data':'组合确认不应提交'})
        check('ime-enter-never-submits',all(i['visible']==1 and not i['sent'] for i in ime),events=ime)
        start=len(sent);box.press('Enter');page.wait_for_timeout(200);normal=[m for m in sent[start:] if m.get('t')=='Chat']
        check('normal-chat-enter-submits-once',len(normal)==1 and not page.locator('input:visible').count(),messages=normal)
        tool('系统');action('sys-home');page.wait_for_function('sa.ui.getMobileActions().some(h=>h.id==="sys-yes")')
        start=len(sent);page.locator('[data-action="sys-no"]').press('Escape');page.wait_for_timeout(250)
        check('native-confirm-escape-cancels-without-return-home',not page.evaluate('sa.ui.getMobileActions().some(h=>h.id==="sys-yes")') and not any(m.get('t')=='ReturnHome' for m in sent[start:]))
        if page.locator('.mobile-shell').get_attribute('data-layout')!='field':tool('返回')
        tool('系统');action('sys-ai');action('ai-enc-val');page.wait_for_timeout(100)
        index=len(sent);enc_open=state();page.wait_for_timeout(700);enc_after=state();enc_moves=[m for m in sent[index:] if m.get('t')=='Move']
        check('auto-encounter-pauses-under-mobile-sheet',enc_open['layout']=='full' and enc_after['target'] is None and not enc_moves,opened=enc_open,after=enc_after,moves_after_enable=enc_moves)
        action('ai-enc-val');tool('返回')
        page.locator('#mobile-mode-switch summary').tap();page.locator('#mobile-mode-switch select').select_option('desktop');page.locator('#mobile-mode-switch summary').click()
        page.locator('#view').click(position={'x':5,'y':5});page.wait_for_timeout(250)
        page.keyboard.down('ArrowRight');page.wait_for_timeout(100);page.locator('#mobile-mode-switch summary').click();page.keyboard.up('ArrowRight')
        page.wait_for_timeout(200);first=state();page.wait_for_timeout(650);second=state()
        check('desktop-keyup-inside-mode-releases-direction',first['want']==-1 and second['want']==-1,after_keyup=first,after_wait=second)
        page.screenshot(path=str(out/'desktop-keyup.png'))
        check('no-browser-page-errors',not errors,errors=errors)
    except Exception as exc:
        results.append({'case':'harness-or-runtime-failure','pass':False,'error':str(exc)})
        page.screenshot(path=str(out/'failure.png'));raise
    finally:
        (out/'regression.json').write_text(json.dumps({'runtime_kind':os.environ.get('SA_RUNTIME_KIND','external-client-candidate'),'results':results,'page_errors':errors,'ime_scope':'Synthetic composition and keyboard events; not physical-device IME'},ensure_ascii=False,indent=2)+'\n')
        browser.close()
assert all(r['pass'] for r in results), 'Input regression assertion failed; inspect JSON'
