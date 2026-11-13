# HTTP、存储与停服审查

> 2026-11-13 UTC · 基线 `31a8848` · 服务端子 Agent

## 调用链与约束

| 路径 | 输入及不变式 | 输出/依赖 | 需要确认的假设 |
| --- | --- | --- | --- |
| `main → world.Run → save/progress → saves → SQLite` | 每条线路单世界协程；队列按角色、数据类别合并；SQLite 一个连接串行写入 | 停服等世界结束，再等 HTTP Shutdown，最后 Close 数据库 | `world.Run` 10 秒 fence 超时直接返回；是否能在慢磁盘/多玩家下丢队尾尚待实际复现 |
| `/ → gzipped → webclient.Handler → ServeContent` | 只 GET/HEAD；发布 URL allowlist；embed 内容进程内不可变 | decoded 内容弱 ETag、304；编码 Vary；外部目录逐请求读取保持热更新 | embed 已缓存读取和 hash，但每个 gzip GET 仍压缩一次；需要基准决定是否优化 |
| `/assets → gzipped → noListing → FileServer` | 外部资源目录；文字 gzip，WebP/Opus 不重压 | 文件/索引，禁目录列表 | 不扩大为资源全集内存缓存；此前 probe 文件描述符关闭已存在 |
| `OpenSQLite → migrate` (`store.go:190` 起) | 文件路径 URL 转义；每连接 WAL、FULL、foreign_keys、busy_timeout；IMMEDIATE 事务 | 建表/迁移原子，单 open/idle connection | 真正 SQLite 版本须符合官方 WAL-reset 修复版本 |
| `SaveProgress` (`store.go:520` 起) | 世界层提供完整快照；Store 只写业务数值，位置独立队列 | 一条带 34 参数 UPDATE；错误传给 saver 日志 | 固定 SQL 是否反复编译形成热点，需基准；跨线路顺序由角色迁移 fence 保证 |

上述记录先建立边界与调用依赖，不把未经复现的假设当成已确认漏洞。

## 官方资料访问

本子 Agent 在源码编辑前实际请求并读取：

- [Go 1.27 发布说明](https://go.dev/doc/go1.27)：2026-08 发布，压缩器和小对象分配优化；其官方数字不作为本项目收益。
- [SQLite WAL 文档](https://sqlite.org/wal.html)：2026 WAL-reset bug 影响 3.7.0 至 3.51.2；3.51.3+ 已修复；仍是单机单写者。
- [SQLite PRAGMA 文档](https://sqlite.org/pragma.html)：2026-10-04 更新；保持 FULL，不以降低持久性换速度。
- [Go HTTP Shutdown](https://pkg.go.dev/net/http#Server.Shutdown)：等待普通在途 HTTP；WebSocket 属于 hijacked 连接，需世界/会话生命周期自行收束。
- [Go prepared statements](https://go.dev/doc/database/prepared-statements)：重复 SQL 可复用 prepared statement；先测收益与生命周期成本。

## 已确认的基线证据

`go1.27.3 test ./internal/store -run '^TestSQLiteConfigurationAndReopen$' -v`：通过，运行时 SQLite **3.53.4**；WAL/FULL、特殊文件名、连接替换、重开和 integrity_check 均通过。已有版本守卫避免误退回受 WAL-reset 影响的版本，无需依赖升级。

## 文件所有权变化

主 Agent 已授权本子 Agent 接管 `server/webclient/`（实际路径），以评估只针对不可变嵌入客户端的压缩缓存。继续拥有 `server/cmd/saserver/`、`server/internal/store/`；后续发现家族独立 saver 的同类停服问题后，又明确接管 `world/family.go` 的队列生命周期与专项测试。World.New/ShareFamilies/Run 所有权集成由主 Agent 修改，公共输入、build/package 和版本号仍由主 Agent 管理。

## 已实施的窄修复

| 风险/热点 | 实现 | 实际证据 |
| --- | --- | --- |
| 同一嵌入 JS 每个新请求重复 gzip；pool 还保留完成的响应引用 | 启动时仅预压不可变 HTML/JS；新增压缩副本预算 4 MiB，单输入最多 2 MiB；未缓存仍走原 streaming。gzip middleware 识别已有 Content-Encoding，首次需要写未编码 body 时才取 writer；归还前 Reset(io.Discard)。 | snapshot 协商、一次解码即可得到 JS（防双压）、32 并发、缓存预算、HEAD/304/Range、外部修改和 URL allowlist 回归；对应 baseline 与 fixed 日志。 |
| 停服只等待存档队列 10 秒，可能关库后丢队尾 | 主 Agent 修复 world 生命周期；本子 Agent 添加真实 main 子进程回归，4 个在线 WS/GM 角色先 warp，SIGTERM 时用 SQLite 测试函数控制每笔 UPDATE 延迟 2 秒。最终日志改为“在线角色存档队列已排空”，避免把队列完成误说成磁盘写入全部成功。 | 基线 10.045 秒退出且两角色仍在旧楼层；修后 16.080 秒等待完整排空，四角色全部位于目标位置。生产代码没有延迟函数/测试 hook。 |
| 已取原信在断线/停服时用 PutMail 恢复，邮箱此时可能已被新信填满；多条恢复缺少事务 | 新增仅供内核使用的 Store.RestoreMails，将已接收原信整批原子恢复，保留 PutMail 对新信的 50 封准入限制；恢复积压可超过 50，所以 TakeMails 先读取全部有效原信，再原子删掉。 | 满邮箱加两封原信后 52 封全部且仅一次取回；trigger 故障不提交半批；取消 context 不写入；隔离副本复原旧容量/非原子恢复和旧 LIMIT 均被回归捕获。 |
| 家族/庄园/家族战配置另有 saver，main 没有在关库前 join；每条线路先建私有 Families 后再共享，留下多余 worker/重复读 | Families.Close 使用独立队列读写锁封住新提交，关闭 FIFO 后等待 saveDone；保存、删除、saveKV 三个 sender 统一受保护。main 在 worldDone 后统一 join 共享 manager；World.New 可直接复用既有 Families，默认单世界自有、Share 显式转交共享所有权并释放被替换的私有 worker。 | 真实 main 缺少 Family join 的隔离基线 3.066s 退出，已接收最后 Gold8000 只存5000；修后 9.079s 等剩余家族队列且存8000。保存/删族/KV FIFO、32提交+4并发Close、3个世界共享实际 SQLite 读仅一次、单线路退出仍可持久化、自有/被替换 worker 退出均通过 race。 |

固定 SaveProgress SQL 的 prepared-statement 优化未实施：本轮已经识别、量化并修复了更直接的嵌入客户端重复压缩与停服数据损失，不扩大存储连接/事务架构。

## 相同输入的 HTTP 基准

命令：Go 1.27.3，`GOMAXPROCS=2 GOMEMLIMIT=400MiB go test -p 1 ./cmd/saserver -run '^$' -bench '^BenchmarkEmbeddedClientGzip$' -benchmem -benchtime=200ms -count=3`。数字为三次中位数；同机还有其他 Agent 工作，因此只报告本机 HTTP handler 路径，不能推导生产玩家容量。

| 内嵌程序 | 原每请求 | 修后每请求 | 原/后分配 | 请求路径耗时降幅 |
| --- | ---: | ---: | ---: | ---: |
| main.js 串行 | 1.409549 ms | 0.148207 ms | 165025 / 132465 B | 89.5% |
| main.js 并行 | 0.916656 ms | 0.090676 ms | 168067 / 132466 B | 90.1% |
| ui.js 串行 | 0.486233 ms | 0.030578 ms | 60292 / 21870 B | 93.7% |
| ui.js 并行 | 0.388071 ms | 0.028732 ms | 60309 / 21870 B | 92.6% |

main.js 解码长度 80361，SHA-256 `4223155b7d3818fed7b7832817570cc8a8d36adb5f2114c4261ac5e9193edfba`；ui.js 解码长度 22265，SHA-256 `c6c0f41d4b03f5d1bd1f3731e837dc09532321764b1d04a855d77f1487944160`。每次基准记录输入摘要，前后比较的是同一份程序；最终新版客户端由主 Agent 重新构建并做发行验证。

## 验证结果

- `go test -p 1 ./internal/store ./webclient -count=1`：通过（1.113s / 0.461s），见 `store-webclient-tests.txt`。
- 对上述两包完整 `-race`：通过（9.635s / 4.726s），见 `store-webclient-race.txt`。
- 真实 `TestSIGTERM*`：通过（普通 53.951ms 排空；受控慢队列 16.080s 排空），见 `slow-shutdown-fixed.txt`；失败基线留在 `slow-shutdown-baseline.txt`。
- `go test -p 1 -race ./cmd/saserver -count=1`：新增慢家族场景后最终通过（59.748s），见 `cmd-race-tests.txt`；期待的是事实日志“在线角色存档队列已排空”。
- `go vet -p 1 ./cmd/saserver ./internal/store ./webclient ./internal/world`：最终退出 0，无输出，见 `server-vet.txt`。
- 本子 Agent 文件 `git diff --check`：通过。
- 额外家族生命周期四项 `-race`：通过（2.801s），见 `family-shutdown-race.txt`；缺少 main 家族 join 的真实失败/修后见 `family-main-shutdown-baseline.txt`、`family-main-shutdown-fixed.txt`。测试采用 1 秒节奏遵守玩家聊天 1.5 次/秒准入限制，每笔真实 SQLite UPDATE 在隔离子进程控制为 2 秒，不将 fixture 限流误认为存档漏洞。
- 最终 cleanup 回归：RestoreMails 的 statement 在 commit 前检查 Close；defer 将意外 Rollback/Close 错误与原错误合并，只显式接受 sql.ErrTxDone。gzip transport 失败使用 net/http 的标准 abort sentinel，保留处理器原 panic；成功空 body 仍输出合法空 gzip 流。空响应和原错误保留均有先失败再通过证据（`gzip-empty-red.txt`、`gzip-cleanup-panic-red.txt`）；该轮三包相关路径 `-race` 通过，见 `server-cleanup-race.txt`。
- ROOT 专项 world/mail/Flush 回归、整个仓库检查、最终二进制/真实 Chromium 和交付归主 Agent 集成验收，不能用本段包级通过替代。

## 发行工具链建议

保留当前无 npm 框架的源码构建和显式嵌入 allowlist；最终发行使用本机实际已装的 Go 1.27.3，再执行 stage/build/package 顺序，核对内嵌客户端与源码摘要。SQLite 3.53.4 已有 WAL 修复，无需依赖变动或调低 FULL。现有 zip 更换、版本与 bin 产物由主 Agent 负责。

家族生命周期必须先停止所有世界生产者，再关闭共享 Families，最后释放 Store。默认 World 自有的 Families 随 Run 退出排空；传入共用 manager 的世界由共享 owner 统一关闭，main 对首条线路的同对象 Share 也显式转交所有权。不要恢复到每线路临时 NewFamilies 再替换的模式，也不能用裸 close(saves) 绕过生产者锁。

## Lint 边界

本批新增测试的 SQLite Close 错误检查已补齐。家族文件保留未改业务区域的原格式，未把旧 `ranking` 占位字段的格式移动计作新代码。早期完整 lint 中仍有历史条目：family 的三处旧 JSON 解码忽略返回值，mapver 的旧 Fprintf 返回值，migrate 测试旧 Close，以及 battle/world 的旧 staticcheck 简化建议和未使用占位函数/字段。完整记录见 `combat-lint.txt`，本批最终增量结果由主 Agent 的 `golangci-incremental.txt` 确认；这些历史条目不能被描述成“完整 lint 全部清零”，也不应作为扩大本次修复到全部旧业务的理由。

本子 Agent 最终窄包增量 lint（golangci-lint 2.15.0，`--new-from-rev=31a8848 ./cmd/saserver ./internal/store ./webclient`）退出 0，**0 issues**，见 `server-cleanup-lint.txt`。Scope 内 Reader/Writer/Transaction cleanup 均已检查；SIGTERM 后 fixture WebSocket teardown 可能已经关闭，CloseNow 的显式忽略附有解释。

## 限制

真实单机子进程和 SQLite 测试不等于生产容量承诺、断电测试或分布式高可用；强杀进程仍无法执行内存状态保存。每个存档 job 仍有既存 5 秒数据库操作期限，磁盘错误/写入失败会记录 error，排空不等于故障磁盘已成功保存；恢复邮件的数据库错误也不能视作成功。新邮件准入 50 封与已接收但延迟投递的恢复积压是不同约束，恢复后可以暂时超过 50 封。邮件协议没有端到端接收 ACK：本轮修复数据库取信到世界投递之间的断线/停服窗口，不承诺客户端已经收到服务器尝试发送的消息。
