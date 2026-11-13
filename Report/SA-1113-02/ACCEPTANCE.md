# SA-1113-02 · v0.2.9-LYNX 发行验收

> 最终交付核验已完成；二进制与浏览器证据均绑定 `f88d9ed94a834493510f89ad00806c72c77ab088cd0f882e8455fbc5208cdff5`。

## 五项任务

| 任务 | 实现与证据 |
|---|---|
| 数据架构 | WAL/FULL/IMMEDIATE、原子表结构升级、邮件/留言事务与索引；旧经验迁移全事务，失败重试不重复扣减；[存储审查](DATA-REVIEW.md) |
| 四位神宠 | 与实际佩露夏777模板同档149成长预算及40/4初始成长，四种定位、旧宠物幂等迁移；[数值与UI](PETS-BATTLE.md) |
| 战斗数值 | 深色高对比血量卡、当前/上限数字、手机放大血量和伤害字体；真实Chromium组件与实际五宠战斗 |
| 多角色 | 密码登录大厅、按角色控制权、独立后台actor、标签页令牌、实时恢复、后台徽标、静默端点隔离；[会话报告](SESSIONS.md) |
| 小地图 | 顶层`minimapReveal: 0|1`，分块全图、点击精确A*绕障、墙角权威检查、不可达提示；[地图报告](MINIMAP.md) |

## 回归

- 最终完整 `go test ./...`、`go vet ./...` 通过，日志见 [完整Go](go-test.txt)、[vet](go-vet.txt)；地图最后窄修复后另运行 `go test ./internal/world -run 'TestMinimap|TestWarp' -count=1` 通过。完整回归包含真实WebSocket多角色、密码撤销、管理员移除后恢复/删除、实际main入口SIGTERM保存等路径。
- 存储race三轮通过；迁移SQL第2行写入与标记写入失败均整体回滚、重试后幂等；安全码变更/清空与重设密码的确定性并发测试通过。
- world新路径race通过，见 [race日志](world-race.txt)；server/tests完整race及最后新增安全回归详见会话报告。
- 最终客户端/构建85项通过，完整入口TypeScript检查通过，安装器29项通过，日志见 [客户端](client-tests.txt)、[TypeScript](typescript.txt)、[安装器](installer-tests.txt)。
- 后台视野千实体专项基准：attached 213869 ns/op，detached 46.32 ns/op；这是单路径微基准，不是整服吞吐承诺。
- 资源目录探测句柄关闭与HTTP停服join已有回归；协议、内嵌JS、缓存摘要一起构建。

## 发行与浏览器核验

最终发行结果：Linux AMD64静态 ELF `f88d9ed94a834493510f89ad00806c72c77ab088cd0f882e8455fbc5208cdff5`，16,392,352 bytes，0755；ZIP `saserver-v0.2.9-LYNX-linux-amd64.zip` 4,358 files，SHA256 `74ded83b1aab790d283f6575b9ac1a7f42300e387e32f62c16cf0dfee816e152`，内嵌二进制一致且 `testzip` 通过。最终二进制 HTTP 检查通过：客户端重复构建相同、内嵌文件逐项相同、ETag/304、HEAD空响应、私有路径404、ELF静态格式和摘要匹配。实际浏览器为Google Chrome for Testing 156.0.8078.4，触屏视口390×844及桌面1280×900；组件场景明确使用合成输入，实际二进制场景独立记录SHA。证据保存在 `browser/`，凭据、令牌、测试数据库、profile只留私密/tmp目录。

最终 f88d 实际 Chromium 小地图证据：`minimapReveal=true`；从(371,183)点击绕障目标(379,186)，10步路线到达并显示“已到达目标”；点击已知墙(385,178)立即显示“目标不可达：目标格为墙体或障碍”，无pageerror。前一候选 d1f 的双角色、后台徽标、恢复、桌面登录和五宠战斗证据与源码逻辑一致，报告 JSON 保留各自SHA，未把不同候选的证据混写。

最终 runtime 已由验证脚本使用 SIGTERM 优雅退出0；随后检查端口52427及 `saserver` 进程均无残留。

## 实际边界

- SQLite为单机单写者，不提供多节点自动切换；未认证生产高并发容量或故障切换SLO。FULL同步仍依赖文件系统与硬件正确实现。
- 邮件数据库取删原子，不等于提交到客户端送达的端到端exactly-once。
- 进程重启清除恢复令牌与挂机意图，重新密码登录，不补算停服收益。
- 已经被旧版部分执行的经验迁移无法由新事务自动识别修复，应从一致备份核对恢复。
- 真实Chromium触屏视口不代表实体手机长期休眠、Safari或系统输入法认证。
- 自定义GM四宠分配超出旧标准随机范围时不猜测迁移；旧随机成长无法精确重放，采用保留养成差异的比例映射。
- 未追加Assets美术资源；原始Assets不入Git，既有机械宠补丁包继续可用。
