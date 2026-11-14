# SA-1114-01 · HP=0 与击飞离场根因复核

> 范围：独立服务端审查、失败复现、窄修复与回归。前端事件、动画队列和真实 Chromium 验证由主 Agent 汇总，本文不替代浏览器验收。

## 已证实的服务端根因

**击飞不是普通倒地。** 原实现把被击飞敌人保留在本场 `F` 数组中，标记 `Flown=true`、`HP=0`。但敌人复活、咒术复活和存活判定只检查 HP/逃走，没有排除 `Flown`。

真实 `Battle.Resolve` 回归复现的同回合顺序：

```text
玩家攻击 slot 10 → Dead=true、Fly>0、HP=0
slot 11 的 ENEMYSKILL_ReLife → slot 10 HP=50
slot 10 执行原来已排队的 Attack → 攻击玩家
```

客户端已将击飞单位移出显示范围，因此后续就表现为已离场空位仍攻击、仍能挨打。该路径影响自动与快速战斗，因为两者共用同一服务端回合规则。失败证据：[`knockout-before.txt`](knockout-before.txt)。

原始战斗配置中确有 28 条敌人记录，在实际技能位置为 `ENEMYSKILL_ReLife`（500）的同时赋予非零 `wa` 权重；8 条原始队伍记录引用这些敌人，例如巴克（1803 / 模板 909）、假朱雀（2252 / 模板 39）。因此这条链路不依赖凭空新增的复活能力。配置映射证据：[`server-knockout-data.json`](server-knockout-data.json)；这份映射不声称每条原始队伍都能从当前开放地图遇到。

另一个已复现的同根因变体：自动策略把被击飞宠物继续纳入待复活盟友，选用真实复活道具，浪费回合/资源。失败证据：[`automation-knockout-before.txt`](automation-knockout-before.txt)。

## 本轮修复

| 文件 / 入口 | 行为 |
| --- | --- |
| `battle.go` · `Fighter.Alive()` | 正 HP 仍须未逃走、未击飞，离场单位不能行动、被攻击或参与胜负计数 |
| `magic.go` · `magicTargets()` | 回复与复活都排除击飞单位；正常 HP=0 倒地仍可显式复活 |
| `skill.go` · `support()` | 敌人回复/复活遵守同一离场边界 |
| `magicRessurect()` / `support()` | 正常复活清除 `KilledBy`、`KilledRide` 和异常状态，不残留上一条生命的击杀归属 |
| `automation.go` · `chooseAutomation()` | 击飞盟友从回复/复活候选中移除，让自动策略继续处理活敌人 |

## 同根因变体搜索

使用 `rg` 逐级检查精确条件 `x == nil || x.Escaped`、所有 `.Escaped`/`.Flown` 与 `.HP` 比较、所有 `attackOnce` / `heal` 调用方，再人工追踪战斗与自动策略入口。

| 候选 | 结论与证据 |
| --- | --- |
| 敌人复活击飞同伴 | 已证实，发行阻断级战斗问题，已修复 |
| 咒术/道具复活击飞玩家、宠物、敌人 | 已证实，已修复；18 个子例覆盖倒地/击飞/逃走及正常复活 |
| 正 HP 的击飞状态进入活目标/胜负判断 | 已证实，已修复；检查选敌、魔法目标、`Resolve` 与 `Over` |
| 普通回复继续增强曾错误复活的击飞单位 | 已证实，已由目标筛选修复；咒术、道具、敌人回复、宠物技能四类覆盖 |
| 自动策略反复复活被击飞宠物 | 已证实，已修复；真实原始数据中的复活道具验证 |
| 普通 HP=0 角色在同回合或后续回合行动 | 服务端未复现；人物/宠物/敌人、其他盟友仍活着时的两回合验证通过 |
| 剧毒 HP=0 后继续行动/拖住胜负 | 服务端未复现；三种角色都发出 `Poison{HP:0,Dead:true}` 并结束无存活单位一方，客户端消费此事件另行修复 |
| 反射死亡被吸血复活、后续多击继续出手 | 已排除当前路径；反射分支立即返回，完整攻击序列以 `Alive` 停止；真实伤害回归通过 |
| 回力镖/回旋/憾甲/群蜂/火线/召唤龙选中离场目标 | 循环已有 `Alive` 或 `magicTargets` 过滤，统一边界修复覆盖其当前调用方 |

没有修改普通 `heal` 原语：当前业务调用已先过滤活目标，未发现普通 HP=0 经普通回复意外复活的可达路径。没有改写技能逻辑、奖励公式或扩大为无关重构。

## 本轮验证证据

- 修前：新回归在原生产代码上失败，包含真实 `Fly → Revive → Attack` 顺序和自动策略误选复活道具。
- 修后：同组回归全部通过。日志：[`knockout-after.txt`](knockout-after.txt)、[`automation-knockout-after.txt`](automation-knockout-after.txt)。
- `go test -count=1 ./internal/battle`：退出 0，0.297 秒，含新增普通伤害 KO 两回合回归与全部既有战斗测试。日志：[`battle-package-after.txt`](battle-package-after.txt)。
- 自动与快速两种模式均验证：敌方 HP=0、未击飞，服务端只发一次死亡事件与一次胜利结算；重复自动 tick 不产生第二次结果。
- 既有 `TestAutomationOwnerDownPetsContinue` 同时验证普通自动与快速模式，存活宠物没有因主人倒地而退化为停滞。
- `git diff --check` 退出 0。

主 Agent 在最终集成后运行全套 Go/race、最终二进制与浏览器检查。此独立报告只声明上述已执行范围。
