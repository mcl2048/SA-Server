"""Render the checked release facts as a self-contained, readable local report."""
from pathlib import Path
import html
import json

OUT = Path(__file__).resolve().parent
r = json.loads((OUT / 'release.json').read_text())
escape = html.escape
shots = sorted((OUT / 'browser').glob('final-*.png'))
gallery = ''.join(
    f'<figure><a href="browser/{escape(p.name)}"><img loading="lazy" src="browser/{escape(p.name)}" alt="{escape(p.stem)}"></a><figcaption>{escape(p.stem)}</figcaption></figure>'
    for p in shots if 'failure' not in p.name
)
rows = [
    ('500只容量与分页', '普通寄放和培养共享500只；每页5只，真实UI访问第1、2和100页并领取。', 'browser/final-petcare.json'),
    ('培养与费用', '所有宠物店有培养／领取路径，按当前人宠等级之和×100收费；取消、余额不足、满仓与重放不改数据。', 'server/ACCEPTANCE.md'),
    ('每只各得80%', '普通／快速真实战斗中，两只培养对象各自取得完整80%并自动升级；普通寄放不增长。', 'browser/final-petcare.json'),
    ('自动／后台／团队', '唯一战后结算入口；两队员、共享开关、倍率与智慧加成，自动／快速／离线恰好一次。', 'server/ACCEPTANCE.md'),
    ('资源开销', '复用事件循环，无新定时器／goroutine／逐宠SQL；500只升级家族队列提交1000→2，收益相同。', 'review/FINAL-REVIEW.md'),
    ('存档与HTTP', 'Gold和Pets同一人物保存，培养标记及升级重读落盘；78文件字节一致、HEAD／304／私有路径及SIGTERM通过。', 'http-content.json'),
    ('发行一致性', '静态Linux AMD64、两次相同构建、源码输入稳定、ZIP逐文件匹配并替换旧包。', 'release.json'),
]
table = ''.join(f'<tr><th>{escape(a)}</th><td>{escape(b)}</td><td><a href="{c}">证据 ↗</a></td></tr>' for a, b, c in rows)
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SA-1115-02 · 宠物仓库与培养</title><style>
:root{color-scheme:light;--ink:#172e2a;--muted:#536b64;--line:#d7e0d5;--green:#235c45}*{box-sizing:border-box}body{margin:0;background:#f4f2e9;color:var(--ink);font:16px/1.75 system-ui,"Noto Sans CJK SC",sans-serif}main{max-width:1120px;margin:auto;padding:56px 28px 72px}header{border-top:5px solid var(--green);padding-top:26px}.tag{letter-spacing:.12em;color:var(--green);font-size:13px;font-weight:700}h1{font-size:clamp(32px,5vw,58px);line-height:1.2;letter-spacing:-.04em;margin:20px 0}.lead{max-width:800px;color:var(--muted);font-size:18px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:32px 0}.card{border:1px solid var(--line);background:#fffdf6;padding:22px}.card b{display:block;font-size:35px;color:var(--green);line-height:1.4}.card span{color:var(--muted)}h2{font-size:24px;margin:36px 0 16px}table{width:100%;border-collapse:collapse;background:#fffdf6}th,td{padding:16px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}th{min-width:135px}a{color:var(--green);text-underline-offset:4px}code{overflow-wrap:anywhere;font-size:13px}.artifact{background:#e6ecdf;padding:22px;margin-top:26px}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}figure{margin:0;background:#fffdf6;border:1px solid var(--line)}img{width:100%;height:230px;object-fit:contain;background:#182822}figcaption{padding:12px;font-size:13px;overflow-wrap:anywhere}.note{color:var(--muted);border-left:3px solid #a5b690;padding-left:20px}footer{border-top:1px solid var(--line);padding-top:20px;margin-top:40px;color:var(--muted);font-size:14px}@media(max-width:600px){main{padding:30px 16px}table,tbody,tr,th,td{display:block}th{padding-bottom:0;border-bottom:0}td{padding-top:8px}td:last-child{padding-top:0}}
</style><main><header><div class="tag">SA-1115-02 · VERSION</div><h1>500只仓库。<br>每只培养宠物，80%战斗经验。</h1><p class="lead">确认后存入共用仓库，随人物实际战斗所得自动成长。复用原生成长、分页和存档，让容量增加保持有界开销。</p></header>
<div class="metrics"><div class="card"><b>500</b><span>共享仓库容量</span></div><div class="card"><b>80%</b><span>每只独立获得，不分摊</span></div><div class="card"><b>244</b><span>客户端／构建回归通过</span></div><div class="card"><b>BROWSER</b><span>最终Chromium检查通过</span></div></div>
<h2>验收与依据</h2><table>TABLE</table><div class="artifact"><strong>最终有效产物</strong><p><a href="../../bin/saserver">bin/saserver</a> · <a href="../../PACKAGE">完整Linux AMD64 ZIP</a><br>SHA-256 <code>DIGEST</code></p><p>ZIP摘要 <code>ZIPDIGEST</code></p></div>
<h2>实际界面</h2><div class="gallery">GALLERY</div><h2>范围与限制</h2><p class="note">真实Chromium运行匹配发行ELF、官方资源与隔离SQLite，业务通过原生UI与允许的GM操作触发，页面状态只读。移动使用触屏和视口模拟，不代表实体Android、iOS或Safari认证。未部署或重启生产实例。性能为单次500只成长／队列提交采样，未执行该探针的家族SQL，不能据此宣称生产吞吐。</p><p>中间脚本时序失败与取消的重复编译保留原始证据，最终通过单独绑定发行摘要。</p><footer><a href="ACCEPTANCE.md">完整验收</a> · <a href="RESEARCH.md">官方资料与应用</a> · <a href="PROGRESS.md">执行记录</a> · <a href="review/FINAL-REVIEW.md">独立审查</a> · <a href="../../docs/v0.2.20-LYNX.md">升级说明</a></footer></main></html>'''
for a, b in [('VERSION', r['version']), ('BROWSER', str(r['browser']['checks'])), ('TABLE', table), ('PACKAGE', r['package']['path']), ('ZIPDIGEST', r['package']['sha256']), ('DIGEST', r['binary_sha256']), ('GALLERY', gallery)]:
    page = page.replace(a, b)
(OUT / 'index.html').write_text(page)
print('Rendered report with', len(shots), 'available screenshots')
