"""Real Chromium layout/gesture/gameplay acceptance; reads state, uses actual UI/CDP input."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os,hashlib
out=Path(os.environ.get('SA_LAYOUT_OUT',str(Path(__file__).resolve().parent)));out.mkdir(exist_ok=True,parents=True)
meta=json.loads(Path('/tmp/sa-layout-runtime.json').read_text());account=json.loads(Path('/tmp/sa-layout-account.json').read_text());base=f'http://127.0.0.1:{meta["port"]}'
results=[];errors=[];sent=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    def socket(ws):
        def frame(x):
            try:sent.append(json.loads(x))
            except (ValueError,TypeError):pass
        ws.on('framesent',frame)
    page.on('websocket',socket);cdp=context.new_cdp_session(page)
    def settle():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def tap_action(id):page.locator(f'[data-action="{id}"]').tap();settle()
    def tool(name):page.locator('.mobile-shell-toolbar').get_by_role('button',name=name,exact=True).tap();settle()
    def rect(selector):return page.locator(selector).first.bounding_box()
    def check(name,**evidence):results.append({'case':name,'pass':True,**evidence});print('PASS',name,json.dumps(evidence,ensure_ascii=False),flush=True)
    def snap(name):page.screenshot(path=str(out/(name+'.png')))
    def touch(kind,points):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
    def geometry(width,height):
        page.set_viewport_size({'width':width,'height':height});settle();page.wait_for_timeout(100)
        game=rect('#mobile-viewport');stage=rect('.stage');assert abs(game['width']/game['height']-4/3)<.01
        if width<height:assert abs(game['width']-width)<1 and abs(game['x'])<1
        else:
            assert abs(game['x']+game['width']/2-width/2)<1
            assert abs(game['y']+game['height']/2-height/2)<1
            if width-height*4/3>=144:assert abs(game['height']-height)<1
            for selector in ('.mobile-shell-left','.mobile-shell-right'):
                rail=rect(selector);assert rail['x']+rail['width']<=game['x']+1 or rail['x']>=game['x']+game['width']-1,(game,rail)
        return game
    try:
        page.goto(base);page.wait_for_function('globalThis.sa && sa.screen.constructor.name==="LoginScreen"',timeout=90000)
        for w,h in ((320,740),(390,844),(430,932),(844,390),(667,375),(568,320),(932,430)):
            game=geometry(w,h)
        check('seven-viewport-fit-and-independent-rails')
        geometry(390,844);snap('portrait-login')
        # Native login illustration is framed without its empty 80/60 border.
        game=rect('#mobile-viewport');stage=rect('.stage');assert abs(stage['width']*.8-game['width'])<1
        check('login-artwork-fills-width-without-thumbnail')
        # Real tap on original Register hit, even with all screen-space controls present.
        hit=page.evaluate('sa.ui.getMobileActions().find(h=>h.id==="register")');r=rect('#view')
        page.touchscreen.tap(r['x']+(hit['x1']+hit['x2'])/2*r['width']/800,r['y']+(hit['y1']+hit['y2'])/2*r['height']/600);settle()
        assert page.locator('input:visible').count()==4;tap_action('dlg-cancel');check('direct-native-game-tap-register-and-cancel')
        # Pinch the actual game and prove control geometry is independent.
        before=rect('[data-mobile-control="mouse-left"]');old=rect('.stage');game=rect('#mobile-viewport');cx=game['x']+game['width']/2;cy=game['y']+game['height']/2
        touch('touchStart',[{'x':cx-35,'y':cy,'id':1},{'x':cx+35,'y':cy,'id':2}]);touch('touchMove',[{'x':cx-65,'y':cy+10,'id':1},{'x':cx+65,'y':cy+10,'id':2}]);settle();touch('touchEnd',[]);settle()
        after=rect('[data-mobile-control="mouse-left"]');zoomed=rect('.stage');assert zoomed['width']>old['width']*1.5 and all(abs(after[k]-before[k])<1 for k in ('x','y','width','height'))
        page.get_by_role('button',name='复位',exact=True).tap();settle();check('portrait-pinch-magnifies-only-game')
        geometry(844,390);snap('landscape-login')
        before=rect('[data-mobile-control="mouse-left"]');old=rect('.stage');game=rect('#mobile-viewport');cx=game['x']+game['width']/2;cy=game['y']+game['height']/2
        touch('touchStart',[{'x':cx-40,'y':cy,'id':5},{'x':cx+40,'y':cy,'id':6}]);touch('touchMove',[{'x':cx-75,'y':cy,'id':5},{'x':cx+75,'y':cy,'id':6}]);settle();touch('touchEnd',[]);settle();after=rect('[data-mobile-control="mouse-left"]');assert rect('.stage')['width']>old['width']*1.5 and all(abs(after[k]-before[k])<1 for k in ('x','y','width','height'));page.get_by_role('button',name='复位',exact=True).tap();settle();check('landscape-pinch-keeps-rails-fixed')
        # Arrow selection highlights native UI without activating it, left key executes it.
        for _ in range(3):page.get_by_role('button',name='下一个选项',exact=True).tap();settle()
        assert page.evaluate('sa.ui.hot')=='ok';assert page.evaluate('sa.screen.constructor.name')=='LoginScreen'
        assert '进入游戏' in page.locator('.mobile-shell-selected').inner_text();check('option-navigation-native-hover-and-human-label')
        page.get_by_label('账号',exact=True).fill(account['account']);page.get_by_label('密码',exact=True).fill(account['password']);page.get_by_role('button',name='鼠标左键',exact=True).tap();page.wait_for_function('sa.screen.constructor.name==="LineScreen"')
        tap_action('item0');tap_action('item0');tap_action('login0');page.wait_for_function('sa.screen.constructor.name==="FieldScreen" && sa.field.self',timeout=30000);page.wait_for_timeout(300)
        check('rail-left-mouse-native-login')
        # Both orientations expose the same eight keyboard directions, real pointer capture/release.
        for w,h,name in ((390,844,'portrait'),(844,390,'landscape')):
            geometry(w,h);stick=page.locator('[data-mobile-control="joystick"]');assert stick.is_visible();stick.scroll_into_view_if_needed();r=stick.bounding_box();cx=r['x']+r['width']/2;cy=r['y']+r['height']/2
            for dir,dx,dy in ((6,1,0),(7,1,1),(0,0,1),(1,-1,1),(2,-1,0),(3,-1,-1),(4,0,-1),(5,1,-1)):
                touch('touchStart',[{'x':cx,'y':cy,'id':11}]);touch('touchMove',[{'x':cx+dx*30,'y':cy+dy*30,'id':11}]);settle();assert page.evaluate('sa.field.wantDir')==dir,(name,dir,page.evaluate('sa.field.wantDir'));touch('touchEnd',[]);settle();assert page.evaluate('sa.field.wantDir')==-1
            snap(name+'-field');check(name+'-joystick-eight-directions-and-release')
        # Center long press edits the joystick without movement; outer holds stay directional.
        stick=page.locator('[data-mobile-control="joystick"]');r=stick.bounding_box();cx=r['x']+r['width']/2;cy=r['y']+r['height']/2;index=len(sent)
        touch('touchStart',[{'x':cx,'y':cy,'id':19}]);page.wait_for_timeout(700);touch('touchMove',[{'x':cx+150,'y':cy-30,'id':19}]);touch('touchEnd',[]);settle()
        assert stick.evaluate('(e)=>e.parentElement.classList.contains("mobile-floating-controls")');assert not any(m.get('t')=='Move' for m in sent[index:]);assert stick.evaluate('(e)=>e.contains(document.elementFromPoint(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2,e.getBoundingClientRect().y+e.getBoundingClientRect().height/2))')
        page.get_by_role('button',name='重置按钮位置',exact=True).tap();settle();check('neutral-joystick-longpress-repositions-without-movement')
        # A second finger aborts a pending position edit.
        r=rect('[data-mobile-control="mouse-left"]');p={'x':r['x']+r['width']/2,'y':r['y']+r['height']/2,'id':41}
        touch('touchStart',[p]);page.wait_for_timeout(250);touch('touchStart',[p,{'x':400,'y':170,'id':42}]);page.wait_for_timeout(500);touch('touchEnd',[]);settle();assert not page.locator('.is-positioning').count();assert not page.locator('[data-mobile-control="mouse-left"]').evaluate('(e)=>e.parentElement.classList.contains("mobile-floating-controls")');check('multitouch-aborts-pending-position-edit')
        # Original map tap continues to work alongside the joystick.
        candidate=page.evaluate('()=>{const f=sa.field,s=f.self,r=view.getBoundingClientRect();for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){if(Math.max(Math.abs(dx),Math.abs(dy))<2)continue;const x=s.x+dx,y=s.y+dy;if(!f.canEnter(x,y)||!f.findPath(s.x,s.y,x,y).length)continue;const [sx,sy]=f.gridToScreen(x,y,performance.now(),400,324);return {x:r.x+sx*r.width/800,y:r.y+sy*r.height/600,gx:x,gy:y}}return null}')
        assert candidate;index=len(sent);page.touchscreen.tap(candidate['x'],candidate['y']);page.wait_for_timeout(300);assert any(m.get('t')=='Move' for m in sent[index:]);tool('状态');check('direct-scene-tap-moves-with-joystick-present')
        assert page.locator('section.mobile-shell').get_attribute('data-layout')=='full';game=rect('#mobile-viewport');assert game['height']==390;snap('landscape-native-panel');page.locator('.mobile-shell-back').tap();settle()
        for w,h in ((568,320),(667,375),(932,430),(844,390)):
            geometry(w,h)
            for selector in ('[data-mobile-control="joystick"]','[data-mobile-control="mouse-left"]','[data-mobile-control="mouse-right"]'):
                box=rect(selector);assert box['y']>=-1 and box['y']+box['height']<=h+1,(w,h,selector,box)
            snap(f'field-{w}x{h}')
        check('small-landscape-core-controls-visible-without-covering-game')
        # Right mouse uses actual game cursor and must reach native field Turn/PickUp path.
        index=len(sent);page.get_by_role('button',name='鼠标右键',exact=True).tap();page.wait_for_timeout(150);assert any(m.get('t') in ('Turn','PickUp') for m in sent[index:]),sent[index:];check('right-mouse-reuses-real-scene-cursor')
        # Drag a button into the game: it remains visible, hit-testable, and does not click through.
        button=page.locator('[data-mobile-control="mouse-left"]');r=button.bounding_box();start={'x':r['x']+r['width']/2,'y':r['y']+r['height']/2,'id':21};index=len(sent)
        touch('touchStart',[start]);page.wait_for_timeout(720);touch('touchMove',[{'x':450,'y':210,'id':21}]);touch('touchEnd',[]);settle()
        moved=button.bounding_box();assert abs(moved['x']+moved['width']/2-450)<2
        assert button.evaluate('(e)=>e.contains(document.elementFromPoint(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2,e.getBoundingClientRect().y+e.getBoundingClientRect().height/2))')
        assert page.get_by_role('button',name='重置按钮位置',exact=True).is_visible();assert not any(m.get('t') in ('Move','ItemUse','BattleCommand') for m in sent[index:]);snap('landscape-control-drag');check('longpress-drag-button-escapes-rail-and-never-clicks-through')
        saved=page.evaluate('localStorage.getItem("sa-control-positions-v1")');assert 'landscape:mouse-left' in saved
        page.reload();page.wait_for_function('globalThis.sa && sa.screen.constructor.name==="LoginScreen"',timeout=90000);settle();button=page.locator('[data-mobile-control="mouse-left"]');assert button.evaluate('(e)=>e.parentElement.classList.contains("mobile-floating-controls")');check('custom-position-persists-across-page-reload')
        # Reset is made discoverable whenever custom positions are loaded.
        reset=page.get_by_role('button',name='重置按钮位置',exact=True)
        if not reset.is_visible():
            r=button.bounding_box();touch('touchStart',[{'x':r['x']+r['width']/2,'y':r['y']+r['height']/2,'id':31}]);page.wait_for_timeout(700);touch('touchEnd',[])
        reset.tap();settle();assert not button.evaluate('(e)=>e.parentElement.classList.contains("mobile-floating-controls")');assert json.loads(page.evaluate('localStorage.getItem("sa-control-positions-v1")'))=={};check('reset-restores-default-control-positions')
        # Desktop original stage containment survives the mobile presentation changes.
        page.locator('#mobile-mode-switch summary').tap();page.locator('#mobile-mode-switch select').select_option('desktop');settle();assert page.locator('.stage').evaluate('(e)=>e.parentElement===document.body');assert not page.locator('.mobile-shell').first.is_visible();check('desktop-stage-and-input-path-restored')
        assert not errors,errors
    except Exception as exc:
        results.append({'case':'failure','pass':False,'error':str(exc)});snap('failure');raise
    finally:
        (out/'layout.json').write_text(json.dumps({'binary_sha256':meta['sha256'],'client_mode':meta['client_mode'],'cases':results,'page_errors':errors},ensure_ascii=False,indent=2)+'\n');browser.close()
