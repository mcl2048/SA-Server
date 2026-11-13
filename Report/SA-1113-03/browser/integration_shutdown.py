"""Independent final ELF HTTP + explicit SIGTERM/DB-position verification."""
from integration_battle import old,CHROME
from runtime_integration import run,OUT
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

def callback(meta):
 c=json.loads(Path(meta['credentials']).read_text())
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=CHROME,args=old.CHROMIUM)
  try:
   ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
   ui=old.UI(ctx.new_page(),'http://127.0.0.1:'+str(meta['port']));ui.enter(c)
   ui.chat('/warp 300 371 183')
   ui.page.wait_for_function('sa.field.floor===300 && sa.field.self.x===371 && sa.field.self.y===183',timeout=15000)
   pos=ui.page.evaluate('({id:sa.field.self.id,floor:sa.field.floor,x:sa.field.self.x,y:sa.field.self.y})')
   assert not ui.errors,ui.errors
   ui.snap('final-runtime-position')
   return pos
  finally:b.close()
if __name__=='__main__':run(callback)
