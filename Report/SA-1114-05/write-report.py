"""Create concise offline acceptance pages from checked final release evidence."""
from pathlib import Path
import html,json
OUT=Path(__file__).resolve().parent;r=json.loads((OUT/'release.json').read_text());c=r['checks'];p=r['archive']
content=f'''# SA-1114-05 · 洞窟双赤爪验收

**{r['version']}**；基线9689b9c／v0.2.15-LYNX。客户端与构建{c['client_and_builder']}项、最终程序真实Chromium {c['browser_checks']}项通过；TypeScript、Go全量、vet及受影响服务端定向race通过。源码、嵌入客户端、Linux AMD64和ZIP交叉校验一致。

## 结果

- 萨鲁法斯：地50风50，体20／腕34／耐36／敏34；漆黑洞窟17层32017，(30,29)周边。全体原始人使用ChatGPT改造佩露夏，挫败黑暗精灵王和柯黑穆肯阴谋的故事进入原生图鉴。
- 克劳德斯：水50火50，体42／腕32／耐42／敏8；漆黑洞窟16层32016，(30,29)周边。全体原始人使用Claude创造厚甲守护者，保护洞窟与归途的故事进入原生图鉴。
- 基础总额均124，Init40／实际LvUp4，与运行时杨格斯档位相同；原始4.50由现有整数解析为4，本版不扩大修改全局成长。独立模板29007／29008、成体29017／29018、形象199400／199401、技能29060、特效199402；严格独立注册与冲突校验，图鉴追加于既有576条之后。
- 两层原敌群70%，1级个体12%，93–95级巡游个体18%。原生Picker与地图可走点另行验证，不将受控浏览器敌群当作自然分布证据。**洞内非1级个体只有攻击和防御；1级个体保留赤爪裂阵。** 覆盖实际Fighter与捕获Seed，防止捕获后回填技能。

## 赤爪裂阵

选择对象及原生2×5阵列的左右、前后相邻活敌，不含斜角，不跨4↔5／14↔15行尾。最大4槽来自原生两排阵型。各目标普通80%命中；两宠自身随机增加一次30%–60%防御，耐力沿用原生防御工作值，5回合含施放轮，刷新不叠加。敌方与队友不增防。权威百分比和剩余回合通过正式协议、恢复快照与原生界面显示。

实际EnemyID名单323、477、1624、1677–1680、1685–1691、1700、1701、1703使用150%伤害；包含天空岛遭遇复用编号，跨地图同一编号也适用，不能用名称／外形代替。特定编号仍受80%命中约束。防御／石化目标必定命中、破除防御或石化额外防御强化并150%；保留基础防御与石化状态，不临时篡改状态。已猛毒目标120%，分支择高，不相乘。

其余普通对象正伤害命中后仍活且无异常，按clamp(35＋等级差/2－非负毒抗性,28,43)%附加原生猛毒；5次扣血后未解在后续检查阵亡。保留守护者、镜／光／守、骑宠分摊、飞出、死亡和捕获保护边界，不反击；反射致死中断后续攻击。

整次技能结束，按**实际造成HP损失总额×1.8%向下取整**一次回复自身HP，包含实际守护者与骑宠，先求和再取整；55→0、56→1。过杀只算实际HP损失，反射／吸收／消失／闪避不计，最多回复MaxHP；施放者死亡不触发，不能复活。客户端绿色回复与真实HP同步，不额外生成一次爪击。

## 美术与独立安装

用户原JPG保留：Cyrufas SHA256 `{r['art']['source_sha256']['cyrufas']}`；Claudes SHA256 `{r['art']['source_sha256']['claudes']}`。

3×3原图各选八个独立方向，不镜像换手；分离腿、左爪、虎尾做关节位图变化。虎奔跑、摇尾、后腿站起左红爪扫击；蟹爬行腿步、待机红眼、跳起左红爪刺击；各自红痕在角色帧，共用技能有独立十字红冲击，原生近战路径负责出击与回位。两宠各376角色帧，共用24特效帧，128动作都有不同帧，最终图集中未检出不透明像素触边。静止帧逐方向可见宽高与金格萨贝鲁100330、洛奇安100286相同；192px透明帧格不计为角色身高。

这是用户JPG透明提取、手工关节分层、Pillow／NumPy变换和程序位图特效，未调用图像生成API、未声称逐帧重新绘制。独立重生七个文件及tar.gz逐字节一致。透明边裁切并补偿锚点，752个逻辑角色帧逐字节保持一致，解码纹理从117,596,160字节降至35,725,312字节，减少69.6%，降低移动端加载与显存负担。动作质量另经关键帧与真实游戏查看，不能由自动测试推出艺术完成度绝对保证。

```bash
bash update/install-primal-claws.sh
# 自定义路径必须已经存在，末级目录名为assets或Assets：
bash update/install-primal-claws.sh --assets /实际路径/Assets
```

独立set5、图像9300000–9399999，七文件精确白名单、逐文件SHA、路径／链接／解压上限、原子发布、幂等与冲突保留均验证。四安装器各30项，共120项。原始Assets、数据库和凭据不上传，新包不会替换此前三扩展。

## 实际证据

- 客户端与构建：{c['client_and_builder']}/{c['client_and_builder']}，失败0，见client-tests.txt；typescript.txt、go-tests.txt、go-vet.txt退出0。
- server-package-tests与server-race：受影响data／battle／world完整回归和明确正则范围race，见SERVER-WORK.md；没有把定向race写成world全量race。
- browser/final-primal.json：两个宠×桌面／触屏各5项，共20项，涵盖原生列表、属性、幼体技能、追加故事、idle/run/爪击／跳刺帧、实际十字16/15/17/11、独立红纹理、自疗HP、5→4→3→2→1→0权威增防和成年只有攻击／防御。
- 移动动作额外通过原生“跟随”按钮操作验证：角色爪击帧中心在390×844视口内、CSS投影矩形至少80%可见；共用红特效至少35%可见且有多个不同帧。visibility字段保留屏幕坐标和对应截图，避免把视口外的画布绘制当成手机可见。先前可见性不足的运行已单独归档。
- 萨鲁法斯移动端原范围特效PNG拍晚，明确归档于browser/original-primal-r7。另以相同ELF、真实UI单独施放赤爪裂阵，直接CDP截取3张可见红弧／爆点，见[补充视觉证据](browser/final-primal-red-probe.json)及其PNG；这是额外施放的补充视觉证据，不冒作原20项同次施放或精确同帧。原20项事件／血量／倒计时保持原样，最终清单另核对其来源。两宠移动普通／技能爪击四张PNG和红效图均实际查看。
- browser/final-mobile-regression.json：14项移动镜头、横竖屏、按钮缩放与双指展开／平移不缩放、不平移、不发送业务指令。二组浏览器errors为空，SIGTERM退出0，位置保存一致。
- HTTP核对{c['embedded_files']}个内嵌文件与26项补丁资源逐字节一致；gzip／排除gzip／HEAD／304及11项私有URL404通过，最终ELF停服正常。
- 重复构建ELF摘要一致，{r['source_files_verified']}项源码输入保持冻结；ZIP {p['files']}项逐项等于当前公共文件，ZIP0644，程序及安装Shell0755。旧v0.2.15 ZIP与摘要替换。

Linux AMD64 SHA256：`{r['binary']['sha256']}`。

ZIP：`{p['archive']}`；SHA256 `{p['sha256']}`。

## 验证边界

真实Linux ELF、原素材、WebSocket、私有SQLite与Chromium，使用SwiftShader。移动屏幕尺寸与触屏是模拟，不是实体Android／iOS／Safari认证；系统键盘、安全区与多GPU没有实机覆盖。原生移动全屏UI与输入公共层保持，进行了实际回归。

240px特效以目标为中心，画布／移动视口边缘可能裁掉外扩部分；图集无裁切不等于所有战场位置完整显示特效外框。物理150%／120%系数仍受基础防御、属性、屏障和坐骑规则影响。角色是参考图分层变化，视觉观感需在实际设备继续检视。中间失败及修正保留于PROGRESS.md；所有最终通过声明以verify-final.py交叉验证为依据。
'''
(OUT/'ACCEPTANCE.md').write_text(content)
esc=html.escape
photos=[('art/cyrufas-directions.png','萨鲁法斯 · 原图八向、后腿站起和左红爪扫击'),('art/claudes-directions.png','克劳德斯 · 爬行、跳跃左爪刺击'),('art/cyrufas-attack.gif','虎系关节动作与赤色扫痕'),('art/claudes-attack.gif','甲壳关节动作与赤色尖刺痕')]
photos +=[(p.relative_to(OUT).as_posix(),p.stem) for p in sorted((OUT/'browser').glob('final-*-mobile-cross-left-claw.png'))]
photos +=[('browser/final-cyrufas-mobile-red-probe-01.png','萨鲁法斯 · 另次原生施放的移动红色范围特效（补充证据）')]
figures=''.join(f'<figure><a href="{esc(n)}"><img src="{esc(n)}" alt="{esc(t)}" loading="lazy"></a><figcaption>{esc(t)}</figcaption></figure>' for n,t in photos)
page=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SA-1114-05 · 洞窟双赤爪</title><style>
:root{{font-family:system-ui,-apple-system,"Noto Sans CJK SC",sans-serif;color:#e5e9ec;background:#151d24}}*{{box-sizing:border-box}}body{{margin:0}}main{{max-width:1160px;margin:auto;padding:40px 22px}}header{{border-top:4px solid #ef534d;padding:34px;background:linear-gradient(120deg,#233443,#30272e);border-radius:8px 8px 22px 22px}}small{{letter-spacing:.16em;color:#ef9991}}h1{{font-size:clamp(30px,5vw,48px);margin:14px 0}}p,li{{line-height:1.8}}a{{color:#93d9da;text-underline-offset:3px}}.pill{{display:inline-block;border:1px solid #758c96;border-radius:40px;padding:6px 13px}}.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:24px 0}}.metric,section{{padding:24px;background:#202c36;border:1px solid #34434e;border-radius:16px}}.metric strong{{font-size:32px;display:block;color:#fff}}.metric span,figcaption{{color:#bdcbd2;font-size:14px}}section{{margin:22px 0}}h2{{font-size:22px;margin-top:0}}.gallery{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}figure{{margin:0}}img{{width:100%;max-height:490px;object-fit:contain;background:#263643;border-radius:8px}}figcaption{{padding-top:8px;line-height:1.6}}code{{font-size:13px;overflow-wrap:anywhere}}footer{{color:#aab9c1;padding:20px 0}}@media(max-width:700px){{main{{padding:18px 12px}}header{{padding:24px}}.metrics{{grid-template-columns:1fr 1fr}}.gallery{{grid-template-columns:1fr}}section{{padding:20px 14px}}}}
</style><main><header><small>SA-1114-05 · RELEASE REVIEW</small><h1>漆黑洞窟 · 双赤爪守护者</h1><span class="pill">{r['version']} · 验证通过</span><p>萨鲁法斯与克劳德斯。原始人携手ChatGPT与Claude，用敏捷、厚甲和赤爪守住归途。</p></header><div class="metrics"><div class="metric"><strong>{c['client_and_builder']}</strong><span>客户端／构建测试</span></div><div class="metric"><strong>34</strong><span>真实Chromium检查</span></div><div class="metric"><strong>776</strong><span>角色与特效帧</span></div><div class="metric"><strong>1.8%</strong><span>实际总伤害自疗</span></div></div>
<section><h2>赤爪裂阵</h2><p>选择对象及左右／前后邻居，80%普通命中；施放宠物自身随机增加30%–60%防御5回合，耐力采用原生防御语义，只加一次。防御／石化必命中破防150%，指定真实编号150%，猛毒120%，其他普通对象按等级与毒抗性计算28%–43%猛毒条件概率。</p><p>整次实际HP损失先求和，再按1.8%向下取整一次自疗；保留守护、坐骑和镜／光／守规则，反射致死不复活。洞窟非1级个体只有攻击、防御，1级个体才拥有共用技能。</p><p><a href="ACCEPTANCE.md">完整验收</a> · <a href="SERVER-WORK.md">服务端边界</a> · <a href="CLIENT-WORK.md">客户端与真实浏览器</a> · <a href="RESEARCH.md">官方资料</a></p></section>
<section><h2>原图八向与局部关节动作</h2><p>两宠各376帧，十字红爪24帧。体型以金格萨贝鲁、洛奇安逐方向可见尺寸和原生锚点为基准；虎后腿站起扫击，蟹爬行跳刺。JPG分层与程序位图处理，没有使用外部图像生成API。</p><div class="gallery">{figures}</div></section>
<section><h2>安装与发行一致性</h2><p><code>bash update/install-primal-claws.sh</code></p><p>独立七文件扩展，精确白名单与SHA校验、原子发布、重复幂等、冲突保留。四安装器120项通过，原Assets不上传。最终ELF与源码／客户端、HTTP与ZIP逐字节核对；重复构建与素材再生一致。</p><p>Linux AMD64 SHA256<br><code>{r['binary']['sha256']}</code></p><p>ZIP SHA256<br><code>{p['sha256']}</code></p><p><a href="release.json">机器发行清单</a> · <a href="privacy-check.json">隐私扫描</a> · <a href="browser/final-primal.json">双宠20项证据</a> · <a href="browser/final-mobile-regression.json">移动14项回归</a> · <a href="browser/final-primal-red-probe.json">另次施放红效</a></p></section>
<section><h2>验证范围</h2><p>真实Linux程序、原生素材、WebSocket与私有SQLite。Chromium用SwiftShader，移动尺寸和触屏来自模拟；没有实体Android／iOS／Safari认证。关键动作另经视觉检查，自动测试不证明艺术完成度的绝对保证。画布边缘可能裁切外扩特效，受控测试敌群不作为自然分布证据。</p></section><footer>2026-11-14 · SA-1114-05 · 离线验收页</footer></main></html>'''
(OUT/'index.html').write_text(page);print('Wrote acceptance markdown and offline HTML from verified release.json')
