"""Render the reviewed delivery from fresh machine-readable verification evidence."""
from pathlib import Path
import html
import json

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
r = json.loads((OUT / 'release.json').read_text())
b = json.loads((OUT / 'browser/final.json').read_text())
c = json.loads((OUT / 'checks-status.json').read_text())
assert r['success'] and c['success'] and not b.get('failure')
checks = '\n'.join(f"| {x['device']} | {x['name']} | 通过 |" for x in b['checks'])
routes = '\n'.join(f"| {x['device']} | {x['name']} | {x['evidence']['moves']} | {x['evidence']['seconds']:.3f} |"
                   for x in b['checks'] if 'seconds' in x['evidence'] and 'moves' in x['evidence'])
acceptance = f'''# SA-1121-01 · v0.2.23-LYNX 验收

基线 `5ffb526e98286b31a4b9a1f33a23aab1ee966a7e`，日期2026-11-21。两项核心修复均完成，产物由同一源码与客户端构建并核验。未部署或重启生产。

## 战后经验

原移植的基础表只含100级，自动经验敌人超出表长即为0。恢复两个独立原作仓库一致的完整200项表，前100项逐值保留；200级之后以末段55/级兼容延伸，并在乘法前检查溢出、饱和到32位上限。这是本项目兼容策略，不声称原表含200级以上数据。

另修显式零经验在等级差折算时被抬成1。全域真实2,984条敌人、2,143条自动奖励与13,244个实际等级点均检查，修复后非正自动经验0。实际结算、培养、队伍、显式零、退出与SQLite落盘的红绿证据见[经验报告](EXPERIENCE.md)。

有效旧版Chromium复现130/140吉比胜利XP0；旧脚本曾使用无效的/level，人物保持100级，该复现不能当作同等级数值认证。最终使用原生/lv并检查Status，火城130/140级奖励3,587/4,076，泪之海130/140级3,341/4,076，140级人物击败80级漩涡显式0事件仍为0。普通动画自动战斗和快速自动战斗都以真实BattleEnd验收。

## 小地图导航

旧版把中途warp一概阻挡，且目录不提供同图传送边；因此817全图240,000格加载后，从(146,19)到宝箱(148,35)仍不可达。新实现保留普通A*，失败后才对服务端提供的有效无条件warp做分帧Dijkstra。支持同图传送及经相邻floor返回原floor另一片区域的两段通路。

每段只执行首个步行部分，精确匹配权威EnterFloor的floor、x、y后续行；返回通路保留原NPC/出口目标。多边共源保留具体选择，手动／新目标、普通战斗、锁定／跟随与错误落点取消旧意图，快速战斗保留时重新规划首段。长路线有循环／跳数保护。114个实际入口／目标的网格模型中110个到达或已在入口；其余4组703/704样本的12个入口，在全1382层、5677条无条件及89条条件分支的宽松原生传送图中仍全部无路。该上界纳入墙格落点及直接相邻warp，查询端点均有真实普通区域；对话、交通NPC和道具动作未建模，不能据此推断任务资格，也不能虚构捷径改变原地图。详细分类见[导航报告](NAVIGATION.md)。真实桌面／移动覆盖817NPC与出口、702→703→702到NPC、701普通路线和手动方向取消，逐场记录实际Move、EnterFloor与零PosCorrect。

静态连通网格与BFS队列只临时分配；长期缓存端点连通ID。全域审计、最终冷／热成本与独立复审见[导航报告](NAVIGATION.md)、[独立复审](NAVIGATION-REVIEW.md)，不可把纯ID字节数当作包含Go map开销的总堆占用，也不可把热查表纳秒数当作完整请求耗时。优化后端点缓存4746个区域ID的纯payload为18,984B；全目录一次构建GC后保留堆增量约1.20MB，临时总分配约111.95MB，均为受控探针。当前层首次目录仍在世界循环同步分析，冷请求wall会受负载影响；独立817测得211.487ms，另保留并发轮772.617ms。没有宣称冷请求零阻塞或生产吞吐同比提升。分帧大图不可达模型曾需930–1054帧，60Hz下理论15.5–17.6秒，不是硬实时保证。

## 最终检查

| 检查 | 结果 |
| --- | --- |
| 客户端／构建测试 | {r['client_tests']}项通过，0失败 |
| 全src TypeScript | 通过 |
| 全部Go test／race／vet | 完整执行通过，源码前后摘要稳定 |
| 最终真实Chromium | {len(b['checks'])}项，页面错误0 |
| HTTP实际内嵌客户端与素材 | {r['http_files']}个文件逐字节匹配，gzip／HEAD／ETag／私有路径边界通过 |
| 重复构建 | 两次ELF SHA-256相同 |
| ZIP | {r['package']['files']}文件逐字节匹配公开白名单，CRC／执行位／摘要通过 |
| StoneAge Skill | 仓库版与安装版同步，quick_validate通过 |

完整命令与日志：[checks-status.json](checks-status.json)、[client-tests.txt](client-tests.txt)、[go-test.txt](go-test.txt)、[go-race.txt](go-race.txt)、[go-vet.txt](go-vet.txt)、[typescript.txt](typescript.txt)。

| 设备模拟 | 实际业务验收 | 结果 |
| --- | --- | --- |
{checks}

| 设备模拟 | 最终长路线 | 实际Move | 观测秒数 |
| --- | --- | ---: | ---: |
{routes}

上述秒数从目录选择前计时至到达截图完成，包含UI交互、规划、服务器逐步移动、软件GPU与渲染等待；不是纯规划CPU，也不是实体手机性能承诺。最终每条路线均无PosCorrect。

最终浏览器：[final.json](browser/final.json)、[完整输出](browser/final-run.txt)。正常SIGTERM退出0、最终人物位置落盘一致。HTTP独立实例也正常SIGTERM退出0。构建源码／client/dist／内嵌static由[production-inputs.json](production-inputs.json)绑定；最终ELF SHA-256：`{r['binary_sha256']}`。

## 交付与限制

最新静态Linux AMD64为bin/saserver，完整ZIP为`{r['package']['path']}`，旧ZIP已在校验后替换。ZIP SHA-256：`{r['package']['sha256']}`。完整字节与文件数见[release.json](release.json)。无新增Assets、数据库迁移或空素材补丁，保留既有独立素材包；原始Assets、测试账号、数据库、凭据、日志与会话数据不提交。

移动为真实Chromium的390×844触屏／视口模拟及844×390横屏，使用SwiftShader软件GPU；未认证实体Android/iOS/Safari。浏览器经验验证使用隔离原始数据与原生GM命令定点召唤，未冒充生产自然随机遭遇。全域数据/图审计不能替代每个任务状态、NPC对话和世界路线的穷举实机认证。条件、任务、随机及对话传送继续由服务端决定；不是任意多层世界寻路。水中扣血等原生规则保留。

基线低HP被水中送岸与状态等待不足、脚本校正等中间结果保留，不计入最终成功。第一次最终桌面矩阵完成业务断言后，清理AI设置时读到过期关闭热区而中断；该轮以candidate-close-race完整保留，修正脚本后重新执行全部桌面／移动场景。只有窗口实际关闭且对应热区消失时才接受该竞态，未放宽业务断言。具体过程见[PROGRESS.md](PROGRESS.md)。最终仅采用匹配ELF、完整场景且正常退出的结果。用户原Prompt修改保留，核心任务勾选与执行结果由本轮追加。
'''
(OUT / 'ACCEPTANCE.md').write_text(acceptance)
rows = ''.join(f"<tr><td>{html.escape(x['device'])}</td><td>{html.escape(x['name'])}</td><td class='ok'>通过</td></tr>" for x in b['checks'])
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SA-1121-01 · 经验与归途</title>
<style>
:root{--paper:#f4f1e8;--ink:#18332f;--muted:#65746b;--line:#c9d0c0;--accent:#b15131;--green:#266047}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.8 system-ui,"Noto Sans CJK SC",sans-serif}main{max-width:1240px;margin:auto;padding:40px 6vw 70px}nav{display:flex;gap:24px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:18px;letter-spacing:.13em;font-size:12px}nav span{margin-left:auto}.kicker{font-size:13px;letter-spacing:.18em;color:var(--accent);margin-top:65px}h1{font-size:clamp(44px,7vw,84px);font-weight:650;letter-spacing:-.05em;line-height:1.15;margin:18px 0 24px}h1 em{font-style:normal;color:var(--green)}.lead{max-width:780px;font-size:19px;color:#435c50}.metrics{display:grid;grid-template-columns:repeat(4,1fr);margin:45px 0 60px;border-block:1px solid var(--line)}.metric{padding:24px 12px 24px 0}.metric b{display:block;font-size:35px;letter-spacing:-.04em}.metric small{font-size:12px;color:var(--muted)}section{margin-top:58px}h2{font-size:29px;line-height:1.4;margin:0 0 22px;font-weight:600}h2 small{display:block;color:var(--accent);font-size:11px;letter-spacing:.15em;font-weight:500;margin-bottom:10px}.two{display:grid;grid-template-columns:1fr 1fr;gap:38px}.note{border-left:3px solid var(--accent);padding-left:20px;color:#576359}.route{padding:25px;background:#e6ebdf;border:1px solid var(--line);font-size:18px;font-weight:550}.route small{display:block;font-size:13px;font-weight:400;color:var(--muted)}a{color:var(--green);text-underline-offset:4px}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;border-bottom:1px solid var(--line);padding:12px 14px 12px 0}th{font-size:12px;color:var(--muted);font-weight:500}.ok{white-space:nowrap;color:var(--green)}.shots{display:grid;grid-template-columns:2fr 1fr;gap:20px;align-items:start}.shots img{width:100%;display:block;border:1px solid var(--line);background:#19372c}figure{margin:0}figcaption{color:var(--muted);font-size:12px;margin-top:8px}code{font-size:12px;overflow-wrap:anywhere}footer{border-top:1px solid var(--line);margin-top:60px;padding-top:20px;font-size:12px;color:var(--muted)}.links{display:flex;gap:20px;flex-wrap:wrap;margin-top:25px}@media(max-width:700px){main{padding:22px 22px 45px}.kicker{margin-top:42px}.metrics{grid-template-columns:1fr 1fr;margin-bottom:40px}.metric b{font-size:30px}.two,.shots{grid-template-columns:1fr}.shots figure:last-child{max-width:390px;margin:auto}td{font-size:12px}nav{gap:10px;font-size:10px}}
</style><main><nav><b>STONE AGE / ENGINEERING</b><span>2026.11.21 · v0.2.23-LYNX</span></nav>
<p class="kicker">SA-1121-01 · VERIFIED RELEASE</p><h1>经验回归，<br><em>归途畅通。</em></h1><p class="lead">恢复高等级战斗奖励，让小地图导航读懂原生传送。以真实游戏数据、独立复审与最终程序上的浏览器操作验证两项修复。</p>
<div class="metrics"><div class="metric"><b>13,244</b><small>实际自动经验等级点 · 全量检查</small></div><div class="metric"><b>@@TESTS@@</b><small>客户端与构建回归 · 0失败</small></div><div class="metric"><b>@@BROWSER@@</b><small>最终Chromium业务验证</small></div><div class="metric"><b>@@HTTP@@</b><small>HTTP文件逐字节一致</small></div></div>
<section class="two"><div><h2><small>01 / BATTLE REWARDS</small>跨过100级，奖励继续。</h2><p>旧移植只保留前100级经验表。完整恢复原作200项，高等级兼容延伸、极端奖励饱和，同时保留显式零经验事件。</p><table><tr><th>实际敌人</th><th>同等级人物经验</th></tr><tr><td>火城吉比 · 130 / 140</td><td>3,587 / 4,076</td></tr><tr><td>泪之海 · 130 / 140</td><td>3,341 / 4,076</td></tr><tr><td>漩涡零奖励事件</td><td>0</td></tr></table></div><div><h2><small>02 / NATIVE PORTALS</small>走过传送，抵达目标。</h2><div class="route">817 → 817<small>泪之海同图传送 · 宝箱与出口</small></div><div class="route">702 → 703 → 702<small>尼克斯城区 · 经邻图返回另一片区域</small></div><p>每段等待权威楼层与落点确认；手动输入即时取消。临时构建连通网格，长期只存端点信息。</p></div></section>
<section><h2><small>03 / ACTUAL CHROMIUM</small>从点击，到真实到达。</h2><div class="shots"><figure><img src="browser/final-nyx-return-passage-desktop.png" alt="真实桌面尼克斯NPC到达截图"><figcaption>桌面 · 真实Move与两段EnterFloor，无服务端位置修正。</figcaption></figure><figure><img src="browser/final-sea-npc-arrived-mobile.png" alt="真实Chromium移动触屏模拟泪之海NPC到达"><figcaption>390×844触屏模拟 · 泪之海宝箱。未冒充实体设备认证。</figcaption></figure></div></section>
<section><h2><small>04 / EVIDENCE</small>每项结论，都有对应证据。</h2><table><thead><tr><th>设备</th><th>最终实际业务</th><th>结果</th></tr></thead><tbody>@@ROWS@@</tbody></table><div class="links"><a href="ACCEPTANCE.md">完整验收</a><a href="EXPERIENCE.md">经验依据</a><a href="NAVIGATION.md">导航审计</a><a href="NAVIGATION-REVIEW.md">独立复审</a><a href="release.json">发行摘要</a><a href="browser/final.json">浏览器原始结果</a></div></section>
<section class="two"><div><h2><small>05 / DELIVERY</small>源码与程序保持一致。</h2><p>完整Go test／race／vet、TypeScript与客户端测试通过。重复构建ELF一致；HTTP实际字节与ZIP公开白名单逐文件匹配。完整新ZIP替换旧版本，无新增素材或数据库迁移。</p><code>ELF SHA-256<br>@@SHA@@</code></div><div class="note"><p>移动验证使用真实Chromium、触屏／视口模拟与软件GPU，未认证实体Android、iOS或Safari。未部署或重启生产。</p><p>200级以上经验是本项目兼容延伸。导航支持同图及相邻图返回通路；任务、随机、条件和对话传送仍由服务端判断，不提供任意多层世界寻路。</p><p>中间脚本与夹具失败保留；最终只采用匹配ELF且正常退出的结果。</p></div></section><footer>SA-Server · SA-1121-01 · 实际范围与性能边界以验收及原始证据为准。</footer></main></html>
'''
for key,value in {'TESTS':r['client_tests'],'BROWSER':len(b['checks']),'HTTP':r['http_files'],'ROWS':rows,'SHA':r['binary_sha256']}.items():
    page=page.replace(f'@@{key}@@',str(value))
(OUT / 'index.html').write_text(page)
print('Rendered ACCEPTANCE.md and index.html from final evidence.')
