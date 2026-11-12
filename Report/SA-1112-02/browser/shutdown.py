"""Final ELF online SIGTERM check. Reads only isolated SQLite; changes game via UI."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,sqlite3,os,signal,hashlib
out=Path(__file__).resolve().parent
meta=json.loads(Path('/tmp/sa-release-final-runtime.json').read_text());account=json.loads(Path('/tmp/sa-release-final-account.json').read_text())
runtime=Path(meta['dir']).resolve();assert runtime.parent==Path('/tmp') and runtime.name.startswith('sa-input-review-')
def stored():
    with sqlite3.connect(runtime/'test.db') as db:
        return list(db.execute('SELECT c.floor,c.x,c.y FROM characters c JOIN accounts a ON c.account_id=a.id WHERE a.name=? AND c.deleted=0 ORDER BY c.id',(meta['gm_account'],)).fetchone())
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);sockets=[];page.on('websocket',lambda ws:sockets.append(ws))
    page.goto(f'http://127.0.0.1:{meta["port"]}/');page.wait_for_function('globalThis.sa && sa.screen.constructor.name==="LoginScreen"',timeout=90000)
    def action(id):
        page.locator(f'[data-action="{id}"]').tap();page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    page.get_by_label('账号',exact=True).fill(account['account']);page.get_by_label('密码',exact=True).fill(account['password']);action('ok');page.wait_for_function('sa.screen.constructor.name==="LineScreen"');action('item0');action('item0');action('login0');page.wait_for_function('sa.screen.constructor.name==="FieldScreen" && sa.field.self')
    before=stored();destination=[1000,47,82] if before[0]!=1000 else [1006,15,22]
    page.locator('.mobile-shell-toolbar').get_by_role('button',name='聊天',exact=True).tap();page.locator('input:visible').fill('/warp '+' '.join(map(str,destination)));page.get_by_role('button',name='发送聊天',exact=True).tap()
    page.wait_for_function('(p)=>sa.field.floor===p[0] && sa.field.self.x===p[1] && sa.field.self.y===p[2]',arg=destination)
    before_shutdown=stored();assert before_shutdown!=destination,'Fixture was persisted early and cannot prove shutdown flush'
    proc=Path('/proc')/str(meta['pid']);assert (proc/'cwd').resolve()==runtime
    assert hashlib.sha256((proc/'exe').read_bytes()).hexdigest()==meta['sha256']
    with sockets[-1].expect_event('close',timeout=10000):os.kill(meta['pid'],signal.SIGTERM)
    # World shutdown closes online clients after draining its save queue.
    page.wait_for_function('()=>fetch("/").then(()=>false).catch(()=>true)',timeout=10000)
    after=stored();assert after==destination,(before_shutdown,after,destination)
    result={'binary_sha256':meta['sha256'],'online_socket_kept_until_SIGTERM':True,'database_before':before_shutdown,'in_memory_position':destination,'database_after_shutdown':after,'position_flushed':True,'gameplay_through_real_UI':True}
    (out/'shutdown.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));browser.close()
