"""Real minimap click -> server position arrival, plus wall rejection."""
from pathlib import Path
import json
from unittest.mock import patch
from playwright.sync_api import sync_playwright,BrowserType
import acceptance as adapter
old=adapter.previous

def main():
 meta=json.loads(old.META.read_text());c=json.loads(Path(meta['credentials']).read_text());base='http://127.0.0.1:'+str(meta['port'])
 with patch.object(BrowserType,'launch',adapter.current_launch),sync_playwright() as pw:
  browser=pw.chromium.launch(args=old.CHROMIUM)
  try:
   context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
   ui=old.UI(context.new_page(),base);ui.enter(c)
   assert ui.page.evaluate('sa.field.minimapReveal===true'),'Hello did not enable full minimap reveal'
   ui.chat('/warp 300 371 183')
   ui.chat('/noenc')
   if '不会遇敌' not in ui.latest.get('ChatMsg',{}).get('text',''):ui.chat('/noenc')
   ui.toolbar('地图');ui.action('map-mini');ui.back()
   ui.page.wait_for_function('sa.ui.getMobileActions().some(h=>h.id==="mini-navigate")',timeout=30000)
   # Read actual map/path data to select a reachable target requiring a detour.
   # All movement below is produced by browser pointer events, never navigateTo.
   choice=ui.page.evaluate('''async()=>{const f=sa.field; const module=await import([...document.querySelectorAll('script[type="module"]')][0].src.replace(/main\\.js.*/, 'pathfinding.js'));const {gridPath}=module;
    const sx=f.self.x,sy=f.self.y;let target=null,wall=null;
    for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++){
     const x=sx+dx,y=sy+dy,k=y*f.width+x;if(x<0||y<0||x>=f.width||y>=f.height)continue;
     if(!wall && f.walk[k]===1 && Math.abs(dx)+Math.abs(dy)>3)wall={x,y};
     if(f.walk[k]!==2 || Math.max(Math.abs(dx),Math.abs(dy))<5)continue;
     const p=gridPath(f.width,f.height,f.walk,sx,sy,x,y);
     if(p && p.length>Math.max(Math.abs(dx),Math.abs(dy))+1 && (!target || p.length<target.length))target={x,y,length:p.length};
    }return {start:{x:sx,y:sy},target,wall};}''')
   assert choice['target'] and choice['wall'],choice
   def click(target):
    point=ui.page.evaluate('''t=>{const h=sa.ui.getMobileActions().find(h=>h.id==='mini-navigate'),r=view.getBoundingClientRect(),m=sa.field.self,dx=t.x-m.x,dy=t.y-m.y;return {x:r.x+((h.x1+h.x2)/2+3*(dx+dy))*r.width/800,y:r.y+((h.y1+h.y2)/2+2.25*(dy-dx))*r.height/600};}''',target)
    ui.page.mouse.click(point['x'],point['y'])
   print('Minimap choice',choice,flush=True)
   click(choice['target'])
   try:ui.page.wait_for_function('t=>sa.field.self.x===t.x && sa.field.self.y===t.y && sa.field.navigationStatus.includes("已到达")',arg=choice['target'],timeout=45000)
   except Exception:
    print('Navigation failed state',ui.page.evaluate('({x:sa.field.self.x,y:sa.field.self.y,status:sa.field.navigationStatus,target:sa.field.target,path:sa.field.path,battle:!!sa.battle,pending:[...sa.field.pending],width:sa.field.width,height:sa.field.height,loadedTotal:sa.field.walk.reduce((n,v)=>n+(v>0),0)})'),flush=True);ui.snap('minimap-debug-failed');raise
   ui.snap('minimap-detour-arrived');arrived=ui.page.evaluate('({x:sa.field.self.x,y:sa.field.self.y,status:sa.field.navigationStatus})')
   # Select a wall within the new minimap footprint.
   wall=ui.page.evaluate('''()=>{const f=sa.field,s=f.self;for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){const x=s.x+dx,y=s.y+dy;if(x>=0&&y>=0&&x<f.width&&y<f.height&&f.walk[y*f.width+x]===1)return{x,y};}}''')
   assert wall;click(wall);ui.page.wait_for_function('sa.field.navigationStatus.includes("不可达")',timeout=15000);ui.snap('minimap-wall-unreachable')
   assert not ui.errors,ui.errors
   (old.OUT/'minimap.json').write_text(json.dumps({'binary_sha256':meta['binary_sha256'],'fullReveal':True,'choice':choice,'arrival':arrived,'wall':wall,'feedback':ui.page.evaluate('sa.field.navigationStatus'),'errors':ui.errors},ensure_ascii=False,indent=2));print('PASS real minimap detour arrival and wall feedback')
  finally:browser.close()
if __name__=='__main__':main()
