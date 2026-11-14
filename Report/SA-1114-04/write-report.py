"""Render human-readable acceptance only after final evidence is accepted."""
from pathlib import Path
import html
import json

OUT=Path(__file__).resolve().parent
r=json.loads((OUT/'release.json').read_text())
assert r['checks']['browser_checks']==20
c=r['checks']; art=r['art']; package=r['archive']
content=f'''# SA-1114-04 · 雷萨利朵验收

**v0.2.15-LYNX**，基线811193a/v0.2.14-LYNX。客户端与构建{c['client_and_builder']}项、最终ELF真实Chromium20项通过；TypeScript、Go全量、vet及受影响服务端定向race通过。匹配源码、客户端、Linux AMD64和ZIP均已交叉校验。

## 角色与技能

- 雷萨利朵火70风30、初始成长40/每级4、体腕耐敏26/60/16/47，总149，与佩露夏同档偏攻敏。玄黄洞窟地下二层11202(40,40)附近保留原敌群70%，Lv1幼体12%、Lv54–58成体18%；5000次原生PickEnemies采样记录578/940/3482，邻接格实际可走。
- 独立Temp/幼体29006、成体29016、角色199300、技能29050、特效199301，碰撞先完整检查再注册；图鉴追加在莉莉丝之后，故事随权威JSON同步，GM/详情使用原生动画。
- 电磁火炮原地连续5发，每发重新随机选择当前合法活敌，独立15%–18%原生物理伤害系数。不引发反击；保留光/镜/守、防御、闪避、守护者和坐骑分摊，反射致死停射。
- 每发正伤害命中后先50/50选择麻痹或驱离，只判定一类。麻痹clamp(35+等级差/2−非负麻痹抗性,20,50)，持续3次行动且不覆盖已有异常；驱离clamp(20+等级差/4,10,30)。同级无抗性每发实际约17.5%麻痹、10%驱离；4000次首发观察701/385，不能把条件概率误称为最终每发概率。
- 驱离仅允许普通可捕获野生敌人，保留HP，以原生Flee事件离场；PvP、玩家、玩家宠物、不可捕获特殊敌、NPC/事件战与禁逃楼层免疫。选中免疫分支不改抽另一分支。后续炮排除死亡、击飞、逃离、隐身和捕获保护对象，避免攻击空位。
- 服务端和客户端AI认识总期望系数0.825，显式选技可用；默认纯伤害排序可能优先普攻，未伪造状态收益强制选炮。随机技能的自动捕获保护按全敌侧判断，不能因UI单体标签绕过保护。

## 美术与安装

用户原图 `img/lisarido.jpg` 保留，SHA256 `{art['source_sha256']}`。八向232角色帧、24电磁特效帧，保留右手炮筒，不通过镜像换手。猫耳微动、悬浮、举炮后坐力与炮口近爆已接入；远程技能逐炮播放240×240电磁爆炸。

32个站立帧主体均98px，与莉莉丝96–98px一致；以雷龙正面145px为基准约67.6%，符合约2/3。测量不含透明边距与地面光圈，160×160帧格不是角色高度。所有64动作均有不同帧，不透明像素未被裁切。

制作方式为用户JPG去棋盘透明提取、Pillow/NumPy局部耳/炮筒姿态变换与程序位图特效。当前工具无image_gen，未使用需要明确授权与密钥的CLI，未称AI重绘。原图、生成脚本、八向静态预览与GIF均保留，可重复生成；五个文件和tar.gz摘要均与首次相同。

`bash update/install-lisarido.sh` 安装独立set4/编号9200000–9299999扩展。五文件精确白名单、逐项SHA、拒绝穿越/链接、原子安装、幂等、冲突保留均通过。实装后再次运行显示文件一致。新包损坏/缺失不影响原资源与前两个包。

实际安装复现旧tar上限遗漏双EOF块再补齐记录的边界，导致合法包误拒绝。新增真实USTAR边界红测试后，将三个安装器都改为精确向10240字节记录补齐，保持解压上限。三安装器通过数：{json.dumps(c['installer_cases'],ensure_ascii=False)}；旧归档字节未变。

## 证据

- `client-tests.txt`：{c['client_and_builder']}/{c['client_and_builder']}，失败0；`typescript.txt`、`go-tests.txt`、`go-vet.txt`均退出0。
- `server-package-tests-status.json`：data/battle/world三包完整回归；`server-race-status.json`为定向race，具体正则与范围在SERVER-WORK.md。没有声称world全量race。
- `browser/final-lisarido.json`：桌面/触屏各3项，共6项，真实原生目录/属性/技能/相簿、普攻位移及炮口纹理、五次不重叠的原地电磁纹理、权威麻痹与保HP驱离/后续不击离场通过。只读观察，没有注入业务状态或事件。
- `browser/final-mobile-regression.json`：14项移动镜头/输入回归，行走与战斗横竖屏实际bitmap边界、+/−/复位及CDP双指展开/平移不缩放、不平移、不发送业务命令。
- 两浏览器监督均退出0、errors为空、SIGTERM退出0、位置落库一致。独立私有fixture不代表自然刷怪；自然分布另由原地图/原生Picker验证。
- HTTP {c['embedded_files']}个嵌入文件与19项补丁资产逐字节一致，gzip、HEAD、304及11私有URL404通过；停服0，重复构建ELF相同，{r['source_files_verified']}项源码输入未变。
- ZIP {package['files']}项逐项匹配当前公共文件，ZIP0644、ELF及安装Shell0755；旧v0.2.14 ZIP与摘要已替换。Assets原树、数据库、凭据与私有运行配置排除。

Linux AMD64：`bin/saserver`，SHA256 `{r['binary']['sha256']}`。

ZIP：`{package['archive']}`，SHA256 `{package['sha256']}`。

## 范围与限制

真实Chromium以SwiftShader渲染，手机尺寸和触屏由浏览器模拟；没有实体Android/iOS、Safari、真实系统键盘与安全区认证。原生移动UI代码沿用上一版，本轮验证没有回退。240px单体特效以目标为中心，边缘目标的外扩部分可能被原生800px画布或移动可视区裁切；活目标仍可见，图集未裁切不等于每个战场位置完整显示特效外框。

原生物理系数不等于忽略防御直接扣Atk百分比；最终伤害仍受原生防御、属性和结果机制影响。驱离对特殊战斗保守免疫，避免跳过事件奖励和头目规则。角色与炮筒由参考图分层变形，未声称重新绘制所有姿势。

进度、中间失败及修正原因见PROGRESS.md；机器清单release.json，可视报告index.html。所有最终通过声明以verify-final.py交叉校验结果为依据。
'''
(OUT/'ACCEPTANCE.md').write_text(content)
esc=html.escape
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SA-1114-04 · 雷萨利朵验收</title><style>
:root{font-family:system-ui,-apple-system,"Noto Sans CJK SC",sans-serif;color:#183b42;background:#eef3f2;color-scheme:light}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:48px 24px}header{padding:36px;background:#17383f;color:#fff9ee;border-radius:24px}header p{color:#d9e9e8}h1{font-size:clamp(28px,5vw,46px);margin:14px 0}p,li{line-height:1.75}small{letter-spacing:.12em}.badge{display:inline-block;border:1px solid #9bc4c3;border-radius:30px;padding:6px 12px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:24px 0}.metric,section{padding:24px;border:1px solid #cedddb;background:#fffef8;border-radius:18px}.metric strong{display:block;font-size:32px}.metric span,figcaption{font-size:14px;color:#52746f}section{margin:20px 0}h2{margin-top:0;font-size:22px}a{color:#1c6c70;text-underline-offset:3px}.screens{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{width:100%;max-height:540px;object-fit:contain;background:#263643;border-radius:12px}figcaption{padding-top:10px;line-height:1.6}code{font-size:13px;overflow-wrap:anywhere}footer{padding:20px 0;color:#52746f;font-size:14px}@media(max-width:700px){main{padding:20px 12px}header{padding:24px}.metrics{grid-template-columns:1fr 1fr}.metric{padding:18px}section{padding:20px 14px}.screens{grid-template-columns:1fr}}
</style><main><header><small>SA-1114-04 / RELEASE REVIEW</small><h1>玄黄守灯者 · 雷萨利朵</h1><span class="badge">已验证 · v0.2.15-LYNX</span><p>火7风3，悬浮猫耳炮手。五发电磁火炮逐次随机活敌，以原生战斗事件呈现麻痹与驱离。</p></header><div class="metrics"><div class="metric"><strong>CLIENT</strong><span>客户端与构建测试</span></div><div class="metric"><strong>20</strong><span>真实Chromium检查</span></div><div class="metric"><strong>98px</strong><span>角色主体高度</span></div><div class="metric"><strong>EMBED</strong><span>匹配嵌入文件</span></div></div>
<section><h2>技能与战斗边界</h2><p>5次远程单体，每发重新随机当前合法活敌；独立15%–18%原生物理伤害系数。每发先等概率选择麻痹或驱离，再按20%–50%或10%–30%的条件概率判定，同一发两者互斥。</p><p>原地举炮，逐炮结算。保护PvP、NPC/事件、禁逃楼层与特殊敌人；死亡和离场后不再被后续炮击选中。沿用镜守、防御、守护、骑宠与反射规则。</p><p><a href="ACCEPTANCE.md">完整验收</a> · <a href="SERVER-WORK.md">服务端红绿与边界</a> · <a href="CLIENT-WORK.md">客户端验证</a> · <a href="RESEARCH.md">研究依据</a></p></section>
<section><h2>原生八向与位图动画</h2><p>232角色帧、24电磁特效帧；猫耳微动、漂浮、右手炮筒举起与近爆。主体98px与莉莉丝一致，约为雷龙正面145px的2/3，透明帧格不计入身高。</p><div class="screens"><figure><img src="art/lisarido-directions-actions.png" alt="雷萨利朵八向与动作"><figcaption>八个原始方向保留右手炮筒，没有用镜像换手。</figcaption></figure><figure><img src="art/electromagnetic.gif" alt="24帧电磁爆炸"><figcaption>240×240原生RGBA电磁爆炸，逐炮独立播放。</figcaption></figure></div><p>用户JPG透明提取、局部耳/炮筒变形与程序位图特效，未调用图像生成API。五文件素材补丁可复现、原子安装，原Assets不进入仓库。</p></section>
<section><h2>真实游戏画面</h2><div class="screens"><figure><a href="browser/final-lisarido-desktop-cannon-electric-explosion.png"><img src="browser/final-lisarido-desktop-cannon-electric-explosion.png" alt="桌面原生电磁火炮"></a><figcaption>桌面：原地右手举炮与真实电磁纹理。</figcaption></figure><figure><a href="browser/final-lisarido-mobile-cannon-electric-explosion.png"><img src="browser/final-lisarido-mobile-cannon-electric-explosion.png" alt="手机模拟原生电磁火炮"></a><figcaption>手机模拟：活敌镜头、逐炮播放与权威状态。</figcaption></figure></div><p><a href="browser/final-lisarido.json">新宠6项事件证据</a> · <a href="browser/final-mobile-regression.json">移动14项回归</a> · <a href="art-validation.json">尺寸与裁切检查</a></p></section>
<section><h2>发行一致性</h2><p>Go全量、vet与定向race通过，重复构建ELF一致。ZIP逐项匹配公共文件，旧ZIP已替换；三个素材安装器修复USTAR末尾填充边界，摘要、白名单与冲突保留继续有效。</p><p>Linux AMD64 SHA-256<br><code>BINARY</code></p><p>ZIP SHA-256<br><code>ARCHIVE</code></p><p><a href="release.json">机器发行清单</a> · <a href="privacy-check.json">隐私检查</a></p></section>
<section><h2>验证边界</h2><p>实际Linux ELF、原素材、WebSocket、隔离SQLite与Chromium。SwiftShader渲染，移动触屏和屏幕尺寸为模拟；未认证实体Android/iOS、Safari或系统安全区。受控敌群仅存在私有验收目录，正式自然分布另经原生Picker采样。</p><p>伤害系数仍受原生防御与属性影响；麻痹/驱离先二选一，再按条件概率触发。角色动画由参考图分层变形，未声称重绘全部姿势。</p></section><footer>2026-11-14 · SA-1114-04 · 可离线阅读</footer></main></html>'''
for key,value in (('CLIENT',c['client_and_builder']),('EMBED',c['embedded_files']),('BINARY',r['binary']['sha256']),('ARCHIVE',package['sha256'])):
    page=page.replace('>'+key+'<','>'+esc(str(value))+'<')
(OUT/'index.html').write_text(page)
print('Wrote ACCEPTANCE.md and index.html from verified release.json')
