# SA-1113-02 · 集成审查记录

本批基线为 `9f44469`（v0.2.8-LYNX）；交付版本为 v0.2.9-LYNX。集成任务已完成；最终文件、浏览器范围、SHA和限制以 ACCEPTANCE.md 为准。

## 已验证的公共层改动

- 资源目录 `noListing.Open` 探测 index 后遗漏 Close，每次成功目录请求泄漏一个文件句柄；现已关闭探测句柄，保留返回目录的生命周期。`TestNoListingClosesIndexProbe` 与 cmd/saserver、webclient 测试通过。
- HTTP 停服显式等待 Shutdown 完成，超时记录并 Close，避免 main 仅等世界存档后提前关闭 HTTP 使用的数据库。最终完整Go包含main停服回归通过，实际候选重启SIGTERM退出0。
- 后台角色无需计算/接收视野差分；refreshView、announce、broadcastMove 跳过未 attached 的玩家消费者。重新 Attach 使用现有完整 snapshot 重建视野。专项存在性及恢复测试通过。

## 视野微基准

本机 Intel Xeon E5-2670 v2、Go 1.27.1、GOMAXPROCS=2、同层1000个其他实体，`go test ./internal/world -run 'TestBackgroundView|TestPresence' -bench BenchmarkRefreshViewConsumer -benchmem -count=1` 通过：attached 213869 ns/op，detached 46.32 ns/op；两者0 allocs/op。仅代表静态视野扫描路径，不能推算整服吞吐或生产容量。

## 研究依据

- [Go 数据库连接管理](https://go.dev/doc/database/manage-connections)：连接池上限有排队/死锁约束，不能将增加SQLite连接数直接当作提升写并发。
- [SQLite WAL 官方文档](https://www.sqlite.org/wal.html)：单写者、同主机共享内存与检查点约束；FULL与NORMAL掉电持久性有区别。本批驱动运行时版本核验与存储事务修复见 DATA-REVIEW.md。

## 验证边界

真实 Chromium 运行与触屏视口可验证浏览器行为，不等同实体手机、Safari 或操作系统休眠认证。SQLite单机持久化不提供多节点自动故障切换；停服或进程重启不补算挂机收益。最终源码、二进制SHA和测试结果将在 ACCEPTANCE.md 给出。
