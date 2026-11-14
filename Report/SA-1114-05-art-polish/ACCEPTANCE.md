# 双爪战场素材 · v0.2.17-LYNX

基线e5aa5d3，任务SA-1114-05用户追加：素材／动画发行前优化，重点为实际战场比例。

## 问题与修整

旧生成器将原图独立拉伸宽高，以匹配不同姿态的原生宠物外框。萨鲁法斯战场常用dir3／dir7横向相对纵向仅0.501／0.512，克劳德斯dir3为0.681。旧验收把外框匹配视为通过，未保护骨架比例。本次先以全16向源图比例测试复现失败，再修正为单一缩放比例；虎112×84、蟹118×92为原生像素包络，允许不同姿态有自然的外框差异。足底／身体中心单独校准，不以尾尖或爪尖作为中心。

站起攻击围绕实际髋部支点，支撑腿沿腿轴用原图纹理连接、垂直方向保宽并固定足底；移除旧画线和圆圈的替代关节。收敛摆腿／尾巴幅度，清理分层旋转碎片，缩小后轻提亮金属中间调与锐化。原图、八向选图、左红爪、跳刺／扫击与红痕保留。实际移动和回位继续走原生近战路径。

## 证据

- `aspect-red.txt`／`aspect-green.txt`：原图比例旧版16向失败，修复后通过。
- `support-red.txt`／`art-tests.txt`：源图比例、碎片清理、纹理关节及固定足底3项通过。
- `art-validation.json`：两宠752帧、128动作及24帧共用特效；非空、不同帧、边界、纹理预算与透明裁边还原。
- `art/*-before-after.png`：相同原生像素尺度的参考宠物／v1／v2八向对照；动作分解图与GIF。
- `proportions.json`：每向单一比例与足底数据。
- `all-client-tests.txt`：224/224（包含客户端TS、移动shell与构建）；`loader-green.txt`：相关20/20。
- `go-tests.txt`：Go全部测试通过；`go-vet.txt`：通过。
- `installer-green.json`：31项通过，包含v1旁装v2、重复安装、冲突／链接／路径／摘要／解压边界。
- `package-reproducibility.json`：重新打包摘要一致，7个安装文件摘要匹配，重复安装不修改mtime，生成器源码匹配记录。
- `live-assets.json`：真实运行Linux ELF通过HTTP提供的7文件与最终补丁逐字节一致。

最终Chromium战场16/16、移动交互14/14通过，浏览器错误0；两个真实ELF正常SIGTERM停服，角色位置保存与SQLite一致。匹配最终ELF与源码的发行摘要见`release.json`，隐私检查见`privacy-check.json`。

`build-repeatability.json`记录同一冻结输入重复构建Linux ELF摘要一致；`source-inputs.json`记录383个源码／客户端输入。`live-assets.json`将52个内嵌网页文件和7个最终素材逐字节与运行中ELF核对。

移动复测发现宽蟹转回竖屏时左侧只剩92.8%可见。原待机镜头只以人物中心取景；现使用人物与出战宠物的真实绘制矩形并集，播放期保持单个执行者跟随。`camera-red.txt`复现左侧裁切；`camera-green.txt`8项通过，覆盖待机完整取景和播放期不偏移。`browser/intermediate-camera`保存原始失败画面与数据。

## 升级与范围

v2独立7文件图包，v1保留，编号和存档无需迁移。必须同时更新v0.2.17程序／客户端才能选择v2。保持共用技能所有规则及1.8%实际总伤害自疗，非1级仅攻击防御；移动原生全屏UI、按钮缩放、禁双指缩放、待机镜头新增真实外框并集取景，播放仍跟随执行者。

Chromium实际运行Linux ELF、WebSocket与原生数据解析，私有GM测试场景只用于受控战场对比，不宣称为自然刷怪。UI点击和GM聊天执行业务，evaluate只读。移动为触屏／视口模拟，不代替实体Android／iOS／Safari认证。艺术判断以逐帧和实际战场画面审阅为依据，不用几何测试宣称100%艺术完美。

## 中间结果

保留`browser/intermediate-fixture`：重复图号的私有夹具被发行版注册器拒绝；改用真实宠物编号与原生参考，不放宽保护。`browser/intermediate-sampling`记录过早截图错过短攻击帧，现仅命中阶段截图，移动／回位只读采样。多宠总范围超过窗口时，按当前视口及按钮缩放计算横向安全范围，保留所锁定人物12px边距；垂直取景保留人物原有高度，避免高宠将人物推到战斗底栏后；不缩小宠物或修改用户缩放。`camera-wide-red.txt`记录宽队伍原本会把人物推到边缘。

`browser/intermediate-camera-side`记录待机并集曾把缺省owner=0的敌方记录纳入，已加同侧与宠物槽位限制，`camera-side-red.txt`复现后由8项镜头测试通过。其他中间浏览器结果不作为最终通过证据。


`browser/intermediate-wide-party`与`intermediate-footer`保留多宠取景边界及底栏遮挡的中间证据；`intermediate-horizontal`是为最终纵向取景修整主动终止的中间运行，不作通过证据。最终以顶层`final-art.json`、`final-mobile-regression.json`和`release.json`为准。


## 最终交付

- 程序版本v0.2.17-LYNX，静态ELF64 Linux AMD64，0755。
- 程序SHA-256：`bd1c3f3cfcad405b22d1c6a7c2a13ae46dfeedf07e24264d8c6228c9e8046e95`。
- v2素材包SHA-256：`5af30668f03911ce6ec60a951fa0fe0c11c1f6f64c92096434cd637f779c1c68`。
- 角色752帧／特效24帧，无越界裁切；解码纹理38.96MiB。源图、所有动作ID／方向／时长／帧ID及共用特效图页保持兼容，见`behavior-preservation.json`。
- 顶层`final-art.json`的4个宠物／设备组合包含真实绘制尺寸、CSS投影、命中阶段、回位、同场原生参照及横竖屏证据；16项均通过。移动宽宠转屏可见比例至少95%。
- 顶层`final-mobile-regression.json`14项通过：行走与战斗分别5组横竖屏尺寸、按钮放大／缩小／复位、真实双指触摸不会缩放／平移／发送移动或战斗指令。
- 最终`verify-release.py`核对383源码输入、52内嵌文件、7素材HTTP字节、图包摘要、30项浏览器、ZIP全部公开文件一致性与旧ZIP替换。

- 最终ZIP：`bin/saserver-v0.2.17-LYNX-linux-amd64.zip`，4370个公开文件，全部字节与工作区一致；内含4个独立素材补丁，共26文件。
- ZIP SHA-256：`cd960dd55f9617909e24e5ac0c361782f5f3976769ee3e6376e19184b5c84f9a`。旧v0.2.16 ZIP及摘要已替换。

- 提交前隐私扫描覆盖247个暂存／工作文件及12层级归档对象（含ZIP内4补丁）；凭据值、编码变体、敏感路径和常见令牌模式均0命中。未使用OCR，不能据此保证发现图片中的所有文本。
