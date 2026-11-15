# SA-1115-01 · v0.2.19-LYNX 最终验收

基线 `6b5cfde / v0.2.18-LYNX`。六项任务全部完成，发行证据绑定唯一二进制。

| 项目 | 最终行为与证据 |
| --- | --- |
| ✅ 导航与精确坐标 | 快速战斗暂停路线，战后重算并续行；小地图可输入 X/Y。普通战斗、换层与手动方向仍取消路线。 桌面与移动各 6 场真实快速战斗后抵达；两端战斗期 Move 均为 0。 [证据](navigation/ACCEPTANCE.md) |
| ✅ 按比例恢复 | HP／MP 共用恢复比例；肉优先，再药物，最后恢复精灵。没有恢复装备也会按 MP 比例补气。 两端分别验证自动／快速战斗吃肉优先及无装备补气；边界由业务测试覆盖。 [证据](browser/final-automation.json) |
| ✅ 自动逃跑 | 新增默认关闭开关；开启时优先逃跑，同场实际失败三次后恢复战斗策略。 真实战斗验证优先逃跑；三次失败及新场重置由确定性业务测试证明。 [证据](server/RESEARCH.md) |
| ✅ 关键词自动丢弃 | 自动遇敌下方新增默认关闭开关；以 | 分隔，名字字面包含即可整叠丢弃。关闭隐藏输入框。 双端验证默认值、保存、隐藏、编辑暂停、日常丢弃和关闭后保留；战后入口有业务测试。 [证据](browser/final-automation.json) |
| ✅ 多人／人宠合击 | 相邻行动、同阵营、同目标的普通近战攻击概率合击；玩家／宠物 50%，怪物 20%。 固定原作源码与玩家讨论交叉印证；两端真实玩家＋宠物普通攻击同时接近，边界测试覆盖反射／骑乘／死亡。 [证据](server/RESEARCH.md) |
| ✅ 雷萨利朵举炮 | 右炮臂以肩关节抬起瞄准，炮焰跟随炮口；保留图号、影子、漂浮与其他动作。 双端普通攻击出击／回位与 HAND 原地五炮通过，八向艺术检查与 42 项安装测试通过。 [证据](lisarido/browser/final-lisarido.json) |

## 验证

- 客户端／构建工具 244/244，TypeScript 通过；完整 Go test、race、vet 通过。
- 最终程序真实 Chromium 29/29 项：导航 3、策略／合击 20、艺术 6。两端各 6 场快速战斗后继续导航，战斗期移动数为 0。
- 57 个 HTTP 文件逐字节匹配，300 个原始输入摘要保持一致；另一个安装器测试脚本仅补清理断言与夹具名，已记录差异并重跑 42 项。两次构建二进制摘要一致。
- 42 项素材安装／升级、5 项艺术测试通过。三组私有实例 SIGTERM exit 0，SQLite 最终位置一致。
- [发行自动核验](release.json)、[浏览器导航](navigation/final-navigation.json)、[策略与合击](browser/final-automation.json)、[艺术](lisarido/browser/final-lisarido.json)。

## 最终产物

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `bin/saserver`，静态 Linux AMD64 | 16674976 | `c9118a90071366a2aedf38ef28cda70faa2e122792811a81d1be0caeb96aa8f4` |
| `bin/saserver-v0.2.19-LYNX-linux-amd64.zip` | 42197789 | `8349b51112aee7657962230fcb2c1d980bb53393dbd9e67510479868daf2ecf6` |
| `update/lisarido-v3-assets.tar.gz` | 2435124 | `420b024dddea2d6c9f0dd8f530cb19dd9e2f64c0394df639d6ef24bf8c798750` |

完整 ZIP 逐文件核验与工作区一致、可执行位正确、不含原 Assets／数据库／本机配置；已替换旧 v0.2.18 ZIP。更新时保留配置和存档，正常停服后替换匹配程序／客户端，执行 `bash update/install-lisarido.sh` 并刷新网页。

## 范围与限制

真实 Chromium 156 使用原生 UI 与授权 GM 命令，页面只读观测；移动为触屏／视口模拟，没有实体 Android／iOS／Safari 认证。仅隔离实例被启动与停服，没有部署或重启生产实例。

合击研究基于固定的公开原作代码变体及两篇可读取玩家讨论；未取得可用的同期官方公式，不杜撰固定敏差或额外倍率。三次失败回退与少见合击边界由确定性业务测试证明，真实浏览器验证实际默认逃跑与普通玩家／宠物合击。

本轮未重做相簿故事内容验收；相簿旧脚本与其他场景时序／验收假设失败均留在 intermediate 目录，不能作为最终通过记录。最终艺术聚焦部署、ATTACK 出击／回位、HAND 原地五炮与举炮特效。输入框生命周期、地图入口穿透、镜头、药物优先级及高防御最小伤害的独立审查问题已闭环。

[可视报告](index.html) · [过程](PROGRESS.md) · [原作研究](server/RESEARCH.md) · [发布说明](../../docs/v0.2.19-LYNX.md) · [stoneage 经验](../../docs/skills/stoneage/references/automation-and-navigation.md)
