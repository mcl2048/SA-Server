# SA-1115-03 · HTTP、会话与停服审查

审查日期：2026-11-15。基线：`9a56234`（v0.2.20-LYNX）；与其他任务共享工作树，最终发行及最终集成验证由主 Agent 统一完成。

## 结论与变更

未在本次覆盖的 HTTP、连接保留、正常 SIGTERM 存档路径中确认需要修改生产代码的缺陷。保留现有边界，新增真实子进程／WebSocket／SQLite 集成验收 `TestSIGTERMSavesDetachedPosition`，覆盖此前缺失的离线角色退出保存路径。

新验收先将角色位置只改在世界内存；断开其控制连接后，第二个 WebSocket 客户端通过实际登录与角色列表确认 `online=true`、`background=true`。SIGTERM 前直接查询 SQLite，确认该位置尚未落库，避免普通断线存档造成假阳性；正常退出后再次查询，确认离线角色位置已保存。这是已存在行为的新增验收覆盖，原版即通过，未将其宣称为漏洞修复或红绿回归。

## 新检索的官方资料

修改测试前重新联网获取并阅读，未沿用历史报告代替检索：

| 来源 | 核实事实 | 本项目采用／核对 |
| --- | --- | --- |
| [Go net/http — Server.Shutdown](https://pkg.go.dev/net/http#Server.Shutdown) | Shutdown 先关 listener，ListenAndServe 会提前返回；调用者必须等 Shutdown 返回；它不关闭或等待被劫持的 WebSocket。 | `main.go` 单独等待 `httpDone`，并等世界／共享家族保存队列。WebSocket 不能被误算为 HTTP drain 的组成部分。 |
| [Go net/http — Server](https://pkg.go.dev/net/http#Server) | ReadHeaderTimeout 仅限制请求头；IdleTimeout 限制 keep-alive 空闲。 | 当前设置 10 秒请求头、2 分钟 keep-alive；游戏 WebSocket 另有未登录 30 秒、登录 90 秒读超时。 |
| [coder/websocket — Conn.Close / CloseNow](https://pkg.go.dev/github.com/coder/websocket#Conn.Close) | Close 执行受限时间的关闭握手；CloseNow 立即终止；上下文取消与连接关闭会唤醒读写。 | 顶号先发送 terminal close reason；读循环最终 CloseNow；测试断网使用 CloseNow，不借 HTTP server.Close 假定 WebSocket 已关闭。 |
| [Go Data Race Detector](https://go.dev/doc/articles/race_detector) | race 仅发现实际执行路径中的竞态，无法证明未覆盖路径无竞态。 | 会话接管／断线／密码变更及真实 SIGTERM 运行 race，报告保持覆盖范围。 |

## 源码核对范围

- `server/cmd/saserver/main.go`：配置后启动世界、HTTP route、正常停服、`noListing` 描述符关闭。
- `server/cmd/saserver/gzip.go`、`server/webclient/*`：发布文件白名单、静态资源压缩及条件请求、HEAD、预压缩避免重复压缩；外部客户端重新读取与 ETag 更新。
- `server/internal/server/session.go`、`session_resume.go`：逻辑角色与传输连接分离、过期凭据、接管栅栏、多角色及密码撤销；断线传输 `closed` 在编码前直接返回。
- 只读核对 `World.Do` 的 stopping 栅栏、`Run` 的最后快照与 saver join，以及共享 Families worker drain；不修改主 Agent 所有的挂机／战斗生产文件。
- `scripts/build-linux.sh`、`stage-client.mjs`、`package-linux.py`、`.github/workflows/release.yml`：客户端先构建再进入 embed，产物允许列表、二进制摘要与原子替换、独立素材包边界。最终版本号、包与 HTTP 内容一致性仍由主 Agent 执行。

## 已执行验证

| 命令（`server/`） | 结果 |
| --- | --- |
| `go test ./cmd/saserver ./internal/server ./webclient -count=1` | PASS；cmd 39.144s、server 9.491s、webclient 0.474s。 |
| `go test ./cmd/saserver -run '^TestSIGTERMSavesDetachedPosition$' -count=1 -v` | PASS；1.550s；实测 SIGTERM 排空约 48ms，保存的是断线后仍在内存的角色。 |
| `go vet ./cmd/saserver ./internal/server ./webclient` | PASS。 |
| `go test -race ./cmd/saserver ./internal/server ./webclient -count=1` | PASS；cmd 92.857s、server 95.589s、webclient 5.345s，包含新增离线 SIGTERM 路径。 |
| `go test ./... -count=1` | PASS；cmd 51.446s、battle 4.139s、data 41.928s、server 16.304s、store 2.297s、world 86.204s、tests 30.859s、webclient 1.166s；proto/tools 无测试文件。 |
| `git diff --check`（仓库根目录） | PASS。 |

## 适用范围与限制

新增测试是真实 WebSocket 协议客户端和真实服务进程，不是 Chromium，也不代表实体移动设备认证。未停止既有生产进程，数据库和配置全部位于测试临时目录。

正常 SIGTERM 的队列排空不能等同磁盘写入永不失败；每笔持久化仍有独立超时／错误日志，磁盘满、硬件故障、SIGKILL／掉电不在成功保证内。服务端重启会清除内存中的挂机意图、恢复令牌与进行中的战斗，不补算停服收益；这一现有契约在手册中已明确，不应在交付时描述为跨重启永久挂机。

HTTP Shutdown 不等 WebSocket 是 Go 官方接口契约。当前世界先进入 stopping 并保存所有保留角色，随后进程退出；因此此次没有仅凭接口契约就新增大范围连接管理。后续若需要长时间保持“HTTP 已停、进程仍运行”的运维模式，必须另外设计传输通知与 join，不能把 `Shutdown` 误当作 WebSocket drain。

## 主线候选的独立业务边界复核

主线功能实现后追加只读审查：`automation.go`、`automation_field.go`、`fight.go`、`item.go`、`pet.go`、`party.go`、`quest.go`、`aismart.ts` 和 `automation_release_test.go`。为避免与最终验证争用资源，本轮不再运行完整测试或 race。

发现两个具体控制流问题并立即反馈主 Agent，主 Agent 新增专项先复现失败，再修复通过；独立复核已检查最终源码、测试断言及实际红绿输出：

1. **显式自动逃跑时主宠失去防御，已修复。** 新 `automationBattle` 复用 `chooseAutomation` 返回的主宠结果，但后者显式 `AutoEscape` 分支原先直接返回 `Escape, -1, -1`。此前会再调用 `chooseAutomationPet` 并选防御；复用后主宠提交 `battle.None`，其他宠物仍正常防御。最终实现使这个提前返回也计算主宠决定。`TestAutomationReusedPrimaryPetStillGuardsOnFailedEscape` 使用具备防御技能的主宠检查实际回合 `guard` 事件；修改前出现预期失败，修改后通过。
2. **换图后可能先消耗补给才停止挂机，已修复。** 新野外补给原先早于 `e.floor != a.floor` 检查，补给成功后 `continue`。换图且 HP／MP 低、库存足时会在新图连续吃补给至阈值，才走到既有换图停止规则。最终实现将地图失配撤销遇敌移至任何补给前。`TestAutomationChangedFloorStopsBeforeUsingSupplies` 验证失配、HP 1、有肉的 tick 不消耗道具且取消遇敌，原因明确为地图改变；修改前实测 HP 1→22、肉被消耗且遇敌仍开启，修改后通过。

证据：[review-red.txt](review-red.txt) 记录两条预期失败；[automation-green.txt](automation-green.txt) 记录修复后的自动化专项通过（18.312s）。额外新增 `TestAutomationFieldRecoveryMPAndParticipatingPetsUseNativeEffects` 以原生 1510／1500 药品证明人物 MP 和出战宠物 HP 实际恢复、道具只消耗一次、休息宠 HP 保持、空包不制造恢复。此处读取的是主线执行结果，没有重复启动测试；最终完整 test／race／vet 及二进制一致性由主 Agent 在最终集成后另行记录，不能用先前 HTTP 审查回归代替。

其余核对结果：

- 展示短路不绕过 `itemsChanged` 的背包序列化、变身／外观更新及保存；不绕过 `petsChanged` 的宠物序列化和保存。`afterMemberTurn` 先执行 `afterTurn` 与物品实际消耗，`endMember` 仍结算经验、石币、掉落、培养、骑宠和最终保存。`sendBattleStart` 本身只有投影，接管快照走当前状态恢复。
- `sendStatus` 的本角色投影可以短路，但 `partyUpdate` 始终执行；后者只略过离线接收方并延迟构建共享消息，在线队友仍得到离线成员 HP／MP。新验收已覆盖这条重要分支。
- `sendQuests`／`refreshQuests` 只跳过投影；任务事件持久化不在这些函数中。离线时保留 dirty，Attach 会重新构建当前列表。
- 新野外恢复仅在 `encounter && (autoBattle || quick)`、非战斗、非编辑租期、非交易／观战／摊位／购买及无窗口时执行；每角色一秒至多一件。实际效果、堆叠消耗、保存仍复用 `useRecoveryField`，选品按真正 use function／参数，并排除战斗专用与负作用品，阈值 0 禁用。人物 HP、当前出战／待命／骑乘宠物 HP、人物 MP 顺序明确；寄放、邮件、守护和倒地宠物排除。
- 战后丢肉通过 pending 状态延迟至非忙碌且无窗口／编辑租期，恢复优先于清包，避免战利品还可补给时先删除。
- 服务端三种自动逃跑入口共用本场实际失败事件数，事件 Actor／Kind／OK 与 `Automatic` 约束保留；新场重置。客户端 `smartChoose` 的危险逃跑与无捕获目标分支也共享三次上限；标准自动入口在三次后走正常策略。

## 最终收尾复核：协议与发行输入

追加只读检查地图地点协议、真实资源语义及发行输入，未重复启动完整 test／race／vet，未修改主线业务或脚本。

**数据边界核对：** `NpcListReq` 仅在角色已进入世界时转发，`NpcList` 继续校验角色和请求楼层存在。既有 `NpcList`／`MapReq` 明确将地图与 NPC 位置视为公开数据且允许查询其他层，完整 gamedata 原已进入公开发行包；`minimapReveal=0` 控制探索显示，不能解释为服务端地图保密边界。新 MapPlace 仅有名称、楼层、源入口坐标和条件标志，不包含账号、玩家位置、条件脚本或认证材料。移动仍逐步走 `World.move` 的速度／通行／斜角检查，条件传送仍由服务端 `freeWarpDest`／`passCheck` 执行，目录展示不授予通行权限。未确认新增保密或越权问题。

本轮发现并即时反馈主 Agent 的两个具体问题：

1. **optional 数组跳过嵌套零值填充，已修复。** `NpcList.places` 声明为 `MapPlace[]?` 时，生成器 SCHEMA 跳过整个字段；Go `MapPoint` 的 `omitempty` 将零坐标省略，客户端 `fillDefaults` 因而不会为入口补回 `x=0`／`y=0`，导致零坐标被 `navigatePlace` 的整数校验拒绝。轻量调用真实生成模块已复现 `{entrances:[{y:8}]}` 填充后 `x` 仍为 undefined，`Number.isInteger` 为 false。最终协议改为正常数组并重新生成 Go／TypeScript；`NpcList` SCHEMA 递归填充 MapPlace／MapPoint，旧服务器缺失 places 时仍得到空数组。独立复核已读真实 `Connection` 解码→Field→navigatePlace→Move 的新增测试，既验证 x=0／conditional=false，也验证旧服务端缺失字段。[map-places-wire-red.txt](map-places-wire-red.txt) 为预期断言失败，[map-places-wire-green.txt](map-places-wire-green.txt) 25/25 通过。
2. **条件传送入口被目录整体过滤，已修复。** `NPCWarps` 为 FREEMORE 配置生成的默认目的地为本层（无条件匹配时留在入口），原 `mapPlaces` 的 `ToFloor != floor` 过滤会排除这些入口，未读取实际条件分支的 TO。实际资源中世界 703 的 `(334,182)`、`add80/eden3/lumberjack/lumberjack.create` 引用 `warppoint3.arg`，按条件前往 7454 或 7453，目录原实现漏掉。静态源文件检查共识别 18 个 FREEMORE NPC，不等于已证明 18 个都可走。最终目录使用有效 `g.Warps`，按目的楼层分别合并入口，读取全部合法条件 TO，过滤源不可走、目标不存在／越界和同层目的地，同源同目的地去重并标条件入口。`data.FreeWarpPoints` 从原生 `freeWarpDest` 提取读取循环，保留原先 `ArgField`、逗号／& 格式、十目的地上限及遇不完整元组即停止的语义；实际传送仍先 `passCheck`，保留随机选择及 CHECKPARTY 副作用，目录不执行这些业务。独立已复核 helper 与原实现逐项相同，并读真实 703 资源和合成非法／重复目的地的测试断言。[map-places-conditional-red.txt](map-places-conditional-red.txt) 为两条预期失败；[map-places-conditional-green.txt](map-places-conditional-green.txt) 通过（3.895s），有效目录为 1206 层、3309 地点、5002 个“源入口／目的楼层”对应关系，一个源格可对应多个条件目的地；703 现为 12 地点。

**发行输入核对：** 版本默认值在入口、Linux 构建脚本、打包脚本均为 `v0.2.21-LYNX`。打包仍为允许列表，引用新版本说明；不把完整 Assets、数据库或 `config.local.yaml` 加入 ZIP。仓库跟踪的 `assets/` 仅 README；游戏资源包保持独立更新包形式。源码构建顺序仍为客户端→允许列表 staging→embed→Linux AMD64 原子替换→摘要。此时完整 ZIP／新说明仍由主线收尾生成，本次只读审查不把旧 ZIP 或当前候选二进制宣称为最终发行验收。
