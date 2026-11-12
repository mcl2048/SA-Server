from pathlib import Path
from playwright.sync_api import sync_playwright
import json,time
out=Path(__file__).resolve().parent;meta=json.loads(Path('/tmp/sa-release-final-runtime.json').read_text());account=json.loads(Path('/tmp/sa-release-final-account.json').read_text());base=f'http://127.0.0.1:{meta["port"]}'
cases=[];errors=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader']);context=browser.new_context(viewport={'width':320,'height':740},is_mobile=True,has_touch=True);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    def action(id):page.locator(f'[data-action="{id}"]').tap();page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def tool(text):page.locator('.mobile-shell-toolbar').get_by_role('button',name=text,exact=True).tap();page.wait_for_timeout(100)
    def chat(text):
        tool('聊天');page.locator('input:visible').fill(text);page.get_by_role('button',name='发送聊天',exact=True).tap();page.wait_for_timeout(400)
    try:
        page.goto(base+'/');page.wait_for_function('globalThis.sa && sa.screen.constructor.name==="LoginScreen"',timeout=90000)
        action('register');page.wait_for_timeout(150);assert page.locator('input:visible').count()==4
        for el in page.locator('.mobile-shell-actions button').all():r=el.bounding_box();assert r['width']>=44 and r['height']>=44
        page.screenshot(path=str(out/'final-register-320.png'));action('dlg-cancel')
        page.get_by_label('账号',exact=True).fill(account['account']);page.get_by_label('密码',exact=True).fill(account['password']);action('ok');page.wait_for_function('sa.screen.constructor.name==="LineScreen"');action('item0');action('item0');page.wait_for_function('sa.screen.constructor.name==="CharSelectScreen"')
        action('new1');action('chr1');page.wait_for_timeout(300);page.screenshot(path=str(out/'final-character-preview-320.png'));action('menu3');action('back');action('login0');page.wait_for_function('sa.screen.constructor.name==="FieldScreen" && sa.field.self')
        for text in ('状态','系统'):
            r=page.locator('.mobile-shell-toolbar').get_by_role('button',name=text,exact=True).bounding_box();assert r['width']>=44 and r['height']>=44 and r['y']+r['height']<=740
        cases.append({'case':'320px-register-character-preview-and-field-controls','pass':True})
        chat('/warp 1006 15 22')
        npcs=page.evaluate('Array.from(sa.field.actors.values()).filter(a=>a.kind==="npc").map(a=>({name:a.name,x:a.x,y:a.y})).sort((a,b)=>Math.hypot(a.x-15,a.y-22)-Math.hypot(b.x-15,b.y-22))')
        nearest=next(n for n in npcs if '家族管理员' in n['name']);chat(f'/warp 1006 {nearest["x"]} {nearest["y"]+1}')
        page.get_by_role('button',name='交互',exact=True).tap();page.wait_for_function('sa.ui.getMobileActions().some(h=>h.id.startsWith("npc-") || h.id.startsWith("modal-"))',timeout=10000)
        page.screenshot(path=str(out/'final-npc-320.png'));text=page.locator('.mobile-shell').inner_text();assert len(text)>10
        cases.append({'case':'npc-native-interact-readable-dialog','pass':True,'npc':nearest,'text':text})
        # Visible touch alternative follows the native Escape/cancel handler.
        page.get_by_role('button',name='返回 / 取消对话',exact=True).tap()
        page.wait_for_function('!sa.ui.getMobileActions().some(h=>h.id.startsWith("npc-"))',timeout=5000)
        cases.append({'case':'npc-visible-touch-cancel-route','pass':True})
        assert not errors,errors
    except Exception as exc:
        cases.append({'case':'failure','pass':False,'error':str(exc),'text':page.locator('body').inner_text()});page.screenshot(path=str(out/'extras-failure.png'));raise
    finally:
        (out/'extras.json').write_text(json.dumps({'cases':cases,'page_errors':errors},ensure_ascii=False,indent=2)+'\n');browser.close()
