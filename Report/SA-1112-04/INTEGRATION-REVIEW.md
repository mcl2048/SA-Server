# 多宠、经验与奖励整合审查

本轮按父任务要求对world/core/自动战斗的宠物位置归属做有限审查，优先给出可复现P1/P2。确认一个P1与两个P2后停止扩大审查；三项均随后得到明确授权并完成修复与永久回归测试。未重跑全仓测试、未构建二进制。

## P1 已修复：收回主宠后重召错误覆盖副宠

原触发流程：单人五宠，bag0..4分别站5..9。第一回合收回主宠，5空、6..9保留；第二回合重新召唤bag0。核心原先调用 `PrimaryPet(0)`，当5空时回退到6副宠，因而PetIn/PetOut实际目标为6。世界层仍硬编码位置5登记、删除、查Recalled，最终产生：

```
phantom deployment slot5 maps to bag0 but has no fighter
slot6 fighter "bag0" mapped to bag1 ("bag1")
```

影响：副宠未正确结算、映射指向错误宠物栏，经验及生命值可能写给另一只宠物。

修复：

- 核心代理修改 `server/internal/battle/pet.go` 的换宠逻辑，仅使用所属玩家的固定主宠位，主宠位空时不回退覆盖副宠。
- 本代理修改 `server/internal/world/petfight.go`：PetIn按Event.Target寻找真实旧bag，并验证Recalled宠物的Owner；`settleRecalled`显式接收bag，避免依赖主宠别名。按事件位置删除映射和命令、清除旧选择状态。PetOut按Event.Target写入映射，只有主宠位更新旧兼容别名。
- 新增永久 `server/internal/world/multipet_swap_test.go`，真实Resolve和afterMemberTurn执行收回、重召两个回合，检查主宠回原位、副宠对象保持不变、无Recalled遗留、所有位置与bag匹配、后续击杀经验发给重召宠物。

验证：`go test -race -p=1 ./internal/world -run 'TestMultiPet|TestPetSwap|TestBattleGold' -count=1` 通过，21.279s。

## P2 已修复：被收回宠物的旧击杀在敌人复活后重复奖励

位置：`server/internal/world/petfight.go` 的balanceBattlePets保存retired.kills（审查时96..102行），以及petResult遍历retired.kills（516..521行）。

最小复现：

1. 关闭经验共享。A单人五宠，slot9宠物杀死敌人15，经验1000。
2. B救援加入，A的slot9宠物因配额减少被收回；retired.kills保存敌人15的 `*battle.Fighter`。
3. 敌人16使用真实 `ENEMYSKILL_ReLife`，通过 `Battle.Resolve` 复活敌人15。
4. B的slot6宠物再次杀死敌人15。
5. A、B各调用一次正常petResult：A旧收回宠物得到1000，B当前击杀宠物也得到1000。

临时复现测试输出：

```
TestIntegrationReviewRetiredKillRevivedThenKilledAgain
one enemy paid two owners after resurrection:
retired-owner exp=1000 active-owner exp=1000
```

根因：保存了可复活、可再次修改归属的敌人对象指针，旧收回记录无死亡代次/有效归属检查。原经验计算只根据最终KilledBy给一次，新收回贡献快照会保留已过期死亡。

实际修复：房间增加 `retirementSeq`，每次收回分配房间内唯一的负值 `killToken`（不使用通用-1，也不按可复用槽位/宠物栏位生成），并将原击杀归属从宠位改为该token。`retired.validKills()` 同时要求敌人HP<=0及当前KilledBy仍等于该次收回token；复活后被同主人或其他主人再次杀死都会覆盖KilledBy，使旧贡献失效。经验和击杀忠诚度结算共用此筛选。

共享经验不将token错误解释成宠位；battleExp显式合并所属fight的有效retiredKills，保留收回前贡献给原主人、当前出战宠和骑宠的共享规则。战斗石币仍按最终死亡敌人计算一次，逻辑未修改。

永久回归：`multipet_rewards_test.go` 的 `TestMultiPetRetiredKillExpiresAfterEnemyRevivesAndDiesAgain`，4个子场景覆盖sharefalse/true及同主人/另一主人再次击杀，通过真实ENEMYSKILL_ReLife执行复活，验证旧收回宠不重复领经验、共享仍只归最终击杀主人、不同收回token互不相同。

## P2 已修复：离场玩家旧宠位被救援重用，击杀奖励错发剩余玩家

位置：`server/internal/world/petfight.go` 的balanceBattlePets构造remap、重排KilledBy及清空整侧宠位（审查时154..193行）。

最小复现：

1. A、B两人初始配额3/2；A主宠slot5杀死敌人15，经验1000。
2. A正常逃离，调用removeMember与endMember；B继续留在战场。A的F0/F5仍作为Escaped旧Fighter保留在F数组。
3. C救援加入B的战斗。balance只遍历room.members中的B、C，清空5..9，再把B的新额外宠物放到空余slot5。
4. 原敌人15的KilledBy仍为5，因旧A宠物不在当前members中，remap没有清除它。B的bag1按个人击杀拿到本应属于已离场A宠物的1000经验。

临时复现测试输出：

```
TestIntegrationReviewEscapedOwnerKillsNotReassignedOnRescue
rescuer rebalance reassigned escaped owner's kill slot5 to remaining owner pet:
{Slot:1 Name:乌力 Exp:1000 LevelUp:0 Level:20}; killer=5
```

实际修复：构造remap时先将该侧F数组中所有旧Pet位置初始化为-1，再用实际保留的deployment覆盖。所有被清掉、未保留的旧宠位都失去击杀/指令目标归属；现有统一重排逻辑同时处理KilledBy、已提交命令和核心保护/技能引用。已经离开room.members的旧宠物也纳入失效处理。

永久回归：`multipet_rewards_test.go` 的 `TestMultiPetRescueDoesNotInheritEscapedOwnersKills`，sharefalse/true两个子场景经过真实endMember逃离结算和rescueEntry加入，确认旧slot5被新owner重用，但旧击杀与已提交Target都变为-1；剩余人物与所有宠物均不继承原离场者经验。

## 复现工具与审查范围

临时测试仅在 `/tmp/sa-integration-review_test.go`，通过 `/tmp/sa-integration-review-overlay.json` 加载为world包测试，无临时测试写入仓库。

命令示例：

```
GOMAXPROCS=2 GOMEMLIMIT=400MiB go test \
  -overlay=/tmp/sa-integration-review-overlay.json -p=1 ./internal/world \
  -run TestIntegrationReviewRetiredKillRevivedThenKilledAgain -count=1
```

另一个测试使用 `-run TestIntegrationReviewEscapedOwnerKillsNotReassignedOnRescue`。两项在审查版本均明确失败，结果已通知父代理。

已检查world的fight/rescue/crush/duel/watch/automation以及核心PetOwner、PrimaryPet、RemapSlots、逃离/保护/复活等路径。没有将保留作主宠兼容的slot+5引用一概认定为缺陷；自动战斗已逐petSlots提交，世界回合等待按所有活宠执行。独立等级上限已有此前真实经验表、1000级、降低配置保留数据及GM边界测试，不重复全仓运行。本次审查到上述三个可复现问题后停止扩大范围；三项已按父任务授权完成修复。

最终验证：`go test -race -p=1 ./internal/world -run 'TestMultiPet|TestPetSwap|TestBattleGold' -count=1` 全部通过，23.399s，包含上述永久回归、原多宠/换宠及战斗石币测试。运行环境限制为GOMAXPROCS=2、GOMEMLIMIT=400MiB。原石币测试仅将旧通用-1断言改为任意负归属，保持其死亡敌人石币计数断言不变。
