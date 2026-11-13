# SA-1113-03 · 独立只读审查

审查范围：`client/src/battle.ts`、`client/src/aismart.ts`、`server/internal/world/automation.go`、`server/internal/world/fight.go` 已落地变更及直接调用上下文。审查者只创建本报告，没有修改实现或测试，没有提交代码。Task3仍在并行修改的协议与世界发送点不作为本报告的完整性结论依据；没有扩展到无关历史功能。

## 结论

未发现本范围内已确认可复现的 P0/P1。人物死亡后存活宠物在自动 PvE 的逐宠技能归属、服务端 nil/no-skill 安全、PvP/manual 负控制和后台权威结算路径均得到源码与聚焦测试支持。另发现两项可实际复现的 P2，已立即反馈主 Agent，并由 UI owner 修复。审查者随后只读复核当前实现并重跑两项对应测试文件，8/8通过；两项P2现均已关闭。下方保留发现时复现作为回归依据，最终复核详见文末。

## P2：死者分支不推进首回合宠物策略

位置：`battle.ts` 的 `openMenu` 死亡人物分支及 `sendAllPets`；`aiFirst` 原本仅在 `autoCommand` 设为 false。

人物在初始快照已经死亡（非 resume）时，`openMenu` 直接设 sent=true 并逐宠发命令，因而不会进入 `autoCommand`。之后每个回合仍把 `first: this.aiFirst` 传给 `smartChooseSoloPet`。若 `petFirst` 和 `petThen` 不同，宠物会一直执行首回合计划。服务器使用 `room.turn == 0`，没有这一问题。

只读复现使用真实 BattleScreen，人物0 HP、宠物slot5存活、敌人slot15存活；设 petFirst 为技能First(slot1)，petThen 为技能Later(slot4)。调用 `openMenu(100)`，设置 turns=1 后调用 `openMenu(200)`，实际输出：

```json
{"twoRounds":[[1,15,5],[1,15,5]],"aiFirst":true}
```

期望第二回合使用slot4。建议在死者分支整批逐宠选择完成后推进首回合标志，避免同一批宠物中首只与后续宠物使用不同时相；或按实际回合语义选择。须补真实 `openMenu` 连续两回合回归，仅测试纯策略函数不足以捕获此状态问题。

## P2：实际复活事件绕过星星状态清理

位置：`battle.ts` 的 `applyMagic` revive、`eventSteps` revive 与 `Fighter.frame`。

`Fighter.frame` 新增的复活清理只在 `!dead && action === DEAD` 时运行。但真实复活路径先设置 dead=false 并 `play(STAND)`，所以清理分支不可达；`stars` 和 `deadAt` 保留，`drawFighters` 的星星绘制没有再次判断 dead。人物虽然已站立、HP恢复，头顶仍持续显示倒地星星。现有测试直接设置 dead=false/hp，未通过实际 revive handler，因此漏过此问题。

只读复现使用真实 `applyMagic` 与 `Fighter.frame`：先令倒地角色 stars=true、deadAt=1；执行 result=revive、hp=50 的事件，再渲染一帧，实际输出：

```json
{"revived":{"dead":false,"hp":50,"stars":true,"deadAt":1}}
```

建议在两条真实复活路径显式重置死亡展示状态，或使存活状态清理独立于 action===DEAD；保留击退、返回与击飞编排。回归必须从已播放完倒地动画、有星星的状态通过实际 revive handler 复活。

## 已确认的正确边界

| 检查点 | 结果与依据 |
|---|---|
| 服务端逐宠技能 | `automationBattle` 枚举当前 fight.petSlots，对每个slot调用 chooseAutomationPet，技能来自该战斗宠物 Skills；不是复用主宠技能格。battlePetCommand再次核对 ownsPetSlot、存活、技能下标、非nil与Field。 |
| nil/无技能 | Fighter.Alive 对nil安全；petBagSlot先判归属；无敌人返回(-1,-1)，无技能回落为无宠物技能命令，不索引空技能；不把该回落描述成真实执行防御技能。角色fight和owner存在由正常战斗入口维持。 |
| 死亡人物自动决策 | chooseAutomation在死亡PvE分支返回Guard占位，automationBattle仅给存活人物提交人物命令；存活宠物仍提交，tryResolve只等待存活角色/宠物，宠物单独回合可推进。死亡人物不会生成低HP逃跑/抓捕意图。 |
| party dead owner | petCanActWithoutOwner不要求单人队伍，party同样适用；ft.pets归属与client ownerSlot/bagSlot约束，其他队友的宠物不会被抢用。现有party回归主要验证策略/PvP gate，非新增真实多连接party端到端认证。 |
| PvP/manual | automationBattle在PvP直接返回；客户端死亡逐宠重选受 !pvp && (auto || quick) 限制；manual与PvP死亡分支保留无技能回落。没有改BattleCommand/BattlePetCommand的manual权威验证规则。 |
| 客户端逐宠 | ownedPets按owner和各自bag匹配PetInfo；sendAllPets对每个未提交宠物重新构造自身skills上下文，并携带明确battle slot提交；petSentSlots阻止重复。serverAuto开启时客户端不重复发指令。 |
| 死亡快照与方向 | Fighter初始化hp<=0直接DEAD；DEAD资源优先当前方向、再任意真实DEAD，才用通用fallback；applyHit在e.dead或hp<=0时标记死亡。保留motion/dying/fly编排，避免idle结束把尸体重新站起。 |
| 后台权威 | sendBattleTurn只裁剪BattleTurn投影构建/发送；resolveTurn仍先Resolve与afterMemberTurn，后续Over/endBattle、奖励、退出、计时器重置不受无观众分支跳过。新观众/重连用完整BattleStart快照。 |

## 聚焦验证

未运行昂贵全量、race全量或浏览器；仅执行：

- `node --test client/test/battle-dead-owner.test.ts client/test/battle-multipet.test.ts`：14/14通过。
- `node --test client/test/ai-owner-down.test.ts client/test/battle-resource.test.ts`：8/8通过。
- `GOMAXPROCS=2 go -C server test ./internal/world -run 'TestAutomationPartyOwnerDownAndPVPNegativeControl|TestAutomationOwnerDownPetsContinue|TestBackgroundBattleTurnAudience|TestBackgroundBattleProgressRewardAndReconnect' -count=1`：通过，2.755s。
- 两条P2只读复现通过Node stdin导入实际实现，未创建测试文件或hook。

后台回归覆盖无观众不投影、附加观众收到投影、双方投影相同、PetOut归属、已关闭/nil transport、后台推进与timer、重连快照、无观众终战经验/金币增加并Flush后数据库可读。

本报告是当前已稳定路径的窄审查，不是生产并发容量、实体设备、所有特殊技能、尚未完成Task3协议发送点的认证。

## 两项 P2 最终复核：已关闭

UI owner 完成修复后，审查者重新阅读对应源码与回归，未修改实现或测试：

- `openMenu` 在整批宠物提交完成后才设 `aiFirst=false`（当前battle.ts:1314）。同一批所有宠物保持一致首回合策略；下一次回合使用后续策略。新增真实BattleScreen测试同时覆盖auto和quick，两只宠物首轮使用各自攻击技能格，次轮均切到明确指定的Next技能格，没有复用另一只宠物的首次技能格。
- `applyMagic` 与 `eventSteps` 两条真实复活处理均仅在hp>0时清除dead/stars/deadAt/dying并播放STAND（当前battle.ts:706、781）。新增测试从有星星、deadAt和dying的倒地状态，通过这两个实际handler复活，断言全部残留状态清除；不再只通过直接赋值dead=false来模拟复活。
- 独立执行 `node --test client/test/battle-dead-owner.test.ts client/test/battle-resource.test.ts`：8/8通过，0失败，335.886ms。

本次只补这两项复核，不扩大历史功能范围、不运行昂贵全量；两项原始缺陷描述保留为发现时记录，不代表当前仍存在。
