"""Two real browser clients exercise native trade request and mobile Back. Uses isolated runtime metadata only."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,time,sys,os
meta_path=Path(os.environ.get('SA_RUNTIME','/tmp/sa-release-review-runtime.json'));meta=json.loads(meta_path.read_text());base=f'http://127.0.0.1:{meta["port"]}';out=Path(os.environ.get('SA_REVIEW_OUT',str(Path(__file__).resolve().parent)));out.mkdir(parents=True,exist_ok=True);result={};sent=[[],[]]
with sync_playwright() as pw:
 b=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']);cs=[b.new_context(viewport={'width':1000,'height':750}),b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)];ps=[c.new_page() for c in cs]
 for i,p in enumerate(ps):
  def ws(sock,idx=i):
   def frame(data):
    try:sent[idx].append(json.loads(data))
    except:pass
   sock.on('framesent',frame)
  p.on('websocket',ws)
 def raf(p):p.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 def a(p,id):
  if p.evaluate('document.documentElement.classList.contains("sa-mobile")'):p.locator(f'[data-action="{id}"]').tap()
  else:
   h=p.evaluate('(id)=>sa.ui.getMobileActions().find(h=>h.id===id)',id);r=p.locator('#view').bounding_box();p.mouse.click(r['x']+(h['x1']+h['x2'])/2*r['width']/800,r['y']+(h['y1']+h['y2'])/2*r['height']/600)
  raf(p)
 def wait(p,name):p.wait_for_function('(name)=>sa.screen.constructor.name===name',arg=name,timeout=90000)
 try:
  p=ps[0];p.goto(base+'/?device=desktop');wait(p,'LoginScreen');boxes=p.locator('input');boxes.nth(0).fill(meta['account']);boxes.nth(1).fill(meta['password']);a(p,'ok');wait(p,'LineScreen');a(p,'item0');a(p,'item0');wait(p,'CharSelectScreen');a(p,'login0');wait(p,'FieldScreen');p.wait_for_timeout(400)
  q=ps[1];q.goto(base);wait(q,'LoginScreen')
  if 'trade_account' not in meta:
   a(q,'register');account='peer'+str(int(time.time()))[-6:];password='TradeReview2026!'
   for i,v in enumerate((account,password,password,'fixturesecret')):q.locator('input:visible').nth(i).fill(v)
   a(q,'dlg-ok');wait(q,'LineScreen');a(q,'item0');a(q,'item0');wait(q,'CharSelectScreen');a(q,'new0');a(q,'chr0');a(q,'menu0');wait(q,'MakeEditScreen');q.locator('input:visible').fill('P'+str(int(time.time()))[-6:])
   for _ in range(10):a(q,'a0+')
   a(q,'ok');wait(q,'HomeTownScreen');a(q,'town0');wait(q,'FieldScreen');meta.update(trade_account=account,trade_password=password);meta_path.write_text(json.dumps(meta))
  else:
   q.get_by_label('账号',exact=True).fill(meta['trade_account']);q.get_by_label('密码',exact=True).fill(meta['trade_password']);a(q,'ok');wait(q,'LineScreen');a(q,'item0');a(q,'item0');wait(q,'CharSelectScreen');a(q,'login0');wait(q,'FieldScreen')
  q.wait_for_timeout(500)
  q.locator('#mobile-mode-switch summary').tap();q.locator('#mobile-mode-switch select').select_option('desktop');q.locator('#mobile-mode-switch summary').click();a(q,'fp-menu');q.wait_for_function('sa.ui.getMobileActions().some(h=>h.id==="etc-4")')
  flags=q.evaluate('sa.ui.texts.filter(t=>t.y===162).map(t=>t.text).join("")');print('trade setting',flags,flush=True)
  if 'Ｎ' in flags:a(q,'etc-4')
  a(q,'etc-close');q.locator('#mobile-mode-switch summary').click();q.locator('#mobile-mode-switch select').select_option('mobile');q.locator('#mobile-mode-switch summary').tap();q.wait_for_timeout(200)
  target=q.evaluate('({x:sa.field.self.x,y:sa.field.self.y,name:sa.field.self.name})');dest=[target['x'],target['y']+1]
  h=p.evaluate('([x,y])=>{let [a,b]=sa.field.gridToScreen(x,y,performance.now(),400,324),r=view.getBoundingClientRect();return [r.x+a*r.width/800,r.y+b*r.height/600]}',dest);p.mouse.click(*h);p.wait_for_function('([x,y])=>sa.field.self.x===x&&sa.field.self.y===y&&sa.field.target===null',arg=dest,timeout=15000)
  p.wait_for_timeout(500);h=p.evaluate('([x,y])=>{let [a,b]=sa.field.gridToScreen(x,y,performance.now(),400,324),r=view.getBoundingClientRect();return [r.x+a*r.width/800,r.y+b*r.height/600]}',[target['x'],target['y']]);p.mouse.click(*h,button='right');raf(p);p.keyboard.press('Control+t');p.wait_for_function('sa.screen.menus.trade.open',timeout=5000);q.wait_for_function('sa.screen.menus.trade.open',timeout=5000)
  index=len(sent[1]);q.locator('.mobile-shell-toolbar').get_by_role('button',name='返回',exact=True).tap();q.wait_for_timeout(700);result={'case':'mobile-trade-back','client_trade_open':q.evaluate('sa.screen.menus.trade.open'),'peer_trade_open':p.evaluate('sa.screen.menus.trade.open'),'commands_after_back':sent[1][index:]};q.screenshot(path=str(out/('trade-back-'+sys.argv[1]+'.png')));print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
 except Exception as exc:
  print('FAILED',str(exc),[p.evaluate('({name:sa.field?.self?.name,x:sa.field?.self?.x,y:sa.field?.self?.y,dir:sa.field?.self?.dir,text:sa.ui.texts.map(t=>t.text),trade:sa.screen?.menus?.trade?.open})') for p in ps],flush=True);raise
 finally:
  (out/('trade-'+sys.argv[1]+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');b.close()

if sys.argv[1] != "before":
 assert result.get("client_trade_open") is False and result.get("peer_trade_open") is False, result
 assert any(m.get("t")=="Trade" and m.get("cmd")=="cancel" for m in result["commands_after_back"]), result
