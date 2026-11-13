# Task4：账号多角色后台会话

## 实现行为

- 密码登录/注册只签发当前浏览器凭据并返回线路选择，不接管、不暂停、不重建账号已有角色。
- 同账号可用不同浏览器标签页控制不同角色，两角色可同时在相同或不同线路运行。
- `CharEnter` 先验证归属，再在账号共享锁下寻找全服唯一角色 actor。已有 actor 恢复其原线路和实时世界快照，不读取 DB 重建，也不重复登录奖励。选择当前在线角色才会断开该角色的原控制窗口。
- `SwitchCharacter` 放弃当前控制权并返回线路选择；`Logout` 撤销当前窗口凭据并回到密码登录。两者均保留角色后台运行。UI 有明确确认文字。
- 在线角色无论有无浏览器都禁止删除；角色选择卡片显示后台挂机/在线可接管/休息状态，5 秒刷新概览。在线数值通过 world goroutine 读取实时 HP、等级、攻防敏、DP。

## 并发与消息隔离

账号根记录拥有一个共享 mutex；各浏览器凭据拥有独立 controller、token 摘要和可选 actor 引用。角色 actor 拥有唯一世界线路、身份快照、控制窗口和 world transport。

所有鉴权后命令、删除/进入、断线、接管、切换、撤销都在同一账号锁下线性化。密码登录在取得账号锁后再次验证数据库凭据，防止先通过旧密码校验、等待锁期间发生密码变更/重置的请求绕过撤销并签发新 token。Server mutex 仅保护索引，不持有它等待账号锁。World 继续用 `Do` 串行执行权威状态操作。旧命令/旧 detach 通过精确 controller/transport 身份检查被 fencing。

GM 删除世界实体后，如角色索引尚存，CharEnter 的 Attach 失败会清除会话 actor/char、等待该世界存档 Flush，成功后才清精确旧索引并从最新 DB 正常进入；Flush 超时则返回可重试大厅，保留旧索引作为存档 fence，确保下次重试不能绕过未完成存档。Resume Attach 失败同样保留索引并返回大厅，由后续显式 CharEnter 完成存档 fence 和恢复。CharDelete 和角色列表也调用 liveActor 回收辅助函数：验证本账号归属、确认世界实体不存在、Flush 成功、再次确认不存在后才删除精确索引，并清除根记录下所有旧 actor 引用。这样用户恢复失败后退出再登录，也能删除已由 GM 移除的角色；真实仍在线角色或存档未完成的角色继续禁止删除。

切换或退出后，`World.Detach` 原子地将实体 endpoint 换为保留账号身份的静默 transport。这样仍打开的大厅连接（随后可进入另一个角色）不会收到旧后台角色的 Status/Quest/Battle 推送。实体 visible 缓存释放，Attach snapshot 重建视野；交易、商店、临时窗口等清理和原 PvP 断线处罚保持生效。

## 凭据与兼容

凭据使用 CSPRNG 256-bit 随机值、43 字符 base64url；服务端仅以 SHA-256 摘要索引，绝对有效期 30 天。密码变更保留当前控制窗口、轮换其凭据，并撤销该账号其他浏览器凭据；密码重置和 GM 撤销覆盖账号全部凭据。撤销不移除世界 actor。

客户端凭据改为 sessionStorage，以标签页隔离账号恢复意图；旧 localStorage 共享凭据删除，要求重新输入密码，避免旧共享凭据自动顶掉另一个角色窗口。密码、摘要、安全码、token 均不进入网络调试日志。

每账号最多 64 浏览器凭据，满时回收最旧无 controller 凭据；角色 actor 不受此回收影响。账号索引最多 10000 项，满时仅回收没有 controller 且没有任何在线 actor 的根记录，并在取得锁后重新检查索引身份，防止分裂账号锁。

## 协议及协作

新增 C2S `SwitchCharacter`，S2C `LobbyReady` / `WorldReady`，CharSummary `online` / `background` / `lineId`。生成 Go/TS 协议已同步；后续 Task5 在相同协议追加 Hello minimapReveal。按主 agent 要求接入 Server.MinimapReveal 和 main 的 Field 配置及任务 HUD 偏移。

未改 store/pet.go、battle.ts、版本和 README，未提交。world 修改仅在预先告知的 presence.go，无额外 world 文件。

## 权威实践参考

1. [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)：不可解释高熵随机 token、服务器会话状态、绝对有效期、密码风险事件撤销、Web Storage 作用域。采用与现有 WS 协议兼容的 bearer 方案；sessionStorage 仍受同源脚本权限影响，生产依赖 HTTPS/WSS。
2. [Microsoft Orleans Request scheduling](https://learn.microsoft.com/en-us/dotnet/orleans/grains/request-scheduling)：权威 actor 状态串行处理，以及避免跨 actor 同步调用环。这里复用已有 World.Do，而账号锁只序列化控制权变更；GM 从 world 发起的账号撤销仍异步执行，防止回调 World.Do 死锁。

## 验证

- `node --test client/test/net.test.ts`：最终 19/19 通过，包含独立标签页 token 隔离、旧共享 token 失效、断线恢复、冻结/后台重建、消息丢弃、超时、撤销和凭据脱敏。最后补充 Field.dispose：net.on 返回独立幂等 unsubscribe，once 使用该退订函数；Field 释放 constructor 全部监听器和地图缓存，main 所有丢弃/替换 Field 路径先 dispose，未完成 loadFloor 回调也停止更新。新增 100 次实际 Field 创建/销毁的监听器计数不增长、旧 Field 不再消费新 Self、重复 callback 独立退订及 once 监听器正确移除回归。最终入口 tsc 与 diff check 同步通过；最终构建由主 agent 执行。
- `npx --yes --package typescript tsc --noEmit --allowImportingTsExtensions --target ES2023 --module ESNext --moduleResolution bundler --lib ES2023,DOM,DOM.Iterable client/src/main.ts`：通过。
- 首轮 `go test -race ./internal/server`：通过。新增真实 WebSocket 覆盖密码登录保留旧角色、显式同角色接管、在线禁删、双角色同时运行、切换/退出持续运行、密码轮换/撤销、实时方向恢复；并补充账号/凭据容量回收、静默 endpoint 防后台推送串流回归。
- 原 `server/tests` 中三项旧“密码登录直接顶号”用例已更新为显式 CharEnter 接管，并保留归属、安全删除、原窗口可用和跨线路隔离断言。
- 主体实现 `go test -race ./internal/server ./tests` 全通过：internal/server 49.702s，tests 166.672s。
- review 后新增确定性并发凭据回归（真实 ChangePassword / ResetPassword 完成后再释放已通过旧密码校验的请求），及 GM Leave 后重新密码登录进入回归，`go test -race ./internal/server -run 'TestPasswordMutationRejectsAlreadyVerifiedOldPassword|TestCharEnterRecreatesActorRemovedByAdministrator' -count=1` 通过（42.608s）。后续补强“Flush 成功才清索引”的重试 fence 后，GM stale actor race 回归再次通过（12.348s）。
- 最后补充 missing actor 回收后，`go test -race ./internal/server -run 'TestRemovedActorCanBeDeletedAfterFailedResumeAndLogout|TestSessionDisconnectResumeTakeoverAndLogout|TestCharEnterRecreatesActorRemovedByAdministrator' -count=1` 三项全通过（22.241s）。新增用例完整覆盖 GM Leave → Resume 失败回大厅 → Logout → 新登录直接删除，并同时核对数据库角色列表为空和在线索引已清；原在线角色禁删/接管及 GM 重进回归继续通过。
