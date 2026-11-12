"""Real Chromium/CDP interaction against the final isolated binary. No app/network mutation via evaluate."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,time,hashlib,traceback
out=Path(__file__).resolve().parent
meta=json.loads(Path('/tmp/sa-mobile-acceptance-runtime.json').read_text())
account=json.loads(Path('/tmp/sa-mobile-acceptance-account.json').read_text())
base=f'http://127.0.0.1:{meta["port"]}'
results=[];errors=[];sent=[];received=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    def socket(ws):
        def append(payload,target):
            try:target.append(json.loads(payload))
            except (ValueError,TypeError):pass
        ws.on('framesent',lambda x:append(x,sent));ws.on('framereceived',lambda x:append(x,received))
    page.on('websocket',socket)
    def check(name,details=None):
        results.append({'case':name,'pass':True,'details':details});print('PASS',name,json.dumps(details,ensure_ascii=False),flush=True)
    def snap(name):
        page.wait_for_timeout(180);page.screenshot(path=str(out/('final-'+name+'.png')))
    def action(id,delay=150):
        page.locator(f'[data-action="{id}"]').tap();page.wait_for_timeout(delay)
    def toolbar(label):
        page.locator('.mobile-shell-toolbar').get_by_role('button',name=label,exact=True).tap();page.wait_for_timeout(150)
    def back():toolbar('返回')
    def chat(text):
        toolbar('聊天');page.locator('input:visible').fill(text);page.get_by_role('button',name='发送聊天',exact=True).tap();page.wait_for_timeout(300)
    def pos():return page.evaluate('({x:sa.field.self.x,y:sa.field.self.y,floor:sa.field.floor,want:sa.field.wantDir,target:sa.field.target})')
    def count(t):return sum(m.get('t')==t for m in sent)
    def login(p):
        p.goto(base+'/');p.wait_for_function('globalThis.sa && sa.screen.constructor.name === "LoginScreen"',timeout=90000)
        p.get_by_label('账号',exact=True).fill(account['account']);p.get_by_label('密码',exact=True).fill(account['password'])
        p.locator('[data-action="ok"]').tap();p.wait_for_function('sa.screen.constructor.name === "LineScreen"')
        for _ in range(2):p.locator('[data-action="item0"]').tap();p.wait_for_timeout(150)
        p.locator('[data-action="login0"]').tap();p.wait_for_function('sa.screen.constructor.name === "FieldScreen" && sa.field.self',timeout=30000);p.wait_for_timeout(500)
    try:
        page.goto(base+'/');page.wait_for_function('globalThis.sa && sa.screen.constructor.name === "LoginScreen"',timeout=90000)
        rect=page.locator('.mobile-shell').bounding_box();assert rect['height']==844
        assert page.locator('html').get_attribute('class')=='sa-mobile'
        assert page.locator('input:visible').evaluate_all('(es)=>es.every(e=>parseFloat(getComputedStyle(e).fontSize)>=16 && e.getBoundingClientRect().bottom<=innerHeight)')
        snap('login');check('automatic-mobile-login-layout',rect)
        # Input identity and focus survive normal frame churn, IME composition, and viewport shrink.
        field=page.get_by_label('账号',exact=True);field.fill(account['account']);field.focus();field.dispatch_event('compositionstart');field.dispatch_event('compositionend',{'data':'中文'})
        field.evaluate('(e)=>e.dataset.acceptanceIdentity="original"');page.wait_for_timeout(250)
        assert field.evaluate('(e)=>document.activeElement===e && e.dataset.acceptanceIdentity==="original"')
        page.set_viewport_size({'width':390,'height':480});assert field.evaluate('(e)=>document.activeElement===e');page.set_viewport_size({'width':390,'height':844})
        check('native-input-focus-composition-and-viewport-resize')
        page.get_by_label('密码',exact=True).fill(account['password']);action('ok');page.wait_for_function('sa.screen.constructor.name === "LineScreen"');action('item0');action('item0');action('login0');page.wait_for_function('sa.screen.constructor.name === "FieldScreen" && sa.field.self');page.wait_for_timeout(700)
        check('real-login-lines-and-character-entry')
        for name in ('状态','道具','宠物','任务','地图','系统'):
            toolbar(name);assert page.locator('.mobile-shell').get_attribute('data-layout')=='full'
            assert page.locator('.mobile-shell-sheet').bounding_box()['height']>200
            if name=='系统':check('system-readable-actions',page.locator('.mobile-shell-actions button').all_text_contents())
            snap('menu-'+name);back();assert page.locator('.mobile-shell').get_attribute('data-layout')=='field'
        check('six-common-native-panels-open-and-close')
        chat('竖屏真实聊天验收');assert any(m.get('t')=='Chat' and m.get('text')=='竖屏真实聊天验收' for m in sent)
        check('real-chat-send');snap('chat')
        # Test-only GM permissions configured for this isolated fixture account; commands still enter through UI chat.
        chat('/warp 1000 47 82');chat('/noenc');chat('/gold 1234');chat('/item 1 1');chat('/pet 9 1');chat('/lv 30');chat('/stat 100 100 100 100');chat('/heal')
        check('isolated-server-approved-gm-fixtures-via-chat')
        toolbar('道具');items=page.locator('.mobile-shell-actions button').all_text_contents();assert any('贝诺美斯' in s for s in items),items
        slot=page.locator('.mobile-shell-actions button').filter(has_text='贝诺美斯').first
        slot_id=slot.get_attribute('data-action');action(slot_id,70);action(slot_id,100);page.wait_for_timeout(400)
        assert any(m.get('t') in ('ItemUse','ItemMove') for m in sent),[m.get('t') for m in sent]
        snap('inventory-item');back();check('inventory-real-name-and-native-use',{'slot_action':slot_id})
        toolbar('宠物');assert any('乌力' in s for s in page.locator('.mobile-shell-actions button').all_text_contents())
        snap('pet');back();check('server-pet-visible-in-readable-panel')
        # Real touch press/hold/release; verify actual position, then no continued movement.
        start=pos();button=page.get_by_role('button',name='向右移动',exact=True).bounding_box();cdp=context.new_cdp_session(page)
        pt={'x':button['x']+button['width']/2,'y':button['y']+button['height']/2,'id':1}
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[pt]});page.wait_for_timeout(550);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(500);end=pos();assert (start['x'],start['y'])!=(end['x'],end['y']),(start,end)
        assert end['want']==-1,end;page.wait_for_timeout(400);assert (end['x'],end['y'])==(pos()['x'],pos()['y'])
        check('touch-held-direction-moves-and-release-stops',{'before':start,'after':end})
        # Touch cancel must release. Use browser CDP cancellation, not application state edits.
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[pt]});page.wait_for_timeout(100);cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});page.wait_for_timeout(350);assert pos()['want']==-1
        check('touch-cancel-releases-direction')
        # Pinch+pan on the actual canvas; it must never become a Move message or map target.
        r=page.locator('#mobile-viewport').bounding_box();cx=r['width']/2;cy=r['height']/2
        before=count('Move');beforepos=pos();beforestyle=page.locator('.stage').get_attribute('style')
        points=[{'x':cx-45,'y':cy,'id':11},{'x':cx+45,'y':cy,'id':12}]
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':points})
        cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx-70,'y':cy+20,'id':11},{'x':cx+95,'y':cy+20,'id':12}]});page.wait_for_timeout(150)
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[{'x':cx+95,'y':cy+20,'id':12}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(400)
        assert count('Move')==before,(before,count('Move'));assert pos()['target'] is None;assert page.locator('.stage').get_attribute('style')!=beforestyle
        page.get_by_role('button',name='复位',exact=True).tap();check('pinch-pan-and-remaining-finger-never-move')
        snap('field-portrait')
        for width,height in ((320,740),(360,800),(430,932),(844,390),(768,1024),(390,844)):
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(200)
            for label in ('状态','系统'):
                box=page.locator('.mobile-shell-toolbar').get_by_role('button',name=label,exact=True).bounding_box();assert box and box['width']>=43 and box['height']>=43 and box['y']+box['height']<=height+1,(width,height,label,box)
            dims=page.evaluate('({vw:view.width,vh:view.height,ow:overlay.width,oh:overlay.height})');assert dims['vw']<=2048 and dims['vh']<=1536,dims
            if width==844:snap('field-landscape')
        check('five-viewport-rotation-matrix-and-pixel-budget')
        # Manual override restores the original input/canvas hierarchy, then auto detects mobile again.
        page.locator('#mobile-mode-switch summary').tap();page.locator('#mobile-mode-switch select').select_option('desktop');page.wait_for_timeout(250)
        assert page.locator('html').get_attribute('class')!='sa-mobile';assert page.locator('.stage').evaluate('(e)=>e.parentNode===document.body')
        page.locator('#mobile-mode-switch select').select_option('auto');page.wait_for_timeout(250);page.locator('#mobile-mode-switch summary').tap();assert page.locator('html').get_attribute('class')=='sa-mobile'
        check('manual-desktop-and-auto-restore')
        chat('/encount 9 1');page.wait_for_function('sa.battle && !sa.battle.quick',timeout=15000);page.locator('[data-action="b-guard"]').wait_for(timeout=20000);snap('battle-command')
        action('b-guard');page.wait_for_timeout(250)
        page.wait_for_function('sa.battle && sa.battle.turns >= 1 && sa.battle.queue.length === 0 && sa.battle.menuAt > 0',timeout=60000)
        assert any(m.get('t')=='BattleCommand' and m.get('kind')=='guard' for m in sent)
        check('battle-native-guard-command',{'battle_commands':sum(m.get('t')=='BattleCommand' for m in sent)})
        page.locator('[data-action="b-attack"]').wait_for(timeout=30000);action('b-attack');page.locator('[data-action^="t-"]').first.wait_for(timeout=10000);snap('battle-target');target=page.locator('[data-action^="t-"]').first.get_attribute('data-action');action(target)
        assert any(m.get('t')=='BattleCommand' and m.get('kind')=='attack' for m in sent)
        for turn in range(8):
            page.wait_for_function('!sa.battle || (sa.battle.turns >= '+str(turn+2)+' && sa.battle.queue.length === 0 && sa.battle.menuAt > 0)',timeout=60000)
            if page.evaluate('!sa.battle'):break
            action('b-attack');page.locator('[data-action^="t-"]').first.wait_for(timeout=5000);action(page.locator('[data-action^="t-"]').first.get_attribute('data-action'))
        page.wait_for_function('!sa.battle',timeout=45000);check('battle-native-attack-target-and-return',{'target':target})
        assert not errors,errors
        # Desktop canvas remains original 4:3; separate fine-pointer contexts also stay desktop when narrow.
        for width,height in ((1440,900),(390,844)):
            desktop=browser.new_context(viewport={'width':width,'height':height});dp=desktop.new_page();dp.on('pageerror',lambda e:errors.append(str(e)));dp.goto(base+'/');dp.wait_for_function('globalThis.sa && sa.screen.constructor.name==="LoginScreen"',timeout=90000);dp.wait_for_timeout(300)
            data=dp.evaluate('({mobile:document.documentElement.classList.contains("sa-mobile"),stage:document.querySelector(".stage").getBoundingClientRect().toJSON(),canvas:[view.width,view.height]})');assert not data['mobile'];assert abs(data['stage']['width']/data['stage']['height']-4/3)<.001
            if width==1440:dp.screenshot(path=str(out/'final-desktop-login.png'));dp.locator('#mobile-mode-switch').evaluate('(e)=>e.style.visibility="hidden"');dp.screenshot(path=str(out/'final-desktop-login-comparison.png'))
            check(f'desktop-original-contain-{width}x{height}',data);desktop.close()
        assert not errors,errors
    except Exception as exc:
        debug=page.evaluate('({screen:sa.screen.constructor.name,battle:sa.battle ? {menuAt:sa.battle.menuAt,queue:sa.battle.queue.length,end:sa.battle.end,turns:sa.battle.turns} : null,actions:sa.ui.getMobileActions()})')
        results.append({'case':'execution-failure','pass':False,'error':str(exc),'traceback':traceback.format_exc(),'debug':debug,'recent_sent':sent[-12:],'recent_received':received[-12:]});snap('failure');print(traceback.format_exc(),json.dumps(debug),flush=True);raise
    finally:
        filtered=[m for m in sent if m.get('t') not in ('Login','Register','ResetPassword')]
        report={'binary_sha256':meta.get('sha256'),'browser':browser.version,'engine':'Chromium headless with SwiftShader WebGL2','device':'390x844 touch, DPR3; viewport matrix; fine-pointer desktop contexts','physical_device':False,'cases':results,'page_errors':errors,'sent_message_types':{t:sum(m.get('t')==t for m in filtered) for t in sorted({m.get('t','') for m in filtered})},'received_message_types':sorted({m.get('t','') for m in received})}
        (out/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');browser.close()
