"""Real UI mechanical-pet acceptance. Authentication and profiles stay in private /tmp runtime."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse, hashlib, json, os, time, traceback
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
META=Path('/tmp/sa-mechanical-pets-runtime.json')
CHROMIUM=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--renderer-process-limit=1','--js-flags=--max-old-space-size=128']
SCHEMA=json.loads((ROOT/'proto/messages.json').read_text())
def defaults(v,fields):
 for k,kind in fields:
  kind=kind.rstrip('?')
  if k not in v:v[k]=[] if kind.endswith('[]') else 0 if kind=='int' else False if kind=='bool' else ''
  if kind.endswith('[]') and kind[:-2] in SCHEMA['types']:
   for child in v[k]:defaults(child,SCHEMA['types'][kind[:-2]])
 return v
class UI:
 def __init__(self,page,base):
  self.page=page;self.base=base;self.latest={};self.events=[];self.errors=[];page.on('pageerror',lambda e:self.errors.append(str(e)));page.on('websocket',self.socket)
 def socket(self,ws):
  def received(payload):
   try:m=json.loads(payload)
   except (ValueError,TypeError):return
   if m.get('t') in ('Session','Login','Register','Resume'):return
   defaults(m,SCHEMA['s2c'].get(m.get('t'),[]));self.latest[m.get('t')]=m;self.events.append(m)
  ws.on('framereceived',received)
 def settle(self):self.page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 def load(self):
  self.page.goto(self.base+'/?device=mobile');self.page.wait_for_function('globalThis.sa && (sa.screen.constructor.name==="LoginScreen" || sa.field?.self)',timeout=90000);self.settle()
 def action(self,id,delay=180):
  b=self.page.locator('[data-action="'+id+'"]')
  self.page.wait_for_function('(id)=>sa.ui.getMobileActions().some(h=>h.id===id)',arg=id,timeout=15000)
  if b.is_visible():b.tap()
  else:
   hit=self.page.evaluate('(id)=>sa.ui.getMobileActions().find(h=>h.id===id)',id);r=self.page.locator('#view').bounding_box();self.page.mouse.click(r['x']+(hit['x1']+hit['x2'])/2*r['width']/800,r['y']+(hit['y1']+hit['y2'])/2*r['height']/600)
  self.settle();self.page.wait_for_timeout(delay)
  if id.startswith(('b-','pw-','pt-','pet-tab-')):print('UI action',id,flush=True)
 def toolbar(self,name):
  self.page.locator('.mobile-shell-toolbar').get_by_role('button',name=name,exact=True).tap();self.settle();self.page.wait_for_timeout(180)
 def back(self):
  b=self.page.locator('.mobile-shell-back')
  if b.is_visible():b.tap()
  else:self.toolbar('返回')
  self.settle();self.page.wait_for_timeout(180)
 def chat(self,text):
  self.page.wait_for_function('sa.screen.constructor.name==="FieldScreen" && !sa.battle',timeout=60000)
  self.toolbar('聊天');self.page.locator('input:visible').fill(text);self.page.get_by_role('button',name='发送聊天',exact=True).tap();self.page.wait_for_timeout(250)
 def enter(self,credential,seed=False):
  self.load();self.page.wait_for_timeout(1800)
  if self.page.evaluate('!!sa.field?.self'):return
  if seed:
   self.action('register');inputs=self.page.locator('input:visible');assert inputs.count()==4
   for i,v in enumerate((credential['account'],credential['password'],credential['password'],credential['secret'])):inputs.nth(i).fill(v)
   self.action('dlg-ok')
  else:
   self.page.get_by_label('账号',exact=True).fill(credential['account']);self.page.get_by_label('密码',exact=True).fill(credential['password']);self.action('ok')
  self.page.wait_for_function('sa.screen.constructor.name!=="LoginScreen" || sa.ui.getMobileActions().some(h=>h.id==="modal-ok")')
  if self.page.evaluate('sa.screen.constructor.name==="LoginScreen"'):
   raise RuntimeError('Login UI rejected: '+str(self.page.evaluate('sa.ui.texts.map(t=>t.text)')))
  deadline=time.monotonic()+60
  while time.monotonic()<deadline:
   name=self.page.evaluate('sa.screen.constructor.name')
   if name=='FieldScreen' and self.page.evaluate('!!sa.field?.self'):self.page.wait_for_timeout(400);return
   if name=='LineScreen':self.action('item0')
   elif name=='CharSelectScreen':
    if seed:
     self.action('new0');self.action('chr0');self.action('menu0');self.page.wait_for_function('sa.screen.constructor.name==="MakeEditScreen"');self.page.locator('input:visible').fill(credential['character'])
     for _ in range(10):self.action('a0+',50)
     self.action('ok');self.page.wait_for_function('sa.screen.constructor.name==="HomeTownScreen"');self.action('town0')
    else:self.action('login0')
   else:self.page.wait_for_timeout(200)
  raise RuntimeError('UI entry did not reach field')
 def snap(self,name):
  self.page.wait_for_timeout(300);self.page.screenshot(path=str(OUT/(name+'.png')))
 def visible_actions(self):return self.page.evaluate('sa.ui.getMobileActions().map(h=>({id:h.id,label:h.label}))')
 def wait_menu(self):self.page.wait_for_function('sa.battle && sa.battle.queue.length===0 && !sa.battle.sent && sa.ui.getMobileActions().some(h=>h.id==="b-guard")',timeout=60000)
 def pet_actions(self,special=False):
  for battle_slot in range(5,10):
   if self.page.evaluate('!sa.battle || sa.battle.petSent'):break
   self.page.wait_for_function('sa.battle && sa.ui.getMobileActions().some(h=>h.id.startsWith("pet-tab-"))',timeout=15000)
   done=self.page.evaluate('(slot)=>sa.battle.petSentSlots.has(slot)',battle_slot)
   if done:continue
   self.action('pet-tab-'+str(battle_slot),300)
   if special and battle_slot==5:self.action('pw-2');self.action('pt-0',300)
   elif battle_slot==9:self.action('pw-0',300);self.action('pt-15',300)
   else:self.action('pw-1',300)
  self.page.wait_for_function('!sa.battle || sa.battle.petSent',timeout=15000)
 def escape(self):
  self.wait_menu();self.action('b-escape');self.page.wait_for_function('!sa.battle',timeout=60000)
 def move_to(self,x,y):
  point=self.page.evaluate('([x,y])=>{const [sx,sy]=sa.field.gridToScreen(x,y,performance.now(),400,324),r=view.getBoundingClientRect();return{x:r.x+sx*r.width/800,y:r.y+sy*r.height/600}}',[x,y]);self.page.mouse.click(point['x'],point['y']);self.page.wait_for_timeout(600)
def main():
 p=argparse.ArgumentParser();p.add_argument('phase',choices=['seed','prepare','details','probe','battle','natural','fallback']);p.add_argument('--mobile',action='store_true');p.add_argument('--case',default='');a=p.parse_args()
 meta=json.loads(META.read_text());runtime=Path(meta['dir']);credential=json.loads(Path(meta['credentials']).read_text());base='http://127.0.0.1:'+str(meta['port'])
 with sync_playwright() as pw:
  browser=pw.chromium.launch(args=CHROMIUM);profile=runtime/'browser-state.json'
  options={'viewport':{'width':390 if a.mobile else 1280,'height':844 if a.mobile else 900},'is_mobile':True,'has_touch':True,'device_scale_factor':1}
  if profile.exists():
   saved=json.loads(profile.read_text());options['storage_state']={'cookies':[],'origins':[{'origin':o['origin'],'localStorage':[v for v in o['localStorage'] if v['name'].startswith('sa.album.')]} for o in saved.get('origins',[])]}
  context=browser.new_context(**options)
  if a.phase=='fallback':
   failed_png=[]
   def block(route):
    url=route.request.url
    if a.case=='manifest404' and url.endswith('/manifest.json'):route.fulfill(status=404,body='missing')
    elif a.case=='invalid-json' and url.endswith('/manifest.json'):route.fulfill(status=200,content_type='application/json',body='{invalid')
    elif a.case=='png404' and url.endswith('.png') and (not failed_png or url==failed_png[0]):
     if not failed_png:failed_png.append(url)
     route.fulfill(status=404,body='missing')
    else:route.continue_()
   context.route('**/extensions/ai-pets-v1/**',block)
  page=context.new_page();ui=UI(page,base)
  try:
   ui.enter(credential,seed=a.phase=='seed')
   if a.phase=='seed':print('Seed character created through registration UI',flush=True)
   elif a.phase=='prepare':
    ui.chat('/noenc');ui.chat('/lv 100')
    ui.chat('/stat 1000 1000 1000 1000');ui.chat('/charm 100');ui.chat('/heal')
    for enemy in range(29001,29005):ui.chat('/pet '+str(enemy)+' 40')
    ui.toolbar('宠物');ui.snap('prepared-five-pets')
    print(json.dumps({'pets':ui.latest.get('Pets'),'chat':ui.latest.get('ChatMsg'),'actions':ui.visible_actions()},ensure_ascii=False),flush=True)
   elif a.phase=='probe':
    if a.case:ui.chat(a.case)
    ui.toolbar('宠物');ui.snap('probe-pets')
    print(json.dumps({'pets':ui.latest.get('Pets'),'actions':ui.visible_actions()},ensure_ascii=False),flush=True)
   elif a.phase=='details':
    ui.toolbar('宠物')
    if not a.mobile:
     page.locator('#mobile-mode-switch summary').click();page.locator('#mobile-mode-switch select').select_option('desktop');page.locator('#mobile-mode-switch summary').click();ui.settle()
    ui.snap(('mobile' if a.mobile else 'desktop')+'-pet-list')
    details=[]
    for slot in range(4):
     pet=next(p for p in ui.latest['Pets']['pets'] if p['slot']==slot)
     assert pet['sprite']==199100+slot and [s['id'] for s in pet['skills']]==[1,2,29101+slot]
     ui.action('pet-name'+str(slot));ui.snap(('mobile' if a.mobile else 'desktop')+'-detail-'+str(slot))
     ui.action('pet-snap');ui.action('pet-waza');ui.snap(('mobile' if a.mobile else 'desktop')+'-skills-'+str(slot))
     ui.action('pet-return');ui.action('pet-return');print('PASS detail/skills/snapshot slot',slot,flush=True);details.append({'slot':slot,'name':pet['name'],'sprite':pet['sprite'],'skills':pet['skills']})
    ui.action('pet-close');ui.action('tb-album');ui.action('album-prev')
    album=[]
    for no in range(570,574):
     ui.action('album-'+str(no));page.wait_for_timeout(600);ui.snap(('mobile' if a.mobile else 'desktop')+'-album-'+str(no+1))
     state=page.evaluate('()=>({texts:sa.ui.texts.map(t=>t.text),images:[...sa.ui.pics??[]].map(x=>({w:x.w,h:x.h}))})')
     album.append({'no':no+1,'visibleStory':any('简介' in str(t) for t in state['texts'])})
    assert all(x['visibleStory'] for x in album),album
    result={'phase':'details','binary_sha256':meta['binary_sha256'],'mode':'mobile' if a.mobile else 'native-desktop','viewport':options['viewport'],'details':details,'album':album,'errors':ui.errors}
    assert not ui.errors,ui.errors
    (OUT/('details-'+('mobile' if a.mobile else 'desktop')+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2));print('PASS details',options['viewport'],flush=True)
   elif a.phase=='battle':
    if page.evaluate('!!sa.battle'):
     if page.evaluate('sa.battle.sent && !sa.battle.petSent'):ui.pet_actions()
     ui.escape()
    if len(ui.latest['Pets']['pets'])<5:ui.chat('/pet 9 30')
    ui.chat('/heal');ui.toolbar('宠物')
    for slot in range(5):
     want='battle' if slot==0 else 'standby'
     for _ in range(3):
      pet=next(p for p in ui.latest['Pets']['pets'] if p['slot']==slot)
      if pet['state']==want:break
      ui.action('pet-st'+str(slot))
     assert next(p for p in ui.latest['Pets']['pets'] if p['slot']==slot)['state']==want
    ui.snap('five-pets-selected');ui.back();ui.chat('/encount 29011 40');ui.wait_menu()
    if not a.mobile:
     page.locator('#mobile-mode-switch summary').click();page.locator('#mobile-mode-switch select').select_option('desktop');page.locator('#mobile-mode-switch summary').click();ui.settle()
    ui.snap('five-pets-four-distinct-mechanical-battle')
    start=ui.latest['BattleStart'];assert set(range(199100,199104)).issubset({f['sprite'] for f in start['fighters'] if f['slot']<10})
    ui.action('b-guard');ui.pet_actions(special=True)
    page.wait_for_function('sa.battle && sa.battle.turns>=1 && sa.battle.queue.length===0',timeout=60000)
    turns=[m for m in ui.events if m['t']=='BattleTurn'];assert any(e.get('skill')=='观测风标' for m in turns for e in m['events']),turns
    ui.snap('mechanical-skill-resolved');ui.escape()
    (OUT/'battle.json').write_text(json.dumps({'binary_sha256':meta['binary_sha256'],'start':start,'turns':turns,'errors':ui.errors},ensure_ascii=False,indent=2));print('PASS four mechanical pets in five-pet battle and legal skill',flush=True)
   elif a.phase=='natural':
    ui.chat('/heal');ui.chat('/warp 300 371 183');ui.chat('/noenc')
    if '不会遇敌' in ui.latest.get('ChatMsg',{}).get('text',''):ui.chat('/noenc')
    encounters=[]
    for attempt in range(25):
     if not page.evaluate('!!sa.battle'):
      pos=page.evaluate('({x:sa.field.self.x,y:sa.field.self.y})');ui.move_to(pos['x']+(1 if attempt%2==0 else -1),pos['y'])
     if page.evaluate('!!sa.battle'):
      ui.wait_menu();start=ui.latest['BattleStart'];enemies=[f for f in start['fighters'] if f['slot']>=10];encounters.append({'attempt':attempt,'enemies':enemies})
      found=any(199100<=f['sprite']<=199103 for f in enemies)
      if found:ui.snap('natural-walking-mechanical-encounter')
      ui.escape()
      if found:break
    assert any(199100<=f['sprite']<=199103 for e in encounters for f in e['enemies']),encounters
    ui.chat('/noenc')
    if '不会遇敌' not in ui.latest.get('ChatMsg',{}).get('text',''):ui.chat('/noenc')
    # Free a real inventory slot through the normal pet drop confirmation UI.
    ui.toolbar('宠物')
    if len(ui.latest['Pets']['pets'])==5:
     for _ in range(3):
      pet=next(p for p in ui.latest['Pets']['pets'] if p['slot']==4)
      if pet['state']=='rest':break
      ui.action('pet-st4')
     hit=page.evaluate('sa.ui.getMobileActions().find(h=>h.id==="pet-name4")');r=page.locator('#view').bounding_box();page.mouse.click(r['x']+(hit['x1']+hit['x2'])/2*r['width']/800,r['y']+(hit['y1']+hit['y2'])/2*r['height']/600,button='right');ui.settle();ui.action('modal-yes')
    for slot in range(4):
     for _ in range(3):
      pet=next(p for p in ui.latest['Pets']['pets'] if p['slot']==slot)
      if pet['state']=='rest':break
      ui.action('pet-st'+str(slot))
    ui.back();before=len(ui.latest['Pets']['pets']);assert before==4
    ui.chat('/encount 29001 1');captures=[]
    for _ in range(12):
     ui.wait_menu();ui.action('b-capture');enemy=next(f for f in ui.latest['BattleStart']['fighters'] if f['slot']>=10);ui.action('t-'+str(enemy['slot']))
     page.wait_for_timeout(1000)
     deadline=time.monotonic()+45
     while time.monotonic()<deadline and page.evaluate('!!sa.battle && sa.battle.sent'):page.wait_for_timeout(200)
     captures=[e for m in ui.events if m['t']=='BattleTurn' for e in m['events'] if e['kind']=='capture']
     if any(e.get('ok') for e in captures):break
    assert any(e.get('ok') for e in captures),captures
    page.wait_for_function('!sa.battle',timeout=60000);ui.toolbar('宠物');ui.snap('captured-new-mechanical-pet-saved')
    captured=next(p for p in ui.latest['Pets']['pets'] if p['slot']==4);assert captured['sprite']==199100 and captured['level']==1,captured
    (OUT/'natural-capture.json').write_text(json.dumps({'binary_sha256':meta['binary_sha256'],'encounters':encounters,'captures':captures,'capturedPet':captured,'errors':ui.errors},ensure_ascii=False,indent=2));print('PASS natural walking encounter and completed capture saved',flush=True)
   elif a.phase=='fallback':
    ui.toolbar('宠物');ui.action('pet-name0');page.wait_for_timeout(600);ui.snap('fallback-'+a.case)
    fallback=page.evaluate('()=>[199100,199101,199102,199103].map(id=>({requested:id,actual:sa.assets.anim(id)?.id}))')
    assert all(x['actual']==100374 for x in fallback),fallback
    assert not ui.errors,ui.errors
    assert page.request.get(base+'/').status==200
    (OUT/('fallback-'+a.case+'.json')).write_text(json.dumps({'case':a.case,'binary_sha256':meta['binary_sha256'],'enteredWorld':True,'fallback':fallback,'errors':ui.errors,'serverAlive':True},indent=2));print('PASS fallback',a.case,flush=True)
   else:raise RuntimeError('Phase implementation pending: '+a.phase)
  except Exception:
   if page.evaluate('globalThis.sa?.screen?.constructor.name') not in ('LoginScreen','MakeEditScreen'):
    try:ui.snap('failure-'+a.phase);(OUT/('failure-'+a.phase+'.json')).write_text(json.dumps({'screen':page.evaluate('sa.screen.constructor.name'),'actions':ui.visible_actions(),'errors':ui.errors},ensure_ascii=False,indent=2))
    except Exception:pass
   raise
  finally:
   context.storage_state(path=str(profile));profile.chmod(0o600)
   context.close();browser.close()
if __name__=='__main__':main()
