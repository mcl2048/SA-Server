# 等级上限与多宠出战：世界层交接

## 已完成

人物与宠物采用独立的有效等级上限；Rules 默认及配置解析由父任务负责。此部分读取 `charMaxLevel()` / `petMaxLevel()` / `charMaxTrans()`。

- 人物、宠物升级按各自规则停止，满级或旧存档高于当前配置时 `NextExp=0`。降低配置不会降级或清除原有经验；升级奖励也不会清零经验，恢复较高配置后可继续成长。
- 宠物模板 `LimitLevel<=0` 或 `>=140` 视为旧通用上限，跟随配置。`0<LimitLevel<140` 保留特殊模板限制，取模板与配置的较小值。
- `NextLevelExp` 保留原表所有非负值和中间无效项。表尾按最后两项正经验的差值线性延伸：199级91,800,799、200级92,276,013、201级92,751,227。1000级所需经验仍在有符号32位范围内，极端调用对机器整数饱和处理。
- GM `/lv`、`/pet`、`/petlv`、`/trans`、`/tensei`、`/encount` 使用配置限制；提供动态菜单提示。`/petlv` 在特殊模板上限处必定退出。转生上限0禁止新转生，但 `/trans 0` 有效。
- 任务等级可达性提示读取配置。仅H5转生引导9101/9102的精确 `TRANS<6` 条件替换为人物转生上限，普通任务原有TRANS含义保持。
- GM `/setpw` 数据库成功后调用目标客户端可选 `InvalidateSession()`，会话模块保证非阻塞，不同步重新进入世界协程。失败密码修改及仅修改安全码不触发。

## 多宠分配与接口

每侧人物占0..4、宠物共用5..9；另一侧加10。已有主宠固定在 `人物slot+5`，额外宠物按队长优先分配剩余空槽。人数与最大配额分别为：

| 人数 | 每人配额 |
| --- | --- |
| 1 | 5 |
| 2 | 3、2 |
| 3 | 2、2、1 |
| 4 | 2、1、1、1 |
| 5 | 1、1、1、1、1 |

候选来自原 `Battle` 主宠及 `Standby` 待命位，按原宠物栏顺序补齐；休息、骑乘、外出、守护、HP<=0不自动入场。不新增存档字段；五宠需要一只出战、其余四只待命。没有指定Battle时，第一只符合条件的待命宠自动占战斗主宠位置。

宠物面板已修复原来把出战和待命合计限制为4只的计数：`MAX_DEPLOYED_PETS=PET_SLOTS` 允许总计5只，服务端待命位仍单独最多4只。正常操作第一只点两次（休息→待命→出战），其余四只各点一次即可选五宠；如果先选四只待命，第五只由休息直接改为出战，避免被服务端的4待命上限拒绝。邮件选择改成休息宠物旁的独立“邮件/取消邮件”按钮，仍可清除邮件选择，不会把第五只误标成邮件宠物；在外邮件、骑乘及HP0不能出战等保护保持。

稳定接口：

```go
fight.pets map[int]int                 // battle slot -> bag slot
fight.petCmds map[int]*battle.Command  // battle slot -> submitted command
ft.petSlots() []int                    // primary first, other slots ascending
ft.petBagSlot(slot int) (int, bool)
ft.ownsPetSlot(slot int) bool
ft.petCommand(slot int) *battle.Command
w.BattlePetCommand(charID, skill, target int, petSlot ...int)
w.battlePetCommand(e, skill, target int, petSlot ...int)
```

可选petSlot为战斗位置；缺省或0使用原主宠。命令严格校验所属玩家、存活状态及本回合是否已提交。回合等待及结算包含全部在场宠物。旧 `ft.pet` / `ft.petCmd` 暂作主宠兼容别名，现有自动战斗与续接逻辑可渐进转到映射接口。

所有宠物Fighter显式设置 `OwnerSlot`、`OwnerSet=true`；客户端战斗快照包含 ownerSlot、bagSlot、status，PetOut事件也明确给出主人和宠物栏位。核心OwnerSet与RemapSlots实现由另一个代理负责。

## 救援重排和结算

初始组队先将全部人物加入房间，再按最终人数一次分配宠物，避免把尚未真正入场的宠物误记为收回。`joinRoom(..., true)` 延后宠物分配，调用方最后执行 `balanceBattlePets(room, side)`；普通救援默认立即分配。PvE初始入口已改，PvP初始入口由父任务同步接入。

新增队友进入时重新计算同侧配额，保留已有Fighter对象，生命、异常状态、蓄力和已提交指令不会通过重新构造被刷新。已有Fighter直接移动F数组引用；不能调用 `Battle.Add`，其会重置蓄力与KilledBy。

- 同步原子重排敌人击杀归属、所有玩家/宠物已提交指令的Target，并调用核心 `Battle.RemapSlots` 更新内部保护/待发动技能目标。
- 因配额减少收回的额外宠物存入 `retiredPets`，保存Fighter及自己的击杀快照，战斗结束只结算一次。生命与忠诚惩罚仍写回，保留其收回前击杀经验；不再参与收回后的新击杀共享。
- 被收回的宠物在该场战斗不能再次手动召唤，当前在场宠物也不能再次召唤自身，防止旧存档HP刷新、克隆和重复奖励。正常换其他未在场、未因配额收回的主宠仍沿用原换宠流程。
- 救援加入发送 `BattleJoin{ResetPets:true}` 及全部人物/宠物快照，已有客户端删除旧宠位后按新映射重建。
- 宠物飞走、逃离、元变、装备磨损、战斗断开、超时、忠诚度、死亡惩罚及结果列表均按实际所有权处理。
- 共享经验按主人和全部当前宠物贡献汇总、活着的人/出战宠/骑宠最低等级折算，所有当前活宠拿同一共享值。关闭共享时每只宠物只按自己的击杀折算。因配额收回宠物按自身收回前击杀单独结算。

## 文件

- `server/internal/data/battle.go`：经验表尾延伸。
- `server/internal/world/pet.go`：宠物等级上限、下级经验、忠诚奖励及显式战斗所有权。
- `server/internal/world/gm.go`：GM等级/转生上限、菜单提示、宠物升级终止保护、密码会话撤销。
- `server/internal/world/quest.go`：等级可达性与两个H5转生引导。
- `server/internal/world/fight.go`：多宠映射/入场/命令/回合等待/经验/状态写回/事件所有权；保留父任务战斗石币奖励行及续接辅助函数。
- `server/internal/world/petfight.go`：配额重排、宠物事件、独立结算、收回贡献保存。
- `server/internal/world/crush.go`：按实际宠物装备磨损。
- `server/internal/world/rescue.go`：重排后完整快照。
- `server/internal/data/battleexp_test.go`：真实经验表保持、线性尾部、无效表及溢出。
- `server/internal/world/level_limits_test.go`：独立上限、降低后保留数据、1000级、模板限制、GM行为、任务引导和密码会话撤销。
- `server/internal/world/multipet_test.go`：五种人数配额、所有权和状态保留、所有宠物命令等待、原子重排目标、共享/独立/收回经验、救援快照、防重复召唤、窗口一主四待命及无主自动选择。
- `client/src/pets.ts`：总共五宠选择、无主时第五只成为主宠、独立邮件选择控件。
- `client/test/pets-selection.test.ts`：真实PetWindow.frame按钮流程，覆盖五宠、四待命加第五主宠、邮件独立操作和原状态保护。

## 验证证据

工具链：Go 1.27.3；运行限制 `GOMAXPROCS=2 GOMEMLIMIT=400MiB`，`-p=1`，未构建服务器二进制。

1. `go test -p=1 ./internal/data ./internal/world -run 'TestNextLevelExp|TestIndependentLevelLimits|TestPetTemplateLimits|TestLevelLimit|TestGMPasswordChangeInvalidates|TestPetBattle|TestPetSwap|TestRescue|TestCapture|TestGM' -count=1`：通过，data0.011s、world5.361s。
2. `go test -p=1 ./internal/world -count=1`：通过，40.504s，覆盖当时全部世界层测试及多宠新增测试。该轮后继续补充RemapSlots、事件映射和重复召唤边界。
3. `go test -race -p=1 ./internal/world -run 'TestIndependentLevelLimits|TestPetTemplateLimits|TestLevelLimit|TestGMPasswordChangeInvalidates|TestMultiPet' -count=1`：通过，16.619s，包含RemapSlots/事件字段/防重复召唤逻辑。
4. 初始队伍一次性配额改动及对应新增测试后，重复同一针对性竞态检查：通过，15.482s，最终版本包含6个多宠测试、4个等级测试及1个GM会话撤销测试。

5. 五宠面板补充后，`node --test client/test/pets-selection.test.ts client/test/battle-multipet.test.ts`：13项全部通过（本子任务新增4项选择测试，另9项为客户端战斗代理测试）。
6. `go test -race -p=1 ./internal/world -run 'TestPetWindow|TestMultiPetWindowSelection' -count=1`：通过，10.598s，覆盖服务端一主四待命、没有主宠时自动选第一个合格待命，以及邮件/守护/死亡宠物排除。

父任务负责最终全仓测试、浏览器五宠/队伍配额/断线续接验收、协议与客户端生成、配置文档及构建发布。本子任务未执行提交、推送或二进制构建。
