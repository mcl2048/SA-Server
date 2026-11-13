# SA-1113-04 · 独立交叉复盘

复盘范围：World 取消/保存栅栏/回调排空、邮件恢复、家族队列所有权、广播消息及原像素几何。生产源码保持只读；新增正式回归与本记录。未发现本批新增 P0/P1。

## 可复现的并发取消回归

[shutdown_concurrency_test.go](../../server/internal/world/shutdown_concurrency_test.go) 使用真实 World/SQLite 保存协程，以一个受控写入阻塞器让 32 个 Flush 栅栏先入队；32 个 Do 随取消启动。释放写入后断言队列退出、全部调用返回、停服后的 Do/Flush 可返回、独立家族保存者已经退出。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| RED：`31a8848` 的原 Do/Flush 实现 | 世界已停止且 Flush 32/32 完成，Do 0/32 在两秒后仍阻塞；测试失败，实际执行 2.41s | [RED 原始输出](cross-review-shutdown-red.txt) |
| GREEN：当前源码，`-race` | 测试通过，实际执行 0.39s；最终断言要求 32/32 都返回，并验证停服后的调用 | [GREEN 原始输出](cross-review-shutdown-green.txt) |

旧 World 构造器没有当前测试所需的新接口。比较通过 Go overlay **仅替换 World.go**，在当前兼容的 World 生命周期中复原两个精确的基线函数声明；不是整棵旧源码的发行认证。停服后无指令消费者却继续等待 done，正是旧 Do 的原始行为。没有编辑生产文件。

日志的 `SHUTDOWN_CONCURRENCY_REACHED` 出现在 Run 已退出之后、等待全部调用之前。RED 必须出现该标记和实际调用阻塞错误；编译失败或外层超时不计为复现。两次命令包含编译约 51–52s，和产品等待时间分别记录在 [输入与结果 JSON](cross-review-shutdown.json)。

复现红绿证据：

```bash
python3 Report/SA-1113-04/cross-review-shutdown.py
```

可通过 `GO_BIN` 指定 Go；本次使用 Go 1.27.3、`GOMAXPROCS=2`、`GOMEMLIMIT=400MiB`。脚本要求本地 Git 中存在 `31a8848`，同时验证 World 输入 SHA 未在比较过程中改变。

单独验证正式回归：

```bash
cd server
go test -race ./internal/world -run '^TestWorldShutdownConcurrentFlushAndDo$' -count=1 -v
```

## 源码核对与补充证据

- [world.go](../../server/internal/world/world.go)：saves 的提交与关闭串行发生在世界协程；Flush 经 cmds 投递保存栅栏，取消后等待 saveDone。旧邮件读取同步 post，停服先等待旧任务发布回调、再 drain、保存最终状态并关闭队列。Do 在停止时解除等待，不代表停止期间未执行的游戏命令已经成功。
- [addressbook.go](../../server/internal/world/addressbook.go) 与 [store.go](../../server/internal/store/store.go)：未附着或 stopping 的已取邮件整批 RestoreMails；事务失败回滚整批，恢复不套用新信准入容量，TakeMails 读取所有未过期恢复行。精选 world shutdown/family race 通过，11.191s；RestoreMails 容量、部分失败及取消的精选 race 通过，2.424s。
- [family.go](../../server/internal/world/family.go)：queueMu 保护投递/关闭，与业务 mu 分开；保存 worker 不反向获取这两个锁。已接受 FIFO 写入被 Close 等待；main 在所有 World 退出后关闭共享家族保存者。New/Share 的所有权区分及并发重复 Close 已通过精选测试。
- [session.go](../../server/internal/server/session.go) 与 [messages_gen.go](../../server/internal/proto/messages_gen.go)：生产 session.Send 同步 Encode；json.Marshal 读取消息并为每次发送生成独立字节数组。广播的 ObjMove/ObjAppear/ObjDisappear 是独立值快照，发送后没有修改；ObjInfo 仅含值与不可变字符串。未发现共享 Message 被传输层修改的路径。
- [mobile-camera.ts](../../client/src/mobile-camera.ts)、[mobile-view.ts](../../client/src/mobile-view.ts)：场景使用统一 scale，`max(1,width/800,height/600)` 不缩小原人物像素；裁剪坐标受四边约束。仅移动沉浸 field/battle 使用该几何，世界/战斗/输入仍是 800×600。几何精选 7/7 通过，不作为实体手机认证。

## ACK 与停服声明的范围

邮件的 Take→世界回调窗口受本次恢复保护；`attached()` 检查到 `Send` 之间仍可能断线，发送队列及 WebSocket 没有应用层邮件 ACK，不能保证客户端已经收到信。独立受控断线夹具确认过这个既有窗口；没有把“必须丢信”断言加入正式回归。README/发行说明已将端到端送达限制独立记录。

Go 官方 `http.Server.Shutdown` 明确不关闭或等待 hijacked WebSocket。当前会话基于 `r.Context()`，所以 httpDone 只证明 HTTP 处理器停服，不等同于 join 全部 WS；world/mail 保存队列的停服复现不依赖这种扩大解释。
