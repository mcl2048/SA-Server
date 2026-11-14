from pathlib import Path
import html,json
OUT=Path(__file__).resolve().parent
figures=[('art/cyrufas-before-after.png','萨鲁法斯：原生金格萨贝鲁／旧v1／新v2，同一原生像素尺度'),('art/claudes-before-after.png','克劳德斯：原生洛奇安／旧v1／新v2，同一原生像素尺度'),('art/cyrufas-directions.png','萨鲁法斯八向：待机、站起、左红爪扫击'),('art/claudes-directions.png','克劳德斯八向：待机、跳跃、左红爪刺击'),('art/cyrufas-attack.gif','萨鲁法斯源图纹理关节动作'),('art/claudes-attack.gif','克劳德斯爬行跳刺动作')]
for name in ('cyrufas','claudes'):
 for device,kind,label in [('desktop','native-comparison','与原生参考宠物的实际战场对照'),('desktop','enemy-native-comparison','敌方东南朝向与原生参考'),('desktop','strike','真实出击后的近战命中'),('mobile','portrait-idle','横屏转回竖屏后的实际取景'),('mobile','strike','移动全屏实际攻击')]:
  f=f'browser/final-{device}-{name}-{kind}.png'
  if (OUT/f).is_file():figures.append((f,name+' · '+label))
body=''.join(f'<figure><a href="{html.escape(f)}"><img src="{html.escape(f)}" alt="{html.escape(label)}" loading="lazy"></a><figcaption>{html.escape(label)}</figcaption></figure>' for f,label in figures)
checks='224项客户端／构建 · 31项安装升级 · 776张角色及特效帧'
if (OUT/'browser/final-art.json').exists():
 b=json.loads((OUT/'browser/final-art.json').read_text())
 if not b.get('failure'):checks+=f' · {len(b["checks"])}项真实战场'
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>双爪 · 战场素材修整</title><style>
:root{color-scheme:dark;font-family:system-ui,"Noto Sans CJK SC",sans-serif;background:#10191e;color:#e4eae8}*{box-sizing:border-box}body{margin:0}main{max-width:1180px;margin:auto;padding:38px 22px}header{padding:36px;border-top:4px solid #e87566;background:linear-gradient(120deg,#243b3b,#352a32);border-radius:6px 6px 20px 20px}small{color:#ffb09e;letter-spacing:.12em}h1{font-size:clamp(30px,5vw,48px);margin:14px 0}p{line-height:1.85}a{color:#a2dbcb}section{margin:24px 0;padding:26px;border:1px solid #3f5355;border-radius:16px;background:#1c2a2e}.gallery{display:grid;grid-template-columns:1fr 1fr;gap:24px}figure{margin:0;min-width:0}img{width:100%;max-height:660px;object-fit:contain;background:#586563;border-radius:8px}figcaption{padding-top:10px;line-height:1.6;color:#bdccc8}code{overflow-wrap:anywhere}footer{padding:24px 0;color:#a8bdb6}@media(max-width:720px){main{padding:18px 12px}header,section{padding:22px 16px}.gallery{grid-template-columns:1fr}}</style><main>
<header><small>SA-1114-05 · ART POLISH · v0.2.17-LYNX</small><h1>双爪 · 回到自然比例</h1><p>修正侧面及实际战场的宽高拉伸；保留源图骨架，以足底定位。优化髋部连接、步态与金属细节，移动转屏取景覆盖人物和出战宠物。</p><p>CHECKS</p></header>
<section><h2>修复依据</h2><p>旧版把不同姿态塞入参考外框，萨鲁法斯常用战斗方向横向相对纵向只有约一半。新素材采用单一比例，体型参照金格萨贝鲁与洛奇安的尺度包络；坐姿和四脚站立允许自然的外框差异。待机镜头使用人物与己方宠物真实外框，播放仍跟随执行者。</p><p><a href="ACCEPTANCE.md">验收与限制</a> · <a href="proportions.json">八向比例</a> · <a href="art-validation.json">逐帧几何</a> · <a href="browser/final-art.json">真实战场证据</a> · <a href="browser/final-mobile-regression.json">缩放／双指／转屏回归</a></p></section>
<section><h2>原生尺度与实际画面</h2><div class="gallery">GALLERY</div></section>
<section><h2>升级</h2><p><code>bash update/install-primal-claws.sh</code></p><p>v2独立7文件补丁，保留旧v1。更新匹配程序、正常保存停服后重启并刷新网页。宠物／技能／特效编号不变，存档不迁移，1.8%实际伤害自疗等战斗规则保留。</p><p><a href="release.json">发行摘要</a> · <a href="package-reproducibility.json">图包再打包</a> · <a href="privacy-check.json">隐私审查</a></p></section>
<footer>真实Linux ELF／Chromium与原生数据。移动采用触屏及视口模拟，未进行实体Android／iOS／Safari认证；艺术质量经逐帧与战场视觉检查，不以自动测试声称完美。</footer></main></html>'''.replace('CHECKS',checks).replace('GALLERY',body)
(OUT/'index.html').write_text(page)
