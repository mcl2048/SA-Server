# SA-1113-03 Task2 · 主人倒地后的独立宠物策略

## 根因：两个真实路径

1. 浏览器 `aismart.ts:smartChoose` 在主人HP≤0时立即返回 `skip`，默认宠物元组仍是 `[-1,-1]`。战斗UI收到skip后调用sendAllPets，所有活宠继承默认防御；不是服务端禁止倒地主人的宠物行动。
2. 服务端 `automation.go:chooseAutomation` 继续替HP=0主人生成逃跑意图，低血逃跑条件必真。`chooseAutomationPet` 看到Capture/Escape为保护捕捉/逃跑而给每只宠物防御，导致全部活宠守势。另一个分支会因主人0HP选择Guardian保护尸体。服务器真正的回合验证已允许主人倒地、活宠独立行动，修改核心战斗规则并非必要。

研究原则沿用主Agent修改前获取的 [Game Programming Patterns · State](https://gameprogrammingpatterns.com/state.html)：以当前行动者与有效状态决定行为，避免把角色失能状态隐式扩散到其余行动者。本补丁采用显式ownerDown边界，而不重构战斗状态机。

任务进行中Prompt扩大到多人PvE自动/快速战斗，故倒地主人的独立宠物决策也应用于组队PvE；PvP与手动指令保持既有规则。

## 修改

- 服务端主人倒地时不生成无效逃跑/捕捉/施法意图；每只活宠仍在已有`petSlots()`循环中提交自身技能。主人本身的默认Guard仅是未提交的占位，`automationBattle`原有Alive检查阻止向尸体提交行动。
- 宠物在倒地主人时忽略主人捕捉/逃跑意图，不选保护尸体的Guardian，也不执行指向倒地主人的固定技能。对每只宠物读取自己的技能格位与血量，对活敌人选择目标；普通攻击零MP仍可用，低于自身15%耐久可防御，无技能/无有效目标走原协议防御fallback。活主人时捕捉安全、逃跑与固定宠物行动不变。
- 客户端`smartChoose`不再在死主时丢弃宠物决策；新增`smartChooseSoloPet(settings, context, petSlot)`供UI逐宠调用。名称保留为首次接口约定，支持多人PvE；`SmartContext.pvp`显式区分PvP，不能用`noEscape`代替（boss也禁止逃跑）。每只宠需传自己的info/技能格位；UI接入由battle.ts owner完成，本子Agent未修改battle.ts/main.ts/net.ts。
- 不虚构技能MP成本：本服PetSkill协议没有MP成本字段，服务端宠物技能没有通用MP扣费约束；MP=0不应使普通物攻或所有技能自动不可用。人物无MP仍沿已有恢复/装备精灵校验路径。
- 多人活队友的治疗、复活逻辑保持原校验：人物有真实装备/道具资源才产生恢复命令，不臆造宠物复活技能，不向尸体施放普通治疗。

## 确定性回归

- `node --test client/test/ai-owner-down.test.ts`：3/3通过。覆盖主人存活→倒地、两只宠技能格位不同、零MP仍攻击、低血独立防御、无技能fallback、多人同侧队友、PvP负例、死亡/离场宠及无活敌人。
- `go test -race ./internal/world -run 'TestAutomationOwnerDown|TestAutomationPartyOwnerDown|TestAutomationPlansEmergency|TestAutomationDetachedBattlePacing' -count=1`：通过。普通auto和quick各真实开战三宠，主人1HP活时仍按原规则逃跑，随后0HP时健康宠物攻击、低血宠防御、无技能宠fallback；实际自动tick使宠物回合推进并产生攻击事件。多人PvE选择正确活敌人；PvP不自动安装任何指令，原显式逃跑宠物规则保持；原捕捉安全回归通过。
- 最终 `go test -race ./internal/world -run 'TestAutomation' -count=1` 全部自动策略测试通过（含Task3 CanEncounter字段后的最终重跑15.092s）。
- 完整客户端入口TypeScript检查通过。
- 按主Agent要求同步修正既有detached pacing测试展示断言：无消费者后台不构造BattleTurn（性能owner修改fight.go），保留权威room.turn仅推进一次、quick最短1秒、同tick不重复、旧手动命令不覆盖等断言。

## 验证范围

上述是确定性真实world/策略代码验证。最终二进制、Chromium主人实际死亡与多宠继续auto/quick场景由主Agent集成验收，证据应绑定最终build SHA后另追加。本子Agent不修改版本、README，不提交、不构建发行包，不改战斗显示。
