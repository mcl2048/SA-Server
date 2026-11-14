# SA-1114-03 · 战斗行动与状态审查

基线：`256f7ab`（v0.2.13-LYNX）。负责范围：`server/internal/battle`。修改前已阅读任务文件、战斗调用链和本轮 [研究依据](RESEARCH.md)。

## 已修复

| 问题 | 原因和可复现证据 | 窄修复 |
| --- | --- | --- |
| 不能行动的单位仍能反击 | `Resolve` 的正常行动通过 `statusSeq` 检查，立即反击只检查存活和预排命令。强制合法反击机会后，麻痹、石化、魔障、晕眩、未被伤害唤醒的睡眠单位均发出 `counter`。 | `counter` 在执行时补查 `canMove()`；反击概率和伤害计算保持原规则。 |
| 已解除的异常状态重新显示 | 状态剩余一次时，`statusSeq` 先发送 `Cure(Status=0)`，再发送缓存旧状态的 `Stun`。客户端按事件顺序赋值，旧状态覆盖解除结果。 | 保留本次行动跳过规则，`Stun` 携带计时递减后的当前状态。 |

生产修改仅在 `server/internal/battle/battle.go` 两处；回归位于 `action_state_test.go`。

## 回归证据

- [失败记录](battle-action-red.log)：修复前运行真实 `Resolve`，九个缺陷子用例失败；正常反击、受到正伤害后唤醒的睡眠反击两个正例通过。断言针对实际攻击事件、状态事件及 HP，不使用模拟战斗实现。
- [通过记录](battle-action-green.log)：同组 11 个子用例重复 20 次，全部通过。覆盖正伤害唤醒后允许反击；手下留情对 1 HP 睡眠单位造成 0 伤害，未唤醒时禁止反击；四种异常最后一次仍跳过行动、最后事件状态为已解除。
- [Race 记录](battle-race.log)：`go test -race ./internal/battle -count=1` 通过。
- [开发阶段集成记录](server-battle-integration.log)：当时运行 `go test ./... -count=1`，战斗包及其他已完成包通过；世界层新增的三个待修红测试失败：`TestAutomationRecoveryDoesNotLetUntreatablePetBlockOwner`、`TestAutomationRecoveryIncludesActiveMountThreshold`、`TestAutomationMPRejectsNativeHPFirstMixedRecovery`。该运行期间主代理正在修复这三条自动恢复路径，已向其同步；该次完整套件不能记为通过。冻结后的最终结果见下方终审记录。

## 死亡、离场和恢复边界复核

基线的 `Alive()` 已排除 HP<=0、击飞和逃离单位。正常行动执行前、普攻重新选目标、连击下一次选目标、敌人 AI 选目标均检查该条件。既有 `knockout_test.go` 已覆盖普通死亡取消预排和后续行动、击飞不可复活、死亡/离场不可普通恢复、反射死亡停止剩余攻击、剧毒死亡结束战斗；这些路径未发现需要重复修改的基线漏洞。

异常状态且仍有 HP 的单位仍可受攻击。睡眠受正伤害唤醒后可以行动/反击，只有明确复活技能可恢复普通死亡单位；这些既有规则保留。

## ActorHP 补充审查

客户端 `applyHit` 会使用事件的 `actorHp` 更新行动者 HP，因此审查了全部物理攻击/反击和 `MagicDamage` 构造路径：

- `attackOnce` 的普通、闪避、吸收、反射、自动保护目标分支均填入当前行动者 HP。
- 群体固定比例攻击 `drainAll` 在群蝠回复结算后回填所有攻击事件的 `ActorHP`；其他物理技能通过 `attackOnce`。
- `magicEvent`、`itemEvent`、`skillEffect` 携带 `ActorHP`；火线猎杀直接构造的魔法伤害事件也明确赋值。
- `world/fight.go` 原样映射为协议 `ActorHp`，未发现该字段被省略或清零。
- `PETSKILL_SelfExplodeAttack` 属于已有明确未注册列表，只发无行动事件，不产生缺少 ActorHP 的攻击事件。

未复现“攻击事件漏报 ActorHP 默认 0”的假设，因此没有为该假设增加生产改动。

## 范围与限制

本报告证明服务端状态和真实回合事件行为；浏览器展示、自动 HP/MP 策略、版本、ELF/ZIP、文档及推送由主代理集成。没有进行实体移动设备认证，不以单元测试或 Race 结果替代浏览器和发行验证。

## 冻结版本终审 · 自动恢复

2026-11-14 只读复审最终 `automation.go` 差异与 `automation_recovery_test.go`，未发现新增 P0/P1 或需要阻止发行的业务回归。

- 受伤候选逐一尝试，不能被自疗精灵治疗的宠物不再阻塞主人。人物与有效骑宠分别按整数乘法判断严格低于阈值，浮点比值仅用于优先级排序，不改变等于阈值时的行为。
- `needs...` 将补气准备限定到能触达当前受伤对象的恢复精灵，修复了“主人满血、宠物受伤、MP6、5MP 自疗与 8MP 单体恢复并存”时便宜自疗阻断补气的问题。恢复精灵需具备正回复量且耗气不超过最大 MP，避免无效准备。
- 沉默时跳过恢复/解除异常精灵候选和无用补气准备，HP 道具仍能按原生使用流程回退；新增真实状态道具测试验证肉回复、保留 MP、物品消耗。
- 混合料理按原生 `ITEM_useRecovery` 的体优先分支识别。原生参数的静态核对未发现与该解析器不一致的条目；没有将“气绝回复”误选为补气。

之前独立复审提出的两条问题已由主代理先取得 [红证据](world-recovery-review-red.log) 再修复，并纳入最终验证。终审读取 [完整 Go 结果](go-tests.txt)、[world race](world-race.txt) 和 [检查状态](checks-status.json)，均为通过；本次终审未重复运行测试或修改生产源码。

核对的 Linux AMD64 SHA-256：`f37197720b6f72e2bd8ad327a98f348315adf730dcb099351d9fc77086bbeb24`。本次只读复审源码 `automation.go` SHA-256：`82fb22522d6fa8417c10991e2bd075634baa17c49e135ae1c87d87caa7fc4234`。
