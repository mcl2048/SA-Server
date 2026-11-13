"""Final-ELF real Chromium scenarios. All mutation uses GM/normal UI.
The imported previous UI observes real WS frames; screenshots are actual frames.
Run only after the parent confirms the final binary: python integration_battle.py
"""
from pathlib import Path
import argparse,base64,importlib.util,json,time
from playwright.sync_api import sync_playwright
from runtime_integration import ROOT,OUT,run
spec=importlib.util.spec_from_file_location('prior_ui',ROOT/'Report/SA-1113-01/browser/acceptance.py')
old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old);old.OUT=OUT
CHROME='/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'

def presentation(ui,mode):
 ui.page.locator('#mobile-mode-switch summary').click();ui.page.locator('#mobile-mode-switch select').select_option(mode);ui.page.locator('#mobile-mode-switch summary').click();ui.settle()

def state(ui):
 return ui.page.evaluate('''()=>({turn:sa.battle?.turns, fighters:sa.battle?[...sa.battle.fighters.values()].map(a=>({slot:a.f.slot,hp:a.hp,dead:a.dead,action:a.action,frameType:a.lastAct?.type,rect:a.rect})):[]})''')

def field_shortcut(ui):
 ui.chat('/warp 300 371 183');ui.back()
 shortcut=ui.page.locator("button[data-mobile-control='auto-encounter']")
 shortcut.wait_for(state='visible',timeout=15000)
 layout=ui.page.evaluate('''()=>{const f=document.querySelector('.mobile-shell-field'),s=document.querySelector('.mobile-shell-sheet');return {controlsBeforeSheet:!!(f.compareDocumentPosition(s)&Node.DOCUMENT_POSITION_FOLLOWING),controlsOrder:getComputedStyle(f).order,sheetTouchAction:getComputedStyle(s).touchAction,sheetOverflow:getComputedStyle(s).overflowY};}''')
 assert layout['controlsBeforeSheet'],layout
 for want in (True,False):
  before=len(ui.events);shortcut.tap()
  ui.page.wait_for_function('(v)=>document.querySelector("button[data-mobile-control=auto-encounter]")?.getAttribute("aria-pressed")===String(v)',arg=want,timeout=15000)
  assert any(m['t']=='AutoPlayState' and bool(m.get('encounter'))==want for m in ui.events[before:]),'shortcut did not receive matching wire ACK'
 ui.snap('mobile-field-shortcut-ack')
 ui.chat('/warp 1000 45 45');ui.back()
 shortcut.wait_for(state='hidden',timeout=15000)
 ui.snap('mobile-city-shortcut-hidden')
 ui.chat('/warp 300 371 183')
 return {'layout':layout,'wild_on_off_ack':True,'city_hidden':True}

def setup(ui):
 if ui.page.evaluate('!!sa.battle'):ui.escape()
 ui.chat('/heal');ui.chat('/charm 100')
 ui.toolbar('宠物')
 assert len(ui.latest['Pets']['pets'])>=5,'copied fixture needs five pets'
 for slot in range(5):
  want='battle' if slot==0 else 'standby'
  for _ in range(3):
   if next(p for p in ui.latest['Pets']['pets'] if p['slot']==slot)['state']==want:break
   ui.action('pet-st'+str(slot))
 ui.back()

def guard_pets(ui):
 # Owner-dead automatic skip may already open the pet menu.
 for slot in range(5,10):
  if not ui.page.evaluate('!!sa.battle || false'):return
  if ui.page.evaluate('(s)=>sa.battle.petSentSlots.has(s)',slot):continue
  if not ui.page.evaluate('(s)=>sa.battle.ownedPets().some(p=>p.a.f.slot===s)',slot):continue
  ui.action('pet-tab-'+str(slot))
  if ui.page.evaluate('sa.ui.getMobileActions().some(h=>h.id==="pw-1")'):ui.action('pw-1')
  else:
   ui.action('pw-0')
   target=ui.page.evaluate('sa.ui.getMobileActions().find(h=>h.id.startsWith("pt-") && Number(h.id.slice(3))>=10)?.id')
   if target:ui.action(target)

def corpse_case(ui,mode,quick):
 # Keep maximum HP large enough that the controlled hit kills without the
 # game's legal >=1.2*MaxHP+20 overkill/fly rule ending the battle immediately.
 ui.chat('/stat 1000 1 0 0');ui.chat('/hp 1');ui.chat('/encount 29011 40');ui.wait_menu()
 start=ui.latest['BattleStart'];begin=len(ui.events)
 assert next(f for f in start['fighters'] if f['slot']==0)['maxHp']>=1000,start
 # Controlled friendly-fire fixture: ordinary legal pet attack commands hit
 # HP1 owner. Damage and death are resolved by the real server, never injected.
 ui.page.evaluate('''()=>{sa.battle.submit('guard',-1);for(const {a} of sa.battle.ownedPets())sa.app.net.send({t:'BattlePetCommand',petSlot:a.f.slot,skill:a.f.slot===5?0:a.f.slot===9?-1:1,target:a.f.slot===5?0:-1});}''')
 ui.page.wait_for_function('sa.battle && sa.battle.turns>=1 && sa.battle.queue.length===0',timeout=90000)
 dead=state(ui);assert any(f['slot']==0 and f['dead'] for f in dead['fighters']),dead
 assert any(f['slot']>=10 and f['hp']>0 for f in dead['fighters']),dead
 initial_events=ui.events[begin:]
 assert not any(m['t']=='BattleEnd' for m in initial_events),initial_events
 assert all(e.get('fly',0)==0 for m in initial_events if m['t']=='BattleTurn' for e in m['events'] if e.get('target')==0),initial_events
 if mode=='desktop':presentation(ui,'desktop')
 ui.snap(f'{mode}-owner-dead-pets-alive')
 begin=len(ui.events)
 try:
  ui.action('battle-quick-toggle' if quick else 'battle-auto-toggle')
 except BaseException:
  (OUT/f'{mode}-strategy-toggle-failure.json').write_text(json.dumps({'state':state(ui),'events':[m for m in ui.events if m['t'] in ('BattleStart','BattleTurn','BattleEnd','AutoPlayState','ChatMsg','Error')]},ensure_ascii=False,indent=2))
  raise
 deadline=time.monotonic()+35;attacks=[]
 while time.monotonic()<deadline:
  ui.page.wait_for_timeout(200)
  attacks=[e for m in ui.events[begin:] if m['t']=='BattleTurn' for e in m['events'] if e.get('actor',-1)>=5 and e.get('actor',99)<10 and e.get('kind') in ('attack','hit','magic','skill') and e.get('damage',0)>0]
  if len({e['actor'] for e in attacks})>=2:break
 (OUT/f'{mode}-strategy-diagnostic.json').write_text(json.dumps({'state':state(ui),'autoplay':ui.latest.get('AutoPlayState'),'turns':[m for m in ui.events[begin:] if m['t']=='BattleTurn'],'events_since_start':[m for m in ui.events if m['t'] in ('BattleStart','BattleTurn','BattleEnd','AutoPlayState','ChatMsg','Error')]},ensure_ascii=False,indent=2))
 assert len({e['actor'] for e in attacks})>=2,'fewer than two surviving pets dealt damage after enabling auto with dead owner'
 ui.snap(f'{mode}-surviving-pets-'+('quick' if quick else 'auto'))
 # Preserve protocol evidence without auth/session messages.
 result={'start':start,'corpse':dead,'pet_damage_events':attacks,'turns':[m for m in ui.events[begin:] if m['t']=='BattleTurn']}
 (OUT/f'{mode}-owner-dead-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 return result

def five_enemy(ui,mode):
 ui.chat('/stat 1000 50 1000 1000');ui.chat('/heal');ui.chat('/warp 300 371 183')
 for attempt in range(35):
  ui.chat('/encount');ui.wait_menu()
  enemies=[f for f in ui.latest['BattleStart']['fighters'] if f['slot']>=10]
  if len(enemies)==5:break
  ui.escape()
 else:raise RuntimeError('No five-enemy area encounter within 35 controlled GM attempts')
 if mode=='desktop':presentation(ui,'desktop')
 ui.snap(f'{mode}-five-enemies-bars-below')
 (OUT/f'{mode}-layout-fixture.json').write_text(json.dumps(ui.page.evaluate('''()=>[...sa.battle.fighters.values()].map(a=>({slot:a.f.slot,x:a.x,y:a.y,homeX:a.homeX,homeY:a.homeY,rect:a.rect,hp:a.hp,maxHP:a.f.maxHp,mp:a.mp,rideHp:a.rideHp}))'''),indent=2))
 # Observe the real popup call; keep an actual rendered canvas at the next two
 # animation frames, without changing HP, damage, animation speed or UI state.
 ui.page.evaluate('''()=>{const b=sa.battle,top=[...b.fighters.values()].filter(a=>a.f.slot>=10).sort((a,c)=>a.homeY-c.homeY)[0];globalThis.damageProbe={slot:top.f.slot};const original=b.popup;b.popup=function(a,now,p){original.call(this,a,now,p);if(a.f.slot===damageProbe.slot&&p.text){damageProbe.text=p.text;requestAnimationFrame(()=>requestAnimationFrame(()=>{damageProbe.png=view.toDataURL('image/png');damageProbe.state={x:a.x,y:a.y,rect:a.rect,text:p.text};}));}};}''')
 top=ui.page.evaluate('damageProbe.slot')
 ui.action('b-attack')
 print('TOP TARGET DIAGNOSTIC',ui.page.evaluate('({selecting:sa.battle?.selecting,sent:sa.battle?.sent,actions:sa.ui.getMobileActions().map(h=>h.id),fighters:[...sa.battle.fighters.values()].map(a=>({slot:a.f.slot,dead:a.dead,rect:a.rect}))})'),flush=True)
 if not ui.page.evaluate('(s)=>sa.ui.getMobileActions().some(h=>h.id==="t-"+s)',top):ui.action('b-attack')
 ui.action('t-'+str(top));guard_pets(ui)
 ui.page.wait_for_function('damageProbe.png',timeout=90000)
 probe=ui.page.evaluate('damageProbe');probe.pop('png',None) # WebGL toDataURL can be blank; real page screenshot below is evidence.
 ui.snap(f'{mode}-top-enemy-hit')
 return {'enemies':enemies,'top_hit':probe,'attempts':attempt+1}

def scenario(meta):
 credential=json.loads(Path(meta['credentials']).read_text());results=[];last=None
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=CHROME,args=[a for a in old.CHROMIUM if not a.startswith(('--renderer-process-limit','--js-flags'))])
  try:
   for mode in (('desktop',) if '--desktop-only' in __import__('sys').argv else ('mobile','desktop')):
    ctx=browser.new_context(viewport={'width':390 if mode=='mobile' else 1280,'height':844 if mode=='mobile' else 900},is_mobile=mode=='mobile',has_touch=True)
    ui=old.UI(ctx.new_page(),'http://127.0.0.1:'+str(meta['port']));ui.enter(credential);setup(ui)
    field_check=field_shortcut(ui) if mode=='mobile' else None
    if '--quick-only' in __import__('sys').argv:top={'previous_final_screenshots':True}
    else:top=five_enemy(ui,mode);ui.escape()
    if mode=='mobile':
     results.append({'mode':mode,'field_shortcut':field_check,'top_enemy':top,'owner_dead':'mobile-auto prior 0bda candidate screenshot; not rerun','errors':ui.errors});ctx.close();continue
    if mode=='desktop' and '--quick-only' not in __import__('sys').argv:presentation(ui,'mobile')
    dead=corpse_case(ui,mode,quick=True)
    # Do not leave automatic intent running when collecting the shutdown point.
    ui.page.evaluate("sa.app.net.send({t:'AutoPlay',encounter:false,autoBattle:false,quick:false,paused:false,settings:''})")
    last=ui.page.evaluate('({id:sa.field.self.id,floor:sa.field.floor,x:sa.field.self.x,y:sa.field.self.y})')
    assert not ui.errors,ui.errors
    results.append({'mode':mode,'field_shortcut':field_check,'top_enemy':top,'owner_dead':dead,'errors':ui.errors});ctx.close()
  finally:browser.close()
 (OUT/'integration-results.json').write_text(json.dumps({'binary_sha256':meta['binary_sha256'],'fixture':'GM-controlled real battles, copied private test DB; not natural gameplay','cases':results},ensure_ascii=False,indent=2)+'\n')
 return last
if __name__=='__main__':run(scenario)
