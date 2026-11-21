# SA-1121-01 · v0.2.23-LYNX 验收

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
| 客户端／构建测试 | 289项通过，0失败 |
| 全src TypeScript | 通过 |
| 全部Go test／race／vet | 完整执行通过，源码前后摘要稳定 |
| 最终真实Chromium | 21项，页面错误0 |
| HTTP实际内嵌客户端与素材 | 78个文件逐字节匹配，gzip／HEAD／ETag／私有路径边界通过 |
| 重复构建 | 两次ELF SHA-256相同 |
| ZIP | 4380文件逐字节匹配公开白名单，CRC／执行位／摘要通过 |
| StoneAge Skill | 仓库版与安装版同步，quick_validate通过 |

完整命令与日志：[checks-status.json](checks-status.json)、[client-tests.txt](client-tests.txt)、[go-test.txt](go-test.txt)、[go-race.txt](go-race.txt)、[go-vet.txt](go-vet.txt)、[typescript.txt](typescript.txt)。

| 设备模拟 | 实际业务验收 | 结果 |
| --- | --- | --- |
| desktop | Sea of Tears NPC via real same-floor portal | 通过 |
| desktop | sea-exit: native exit navigation | 通过 |
| desktop | manual direction cancels a portal navigation intent | 通过 |
| desktop | nyx-return-passage: native NPC navigation | 通过 |
| desktop | eden-west-ordinary: native NPC navigation | 通过 |
| desktop | patched native experience for enemy 1969 level 130 | 通过 |
| desktop | patched native experience for enemy 1971 level 140 | 通过 |
| desktop | patched native experience for enemy 2165 level 130 | 通过 |
| desktop | patched native experience for enemy 2168 level 140 | 通过 |
| desktop | patched native experience for enemy 2239 level 80 | 通过 |
| mobile | Sea of Tears NPC via real same-floor portal | 通过 |
| mobile | sea-exit: native exit navigation | 通过 |
| mobile | manual direction cancels a portal navigation intent | 通过 |
| mobile | nyx-return-passage: native NPC navigation | 通过 |
| mobile | eden-west-ordinary: native NPC navigation | 通过 |
| mobile | patched native experience for enemy 1969 level 130 | 通过 |
| mobile | patched native experience for enemy 1971 level 140 | 通过 |
| mobile | patched native experience for enemy 2165 level 130 | 通过 |
| mobile | patched native experience for enemy 2168 level 140 | 通过 |
| mobile | patched native experience for enemy 2239 level 80 | 通过 |
| mobile | mobile native map survives landscape rotation | 通过 |

| 设备模拟 | 最终长路线 | 实际Move | 观测秒数 |
| --- | --- | ---: | ---: |
| desktop | sea-exit: native exit navigation | 352 | 178.684 |
| desktop | nyx-return-passage: native NPC navigation | 610 | 208.300 |
| desktop | eden-west-ordinary: native NPC navigation | 66 | 25.197 |
| mobile | sea-exit: native exit navigation | 352 | 143.323 |
| mobile | nyx-return-passage: native NPC navigation | 610 | 171.611 |
| mobile | eden-west-ordinary: native NPC navigation | 66 | 21.513 |

上述秒数从目录选择前计时至到达截图完成，包含UI交互、规划、服务器逐步移动、软件GPU与渲染等待；不是纯规划CPU，也不是实体手机性能承诺。最终每条路线均无PosCorrect。

最终浏览器：[final.json](browser/final.json)、[完整输出](browser/final-run.txt)。正常SIGTERM退出0、最终人物位置落盘一致。HTTP独立实例也正常SIGTERM退出0。构建源码／client/dist／内嵌static由[production-inputs.json](production-inputs.json)绑定；最终ELF SHA-256：`50cb389bca454ad6b37aab1016c2066e5ec6f8ab57ded90c5f7b3777ee69788d`。

## 交付与限制

最新静态Linux AMD64为bin/saserver，完整ZIP为`bin/saserver-v0.2.23-LYNX-linux-amd64.zip`，旧ZIP已在校验后替换。ZIP SHA-256：`329c8131a2988debf62090630ccc571b98b44cf7940e30395ba103ca799bee2c`。完整字节与文件数见[release.json](release.json)。无新增Assets、数据库迁移或空素材补丁，保留既有独立素材包；原始Assets、测试账号、数据库、凭据、日志与会话数据不提交。

移动为真实Chromium的390×844触屏／视口模拟及844×390横屏，使用SwiftShader软件GPU；未认证实体Android/iOS/Safari。浏览器经验验证使用隔离原始数据与原生GM命令定点召唤，未冒充生产自然随机遭遇。全域数据/图审计不能替代每个任务状态、NPC对话和世界路线的穷举实机认证。条件、任务、随机及对话传送继续由服务端决定；不是任意多层世界寻路。水中扣血等原生规则保留。

基线低HP被水中送岸与状态等待不足、脚本校正等中间结果保留，不计入最终成功。第一次最终桌面矩阵完成业务断言后，清理AI设置时读到过期关闭热区而中断；该轮以candidate-close-race完整保留，修正脚本后重新执行全部桌面／移动场景。只有窗口实际关闭且对应热区消失时才接受该竞态，未放宽业务断言。具体过程见[PROGRESS.md](PROGRESS.md)。最终仅采用匹配ELF、完整场景且正常退出的结果。用户原Prompt修改保留，核心任务勾选与执行结果由本轮追加。
