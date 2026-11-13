# Task1 数据存储深度审查

日期：2026-11-13。范围：`server/internal/store/*`；允许修改 `server/go.mod`、`server/go.sum`，但核验后无需变更依赖。后经主 agent 明确协调授权，另独占修改 `server/internal/world/migrate.go` 及新增迁移测试，修复经验数据迁移原子性；未改 pet.go。HTTP 停服仅阅读、发现交由主 agent；未修改版本、README，未提交。共享工作区其他文件变更归属其他任务。

## 结论

当前后端是单机 SQLite 持久化，不是 HA。保留一个打开连接适合现阶段小写入量，但它只串行执行单条语句，不会自动把多条语句绑定成原子操作。本次修复了留言编号/裁剪、邮件容量/取删的并发窗口，补齐迁移回滚与索引，并核实 SQLite 已包含 2026 WAL-reset 修复。

## 依赖与连接

- go.mod 固定 `modernc.org/sqlite v1.60.1`，其源码 `lib/sqlite.go` 标示 `SQLITE_VERSION = "3.53.4"`，`doc.go` 所列平台均为该版本；测试通过 SQL `SELECT sqlite_version()` 实测 **3.53.4**。
- [SQLite WAL 文档 §11](https://www.sqlite.org/wal.html#the_wal_reset_bug) 说明 3.7.0–3.51.2 存在 WAL-reset 数据损坏问题，3.51.3 及之后修复，3.44.6、3.50.7 有回移修复。本依赖已包含修复，无需盲目升级。新增版本回归检查，防止未来依赖回退到已知受影响版本。普通并发测试不能证明复现或消除该罕见引擎竞态；版本核验才是这里的依据。
- 继续 `SetMaxOpenConns(1)`，显式 `SetMaxIdleConns(1)`，不设短连接寿命，避免不必要地重开文件与重做 PRAGMA。连接池上限不是事务边界，未来扩大池需重新测量锁竞争，不能仅为吞吐直接增加连接数。参见 [Go 连接管理](https://go.dev/doc/database/manage-connections)。
- 每条连接通过 DSN 设置 `busy_timeout(5000)`、WAL、外键和 `synchronous(FULL)`。FULL 是显式持久性选择，不宣称比旧默认设置更快；其提交同步依赖操作系统、文件系统及硬件正确兑现。
- IMMEDIATE 事务在开始时争取写锁，避免先读后写的 WAL 快照升级失败；跨独立 Store 的并发测试覆盖同文件不同连接。仍可遇到 BUSY/超时，错误保留给调用方，未加入可能重复写入的盲重试。
- 将配置路径当作文件名进行 URL 转义，防止 `?`、`#` 等改变 DSN 参数；保留 `:memory:` 特例。新增含空格、问号、井号路径测试；文件库打开时核验实际日志模式是 WAL，内存库允许 memory 模式。

## 修复明细

### 迁移

旧实现逐句提交 DDL，失败后留下半升级库；且依靠错误字符串判断重复列。现将基础 schema 与所有增量放进一个事务，先查 `pragma_table_info` 决定是否补列，任何非预期错误均回滚。测试用不兼容的 `mails` view 在迁移中途制造失败，确认此前补的 `face` 列没有残留；移除冲突后成功迁移，旧账户保留，重复打开可幂等执行。

经验语义迁移原来按角色逐次 SaveExpPets，最后单独 PutKV。中途错误会留下部分新经验、缺失标记，下次启动再扣经验。现 world.MigrateExp 只读取并纯计算人物及宠物（含寄放）转换结果，再调用新增 `Store.MigrateExpPets`，在同一 IMMEDIATE 事务内写完所有变更及完成标记；任一角色更新、标记写入或 commit 失败均回滚，成功后才记录日志。角色缺失/删除也视为错误而非静默标记成功。事务内重新核对同值标记，避免并发启动中已完成迁移被另一个预计算快照重写。GetKV 的非 ErrNotFound 错误直接传播，不再将存储故障当作未迁移。该接口仅限世界写入开始前调用，不支持在线转换；完整角色列表的读取/计算在事务外，以避免在数据库事务内运行世界层序列化。

新增 SQLite trigger 故障测试，分别让第二个角色更新、最终标记插入失败，检查所有原经验/宠物与标记一起回滚；去除故障后重试成功，同值标记下再次提交错误转换结果也不覆盖。世界层回归验证失败后重试从原始经验计算、人物与宠物只扣一次，并阻止误用单角色 SaveExpPets/单独 PutKV；标记读取失败须在任何后续读写前返回。未对已发生过旧版部分转换的生产库自动逆向修复，应根据备份与数据审计恢复，不可凭缺失标记判定每个角色都未转换。

仍未引入 schema version 或迁移校验和：这是保持旧库兼容的窄修复，已有列的类型/默认值不会被自动重建纠正；结构已被人为改坏时应人工审计。上线大库应先备份并在副本验证，首次建索引会占写锁，不是在线无阻塞迁移。

### 事务与并发

- `AddDengon`：旧版 MAX、INSERT、DELETE 可被其他 goroutine 交错，导致编号冲突或插入成功但裁剪失败。现同一 IMMEDIATE 事务完成分配、写入、裁剪，只有 commit 成功才返回编号。
- `PutMail`：旧版 COUNT 与 INSERT 可并发越过 50 封上限。现为一条带容量条件的 INSERT，以 RowsAffected 返回 ErrMailFull。
- `TakeMails`：旧版 SELECT 与 DELETE 之间新到邮件可能被一起删除，并可能重复读取；且未检查 rows.Err。现 SELECT、迭代错误检查、关闭结果集、DELETE、COMMIT 同事务执行，commit 失败不返回邮件正文。
- `ResetPassword`：校验安全码的 SELECT 与密码 UPDATE 之间存在并发变更窗口；现 UPDATE 同时要求 `id = ? AND secret = ?`，并检查 RowsAffected；安全码在初次校验后被修改或清空时，返回 ErrBadLogin，保留原密码。保留初次常量时间比较及已有 ErrNoSecret 行为，未更改账号接口。
- 故障注入 trigger 验证留言裁剪失败回滚插入、邮件删除失败不返回未提交正文且原邮件可再次取出。安全码回归通过仅测试使用的 driver 包装，在真实 SELECT 完成后、UPDATE 执行前，使用另一个真实 Store 修改/清空安全码，确定性验证旧码请求不能修改密码；同时确认新安全码可正常重设、清空后回 ErrNoSecret。

数据库层原子性不等于客户端送达保证。TakeMails 仍是破坏性出队，提交后、客户端收到前崩溃可丢消息；要实现可靠重投递需另设计确认/重试/去重协议，当前无端到端 exactly-once 承诺。SaveProgress 是整角色快照更新，多个世界同时改同一角色会最后写入覆盖；跨线路单控制者约束由会话/世界任务维护，不因 SQLite 事务自动成立。ResetPassword 使用密码更新语句作为原子判定点：先完成的安全码变更会使旧码请求失败；若密码更新先完成，之后的安全码变更不撤销已完成的密码更新。

### 索引

保留账户唯一索引、角色姓名唯一索引、`characters(account_id, deleted)` 与留言 `(board,id)` 主键。增加：

| 索引 | 对应路径 | 效果/代价 |
|---|---|---|
| `mails_recipient(to_char,id)` | 收件容量统计、顺序取信、删除 | 避免每次扫全站邮件，INSERT 需维护索引 |
| `characters_duel(dp DESC,id) WHERE deleted=0` | 强者排序、统计更高 DP | 避免全表排序并限制计数范围；更新 DP/删除要维护索引 |

EXPLAIN QUERY PLAN 回归验证上述索引被使用。排行榜的逐行相关 COUNT 随排名深度和请求条数增长，新增索引并未把它变成常数复杂度；如数据量继续增大应另测窗口函数或缓存方案。另有原有语义差异：DuelRanking 同分同名次，DuelRank 按 id 打破同分，未在本轮性能/持久性修复中变更。

## 验证

- `go test ./internal/store -v`：全部通过，输出运行时 SQLite 3.53.4。
- `go test ./internal/store -count=3`：通过；含两个独立 Store、100 个并发留言/寄信、10 个并发取信者、寄信与取信交错守恒检查。确认留言 ID 唯一、邮件最多 50 封、成功寄入的邮件没有并发删除丢失或重复取出。
- `go test -race ./internal/store -count=3` 与 `go vet ./internal/store`：补修 ResetPassword 后最终全部通过，含安全码修改/清空的确定性回归、新增交错测试及 WAL 模式核验；race 三轮耗时 45.728s，命令退出码 0。
- `go test ./internal/store -run TestResetPasswordRejectsChangedSecret -v`：changed/cleared 两个子测试均通过（0.093s）。
- 经验迁移补修后 `go test -race ./internal/store ./internal/world -run 'TestMigrateExp' -count=3 -v` 全通过（store 9.180s、world 9.965s）；覆盖第二个角色失败、marker 失败、真实 SQL 回滚/重试、世界层纯计算后原子提交/幂等及 GetKV 错误传播。`go vet ./internal/store ./internal/world` 与 `git diff --check` 同批通过。首轮新世界测试曾因测试 fixture 未初始化 Battle 指针失败，修正 fixture 后三轮 race 均通过；生产转换逻辑无此变更。主 agent 负责接口变更后的全 Go 回归。
- 特殊路径、替换物理连接后外键仍启用、正常重开保存值、`PRAGMA integrity_check = ok`、旧库/中途失败/重复迁移、复合操作故障回滚、索引计划均覆盖。未模拟断电、真实磁盘损坏或跨主机故障；正常重开不是掉电恢复证明。
- `go test ./internal/world ./internal/server`：通过。
- 同次 `go test ./tests` 出现 3 个当前会话接管预期失败（`TestAccountInfoAndChange`、`TestCannotDeleteOnlineChar`、`TestTwoPlayers`），均为旧接管测试与 Task4 正在变更的登录语义不符，没有 SQL 错误。已向主 agent 汇报，主 agent 已交对应 agent 更新测试，明确无需本任务复跑或修改越界文件。
- `git diff --check`：通过（共享工作区检查）。

基准：`go test ./internal/store -run '^$' -bench BenchmarkPutMail -benchtime=100x -count=3 -benchmem`，Linux/amd64，Xeon E5-2670 v2，20,000 封历史邮件，各次真实临时文件库，WAL/FULL；比较同一新 SQL 有/无收件人索引，非旧版全链路吞吐：

| 配置 | 三次 ns/op | 分配 |
|---|---|---|
| 无收件人索引 | 5,813,345 / 3,691,690 / 3,851,812 | 336 B，10 allocs/op |
| 有收件人索引 | 2,477,055 / 1,602,102 / 1,364,373 | 336 B，10 allocs/op |

观察范围约 1.36–2.48 ms/op 对 3.69–5.81 ms/op；受本机磁盘同步及其他并行任务干扰，样本少，不作为生产 TPS 或延迟 SLO。结论仅支持该索引降低随全站邮件数增长的查询成本。

## 单机边界与 HTTP 审查移交

WAL 要求访问者在同一主机并具备可靠本地锁/共享内存语义；不能将此方案称为跨主机 HA，也不能把 WAL 数据库直接放在网络文件系统上供多机写。单实例/单盘故障仍会停服；没有复制、自动故障转移、故障域隔离与经演练的备份恢复流程，不能宣称 HA。多个 Store 连接测试只是验证 SQLite 同机并发，并不授权多游戏实例同时持有同角色状态。

WAL 默认约 1000 页自动 checkpoint；长读事务或外部工具持续读可阻止回收，本次保持默认策略，未添加强制 checkpoint 阻塞关键路径。监控应关注 DB/WAL 体积、磁盘空间、SQL 错误与 DBStats 的等待；这是后续运维工作，当前没有新增监控接口。在线备份应使用 SQLite 一致性快照/备份 API，或停写后干净关闭再复制；不要直接只拷贝打开中的 .db，也不要手删仍在使用的 -wal/-shm。

只读审查发现原 main 在 goroutine 调用 HTTP Shutdown 并忽略其错误，而 main 仅等待 worldDone 就执行 defer db.Close，未等待 HTTP drain；可能在认证等 HTTP 活动仍进行时关闭数据库。已交主 agent；主 agent 回报负责 HTTP shutdown join、错误日志和回归测试，本任务未改 main。HTTP Shutdown 自身不等待 hijacked WebSocket，世界退出顺序、连接撤销与保存成功要由对应任务独立验证。`os.Exit` 启动失败分支不会执行 defer；运行期保存失败的日志与补偿也不能靠 SQLite Close 自动补救。
