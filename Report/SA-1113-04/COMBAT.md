# SA-1113-04 · 自动战斗、敌方策略与队伍协作

> 初始基线 `31a8848` · 2026-11-13 · 本记录绑定本批源码，最终二进制与 Chromium 验收由主 Agent 记录。

## 风险、修复与复现证据

| 风险 | 实际复现 | 修复后的行为 |
| --- | --- | --- |
| 客户端再次折扣已折扣的 MP，生成无法施放的精灵指令 | 80 MP、服务端报告成本 100 MP，`smartChoose` 仍返回 magic；[客户端基线](combat-client-baseline.txt) | 直接使用 `InvItem.magicMp`；仅真实装备、战斗可用、当前 MP 足够的精灵进入候选；80/80 边界仍可施放。 |
| 地图专用道具与全体复活产生无效战斗意图 | 地图补血道具被选择；全体复活发送倒地玩家格位 1，原生边界要求 side 20 | 排除地图专用/不可用道具；全体复活与恢复一致发送 side 目标。 |
| 固定宠物攻击破坏主人捕捉 | 主人 Capture、宠物固定 Attack 仍指向同一敌人 | 捕捉优先于固定计划；战斗可用的手下留情辅助捕捉，否则使用防御技能，缺少防御技能沿用无动作回退；主人倒地时仍保持活宠独立决策。 |
| 快速/自动队友攻击待捕捉敌人，或多人重复捕捉同一对象 | [多人基线](combat-cooperation-baseline.txt)：quick 队长实际击杀 auto 队员的捕捉目标；范围宠物技能同样包含该对象 | 从当前合法指令和明确自动计划按队伍顺序分配捕捉对象；顺序不同的提交维持同一分配；其他队员选择安全目标或防御。既有手动捕捉优先，开启自动后宠物也继承该真实意图。 |
| 策略层避开目标仍可被攻击重定向、范围扩展或 Guardian 绕过 | [重定向](combat-retarget-baseline.txt)：原目标死亡后宠物击杀捕捉对象；[范围表](combat-magic-area-baseline.txt)：真实 AttMagics 仍包含该对象；[Guardian](combat-guardian-baseline.txt)：攻击安全敌人被待捕捉的 Guardian 替挡 | `battle.Command.Automatic` 仅由内部自动策略设置；Resolve 为该侧实际合法 Capture 建立本次自动行动排除集合。单次/连击目标、一般精灵范围、真实攻击精灵范围与最终伤害接收者均检查它。手下留情保留非致命协助，反击不能因此击杀对象。Guardian 拦截导致该次自动攻击跳过，原规则仍保留，None 事件报告原目标的原 HP。 |
| 恢复总选最大的精灵，浪费 MP | 仅缺 60 HP 仍选成本 100 MP、回复 1000 的精灵；身上已有成本 5 MP、回复 100 的精灵 | 优先估计足够的小回复；缺口较大时选择较大回复；回复量相同选实际 MP 较低者；骑宠缺口计入。实际恢复与 MP 扣费经过原生执行验证。 |
| 敌人随机抽到地图专用/空技能，并将普通攻击目标用于自用或范围技能 | [服务端基线](combat-go-baseline.txt) 与 [范围类型变体](combat-retarget-baseline.txt) | 权重仅包含存在且战斗可用的技能；无可用动作回退普通攻击；保留表内人物/宠物过滤及随机/最高/最低 HP 偏好；自用、双方全体、一排、全部排遵循自身范围。 |
| 队长先离开共同观战，仍观战的队员被移动并拖入另一场战斗 | `fight/watch` 同时存在，队员位置也改变；[服务端基线](combat-go-baseline.txt) | 观战队员继续属于原观战室，不参与跟随移动及队长新战斗；消除同时消费两场战斗流的状态。 |

范围表测试第一次因测试夹具缺少 AttMagics 而未执行攻击（旧 `combat-boundaries.txt` 保留该失败）。补全真实范围表后复现了遗漏，随后增加 `attMagicArea` 过滤。该夹具失败没有作为修复证据；最终验证使用完整夹具。

## 性能证据

敌人每回合五次解析同一战术并构造多个目标切片。现在每个敌人只保存一个不变的解析结果；战术字符串改变时重新解析，技能可用性、目标生命状态和 guard 倍率每次重新读取。人物/宠物不分配战术缓存，目标选择使用十格栈缓冲。

| 同一 `BenchmarkEnemyAI`，Go 1.27.3 / GOMAXPROCS=2 | 时间范围（三次） | 每次分配 |
| --- | --- | --- |
| [修改前](combat-enemy-benchmark-before.txt) | 6,444–7,801 ns/op | 886 B / 17 次 |
| [修改后](combat-enemy-benchmark-after.txt) | 197.2–263.4 ns/op | 稳态 0 B / 0 次 |

测量发生在共享虚拟机，时间范围包含并行构建负载。缓存首次建立会分配一个小对象；以上数字是该函数稳态基准，不能换算成全服吞吐或总内存提升。

## 已执行验证

- 客户端最初 4 个新用例全部按预期失败；修复后这些用例与倒地主人回归共 7/7 通过。该阶段完整客户端测试 115/115 通过，见 [完整客户端日志](combat-client-full.txt)。后续移动集成的新测试由主 Agent 的最终全套结果覆盖。
- 完整 `go test -race ./internal/battle ./internal/world -count=1` 通过：battle 2.152s、world 229.561s，见 [完整 race](combat-race.txt)。
- 发现并补齐 Guardian 变体后，完整 battle 包再次通过，见 [最终 battle](combat-final-battle.txt)；自动、快速、双方捕捉范围、多宠配额、队伍、观战与敌人策略 focused race 再次通过，见 [最终 focused race](combat-final-focused-race.txt)。
- 开启自动前已经提交的手动 Capture 与宠物手下留情真实执行验证通过，见 [排队捕捉 race](combat-queued-capture.txt)，8.025s。
- 新增测试覆盖：不同捕捉提交顺序、混合 quick/auto 等待、手动捕捉保留、倒地主人的活宠保护队友目标、范围攻击、重定向、蓄力、手下留情/反击、Guardian 拦截与无假血量通知。队伍 1..5 人共享五宠位、实际所属角色校验和既有 PvP 不自动下令用例继续通过。
- 最后修改后 `go vet ./internal/battle ./internal/world` 通过，见 [vet](combat-vet.txt)；TypeScript 使用 esnext/bundler 检查完整 `client/src/main.ts` 入口通过，见 [TypeScript](combat-typescript.txt)。
- 运行 golangci-lint 2.15.0 全 battle/world 检查，历史与并行变更共出现 18 项，见 [完整 lint](combat-lint.txt)。`--new-from-rev=31a8848` 在本 Agent 修改中未报告新问题；当时 family/shutdown 并行改动的 3 项已反馈主 Agent，见 [增量 lint](combat-lint-new.txt)。未扩大修改到其他文件所有者的历史家族/地图代码。

实际 Go 命令使用 `/home/coder/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.27.3.linux-amd64/bin/go`、`GOMAXPROCS=2`、`GOMEMLIMIT=400MiB`。完整记录保留原始输出，失败日志与通过日志分开。

## 实现与保留的边界

- 只修改 battle/world 决策与已有客户端 AI；`Automatic` 不进入消息协议，不允许客户端提交或跳过合法性校验；不改变数据库、道具规则、奖励归属或人为手动指令。
- 捕捉排除集合仅在一个自动行动的执行期间生效，行动结束即清空；普通目标查询、敌方动作及后续回合不会继承它。
- 队伍自动计划会在紧急恢复优先时暂时保守保护一个候选捕捉对象；策略以合法和可解释为目标，不声称全局最优。恢复量按现有精灵 Option 估计，真实回复仍有原版随机区间。
- 敌人保留 table-driven 权重与已存在的 `ma` 普通攻击 fallback；没有引入外部推理或重写完整敌人魔法系统。
- 本记录包含真实 battle/world 执行和客户端模块测试，不包含实体手机认证。最终嵌入客户端、二进制 SHA、浏览器与交付验收以主 Agent 最终记录为准。
- 本 Agent 执行期间任务文件 SHA-256 保持 `6d510059a3a749f9099121c02deb0d46680ba13146048bf9268a1a374a0cf6e6`，未修改任务文件、版本、发行文档或提交/推送。

修改前的源码约束与官方资料见 [COMBAT-CONTEXT.md](COMBAT-CONTEXT.md)。
