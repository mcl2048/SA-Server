# SA-1114-04 · 雷萨利朵与电磁火炮服务端

基线 `811193a / v0.2.14-LYNX`。本代理负责 `server/internal/data`、`server/internal/battle`、世界开战保护与自动宠技选择；客户端、图像、版本、发行、浏览器及推送由主代理集成。修改前依据与原生边界见 [SERVER-RESEARCH.md](SERVER-RESEARCH.md)。

## 独立宠物与洞窟分布

权威数据为 [`server/internal/data/lisarido.json`](../../server/internal/data/lisarido.json)，独立嵌入并严格解码，不修改莉莉丝和原四宠目录。

| 项目 | 雷萨利朵 |
| --- | --- |
| 模板／幼体敌人／幼体敌群 | 29006 |
| 成体敌人／敌群 | 29016 |
| 形象／技能／效果 | 199300／29050／199301 |
| 初始／每级实际成长次数 | 40／4，与原生佩露夏同档 |
| 体／腕／耐／敏 | 26／60／16／47，总量149，偏攻击爆发与敏捷 |
| 地／水／火／风 | 0／0／70／30 |
| 地区 | 玄黄洞窟2层·鸣金石廊，floor11202，中心(40,40) |
| 等级与权重 | 幼体Lv1占12%，成体Lv54–58占18%，原敌群保留70% |

实际地图二进制与运行时 `TileSet.Walkable` 均证明(40,40)/(41,40)可行走。独立覆盖最大半径8，始终留在同一原生区域505，使用独立群组切片，不覆盖原生区域或其他新宠分布。5000次真实 `PickEnemies` 采样得到幼体578、成体940、原敌群3482；自然宠物经 `NewEnemy` 保留捕获与炮技能元数据，真实回合结算发出五次远程攻击。

故事以玄黄矿脉余电、守护岔路与击退盗矿者为主题，完整文本保存在权威JSON，由客户端同步读取。原生GM从模板／敌人／技能注册表枚举即可查询与授予，不添加另一份硬编码。

安装在写入任何注册项前检查模板、技能、幼成敌人、幼成敌群、形象七类冲突，任一冲突保持所有注册项原样；重复安装幂等。缺少可行走原生地图区域时保留宠物／技能注册并给出跳过自然分布的警告。原四宠区域总数断言仅由原生+5扩展为+6。

## 五发与状态规则

`PETSKILL_ElectromagneticCannon` 通过原生技能命令预处理和执行分派，不退化成普通攻击。UI `Target=1`，服务端忽略首个单体目标，每发独立随机选取敌侧当前可攻击活体；死亡、击飞、逃离、隐藏和自动捕获保护均重新检查。每次调用一次原生 `attackOnce`，按原生物理结算后的15%／16%／17%／18%之一缩放，保留命中、防御、属性、光镜守、实际守护者、骑宠分摊与死亡归因，不引发反击。

每次正伤害且实际承伤者仍存活时，先用50%／50%选择一个附加效果类别，然后仅对所选类别进行概率判定：

```text
麻痹：clamp(35 + (施法等级−承伤等级)/2 − max(0,麻痹抗性), 20, 50)%
驱离：clamp(20 + (施法等级−承伤等级)/4, 10, 30)%
```

等级差为Go整数向零截断。麻痹仅在没有其他异常或晕眩时生效，持续三次跳过行动；消失／吸收／反射／闪避／零伤害不附加效果。一次攻击绝不同时新加麻痹与驱离，所选类别免疫或已有异常时保持失败，不改抽另一类。后续另一发可以驱离已在先前一发麻痹的敌人，这不属于同发叠加。

驱离只允许非玩家、非玩家宠物且 `Seed.Capture=true` 的普通野敌。PvP、`NoAbduct`（NPC或WinFunc事件战斗）、禁逃楼层 `NoDisplacement`、不可捕获特殊敌及没有自然元数据的敌人均免疫。没有沿用旧怯战缺少boss检查的行为；驱离白名单是保守设计，经主代理确认。禁逃标记在世界真实开战入口从 `Rules.NoEscapeFloors` 传入，不改变旧旅程伙伴或伤害击飞的规则。

## 事件与自动策略

- 五发各自为独立 `Kind=Magic / Effect=199301 / Combo=false`，保持服务端顺序，客户端逐发原地演出。
- 普通／暴击伤害结果包装为 `MagicDamage`；其他物理结果及 `Target`、`Guardian`、`ActorHP/MP`、实际承伤HP、骑宠HP、击飞等字段保留。每发只有一次扣血。
- 驱离成功在该发之后追加原生 `Flee`：`Actor=实际承伤slot`，不清空HP，不伪造死亡或击飞。下一发重新收集目标，离场者不再被选中；最后一敌驱离会正常结束战斗。HP仍为正，也不会按击杀经验或掉落分配。
- 反射击倒施法者后立即停射；每发前检查当前存活与行动能力。
- 自动评分使用五发平均伤害预算0.825，不按敌人数量放大收益。显式炮技能计划和没有更强普通攻击槽时均能实际执行；普通攻击存在且只按伤害评分时仍可优先普攻。
- 虽UI单体目标，五发随机范围可能触及全敌侧；自动与显式计划均按整个敌侧检查捕获保护，不能因首个目标安全而误用随机炮。

## 可复现证据

| 记录 | 结果 |
| --- | --- |
| [server-red.log](server-red.log) | 原实现缺少宠物注册，未知技能只打一发普通攻击，无远程效果；真实失败。 |
| [world-red.log](world-red.log) | 原策略不选新技能、明确随机炮绕过捕获范围、禁逃楼层标记未传入；真实失败。 |
| [server-targeted-tests.log](server-targeted-tests.log) | data／battle／world定向验证通过，包含真实策略、提交与回合事件。 |
| [cannon-boundary-tests.log](cannon-boundary-tests.log) | 五发结算与最初完整边界验证通过；后续Guardian／骑宠等追加范围以三包最终回归为准。 |
| [targeted-test-compile-intermediate.log](targeted-test-compile-intermediate.log) | 一次新增测试局部变量未使用的编译中间失败，已修复；不作产品红测试或最终成功证据。 |

五组各4000次首发真实正伤害观察：同级麻痹701／驱离385，上限1003／596，下限436／195，高抗436／385，负抗701／385。对应先各50%选择，再按35/20、50/30、20/10、20/20、35/20条件概率判定；没有把条件概率误写成无条件触发率。七类驱离免疫各2000次验证没有离场，并确认免疫驱离分支不增抽麻痹。

另覆盖原生75%前序宠技回归、守护者实际状态和驱离对象、骑宠逐发HP、已存在异常不被覆盖、无反击、反射致死停射、各类施法者不可行动、同回合中途离场／死亡重选、捕获守护者取消和终局。

## 最终包验证与冻结

- [三包完整回归](server-package-tests.txt)：`go test ./internal/data ./internal/battle ./internal/world -count=1 -timeout=5m`，data11.651秒、battle0.522秒、world38.356秒；独立监督 [server-package-tests-status.json](server-package-tests-status.json) 保存真实退出0。
- [定向Race](server-race.txt)：`go test -race ./internal/data ./internal/battle ./internal/world -run 'TestLisarido|TestElectromagneticCannon|TestGhostStorm|TestCounter|TestExpiredDisable' -count=1 -timeout=3m`，三包通过；[server-race-status.json](server-race-status.json) 记录退出0、总72.707秒。此项是明确限定范围的Race检查，不冒充world整个测试集的Race。
- 首次三包全量的终端会话被工具返回143终止，没有产生可采纳的完整结果；改用独立进程组监督重跑，只有上表保存的退出0作为通过证据。
- 新增及修改Go文件 `gofmt -l` 无输出，`git diff --check` 通过。莉莉丝与四宠catalog及其安装源码没有差异。
- 已向主代理明确服务端生产freeze；后续仅补报告，不再改源码，主代理可统一构建／浏览器／完整Go最终验收。本代理不生成客户端或发行包，不提交／推送，不声称进行实体设备认证。

冻结文件SHA-256：

```text
data/lisarido.json                147cd70e809929556484dcce15b10f7de2bf2837d7e5b004ee321d2357364442
battle/electromagnetic_cannon.go  81ca050e61a6f1890c9437459cb937b3d0d4fee04c80c507809b95778eb37ca7
world/automation.go              32240f43dda4e821e9fce6293af59e5eb0cfaa8e39bb09a0369888c037b5f777
world/fight.go                   c201417128bb7d264829fed740c3f3b666535a09ccabceb9bb645fa5b14bbf17
```
