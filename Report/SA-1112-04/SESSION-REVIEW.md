# 会话恢复、角色驻留与离线交互审查

本记录对应 SA-1112-04 的会话服务端实现。自动挂机算法、多宠战斗、客户端恢复及协议生成由并行任务负责；本记录只声明实际完成并验证的会话行为。

## 实施范围

- `server/internal/server/session.go`、新增 `session_resume.go` / `session_resume_test.go`：账号逻辑会话、随机令牌、控制权迁移、断线与登出分离。
- `server/internal/world/world.go`、新增 `presence.go` / `presence_test.go`：角色连接状态、恢复快照、250ms 自动挂机调度接口、共享移动入口。
- `server/internal/world/addressbook.go`、`trade.go`、`duel.go`：离线邮件与交互边界。
- 不修改协议源与客户端，不构建发行二进制，不单独提交并行代理的变更。

## 角色与连接生命周期

`accountSession` 独立于 WebSocket，记录账号、当前控制连接、世界实际安装的最近 transport、角色身份和线路。角色数值、背包、金币、队伍、战斗和自动配置仍以世界 goroutine 中的同一个 entity 为准。

浏览器关闭、网络读写失败、心跳超时触发 `World.Detach(id, client)`：

1. 验证 client 恰为 entity 当前连接，过时连接无效。
2. 标记 `connected=false`，取消交易、商店买卖、NPC 窗口与观战。
3. 保留角色、坐标、队伍、PvE 战斗房间、现有定时器和自动配置。
4. 不执行真正下线流程，不触发登出道具移除、队伍解散、邮件宠物提前回收或重新登入附加效果。
5. PvP 保留原有断线弃战与 DP 处罚，清理对战开关并广播当前标记；禁止离线角色接受新挑战，包括待参战队伍中含离线成员的情况。

真正 `Logout` 才撤销令牌、停止自动挂机、执行 `World.Leave`、清除认证，并发送空令牌 Session。客户端应回登录界面。存档先完成 Flush，防止立即重登加载旧金币、物品或位置；存储繁忙时保留 account 的 flush 栅栏，下一次密码认证继续等待成功后才能重新入场。

断线输出直接丢弃，不缓冲离线历史事件；transport 结束时清空未写出的编码队列。恢复依赖当前状态快照，不重放战斗回合或奖励。

## 令牌与控制权合同

- 密码认证或注册成功后，服务端用 `crypto/rand` 生成 32 字节随机 bearer，base64url 编码后长度 43。
- 浏览器只需持久化 bearer；服务端令牌索引保存 SHA-256，令牌既非账号名也非密码/密码摘要。
- 每账号只保留一个当前令牌、一个控制连接；新密码登录替换旧令牌并立即迁移现有角色，不重新读取旧存档或选择角色。
- 同令牌恢复不反复生成永久记录或轮换令牌；期限为首次生成后 30 天，过期只拒绝恢复，不凭此删除世界中的挂机角色。
- 内存记录上限 10,000；容量回收只考虑没有控制连接、没有驻留角色且没有待完成存档栅栏的记录，不挤掉离线挂机角色。
- 每条已认证游戏指令、断线分离、接管及登出都在账号锁内串行，并检查 `controller == session`。旧连接迟到的移动、交易、战斗、登出或清理均不能控制新连接的角色。
- 全局服务器锁仅保护索引，不在持锁时等待世界操作或账号锁，避免跨线路接管死锁。
- 本人修改密码轮换令牌并保留当前连接；密码重设或 GM 修改调用令牌撤销能力。GM 回调异步执行，避免 world goroutine 再次等待自身 `World.Do`。

进程重启会清空令牌和内存自动状态。角色持久进度仍由正常存档恢复，但浏览器需要重新输入密码；本实现不模拟服务器进程关闭期间的战斗或奖励。

## WebSocket 消息合同

| 场景 | 顺序 |
| --- | --- |
| 首次密码登录/注册，无驻留角色 | `AuthResult(ok)` → `Session(token,resumed=false,inWorld=false)` → `ServerList` |
| 新设备密码登录，已有驻留角色 | `AuthResult(ok)` → `Session(newToken,resumed=true,inWorld=true)` → 当前角色快照 |
| 相同浏览器 bearer 恢复角色 | `Session(token,resumed=true,inWorld=true)` → 当前角色快照；不重复 `AuthResult` |
| bearer 恢复大厅账号 | `Session(token,resumed=false,inWorld=false)` → `ServerList` |
| 无效/已撤销/已过期 bearer | `Error(code="resume_failed")`，连接保留未认证状态 |
| 显式 Logout | `Session(token="",resumed=false,inWorld=false)`，服务端清认证 |
| 本人修改密码 | `AccountResult(ok)` → `Session(newToken,resumed=false,inWorld=current)`，不重建战斗界面 |

新控制连接替代旧连接时，旧连接收到 WebSocket 1008，reason 为 `session_replaced`。密码重设或 GM 撤销使用 `session_revoked`。关闭帧先发送再取消 reader，避免 `CloseNow` 抢先吞掉终止原因。客户端应对这两种原因停止旧 controller 自动重连。

## 恢复快照与副作用隔离

`World.Attach(id, oldClient, newClient)` 验证现有 entity 的旧 client 身份，先清理临时交易/商店/窗口/观战，再安装新 client。这个清理也覆盖新设备接管先于旧 read loop Detach 的情况，防止新浏览器继承看不见的交易锁。

快照包含 Self、Flags、Status、Inventory、Pets、Quests、AddressBook、FamilyStatus、EnterFloor、可见对象及自身标记、PartyMember、GM 菜单。家族快照读取持有共享 family 锁。

**EnterFloor 先于 AutoPlayState，AutoPlayState 先于 BattleStart。** 前者让浏览器创建地图界面，后者让浏览器先恢复 quick/auto 设置再重建当前战斗。战斗快照提供现有 fighters、当前回合与已提交状态，不重放历史动画、资源消耗或结算。已有房间和战斗定时器继续运行；恢复本身不重新计时。

快照不调用 `World.Enter` 或 `placeOnFloor`，因此不重新应用登入装备效果、不增添登录次数、不传送或踢出队员，也不提前召回仍飞行中的邮件宠物。

## 交易、队伍与邮件

- 队伍保留同一 entity 与 party slots，跟随、共同进入 PvE 与奖励结算仍走现有世界逻辑；不从 DB 克隆离线队员。
- 断线与直接设备接管均取消原有交易、商店操作。新邀请拒绝没有真正附加浏览器连接的对象。
- 名片“在线”仍表示角色驻留世界；普通信件按是否存在附加 transport 决定即时投递或 SQLite 离线存储。
- `TakeMails` 和 world 回调之间再次断线时，已取出的信件回存 SQLite，不静默丢弃。
- 新宠物邮件拒绝离线挂机接收者；飞行中接收者离线则按原退回路径处理，避免完成资产移交却丢失到达通知。
- 普通信件仍沿用原有“发入 WebSocket 队列即投递”模型，没有新增浏览器 ACK；发送瞬间断链的极短窗口不在本次可靠投递保证内。

## 已执行验证

真实 WebSocket 测试使用 `httptest`、真实 websocket 客户端、SQLite 和运行中的 World，覆盖：

- 登录并进入角色后关闭 transport，角色人数仍为 1。
- 同 token 恢复读取当前方向而非旧 DB 位置，并保持同一世界角色。
- 新密码登录轮换 token、自动接管驻留角色，旧 token 无法恢复。
- 旧连接实际收到 1008 / `session_replaced`。
- 迟到旧 transport 清理不会移除新控制角色。
- 显式 Logout 移除角色并撤销 token；密码重设撤销既有 token。

世界回归覆盖：

- Detach/Attach 不改变角色、party 或 PvE 房间身份。
- 快照钱包状态正确，不重新加载旧数值。
- 活动交易直接接管立即取消；旧 Detach 不胜过新连接；新断线再次取消交易。
- 离线新交易与决斗被拒绝。
- 普通离线信持久化、恢复送达一次，数据库不残留重复信。
- 恢复消息顺序满足 EnterFloor → AutoPlayState → resumed BattleStart，并保留 quick/auto 配置。

使用工具链 `/home/coder/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.27.3.linux-amd64/bin/go`，限制 `GOMAXPROCS=2 GOMEMLIMIT=400MiB`：

```text
go test -p=1 ./internal/server ./internal/world -run 'TestSessionDisconnect|TestResumeToken|TestPresence|TestOfflineOrdinary' -count=1
server PASS 4.207s; world PASS 1.779s（最终恢复顺序与生命周期回归）

go test -race -p=1 ./internal/server ./internal/world -run 'TestSessionDisconnect|TestResumeToken|TestPresence|TestOfflineOrdinary' -count=1
server PASS 15.252s; world PASS 14.196s

go test -p=1 ./internal/server ./internal/world -run 'TestPresenceCancelsTrade' -count=1
server 编译 PASS; world PASS 2.405s（直接接管活动交易补充回归）
```

完整 `./internal/server` 测试通过 3.281s。完整 `./internal/world` 当时唯一失败为旧 `TestBattleFlow` 的经验断言：新经验表允许升级消耗累计经验，不能再把剩余经验直接等同单场所得；该旧断言已交由主代理统一修正。30 天令牌过期已实现检查，但未单独模拟时间过期；不将其列为已测试用例。

## 客户端只读复核交接

复核 `client/src/net.ts` 与 `main.ts` / `screens.ts` 时，已向主代理提交以下竞态，客户端由主代理修改，本文不声称其已修复：

1. `app.connect()` 在 Hello 后才设置 `app.net`，没有 pending Promise 时，自动恢复尚未握手完成又点击登录会建立两个连接；同 token 相互接管，且 Field 可能仍绑定早先的 Connection。应单飞连接创建，并隔离过时连接的全局 UI 回调。
2. Hello 后自动发送 Resume，同时登录表单在 `await app.connect()` 后发送 Login，可能 Resume 已恢复认证导致第二条 Login 不返回 AuthResult。应把自动恢复握手与人工密码认证明确串行。
3. Hello 等待超时后若未关闭那条 Connection，迟到 Hello 仍能自动 Resume 并改动 UI，与人工重试连接竞争。失败路径应停止旧 transport。
4. 冻结恢复或网络切换后 socket 可能暂时仍显示 OPEN，但连接实际半开。仅发送 Ping 没有 Pong 截止时间可能长时间停留旧画面；建议恢复时有心跳 watchdog，并为新 transport 设置 Hello 期限。
5. `session_replaced` 不删除 localStorage token 是为了同浏览器新 tab 的相同 token 不被旧 tab 清掉；新设备密码接管时旧设备可能保留失效 token，下一次刷新会先收到 resume_failed。当前服务端已确保它不能重新获得控制权；客户端可在不破坏同浏览器多 tab 共享恢复的前提下改善提示。

还提示自动引擎：世界手工 move 原依靠浏览器预测自身位置，server 自动 move 必须额外同步自身位置；该项由主代理/自动引擎所有者处理。恢复 BattleStart 的倒计时精确剩余值也由 battle 所有者统一完善，不通过重置房间计时器实现。

## 后续客户端网络层实施

主代理随后授权本任务接管 `client/src/net.ts`，其余 `main.ts` / `screens.ts` 由主代理修复。本任务新增 `client/test/net.test.ts`，没有修改其余客户端源码或再次更改服务器实现。

网络 API：

- `ready(): Promise<void>`：首次握手中，无 token 时等待 Hello；有 token 时继续等待 Resume 对应 Session。恢复大厅也须确认 Session 才交出连接。初次就绪总期限 30 秒，防止界面永久等待。
- `recovering`：当前 transport 尚未完成 Hello / Resume 握手，包含首次 ready 已完成后的网络重连。
- `recoveredSession`：当前 transport 通过 Resume 认证，包括大厅恢复；显式空 Session 清除该标记，普通密码登录不设置该标记。
- 每次新 transport 的 Hello 期限 8 秒，Hello 后的 Session 也有 8 秒期限。有 token 时关闭过时连接并退避重试；初次成功后的恢复可继续重试，角色始终在服务器运行。
- online / pageshow / visibilitychange 唤醒和周期心跳都使用唯一 seq 的 Ping；5 秒内未收到匹配 Pong 则更换 transport。无关 Pong 不取消待验证连接的 watchdog。
- 关闭或替换 transport 时清理相关计时器和旧回调；旧连接迟到消息不能修改新状态。显式 close 拒绝尚未完成的 ready，但保留恢复凭据。
- 令牌删除使用 localStorage compare-and-remove，过时 tab 不会删除另一个 tab 已保存的新 token；日志继续隐藏 Resume / Session bearer。
- Promise 构造时内部登记 rejection handler，允许 UI 稍后 await 而不产生提前的 unhandled rejection；调用方仍会收到原始 ready 失败。
- 构造函数采用普通参数与显式字段，兼容项目 Node `stripTypeScriptTypes` 构建，不使用参数属性。

新增 15 项确定性假时钟 / WebSocket 测试，覆盖密码握手时序、恢复 Session 就绪屏障、恢复大厅与 Logout 标记、Hello/Session 超时复用一个 ready Promise、唤醒半开连接与正确 Pong、冻结期间旧世界事件抑制、前台恢复立即换 transport 取快照、无可见性变化的 freeze/resume 生命周期、BFCache pageshow 恢复、隐藏期间恢复握手、终止顶号、撤销及新 token 保护、30 秒初次总截止、主动关闭清理、无 token 握手失败与迟到消息隔离，以及所有认证日志字段脱敏而实际线上消息保持原值。

```text
node --test client/test/net.test.ts
15 / 15 PASS，460.935ms

Node stripTypeScriptTypes(client/src/net.ts)
PASS，可擦除 TypeScript 语法验证通过
```

这些测试未使用真实浏览器网络栈；多连接单飞、表单等待恢复及原生浏览器整合验证仍由主代理完成。前述只读发现不再全部处于未实施状态：network watchdog、Hello/Session 期限与 ready 屏障已在本节落实，main/screens 的界面调用方修复应以主代理最终验证为准。

冻结恢复期间，后台不向 UI 分发世界/战斗事件，只保留 Hello、Session、Error、Pong、AuthResult 控制消息；即使 document.hidden 已变回 false，只要 visibility/resume 回调尚未处理也不放行旧帧。前台恢复会立即关闭原 transport、隔离迟到回调并以同 token Resume 获取当前快照，不等待旧连接 Pong，也不回放历史奖励或战斗动画。document freeze/resume 与 BFCache pageshow.persisted 同样处理；若 resume 时仍隐藏，等真正可见再恢复，避免重复连接。stop 时清理全部生命周期监听。

## 旧端到端测试适配与最终验证

主代理发现旧 `server/tests` 用例仍假定同账号多连接能同时维持认证、密码登录后可以先换线路再接管。按新要求更新三个测试文件，未修改生产会话实现：

- `TestTwoPlayers` 先验证新设备登录自动恢复原角色和原线路、旧连接断开、附近聊天保留相同身份；随后显式 Logout、重新认证并选择二线，继续验证原有跨线聊天隔离。
- `TestCannotDeleteOnlineChar` 在接管后的当前控制连接发送原始 CharDelete，验证 `in_world` 拒绝，随后查询任务证明角色仍可使用；登出重登读取实际 CharList，再验证角色 ID/名字未被删除或改写。非法 # 名称断言保留，并补充零宽字符拒绝。
- `TestAccountInfoAndChange` 验证修改密码轮换 token、新设备登录顶掉旧连接、密码重设撤销当前连接；之后用重设后的密码重新认证，继续在有效控制连接上验证旧密码错误与锁定规则。
- 注册 helper 检查 Session token 格式。测试结束关闭客户端、等待所有 World.Run 完成后再关闭 SQLite，避免测试生命周期竞态。

```text
go test -p=1 ./tests -count=1
PASS 13.095s

go test -race -p=1 ./tests -run 'TestAccountInfoAndChange|TestCannotDeleteOnlineChar|TestTwoPlayers' -count=1
PASS 20.364s
```

这些旧用例失败均由会话合同变化解释，安全断言保留并增强，未发现需要修改生产代码的缺陷。完整仓库与真实浏览器最终验证由主代理统一执行。
