"""Real Chromium UI: account login isolation, second character, background badge.
Uses the current-batch private runtime. No direct network mutation or SQL seeding.
"""
from pathlib import Path
import json,time
from unittest.mock import patch
from playwright.sync_api import sync_playwright,BrowserType
import acceptance as adapter
old=adapter.previous

def chars(ui,c):
 ui.load();ui.page.get_by_label('账号',exact=True).fill(c['account']);ui.page.get_by_label('密码',exact=True).fill(c['password']);ui.action('ok')
 ui.page.wait_for_function('sa.screen.constructor.name!=="LoginScreen"',timeout=30000)
 deadline=time.monotonic()+60
 while time.monotonic()<deadline:
  name=ui.page.evaluate('sa.screen.constructor.name');print('Login screen',name,flush=True)
  if name=='CharSelectScreen':ui.settle();return
  if name=='LineScreen':ui.action('item0')
  else:ui.page.wait_for_timeout(300)
 raise RuntimeError('Character selection not reached')

def main():
 meta=json.loads(old.META.read_text());c=json.loads(Path(meta['credentials']).read_text());base='http://127.0.0.1:'+str(meta['port'])
 with patch.object(BrowserType,'launch',adapter.current_launch),sync_playwright() as pw:
  browser=pw.chromium.launch(args=[a for a in old.CHROMIUM if not a.startswith(('--renderer-process-limit','--js-flags'))])
  print('Chromium multi-role launched',flush=True)
  options={'viewport':{'width':390,'height':844},'is_mobile':True,'has_touch':True}
  contexts=[]
  def ui():
   ctx=browser.new_context(**options);contexts.append(ctx);return old.UI(ctx.new_page(),base)
  try:
   a=ui();a.enter(c);first=a.page.evaluate('sa.field.self.id')
   b=ui();chars(b,c)
   assert a.page.evaluate('!!sa.field?.self && sa.screen.constructor.name==="FieldScreen"'),'account login displaced first role'
   b.snap('multirole-first-stays-online')
   if b.page.evaluate('sa.app.chars.length<2'):
    b.action('new1');b.action('chr0');b.action('menu0');b.page.wait_for_function('sa.screen.constructor.name==="MakeEditScreen"');b.page.locator('input:visible').fill(c['character'][:6]+'B')
    for _ in range(10):b.action('a0+',50)
    b.action('ok');b.page.wait_for_function('sa.screen.constructor.name==="HomeTownScreen"');b.action('town0')
   else:b.action('login1')
   b.page.wait_for_function('!!sa.field?.self',timeout=60000)
   second=b.page.evaluate('sa.field.self.id');assert first!=second
   a.chat('/charm 100');assert a.page.evaluate('!!sa.field?.self'),'second role displaced first role'
   a.chat('/warp 300 371 183');a.chat('/heal')
   a.toolbar('系统');a.action('sys-ai')
   for action in ['ai-auto','ai-quick','ai-enc']:a.action(action+'-val')
   a.back();a.page.wait_for_function('sa.battle || sa.field?.self',timeout=30000)
   a.snap('multirole-autoplay-before-disconnect')
   contexts[0].close()
   d=ui();chars(d,c)
   d.page.wait_for_function('sa.app.chars.some(c=>c.online && c.background)',timeout=15000)
   d.snap('multirole-background-badge');presence=d.page.evaluate('sa.app.chars.map(c=>({id:c.id,online:c.online,background:c.background}))')
   d.action('login0');d.page.wait_for_function('!!sa.field?.self',timeout=60000)
   assert d.page.evaluate('sa.field.self.id')==first
   assert b.page.evaluate('sa.field.self.id')==second
   d.snap('multirole-resume-first-role')
   d.toolbar('系统');d.action('sys-ai')
   for action in ['ai-enc','ai-quick','ai-auto']:d.action(action+'-val')
   d.back()
   errors=a.errors+b.errors+d.errors;assert not errors,errors
   (old.OUT/'multirole.json').write_text(json.dumps({'binary_sha256':meta['binary_sha256'],'first':first,'second':second,'presence':presence,'errors':errors},ensure_ascii=False,indent=2))
   print('PASS UI multi-role isolation, background badge and resume')
  finally:browser.close()
if __name__=='__main__':main()
