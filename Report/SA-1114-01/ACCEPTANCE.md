# SA-1114-01 · v0.2.12-LYNX 验收

基线 `1c5bd7f / v0.2.11-LYNX`。本轮修复战斗死亡与击飞离场状态，重排手机全屏游戏内UI。最终发行摘要以 [release.json](release.json) 为准；本文说明证据覆盖的实际边界。

## 战斗根因与行为

旧发行 ELF 的真实浏览器复现中，敌人被打到 HP0 且 Fly>0 后，同回合被另一敌人的 `ENEMYSKILL_ReLife(500)` 拉起，再执行排队攻击；下一回合仍受到我方攻击。客户端此时已经移除了模型，因此出现用户所述“晕厥/击飞敌人仍出手、攻击空位仍有伤害”。原游戏数据确有28条敌人记录配置该能力，8条组记录引用；夹具只在私有临时数据中安排可控遭遇，不修改发行gamedata或伪造客户端事件。

服务端 `Alive`、魔法/道具目标、敌人辅助技能与自动策略统一排除逃跑/击飞单位。HP≤0的普通倒地立即停止行动，仍允许明确复活；击飞是本场永久离场。合法复活清除异常和上一次死亡的击杀归属。客户端每次HP写入同步dead，致死毒伤播放死亡；普通命中、魔法和敌人复活实际播放时再次排除gone/fly。活宠和其他队友仍可继续行动。

| 证据 | 已覆盖行为 |
| --- | --- |
| [旧版真实战斗](browser/baseline-knockout.json) | 实际Fly→ReLife→继续攻击→后续空位受伤，保留协议与截图 |
| [战斗根因审查](BATTLE-KNOCKOUT.md) | 人物/宠物/敌人、同回合与后续回合、普通/毒/反射KO、合法复活及离场变体 |
| [服务端修前失败](knockout-before.txt) / [修后](knockout-after.txt) | 真实Resolve队列复现；咒术/道具/敌人复活一致性 |
| [自动策略修前](automation-knockout-before.txt) / [修后](automation-knockout-after.txt) | 不为已击飞宠物浪费复活回合或物品 |
| [客户端修前](battle-client-red.txt) / [修后](battle-client-green.txt)、[支持复活修前](battle-support-red.txt) / [修后](battle-support-green.txt) | 毒死双方/人物/宠物、正常复活、迟到空位命中与原生敌人复活 |
| [最终真实自动/快速](browser/candidate-knockout.json) | 两种模式的击飞永不恢复、实际胜利且客户端返回地图；另验证HP0未击飞各结算一次 |

## 手机原生UI

“界面→游戏画面→全屏游戏界面”始终占据可见设备屏幕，菜单、登录、NPC、提示与战斗子页在游戏视口内排版。场景保持等比，原生窗口九宫格、菜单/战斗图标、道具CG、宠物模型与地图本来的图层都来自既有游戏素材。真实输入框保留身份、选区和原事件；所有按钮仍进入原动作ID，经当前热区和screen/modal/battle校验，不另造游戏指令。

背包按当前真实槽位排图格，保留数量、说明、石币及原双击使用/装备和点选移动语义；宠物以每只的名称、HP、状态及操作组成卡片，详情只展示当前宠物和扩展资料。宽横屏内容与命令分列，竖屏/短屏自然滚动。窗口切换复位滚动；鼠标/缩放保留在“更多操作”。地图轻点精确进入原寻路，拖动进入原`MapWindow.pan`；取消、第二指、失焦、隐藏和上下文变化清理输入，队列合并move但保留start/move/release顺序。素材解码串行，预览与图标缓存有界。桌面原绘制和鼠标路径保留。

最终真实Chromium矩阵包含62项检查：桌面原生鼠标菜单；经典/全屏各5尺寸；6类菜单；5尺寸×6窗口的边界、无横向溢出、触控尺寸与横屏分栏；真实道具CG/宠物模型和取消改名；地图实际拖动/取消/精确寻路移动；摇杆移动/释放；短屏抽屉滑动；正常手动战斗、宠物子页、目标、结果返回及服务端确认的自动/快速战斗。视口为320×568、390×844、430×932、844×390、568×320。

- [最终矩阵协议/几何](browser/final-real-game.json) 与 [监督进程退出状态](final-matrix-status.json)
- [背包原CG截图](browser/final-adaptive-inventory-art.png)、[宠物原模型](browser/final-adaptive-pet-native-portrait.png)、[横屏地图](browser/final-adaptive-map-844.png)
- [设计与独立复审](MOBILE-WORK.md)、[地图触摸独立复核](mobile-pointer-review.json)、[复现脚本说明](browser/README.md)

## 构建与回归

| 检查 | 结果/证据 |
| --- | --- |
| Go全包 | `go test -count=1 -buildvcs=false ./...`，退出0；[日志](go-test.txt) / [独立监督状态](go-test-status.json) |
| Go race全包 | `go test -race -count=1 -buildvcs=false ./...`，退出0；[日志](go-race.txt) / [状态](go-race-status.json) |
| 最终客户端/构建回归 | 151项通过；[日志](client-tests.txt)，最终命令及明确退出状态见[final-checks-status.json](final-checks-status.json) |
| TypeScript / vet | 无错误；同上最终命令状态。最终嵌入快照另跑webclient包 |
| 同输入重复构建 | Linux静态AMD64，0755；[二进制两次构建SHA相同](build-repeatability.json) |
| 内嵌HTTP | 46文件（HTML+44JS+封面）与源码输出逐字节一致；gzip单次解码、显式排除gzip、304、空HEAD、11个私有路径404、既有9个补丁文件一致；[证据](binary-http-verification.json) |
| 正常停服 | HTTP/浏览器自建进程均SIGTERM退出0；实际角色位置与SQLite一致；[HTTP退出](binary-http-shutdown.json) |
| ZIP | 所有条目匹配当前公开文件，程序0755、SHA正确、无运行数据或Assets；[包校验](package-verification.json) |

本轮生产Go修改后完成全套normal/race；随后仅调整移动端源码与重新生成嵌入快照，最终再检查webclient和vet。HTTP/停服审查未发现需要扩大修改的明确P0/P1，沿用已存在的存档排空机制，见 [独立审查](SERVER-REVIEW.md)。版本升级为v0.2.12-LYNX，旧ZIP在新包校验后替换；Assets未追加，不需要新增补丁。

## 失败记录与验证边界

保留RED/GREEN及中间验收，不能用候选通过替代最终SHA。工具长会话曾返回143，即使日志完整也未据此认定退出成功；最终使用独立监督进程记录真实退出码。高负载并行测试中既有素材deadline测试一次未等到异步读取启动，保留[失败日志](client-tests-loaded-failure.txt)；最终完整串行151项通过，未删除或放松断言。

中间地图脚本点击map-me工具后，对滚到屏幕外的图层发出触摸；独立复现落点y=-440、elementFromPoint=null。脚本改为工具操作后滚回图层并验证命中。初轮正常自动battle已收到胜利，但多回合动画队列超过通用90秒等待；夹具正常播放等待放宽360秒，必须等真正返回地图，不注入跳过状态。记录在`browser/intermediate-*`与`pre-final-*`。

另一次夹具在观察到结果关闭按钮后，原生结果窗口的5秒超时已将其收起，旧脚本仍等待那个已消失按钮。运行器仅在当前确已无结果按钮、无其他窗口时接受原生超时关闭；其他失败继续抛出。证据保留在`intermediate-result-expired-*`，没有修改游戏结果窗口时长或绕过胜负。

这是实际Chromium、真实服务/素材/网络与触屏视口模拟，使用SwiftShader软件GPU；不等于实体Android/iOS、Safari、系统键盘或刘海安全区认证。键盘视口收缩、输入身份和取消另有自动回归，未把模拟结果冒充实体IME验证。普通宠物详情预览为稳定静态姿态，原战斗/桌面动画保留。未穷举全部NPC、交易、技能与所有设备；普通复活能力属于保留的游戏规则。I/O错误、强杀/断电、网络容量等既有运行边界没有被本轮有限测试消除。
