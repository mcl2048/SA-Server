"""Native desktop login, line/character selection and field rendering."""
from pathlib import Path
import json
from unittest.mock import patch
from playwright.sync_api import sync_playwright,BrowserType
import acceptance as adapter
old=adapter.previous

def load_desktop(self):
 self.page.goto(self.base+'/?device=desktop');self.page.wait_for_function('globalThis.sa && sa.screen.constructor.name==="LoginScreen"',timeout=90000);self.settle()

def main():
 meta=json.loads(old.META.read_text());c=json.loads(Path(meta['credentials']).read_text())
 with patch.object(BrowserType,'launch',adapter.current_launch),patch.object(old.UI,'load',load_desktop),sync_playwright() as p:
  b=p.chromium.launch(args=old.CHROMIUM)
  try:
   ctx=b.new_context(viewport={'width':1280,'height':900});ui=old.UI(ctx.new_page(),'http://127.0.0.1:'+str(meta['port']));ui.enter(c)
   ui.page.wait_for_function('!!sa.field?.self',timeout=60000);ui.snap('desktop-native-login-field')
   assert not ui.errors,ui.errors
   (old.OUT/'desktop-login.json').write_text(json.dumps({'binary_sha256':meta['binary_sha256'],'mode':'native-desktop','viewport':{'width':1280,'height':900},'field':ui.page.evaluate('({id:sa.field.self.id,floor:sa.field.floor,x:sa.field.self.x,y:sa.field.self.y})'),'errors':ui.errors},indent=2));print('PASS native desktop login/select/field')
  finally:b.close()
if __name__=='__main__':main()
