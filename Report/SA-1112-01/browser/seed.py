"""Create an isolated acceptance account using actual mobile UI, never direct protocol injection."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,time,os
runtime=Path(os.environ.get('SA_RUNTIME','/tmp/sa-mobile-acceptance-runtime.json'))
meta=json.loads(runtime.read_text());out=Path(__file__).resolve().parent
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{meta["port"]}/')
    page.wait_for_function('globalThis.sa && sa.screen.constructor.name === "LoginScreen"',timeout=90000)
    def action(id):
        page.locator(f'[data-action="{id}"]').tap();page.wait_for_timeout(150)
    action('register');inputs=page.locator('input:visible');assert inputs.count()==4
    account='accept'+str(int(time.time()))[-7:];password='BrowserFixture2026!'
    for i,value in enumerate((account,password,password,'fixturesecret')):inputs.nth(i).fill(value)
    action('dlg-ok');page.wait_for_function('sa.screen.constructor.name === "LineScreen"')
    action('item0');action('item0');page.wait_for_function('sa.screen.constructor.name === "CharSelectScreen"')
    action('new0');action('chr0');action('menu0');page.wait_for_function('sa.screen.constructor.name === "MakeEditScreen"')
    page.locator('input:visible').fill('手机测试')
    for _ in range(10):action('a0+')
    action('ok');page.wait_for_function('sa.screen.constructor.name === "HomeTownScreen"');action('town0')
    page.wait_for_function('sa.screen.constructor.name === "FieldScreen" && sa.field.self',timeout=30000)
    page.wait_for_timeout(500)
    page.screenshot(path=str(out/'seed-real-field.png'))
    state=page.evaluate('({name:sa.field.self.name,floor:sa.field.floor,position:[sa.field.self.x,sa.field.self.y]})')
    assert not errors,errors
    Path('/tmp/sa-mobile-acceptance-account.json').write_text(json.dumps({'account':account,'password':password,'runtime':str(runtime)}))
    (out/'seed.json').write_text(json.dumps({'created_through_real_mobile_ui':True,'state':state,'page_errors':errors},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(state,ensure_ascii=False));browser.close()
