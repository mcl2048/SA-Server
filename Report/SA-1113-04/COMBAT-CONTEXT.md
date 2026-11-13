# 战斗与队伍源码约束

该记录是审查前的调用链与假设，不作为缺陷结论。基线 `31a8848`。

| 路径 | 已建立的约束 | 需要继续确认的假设 |
| --- | --- | --- |
| `world/automation.go:234 automationBattle` → `battlePetCommand` / `battleCommand` | PvP 返回；quick 最短 1 秒、auto 4 秒首次延迟；已提交指令不覆盖；每只活宠独立下令。 | 世界玩家遍历顺序与多人协作；同回合已提交恢复/捕捉是否被后续决策考虑。 |
| `world/fight.go:405 battleCommand` | 玩家活着且本回合无指令才接受；道具、精灵、装备格位与范围经过原生校验。 | 策略层判断的 MP 成本是否与 `equipMagic` 相同；自动选定技能和目标是否会被改为 None。 |
| `world/fight.go:505 battlePetCommand` → `tryResolve` | 实际宠位所有权校验；技能必须 Field 0/1；全部存活人宠下令才推进回合。 | 自动与固定宠物计划是否先保护队伍正在捕捉的目标。 |
| `battle/battle.go:506 Resolve` → `enemyAI` → `setup` → `act` | 单回合恢复基本值、排序速度、状态与忠诚度执行；死亡/离场不能行动。 | Tactics 技能权重是否排除不存在/地图技能；按技能目标类型生成的目标是否准确。 |
| `world/party.go:81 PartyRequest` → `partyCandidate` → `joinPartyMain` | 近距离、同楼层、开放队伍、容量、双方非战斗/交易等边界；队长及空位语义明确。 | 延迟窗口回复后的候选重检是否覆盖状态改变；队员自动遇敌是否暂停而不接管队长。 |
| `world/fight.go:131 startBattleWith` → `balanceBattlePets` | 队伍人数共享 5 个宠位，真实 OwnerSlot 在重排后保留；已有测试覆盖 1..5 人配额。 | 协作策略是否仍按 `slot+5` 默认主宠错误推断其他宠物身份。 |
| `client/aismart.ts:140 smartChoose` | 客户端学习只影响展示/旧手动 AI 判断；挂机行动在服务端生成。 | 本地 spell 过滤、捕捉保护与固定动作需要和服务器语义一致，不能制造非法意图。 |

## 修改前实际网络资料

- 2026-11-13 访问 [Unity ML Agents 4.0.3：Agents](https://docs.unity3d.com/Packages/com.unity.ml-agents@4.0/manual/Learning-Environment-Design-Agents.html)，HTTP 200。文档将 observations、policy decision 和实际动作执行分开，并支持 Heuristic Only。这里采用可解释策略和显式合法行动，保留权威执行；不加入强化学习依赖。
- 同日访问 [Go Diagnostics](https://go.dev/doc/diagnostics)，HTTP 200；性能结论须由实际基准/分配证明。
- Microsoft Project Malmo 页面返回 HTTP 403，未作为已读取研究证据。
