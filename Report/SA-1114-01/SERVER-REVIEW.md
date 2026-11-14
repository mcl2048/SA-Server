# SA-1114-01 · 服务端与发行工具链复核

> 独立审查范围：HTTP 静态发布边界、SIGTERM 停服持久化顺序、客户端嵌入与 Linux 构建。审查以 `1c5bd7f` 为起点；最终游戏逻辑和客户端由主 Agent 集成后另做验收。

## 审查依据

本轮先对照 Go 官方当前 `net/http.Server.Shutdown` 文档（2026-11-13 获取）：关闭监听后 `ListenAndServe` 会先返回，调用方必须继续等待 `Shutdown`；它不等待已经劫持的 WebSocket 连接。来源：<https://go.dev/src/net/http/server.go>，`Server.Shutdown` 注释。

项目入口将世界取消与 HTTP 停服同时发出，等待所有世界的角色存档队列、共享家族/KV 队列、HTTP 处理器结束后才关闭数据库。世界有独立的停止栅栏及最终邮件回调排空；不能用 HTTP 监听消失或固定延迟推断存档完成。

## 本轮证据

| 命令 | 结果 | 证明范围 |
| --- | --- | --- |
| `go test ./...`（`server/`） | 退出 0 | 全量 Go 测试通过，含真实进程 SIGTERM、慢角色写入与共享家族写入 |
| `go vet ./...`（`server/`） | 退出 0，无诊断 | Go 静态检查 |
| `node --test scripts/build-client.test.mjs` | 8/8 通过 | 重复构建、删除旧 JS、失败保留原产物、符号链接和非发布文件拒绝 |
| `go test -race -count=1 ./internal/world -run 'TestWorldShutdownConcurrentFlushAndDo\|TestShutdownRestoresDequeuedMail\|TestFamilies' -v` | 4/4 通过，退出 0 | 共享家族并发关闭/提交、角色并发 Flush/Do、真实 SQLite 邮件出队后的停服回补；无 race 诊断 |
| `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -p 1 -trimpath -buildvcs=false -o /tmp/sa-1114-01-server-review ./cmd/saserver` | 退出 0 | 独立 Linux AMD64 编译；`--version` 返回 `v0.2.11-LYNX-dev`，不是最终发行产物 |

Go 版本：`go1.27.3 linux/amd64`。全量测试输出：

```text
ok  sa/server/cmd/saserver       42.154s
ok  sa/server/internal/battle    (cached)
ok  sa/server/internal/data      (cached)
?   sa/server/internal/proto     [no test files]
ok  sa/server/internal/server    14.949s
ok  sa/server/internal/store     2.004s
ok  sa/server/internal/world     38.217s
ok  sa/server/tests              12.860s
?   sa/server/tools/assetindex   [no test files]
?   sa/server/tools/protogen     [no test files]
ok  sa/server/webclient          0.434s
```

## 风险与结论

- HTTP 客户端只发布 `index.html`、`art/login.png` 与 `dist/*.js`；未发布源码、配置或数据库。游戏资源由独立的无目录列表文件系统提供。
- 内嵌客户端静态快照有 ETag 和 gzip 预算；显式外部客户端重新读取文件，避免持续使用旧校验值。
- 构建和打包均先生成同目录临时产物，再成功替换；构建阶段不包含 Assets 或运行数据库。
- 本轮未发现该范围内需要扩张任务的明确 P0/P1；未为增加修改量而变更已有停服和 HTTP 代码。
- 测试证明的是当前覆盖路径与可控 SQLite 延迟；磁盘写失败仍依赖逐任务错误日志，不把“队列排空”写成“所有磁盘写成功”。最终二进制、最终版本号与归档校验由主 Agent 统一生成。

## 停服并发验证输出

```text
=== RUN   TestFamiliesCloseDrainsSnapshotsAndKV
--- PASS: TestFamiliesCloseDrainsSnapshotsAndKV (0.41s)
=== RUN   TestFamiliesConcurrentCloseAndSubmission
--- PASS: TestFamiliesConcurrentCloseAndSubmission (0.41s)
=== RUN   TestWorldShutdownConcurrentFlushAndDo
--- PASS: TestWorldShutdownConcurrentFlushAndDo (0.41s)
=== RUN   TestShutdownRestoresDequeuedMail
--- PASS: TestShutdownRestoresDequeuedMail (6.75s)
PASS
ok  sa/server/internal/world  9.256s
```

停服并发测试会在等待所有调用返回之前打印中途计数；最终断言要求 32/32 个 Flush 和 32/32 个 Do 全部结束，并且停止后的晚到调用也不阻塞。不能把那条中途日志误解为丢失调用。
