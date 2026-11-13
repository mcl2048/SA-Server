# SA-1113-02 独立只读审查

日期：2026-11-13
范围：`server/internal/server/session*.go`、`server/internal/world/presence.go`，以及与本补丁直接耦合的 store 事务、密码撤销、容量、失败恢复和宠物/经验迁移。
权限：本审查未修改实现、测试或其他报告文件；仅创建本文件。

## 结论

当前多角色 actor/token 隔离、后台线路流量隔离、账号共享锁、密码撤销竞态防护，以及管理员移除后的 actor 重建路径，未发现仍可确认的 P0/P1 阻塞问题。此前审查中确认的两个 P1 会话故障已在当前工作树修复，并由定向 overlay 测试验证：

1. **旧密码认证在密码重置/修改后仍签发新 bearer**：修复为取得账号共享锁后再次向 store 验证密码；当前测试确认已验证但被撤销的登录不会返回成功 `AuthResult` 或安装 token。
2. **管理员 `World.Leave` 后残留 `srv.online` actor 导致新会话卡死**：当前 `CharEnter` 在 `Attach` 失败时保留保存 fence，等待 `World.Flush` 成功后再条件清除 actor 索引并重新进入；当前测试确认角色可重新进入，且大厅 `SwitchCharacter` 仍可用。失败时不直接删除索引，避免读到未完成保存的旧 DB 快照。

## 当前 P1：经验迁移失败重试会重复扣经验（修复已移交，最终核验由主 agent 负责）

### 影响

`server/internal/world/migrate.go:MigrateExp` 按角色逐条调用 `SaveExpPets`，仅在全部角色成功后才写 `kv(expSemantics=2)`。若处理中途数据库写入失败：

- 已成功写回的角色已经从旧累计经验转换为新语义；
- `expSemantics` 仍不是 `2`，下次启动会再次执行迁移；
- `conv(level, exp)` 再次减去同一等级起点，已转换角色的经验会被重复扣减，可能降为 0；
- 宠物经验在同一函数中走相同的 `conv`，也会重复扣减；
- AI 宠物属性 rebalance 本身有 allocation marker 且是幂等的，但不能使经验转换幂等。

这是可造成持久化进度损失的确定性恢复缺陷，属于 P1，不是性能或纯推测问题。

### 可复现步骤

1. 准备至少两个角色，使第一个角色处于会被转换的等级/经验。
2. 注入一个 `Store` wrapper：第一次 `SaveExpPets` 成功，第二次返回 I/O/数据库错误。
3. 调用 `MigrateExp`，确认返回错误且 `expSemantics` 未写成 `2`。
4. 移除故障，再次调用 `MigrateExp`。
5. 第一个角色会再次执行 `exp = max(0, exp - LevelExp[level])`；其经验低于第一次成功迁移后的值，宠物经验同理。

### 修复建议

优先使用单个 SQLite 事务完成所有角色的经验/宠物更新，并在同一事务内最后写入 `kv(expSemantics=2)`，成功提交才视为迁移完成。若受 `Store` 接口限制不能一次事务批量写入，则必须给每个角色增加可持久化的迁移版本/语义字段，已转换的行在重试时跳过；不能仅依赖全局 KV 标志。修复后应加入“中途失败、再次执行不改变已迁移角色”的测试，并覆盖人物及宠物经验。

主 agent 已将该 P1 交由 store agent 修复；本报告不将修复中的代码提前宣称为已验证完成。

## 定向验证记录

- 发现并确认原始会话问题：使用临时 Go overlay 对原始实现运行两个测试，分别确认：
  - reset 完成后，已在 store 中验证旧密码但尚未安装 token 的请求仍可返回成功并取得可 resume bearer；
  - `World.Leave` 删除实体但不清 `srv.online` 时，后续 `CharEnter` 收到 `not_found`，旧 actor 使会话进入 fence，`SwitchCharacter`/`Logout` 被吞。
- 当前工作树相同 overlay 测试：两项均通过修复断言；密码请求被拒绝，管理员移除后的角色可重新进入。
- 工作树中已有完整测试/构建任务在运行（包含 `go test -race ./internal/server ./tests`、`go test ./...` 和 Linux build），因此本审查没有重复启动昂贵任务。定向测试只使用临时 overlay，不写入仓库源码。
- 当前未报告未能复现的竞态、泛化容量猜测、常规低价值风格问题或历史功能差异。

## 交付建议

在 migration 事务/幂等修复及其故障注入测试通过前，不建议把 SA-1113-02 标记为完全交付；会话/actor 修复本轮已达到可继续集成验证的状态。

## 主 Agent 最终核验追加

上述迁移P1现已修复：`Store.MigrateExpPets`在一次IMMEDIATE事务中重查标记、写所有转换行、写完成KV，错误整体回滚；world先计算再提交，非不存在的KV读取错误直接返回。已阅读最终实现并核对故障注入测试（第2角色写入失败及标记写入失败）和重复调用断言。`go test -race ./internal/store ./internal/world -run 'TestMigrateExp' -count=3 -v`通过；最终全Go与完整vet通过。此前已发生的旧版部分迁移无法靠新事务自动识别修复，边界保留于存储报告。本文上方保留审查发现时的历史过程，不表示最终仍有该阻塞。
