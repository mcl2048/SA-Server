"""Real browser acceptance for the upgrade, using normal UI and isolated SQLite reads.
Credentials/tokens stay in /tmp/sa-upgrade-*/. Debug state is read-only.
Run --seed against the non-GM fixture; restart it with --gm, then run --run.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse, hashlib, json, os, sqlite3, sys, time, traceback

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
META=Path(os.environ.get('SA_UPGRADE_META','/tmp/sa-upgrade-runtime.json'))
parser=argparse.ArgumentParser();parser.add_argument('--seed',action='store_true');parser.add_argument('--run',action='store_true');parser.add_argument('--skip-limits',action='store_true',help='Reuse already validated cap/pet fixtures on the same binary');parser.add_argument('--skip-baseline',action='store_true');parser.add_argument('--phase',choices=['all','layout','gameplay','offline','toggle','dom-probe'],default='all');args=parser.parse_args()
meta=json.loads(META.read_text());runtime=Path(meta['dir']).resolve();assert runtime.parent==Path('/tmp') and runtime.name.startswith('sa-upgrade-')
credentials=json.loads(Path(meta['credentials']).read_text());base=f'http://127.0.0.1:{meta["port"]}'
RESULTS=[];ERRORS=[];CONSOLE=[]
CHROMIUM=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']
SCHEMA=json.loads((ROOT/'proto/messages.json').read_text())
def fill_fields(value,fields):
    # Match the real client's generated fillDefaults for Go omitempty wire fields.
    for key,kind in fields:
        kind=kind.rstrip('?')
        if key not in value:value[key]=[] if kind.endswith('[]') else 0 if kind=='int' else False if kind=='bool' else ''
        if kind.endswith('[]') and kind[:-2] in SCHEMA['types']:
            for child in value[key]:fill_fields(child,SCHEMA['types'][kind[:-2]])
    return value

def private_write(path,value):
    path=path.resolve();assert runtime in path.parents;path.write_text(json.dumps(value));path.chmod(0o600)

def failure_evidence(contexts):
    if not sys.exc_info()[0]:return
    for context in contexts:
        for index,page in enumerate(context.pages):
            if page.is_closed():continue
            ui=getattr(page,'acceptance_ui',None);label=ui.label if ui else str(index)
            try:
                page.screenshot(path=str(OUT/('failure-'+label+'.png')))
                debug=page.evaluate('({screen:globalThis.sa?.screen?.constructor.name,hits:globalThis.sa?.ui?.getMobileActions(),body:document.body.innerText,battle:sa.battle?{quick:sa.battle.quick,sent:sa.battle.sent,turns:sa.battle.turns,queue:sa.battle.queue.length,menuAt:sa.battle.menuAt,petMenuAt:sa.battle.petMenuAt}:null})')
                if ui:debug.update(recentSent=ui.sent[-15:],recentReceived=ui.received[-20:])
                (OUT/('failure-'+label+'.json')).write_text(json.dumps(debug,ensure_ascii=False,indent=2)+'\n')
            except Exception:pass

def record(name,details=None):
    RESULTS.append({'case':name,'pass':True,'details':details});print('PASS',name,json.dumps(details,ensure_ascii=False),flush=True)

def db_state(character):
    with sqlite3.connect(f'file:{runtime}/test.db?mode=ro',uri=True,timeout=10) as db:
        db.row_factory=sqlite3.Row;row=db.execute('SELECT id,name,level,exp,gold,floor,x,y,hp,pets,trans FROM characters WHERE name=? AND deleted=0',(character,)).fetchone()
        return dict(row) if row else None

def redacted_state(state):
    if not state:return None
    pets=json.loads(state.get('pets') or '{}')
    return {k:v for k,v in state.items() if k!='pets'}|{'pet_state':{'battle':pets.get('battle'),'standby':pets.get('standby'),'pets':[{'bagSlot':i,'name':p.get('name'),'level':p.get('lv'),'exp':p.get('exp'),'hp':p.get('hp')} for i,p in enumerate(pets.get('pets',[])) if p]}}

def wait_db_growth(character,before,timeout=45):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        state=db_state(character)
        if state and state['gold']>before['gold']:return state
        time.sleep(.5)
    raise AssertionError(f'No saved offline gold growth within {timeout}s: before={before["gold"]}, after={db_state(character)["gold"]}')

class UI:
    def __init__(self,page,label):
        self.page=page;self.label=label;self.sent=[];self.received=[];self.latest={};self.sessions=[];page.acceptance_ui=self
        page.on('pageerror',lambda e:ERRORS.append({'page':label,'error':str(e),'stack':e.stack}))
        page.on('console',lambda m:CONSOLE.append({'page':label,'type':m.type,'text':m.text}) if m.type=='error' else None)
        page.on('websocket',self.socket)
    def socket(self,ws):
        def receive(payload):
            try:m=json.loads(payload)
            except (ValueError,TypeError):return
            fill_fields(m,SCHEMA['s2c'].get(m.get('t'),[]))
            if m.get('t')=='Session':
                self.sessions.append({'resumed':m.get('resumed'),'inWorld':m.get('inWorld'),'hasToken':bool(m.get('token'))});return
            self.received.append(m);self.latest[m.get('t')]=m
        def send(payload):
            try:m=json.loads(payload)
            except (ValueError,TypeError):return
            if m.get('t') not in ('Login','Register','ResetPassword','Resume','ChangePassword','ChangeSecret'):self.sent.append(m)
        ws.on('framereceived',receive);ws.on('framesent',send)
    def settle(self):self.page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def load(self):
        self.page.goto(base+'/?device=mobile');self.page.wait_for_function('globalThis.sa && (sa.screen.constructor.name==="LoginScreen" || (sa.screen.constructor.name==="FieldScreen" && sa.field?.self))',timeout=90000);self.settle()
    def action(self,id,delay=120):
        button=self.page.locator(f'[data-action="{id}"]')
        button.wait_for(state='visible',timeout=15000)
        button.tap();self.settle()
        self.page.wait_for_timeout(delay)
    def native(self,id):
        hit=self.page.evaluate('(id)=>sa.ui.getMobileActions().find(h=>h.id===id)',id)
        assert hit,f'No reachable native hit {id}'
        r=self.page.locator('#view').bounding_box();assert r
        self.page.touchscreen.tap(r['x']+(hit['x1']+hit['x2'])/2*r['width']/800,r['y']+(hit['y1']+hit['y2'])/2*r['height']/600)
        self.settle()
    def toolbar(self,label):
        self.page.locator('.mobile-shell-toolbar').get_by_role('button',name=label,exact=True).tap();self.settle();self.page.wait_for_timeout(120)
    def back(self):
        b=self.page.locator('.mobile-shell-back')
        if b.is_visible():b.tap()
        else:self.toolbar('返回')
        self.page.wait_for_timeout(120)
    def chat(self,text):
        self.page.wait_for_function('sa.screen.constructor.name==="FieldScreen" && !sa.battle',timeout=45000)
        self.toolbar('聊天');self.page.locator('input:visible').fill(text);self.page.get_by_role('button',name='发送聊天',exact=True).tap();self.page.wait_for_timeout(180)
    def login(self,credential):
        self.load()
        self.page.wait_for_timeout(250)
        if self.page.locator('[data-action="modal-ok"]').is_visible():self.action('modal-ok')
        if self.page.evaluate('sa.screen.constructor.name')=='FieldScreen':return
        self.page.get_by_label('账号',exact=True).fill(credential['account']);self.page.get_by_label('密码',exact=True).fill(credential['password']);self.action('ok')
        self.page.wait_for_function('sa.screen.constructor.name!=="LoginScreen"',timeout=30000)
        if self.page.evaluate('sa.screen.constructor.name')=='LineScreen':
            self.action('item0');self.action('item0');self.page.wait_for_function('sa.screen.constructor.name==="CharSelectScreen"');self.action('login0')
        self.page.wait_for_function('sa.field?.self',timeout=45000);self.page.wait_for_timeout(250)
        if self.page.evaluate('!!sa.battle'):
            auto=self.latest.get('AutoPlayState',{})
            if not (auto.get('autoBattle') or auto.get('quick')):self.page.keyboard.press('PageUp')
            self.page.wait_for_function('!sa.battle',timeout=60000)
        self.page.wait_for_function('sa.screen.constructor.name==="FieldScreen" && sa.field?.self',timeout=45000)
    def seed(self,credential):
        self.load()
        with sqlite3.connect(f'file:{runtime}/test.db?mode=ro',uri=True) as db:
            exists=bool(db.execute('SELECT 1 FROM accounts WHERE name=?',(credential['account'],)).fetchone())
        if exists:
            self.page.get_by_label('账号',exact=True).fill(credential['account']);self.page.get_by_label('密码',exact=True).fill(credential['password']);self.action('ok')
        else:
            self.action('register');inputs=self.page.locator('input:visible');assert inputs.count()==4
            for index,value in enumerate((credential['account'],credential['password'],credential['password'],credential['secret'])):inputs.nth(index).fill(value)
            self.action('dlg-ok')
        self.page.wait_for_function('sa.screen.constructor.name==="LineScreen"');self.action('item0');self.action('item0');self.page.wait_for_function('sa.screen.constructor.name==="CharSelectScreen"');self.action('new0');self.action('chr0');self.action('menu0');self.page.wait_for_function('sa.screen.constructor.name==="MakeEditScreen"');self.page.locator('input:visible').fill(credential['character'])
        for _ in range(10):self.action('a0+',70)
        self.action('ok');self.page.wait_for_function('sa.screen.constructor.name==="HomeTownScreen"');self.action('town0');self.page.wait_for_function('sa.screen.constructor.name==="FieldScreen" && sa.field?.self',timeout=30000);self.page.wait_for_timeout(200)
    def snapshot(self):
        return {'self':self.page.evaluate('sa.field?.self?{id:sa.field.self.id,name:sa.field.self.name,x:sa.field.self.x,y:sa.field.self.y,floor:sa.field.floor}:null'),'status':self.latest.get('Status'),'inventory':self.latest.get('Inventory'),'pets':self.latest.get('Pets'),'auto':self.latest.get('AutoPlayState')}
    def snap(self,name):
        self.page.wait_for_timeout(300);self.page.screenshot(path=str(OUT/(name+'.png')))
    def no_enc(self,enabled):
        self.chat('/noenc');text=self.latest.get('ChatMsg',{}).get('text','');disabled='不会遇敌' in text
        if disabled!=enabled:self.chat('/noenc')
    def set_auto(self,*,encounter=False,auto=False,quick=False):
        if self.page.evaluate('!!sa.battle'):
            for key,want,action_id in [('autoBattle',auto,'battle-auto-toggle'),('quick',quick,'battle-quick-toggle')]:
                if bool(self.latest.get('AutoPlayState',{}).get(key))!=want:
                    button=self.page.locator(f'[data-action="{action_id}"]')
                    button.wait_for(state='visible',timeout=15000);button.tap();self.settle()
                    self.page.wait_for_timeout(200)
                    deadline=time.monotonic()+5
                    while self.latest.get('AutoPlayState',{}).get(key)!=want and time.monotonic()<deadline:self.page.wait_for_timeout(100)
                    assert self.latest.get('AutoPlayState',{}).get(key)==want,{'battleToggle':key,'wanted':want,'latest':self.latest.get('AutoPlayState'),'recentSent':self.sent[-8:]}
            return
        self.toolbar('系统');self.action('sys-ai');self.action('ai-tab-基本');self.page.wait_for_timeout(120)
        for id,key,want in [('ai-enc','encounter',encounter),('ai-auto','autoBattle',auto),('ai-quick','quick',quick)]:
            current=bool(self.latest.get('AutoPlayState',{}).get(key))
            if current!=want:
                self.action(id+'-val',200)
                deadline=time.monotonic()+5
                while self.latest.get('AutoPlayState',{}).get(key)!=want and time.monotonic()<deadline:self.page.wait_for_timeout(100)
                assert self.latest.get('AutoPlayState',{}).get(key)==want,{'toggle':key,'wanted':want,'latest':self.latest.get('AutoPlayState'),'recentSent':self.sent[-8:]}
        close=self.page.locator('[data-action="ai-close"]')
        if close.is_visible():self.action('ai-close')
        self.page.wait_for_timeout(300)
        # Closing the AI subwindow can leave its parent system menu open.
        if self.page.locator('.mobile-shell-back').is_visible():self.back()
        self.page.wait_for_timeout(250)
        state=self.latest.get('AutoPlayState',{});assert state.get('encounter')==encounter and state.get('autoBattle')==auto and state.get('quick')==quick,state
    def enable_pets(self):
        self.toolbar('宠物');self.page.wait_for_timeout(120)
        for slot in range(5):
            for _ in range(3):
                pets=self.latest.get('Pets',{}).get('pets',[]);p=next(p for p in pets if p['slot']==slot);desired='battle' if slot==0 else 'standby'
                if p['state']==desired:break
                self.action(f'pet-st{slot}',200)
            assert next(p for p in self.latest['Pets']['pets'] if p['slot']==slot)['state']==desired,self.latest['Pets']
        self.snap(self.label+'-five-pets-selected');self.back()
    def guard_plan(self,on=True):
        self.toolbar('系统');self.action('sys-ai')
        if on:
            for tab,keys in [('人物',('first','then')),('宠物',('petFirst','petThen'))]:
                self.action('ai-tab-'+tab)
                for key in keys:
                    for _ in range(12):
                        state=self.page.evaluate('(name)=>JSON.parse(localStorage.getItem("sa.ai."+name)||"null")',credentials[0]['character'])
                        action=state.get(key,{}) if state else {}
                        if action.get('kind')=='guard' or (action.get('kind')=='skill' and '防御' in action.get('name','')):break
                        self.action('ai-'+key+'-val')
                    else:raise AssertionError('Could not select defensive real UI action '+key)
        else:self.action('ai-tab-其他');self.action('ai-reset-val')
        self.action('ai-close')
        if self.page.locator('.mobile-shell-back').is_visible():self.back()
        self.page.wait_for_timeout(250)
    def guard_turn(self,attack=False):
        self.page.wait_for_function('sa.battle && !sa.battle.sent && sa.battle.queue.length===0 && sa.ui.getMobileActions().some(h=>h.id==="b-guard")',timeout=30000);turn=self.page.evaluate('sa.battle.turns')
        if attack:
            self.action('b-attack');target_id=self.page.evaluate('()=>sa.ui.getMobileActions().map(h=>h.id).find(id=>/^t-\\d+$/.test(id)&&Number(id.slice(2))>=10)');assert target_id,'No enemy target reachable';self.action(target_id)
        else:self.action('b-guard')
        for _ in range(5):
            self.page.wait_for_function('!sa.battle || sa.battle.turns>'+str(turn)+' || (sa.battle.myPet() && sa.ui.getMobileActions().some(h=>h.id==="pb-waza"))',timeout=15000)
            if self.page.evaluate('!sa.battle || sa.battle.turns>'+str(turn)):break
            info=self.page.evaluate('sa.battle.myPet().info');guard=next((s for s in info['skills'] if '防御' in s['name']),None);assert guard,info
            if not self.page.evaluate('sa.battle.petWnd'):self.action('pb-waza')
            self.action('pw-'+str(guard['slot']))
        if not attack:self.page.wait_for_function('sa.battle && sa.battle.turns>'+str(turn)+' && sa.battle.queue.length===0 && sa.ui.getMobileActions().some(h=>h.id==="b-help")',timeout=30000)
    def turn_to(self,x,y):
        point=self.page.evaluate('([x,y])=>{const [sx,sy]=sa.field.gridToScreen(x,y,performance.now(),400,324),r=view.getBoundingClientRect();return{x:r.x+sx*r.width/800,y:r.y+sy*r.height/600}}',[x,y]);self.page.mouse.click(point['x'],point['y'],button='right');self.page.wait_for_timeout(200)
    def battle_end(self,index,timeout=60000):
        deadline=time.monotonic()+timeout/1000
        while time.monotonic()<deadline:
            ends=[m for m in self.received[index:] if m.get('t')=='BattleEnd']
            if ends:
                self.page.wait_for_function('!sa.battle',timeout=45000);return ends[-1]
            self.page.wait_for_timeout(100)
        raise AssertionError('No BattleEnd received')


def layout_cases(pw):
    browser=pw.chromium.launch(args=CHROMIUM)
    try:
        for width,height,mobile,name in [(1280,900,False,'desktop'),(390,844,True,'portrait'),(844,390,True,'landscape')]:
            context=browser.new_context(viewport={'width':width,'height':height},is_mobile=mobile,has_touch=mobile,device_scale_factor=1);page=context.new_page();ui=UI(page,name);page.goto(base+'/');page.wait_for_function('globalThis.sa && sa.screen.constructor.name==="LoginScreen"',timeout=90000);page.wait_for_timeout(250)
            art=page.evaluate('!!sa.app.loginArt');assert art,'New login cover did not upload into actual WebGL client'
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(name,'horizontal overflow')
            inputs=page.locator('input:visible');assert inputs.count()==2
            if not mobile:
                measured=inputs.evaluate_all('(es)=>es.map(e=>({rect:e.getBoundingClientRect().toJSON(),x:e.dataset.logicalX,y:e.dataset.logicalY}))');assert all(500<=float(x['x'])<=505 for x in measured),measured
            else:assert inputs.evaluate_all('(es)=>es.every(e=>parseFloat(getComputedStyle(e).fontSize)>=16)')
            ui.snap('login-'+name);record('new-cover-real-'+name,{'size':[width,height],'coverLoaded':art,'inputCount':inputs.count()})
            if mobile and width<height:
                password=page.get_by_label('密码',exact=True);password.focus();password.fill('temporary-unsubmitted');password.dispatch_event('compositionstart');password.dispatch_event('compositionend',{'data':'测试'});page.set_viewport_size({'width':390,'height':500});page.wait_for_timeout(250);password.scroll_into_view_if_needed();r=password.bounding_box();assert r and r['y']>=0 and r['y']+r['height']<=500+1,r;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');record('mobile-password-visual-viewport-and-composition-safe',{'visiblePassword':True,'height':500})
            context.close()
    finally:browser.close()


def dom_probe(pw):
    browser=pw.chromium.launch(args=CHROMIUM);context=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True);ui=UI(context.new_page(),'dom-probe');page=ui.page
    try:
        ui.login(credentials[0]);ui.toolbar('系统');ui.action('sys-ai');ui.action('ai-tab-基本')
        page.evaluate('''()=>{globalThis.acceptanceEvents=[];const push=e=>acceptanceEvents.push({event:e.type,t:performance.now(),target:e.target?.dataset?.action,x:e.clientX,y:e.clientY,w:innerWidth,h:innerHeight,sx:scrollX,sy:scrollY,vv:visualViewport?{w:visualViewport.width,h:visualViewport.height,x:visualViewport.offsetLeft,y:visualViewport.offsetTop}:null,hot:sa.ui.hot,mouse:{x:sa.ui.mouse.x,y:sa.ui.mouse.y,clicked:sa.ui.mouse.clicked,down:sa.ui.mouse.down}});for(const name of ['pointerdown','pointerup','click','scroll','sa-controls-layout','focusin'])document.addEventListener(name,push,true);window.addEventListener('resize',push);visualViewport?.addEventListener('resize',push);visualViewport?.addEventListener('scroll',push)}''')
        probes=[]
        for id in ['ai-auto-val','ai-quick-val','ai-quick-val','ai-auto-val']:
            button=page.locator('[data-action="'+id+'"]');before=button.bounding_box();state_before=ui.latest.get('AutoPlayState');index=len(ui.sent);button.tap();ui.settle();page.wait_for_timeout(500)
            probes.append({'id':id,'beforeBox':before,'afterBox':button.bounding_box(),'serverBefore':state_before,'serverAfter':ui.latest.get('AutoPlayState'),'sent':ui.sent[index:],'events':page.evaluate('acceptanceEvents.splice(0)'),'ui':page.evaluate('({hot:sa.ui.hot,mouse:{x:sa.ui.mouse.x,y:sa.ui.mouse.y},actions:sa.ui.getMobileActions().filter(h=>h.id.startsWith("ai-quick")),view:view.getBoundingClientRect().toJSON()})')})
        (OUT/'dom-tap-probe.json').write_text(json.dumps({'binary_sha256':meta['sha256'],'probes':probes},ensure_ascii=False,indent=2)+'\n');ui.snap('dom-tap-probe')
        for index,probe in enumerate(probes):
            key='quick' if 'quick' in probe['id'] else 'autoBattle';assert bool(probe['serverBefore'].get(key))!=bool(probe['serverAfter'].get(key)),probe
            assert any(m.get('t')=='AutoPlay' and bool(m.get(key))==bool(probe['serverAfter'].get(key)) for m in probe['sent']),probe
            record('real-dom-'+probe['id']+'-'+str(index),{'before':probe['serverBefore'],'after':probe['serverAfter'],'box':probe['afterBox']})
        print('DOM probe passed',flush=True)
    finally:failure_evidence([context]);context.close();browser.close()

def toggle_probe(pw):
    browser=pw.chromium.launch(args=CHROMIUM);context=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True);ui=UI(context.new_page(),'toggle-probe')
    try:
        ui.login(credentials[0])
        for enabled in (True,False,True,False):
            ui.set_auto(auto=enabled,quick=False);record('live-ui-auto-toggle-'+str(len(RESULTS)),{'auto':enabled,'server':ui.latest.get('AutoPlayState')})
    finally:failure_evidence([context]);context.close();browser.close()

def gameplay_cases(pw):
    browser=pw.chromium.launch(args=CHROMIUM)
    contexts=[]
    try:
        for label,credential in zip(('leader','partner'),credentials):
            context=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True);contexts.append(context);ui=UI(context.new_page(),label);ui.login(credential)
            if label=='leader':leader=ui
            else:partner=ui
        for ui in (leader,partner):
            if args.skip_limits:
                ui.no_enc(True);ui.chat('/heal');continue
            ui.no_enc(True);ui.chat('/warp 1000 47 82');ui.chat('/stat 1000 1000 1000 1000');ui.chat('/lv 199');ui.chat('/exp 2147483647');assert ui.latest['Status']['level']==200,ui.latest.get('Status');ui.chat('/lv 201');assert ui.latest['Status']['level']==200;record(ui.label+'-character-cap-200-above-native-140',{'level':200,'nextExp':ui.latest['Status'].get('nextExp',0)});ui.chat('/trans 11');ui.chat('/tensei');assert ui.latest['Status']['trans']==12,ui.latest['Status'];ui.chat('/lv 150');ui.chat('/tensei');assert ui.latest['Status']['trans']==12;ui.chat('/trans 13');assert ui.latest['Status']['trans']==12;record(ui.label+'-character-rebirth-cap-twelve',{'trans':12,'independentConfiguredPetCap':8});ui.chat('/trans 0');ui.chat('/stat 1000 1000 1000 1000');ui.chat('/heal');ui.chat('/gold 0')
            if len(ui.latest.get('Pets',{}).get('pets',[]))<5:
                for _ in range(5-len(ui.latest.get('Pets',{}).get('pets',[]))):ui.chat('/pet 9 30')
            ui.chat('/petlv 0 180');assert next(p for p in ui.latest['Pets']['pets'] if p['slot']==0)['level']==180;ui.chat('/petlv 0 181');assert next(p for p in ui.latest['Pets']['pets'] if p['slot']==0)['level']==180
            for slot in range(5):
                if not any('防御' in s['name'] for s in ui.latest['Pets']['pets'][slot]['skills']):ui.chat(f'/petskill {slot} 2 2')
            ui.chat('/heal');ui.enable_pets();record(ui.label+'-pet-cap-180-and-five-selected',{'levels':[p['level'] for p in ui.latest['Pets']['pets']]})
        leader.guard_plan(False)
        # Solo encounter uses exactly the five legal pet slots and shares experience.
        if not args.skip_baseline:
            leader.set_auto(auto=True,quick=False);start=len(leader.received);leader.chat('/encount 9 100');leader.page.wait_for_function('sa.battle',timeout=15000)
            starts=[m for m in leader.received[start:] if m.get('t')=='BattleStart'];assert starts
            fighters=starts[-1]['fighters'];pets=[f for f in fighters if 5<=f['slot']<10];assert len(pets)==5,pets;leader.snap('solo-five-pet-battle');result=leader.battle_end(start);assert result['result']=='win' and len(result['pets'])==5 and all(p['exp']>0 for p in result['pets']),result;assert 50<=result.get('gold',-1)<=80,result;record('solo-five-pet-fighters-each-exp-and-level100-stone50to80',{'fighters':[{k:f.get(k) for k in ('slot','name','ownerSlot','bagSlot')} for f in pets],'result':result})
            leader.set_auto(auto=False,quick=False);leader.chat('/gold 0');start=len(leader.received);leader.set_auto(auto=True,quick=True);leader.chat('/encount 9 4');result=leader.battle_end(start);assert result.get('gold')==4,result;record('below-five-enemy-level-pays-exact-level-stone',result);leader.set_auto(auto=False,quick=False)
        # Hold a real quick battle in a defensive plan while toggling modes live.
        leader.guard_plan(True);leader.set_auto(auto=True,quick=True);start=len(leader.received);leader.chat('/encount 263 100');leader.page.wait_for_function('sa.battle && sa.battle.quick',timeout=15000);before_mode=leader.page.evaluate('({field:sa.field.floor,pets:Array.from(sa.battle.fighters.values()).filter(a=>a.f.slot>=5&&a.f.slot<10).map(a=>({bag:a.f.bagSlot,owner:a.f.ownerSlot,name:a.f.name}))})');leader.page.wait_for_timeout(400)
        leader.set_auto(auto=False,quick=False);leader.page.wait_for_function('sa.battle && !sa.battle.quick',timeout=15000);manual_start=len(leader.sent);leader.guard_turn();manual=[m for m in leader.sent[manual_start:] if m.get('t')=='BattlePetCommand'];assert len(manual)==5 and len({m['petSlot'] for m in manual})==5,manual;assert sum(m.get('t')=='BattleCommand' for m in leader.sent[manual_start:])==1;leader.snap('quick-disabled-five-manual-pet-commands');after_mode=leader.page.evaluate('({field:sa.field.floor,pets:Array.from(sa.battle.fighters.values()).filter(a=>a.f.slot>=5&&a.f.slot<10).map(a=>({bag:a.f.bagSlot,owner:a.f.ownerSlot,name:a.f.name}))})');assert before_mode==after_mode,(before_mode,after_mode)
        leader.action('battle-quick-toggle');leader.page.wait_for_function('sa.battle && sa.battle.quick',timeout=15000);leader.page.wait_for_timeout(300);leader.set_auto(auto=False,quick=False);leader.guard_turn(attack=True);result=leader.battle_end(start);assert result['result']=='win';record('live-quick-to-manual-five-distinct-pet-commands-to-quick-same-fighters',{'sameFormation':before_mode,'quickToggleNativeCanvasFallback':getattr(leader,'quick_toggle_native_fallback',False),'manualPetCommands':manual,'battleEnds':sum(m.get('t')=='BattleEnd' for m in leader.received[start:]),'result':result});leader.set_auto(auto=False,quick=False);leader.guard_plan(False)
        # Group join through the original facing and party UI.
        leader.chat('/warp 1000 47 82');partner.chat('/warp 1000 48 82');partner.turn_to(47,82);partner.native('fp-party');partner.page.wait_for_timeout(350);assert partner.latest.get('PartyResult',{}).get('ok'),partner.latest.get('PartyResult')
        leader.set_auto(auto=True,quick=False);partner.set_auto(auto=True,quick=False);start=len(leader.received);other=len(partner.received);leader.chat('/encount 9 100');leader.page.wait_for_function('sa.battle',timeout=15000);starts=[m for m in leader.received[start:] if m.get('t')=='BattleStart'];fighters=starts[-1]['fighters'];pets=[f for f in fighters if 5<=f['slot']<10]
        assert len(pets)==5;owned={}
        for f in pets:owned[str(f.get('ownerSlot'))]=owned.get(str(f.get('ownerSlot')),0)+1
        assert sorted(owned.values())==[2,3],owned;leader.snap('party-two-player-three-two-pets');a=leader.battle_end(start);b=partner.battle_end(other);assert len(a['pets'])==3 and len(b['pets'])==2,(a,b);record('two-player-pet-quota-three-two-and-independent-results',{'owners':owned,'leaderPets':a['pets'],'partnerPets':b['pets']})
        leader.set_auto(auto=False,quick=False);partner.set_auto(auto=False,quick=False)
        # Rescue after a fully defended round preserves existing damaged/dead pets.
        partner.native('fp-party');partner.page.wait_for_timeout(250);leader.chat('/warp 1000 47 82');partner.chat('/warp 1000 48 82');partner.turn_to(47,82)
        start=len(leader.received);other=len(partner.received);leader.chat('/encount 263 100');leader.guard_turn()
        prefix=leader.page.evaluate('Array.from(sa.battle.fighters.values()).filter(a=>a.f.slot>=5&&a.f.slot<10).map(a=>({bagSlot:a.f.bagSlot,ownerSlot:a.f.ownerSlot,hp:a.hp,dead:a.dead,gone:a.gone,status:a.status}))');leader.action('b-help');partner.native('fp-join');partner.page.wait_for_function('sa.battle',timeout=20000);leader.page.wait_for_timeout(350)
        joins=[m for m in leader.received[start:] if m.get('t')=='BattleJoin'];assert joins and joins[-1].get('resetPets');joined=joins[-1]['fighters'];survivors=[f for f in joined if 5<=f['slot']<10 and f['ownerSlot']==0];assert len(survivors)==3,survivors
        for old in prefix[:3]:
            current=next(f for f in survivors if f['bagSlot']==old['bagSlot']);assert current['hp']==old['hp'] and current['status']==old['status'],(old,current)
        leader.snap('rescue-prefix-state-preserved');record('rescue-rebalances-five-to-three-two-with-existing-hp-status-preserved',{'before':prefix,'after':survivors,'resetPets':True})
        # Finish through the real battle's PageUp automatic toggle on both clients.
        leader.page.keyboard.press('PageUp');partner.page.keyboard.press('PageUp');a=leader.battle_end(start);b=partner.battle_end(other);leader.page.wait_for_timeout(500);ends=[sum(m.get('t')=='BattleEnd' for m in client.received[index:]) for client,index in ((leader,start),(partner,other))];assert ends==[1,1],ends;record('rescue-battle-finishes-on-both-real-clients',{'leaderResult':a['result'],'partnerResult':b['result'],'battleEnds':ends})
        private_write(runtime/'gameplay-complete.json',{'leader':leader.snapshot(),'partner':partner.snapshot()})
    finally:
        failure_evidence(contexts)
        for context in contexts:context.close()
        browser.close()


def offline_cases(pw):
    profile=runtime/'profile-main';context=pw.chromium.launch_persistent_context(str(profile),args=CHROMIUM,viewport={'width':844,'height':390},is_mobile=True,has_touch=True);page=context.pages[0] if context.pages else context.new_page();ui=UI(page,'offline-main')
    try:
        ui.login(credentials[0]);ui.chat('/warp 100 650 450');ui.chat('/stat 1000 1000 1000 1000');ui.chat('/lv 150');ui.chat('/gold 0');ui.chat('/heal')
        # /noenc is a toggle; prior gameplay deliberately left this protection on.
        ui.no_enc(False);ui.set_auto(encounter=True,auto=True,quick=True);page.wait_for_timeout(3500);before=db_state(credentials[0]['character']);assert before;ui.snap('offline-auto-enabled');state=ui.latest.get('AutoPlayState',{});assert state.get('encounter') and state.get('quick'),state
        live_entity_id=page.evaluate('sa.field.self.id')
        context.close();context=None
        after=wait_db_growth(credentials[0]['character'],before,timeout=45);record('closed-browser-server-continues-auto-encounter-quick-battle',{'before':redacted_state(before),'after':redacted_state(after),'noBrowserPage':True})
        context=pw.chromium.launch_persistent_context(str(profile),args=CHROMIUM,viewport={'width':844,'height':390},is_mobile=True,has_touch=True);page=context.pages[0] if context.pages else context.new_page();ui=UI(page,'offline-resumed');ui.load();page.wait_for_function('sa.screen.constructor.name==="FieldScreen" && sa.field?.self',timeout=45000);assert page.evaluate('sa.field.self.name')==credentials[0]['character'];assert page.evaluate('sa.field.self.id')==live_entity_id
        deadline=time.monotonic()+10
        while not (ui.latest.get('AutoPlayState',{}).get('encounter') and ui.latest.get('AutoPlayState',{}).get('quick')) and time.monotonic()<deadline:page.wait_for_timeout(100)
        assert any(x['resumed'] and x['inWorld'] for x in ui.sessions),{'sessions':ui.sessions}
        assert ui.latest.get('AutoPlayState',{}).get('encounter') and ui.latest['AutoPlayState'].get('quick'),{'autoState':ui.latest.get('AutoPlayState'),'sent':ui.sent[-3:]}
        ui.snap('same-browser-auto-resumed');record('same-browser-token-resumes-same-live-character-and-auto-state',{'sessions':ui.sessions,'state':ui.snapshot()})
        # An actually frozen renderer cannot advance JS or issue commands.
        cdp=context.new_cdp_session(page);baseline=db_state(credentials[0]['character']);sent_before=len(ui.sent);cdp.send('Page.setWebLifecycleState',{'state':'frozen'})
        try:advanced=wait_db_growth(credentials[0]['character'],baseline,timeout=45)
        finally:cdp.send('Page.setWebLifecycleState',{'state':'active'})
        page.wait_for_timeout(1500);battle_commands=[m for m in ui.sent[sent_before:] if m.get('t') in ('BattleCommand','BattlePetCommand')];assert not battle_commands,battle_commands;assert ui.latest.get('Inventory',{}).get('gold',0)>=advanced['gold'];record('frozen-tab-server-growth-and-unfreeze-current-state',{'beforeGold':baseline['gold'],'afterGold':advanced['gold'],'clientGoldAfterResume':ui.latest.get('Inventory',{}).get('gold'),'browserBattleCommandsWhileFrozen':len(battle_commands)})
        # Another clean browser context authenticates with the password, invalidating the old token.
        old_token=page.evaluate('()=>{const k=Object.keys(localStorage).find(k=>k.startsWith("sa-session:"));return k?localStorage.getItem(k):null}');assert old_token
        other_browser=pw.chromium.launch(args=CHROMIUM);other_context=other_browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True);new=UI(other_context.new_page(),'new-device')
        try:
            new.login(credentials[0]);page.wait_for_function('sa.screen.constructor.name==="LoginScreen"',timeout=15000);assert new.page.evaluate('sa.field.self.name')==credentials[0]['character'];assert new.latest.get('AutoPlayState',{}).get('quick');record('new-device-password-login-replaces-old-controller-preserving-live-state',{'newSessions':new.sessions,'oldScreen':page.evaluate('sa.screen.constructor.name'),'newState':new.snapshot()})
            # Old bearer is intentionally tested only in an independent browser transport.
            rejected=page.evaluate('''(token)=>new Promise(resolve=>{const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);const t=setTimeout(()=>{ws.close();resolve({timeout:true})},5000);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==='Hello')ws.send(JSON.stringify({t:'Resume',token}));if(m.t==='Error'){clearTimeout(t);ws.close();resolve({code:m.code})}}})''',old_token);assert rejected.get('code')=='resume_failed',rejected;record('replaced-device-old-token-rejected',rejected)
            new.set_auto(encounter=False,auto=False,quick=False);new.snap('new-device-live-state');private_write(runtime/'final-state.json',new.snapshot())
        finally:
            failure_evidence([other_context]);other_context.close();other_browser.close()
    finally:
        if context:
            failure_evidence([context]);context.close()

try:
    with sync_playwright() as pw:
        if args.seed:
            assert not meta.get('gm'),'Register accounts before enabling GM name reservation'
            browser=pw.chromium.launch(args=CHROMIUM)
            try:
                for index,credential in enumerate(credentials):
                    if db_state(credential['character']):continue
                    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);ui=UI(context.new_page(),'seed'+str(index));ui.seed(credential);ui.snap('seed-character-'+str(index));context.close();record('normal-ui-created-isolated-character-'+str(index),{'name':credential['character']})
            finally:browser.close()
        else:
            assert args.run and meta.get('gm'),'Use --run only after the fixture restarts with --gm'
            if args.phase=='toggle':toggle_probe(pw)
            if args.phase=='dom-probe':dom_probe(pw)
            if args.phase in ('all','layout'):layout_cases(pw)
            if args.phase in ('all','gameplay'):gameplay_cases(pw)
            if args.phase in ('all','offline'):offline_cases(pw)
        assert not ERRORS,ERRORS
except Exception as error:
    RESULTS.append({'case':'execution-failure','pass':False,'error':str(error),'traceback':traceback.format_exc()});print(traceback.format_exc(),flush=True);raise
finally:
    report={'binary_sha256':meta.get('sha256'),'client_mode':meta.get('client_mode'),'phase':'seed' if args.seed else args.phase,'engine':'real Chromium / SwiftShader; Playwright + CDP touch','physical_device':False,'cases':RESULTS,'page_errors':ERRORS,'console_errors':CONSOLE,'credentials_stored_outside_repository':True}
    (OUT/('seed-results.json' if args.seed else 'gameplay-'+args.phase+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
