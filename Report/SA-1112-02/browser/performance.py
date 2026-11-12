"""Measure idle DOM work against SA_RUNTIME, without changing application state."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os
meta=json.loads(Path(os.environ.get('SA_RUNTIME','/tmp/sa-release-review-runtime.json')).read_text())
output=Path(os.environ.get('SA_PERF_OUT',str(Path(__file__).with_name('performance-after.json'))))
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{meta["port"]}/');page.wait_for_function('globalThis.sa && sa.screen.constructor.name==="LoginScreen"',timeout=90000);page.wait_for_timeout(300)
    page.evaluate('''()=>{globalThis.mutationCounts={total:0,attributes:0,childList:0,byAttribute:{}};new MutationObserver(rs=>{for(const r of rs){mutationCounts.total++;mutationCounts[r.type]++;if(r.type==='attributes')mutationCounts.byAttribute[r.attributeName]=(mutationCounts.byAttribute[r.attributeName]||0)+1}}).observe(document.querySelector('#mobile-root'),{subtree:true,attributes:true,childList:true,characterData:true});}''')
    session=context.new_cdp_session(page);session.send('Performance.enable')
    before={x['name']:x['value'] for x in session.send('Performance.getMetrics')['metrics']};page.wait_for_timeout(1500)
    after={x['name']:x['value'] for x in session.send('Performance.getMetrics')['metrics']}
    report={'idle_ms':1500,'mutations':page.evaluate('mutationCounts'),'metrics_delta':{k:after[k]-before[k] for k in ('LayoutCount','RecalcStyleCount','ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration')},'page_errors':errors}
    output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
    assert not errors
    assert report['mutations']['total']<10,'Idle presentation is still rewriting DOM'
    browser.close()
