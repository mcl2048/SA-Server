"""Use the rail mouse keys and native selection in a real server battle."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
out=Path(__file__).resolve().parent;meta=json.loads(Path('/tmp/sa-layout-runtime.json').read_text());account=json.loads(Path('/tmp/sa-layout-account.json').read_text());sent=[];errors=[];cases=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader']);page=browser.new_page(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
    page.on('pageerror',lambda e:errors.append(str(e)))
    def socket(ws):
        def frame(x):
            try:sent.append(json.loads(x))
            except (ValueError,TypeError):pass
        ws.on('framesent',frame)
    page.on('websocket',socket)
    def settle():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def action(id):page.locator(f'[data-action="{id}"]').tap();settle()
    def tool(label):page.locator('.mobile-shell-toolbar').get_by_role('button',name=label,exact=True).tap();settle()
    def chat(text):tool('聊天');page.locator('input:visible').fill(text);page.get_by_role('button',name='发送聊天',exact=True).tap();page.wait_for_timeout(200)
    def ensure_target():
        page.wait_for_function('sa.battle && !sa.battle.sent && !sa.battle.end && sa.battle.queue.length===0 && sa.battle.menuAt>0 && sa.battle.vnow-sa.battle.menuAt>=25*1000/60',timeout=30000)
        if not page.evaluate('sa.ui.getMobileActions().some(h=>/^t-/.test(h.id))'):action('b-attack')
        page.locator('[data-action^="t-"]').first.wait_for()
    try:
        page.goto(f'http://127.0.0.1:{meta["port"]}/');page.wait_for_function('globalThis.sa && sa.screen.constructor.name==="LoginScreen"',timeout=90000);page.get_by_label('账号',exact=True).fill(account['account']);page.get_by_label('密码',exact=True).fill(account['password']);action('ok');page.wait_for_function('sa.screen.constructor.name==="LineScreen"');action('item0');action('item0');action('login0');page.wait_for_function('sa.screen.constructor.name==="FieldScreen" && sa.field.self')
        chat('/warp 1000 47 82');chat('/encount 9 1');page.wait_for_function('sa.battle && !sa.battle.quick && sa.battle.queue.length===0 && sa.battle.menuAt>0',timeout=30000);page.locator('[data-action="b-attack"]').wait_for(timeout=20000);ensure_target()
        start=len(sent);page.get_by_role('button',name='鼠标右键',exact=True).tap();page.wait_for_function('sa.battle && !sa.battle.selecting && !sa.ui.getMobileActions().some(h=>/^t-/.test(h.id))');assert not any(m.get('t')=='BattleCommand' for m in sent[start:]);cases.append({'case':'right-mouse-cancels-native-battle-target-without-command','pass':True})
        ensure_target()
        for _ in range(40):
            page.get_by_role('button',name='下一个选项',exact=True).tap();settle()
            if page.evaluate('sa.ui.hot.startsWith("t-")'):break
        selected=page.evaluate('sa.ui.hot');assert selected.startswith('t-');page.screenshot(path=str(out/'landscape-battle-navigation.png'));start=len(sent);page.get_by_role('button',name='鼠标左键',exact=True).tap();page.wait_for_timeout(250);commands=[m for m in sent[start:] if m.get('t')=='BattleCommand'];assert len(commands)==1 and commands[0]['kind']=='attack',commands;cases.append({'case':'option-navigation-and-left-mouse-submit-native-battle-target','pass':True,'selected':selected,'command':commands[0]})
        for turn in range(10):
            page.wait_for_function('!sa.battle || (sa.battle.turns >= '+str(turn+1)+' && sa.battle.queue.length===0 && sa.battle.menuAt>0)',timeout=60000)
            if page.evaluate('!sa.battle'):break
            ensure_target();action(page.locator('[data-action^="t-"]').first.get_attribute('data-action'))
        page.wait_for_function('!sa.battle',timeout=45000);assert not errors;cases.append({'case':'battle-completes-and-returns-to-field','pass':True})
    except Exception:
        page.screenshot(path=str(out/'battle-controls-failure.png'))
        (out/'battle-controls-debug.json').write_text(json.dumps(page.evaluate('({body:document.body.innerText,hits:sa.ui.getMobileActions(),battle:sa.battle?{mode:sa.battle.mode,menuAt:sa.battle.menuAt,quick:sa.battle.quick,queue:sa.battle.queue.length,turns:sa.battle.turns}:null,hot:sa.ui.hot})'),ensure_ascii=False,indent=2)+'\n');raise
    finally:
        (out/'battle-controls.json').write_text(json.dumps({'binary_sha256':meta['sha256'],'cases':cases,'page_errors':errors},ensure_ascii=False,indent=2)+'\n');browser.close()
print(json.dumps(cases,ensure_ascii=False))
