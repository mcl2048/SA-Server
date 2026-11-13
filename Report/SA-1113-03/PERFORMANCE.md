# SA-1113-03 · 无人观看的战斗回合展示开销

## 范围与依据

本专项只修改 `server/internal/world/fight.go`，新增 `background_battle_test.go`。不修改自动行为策略、奖励规则或调度节奏。修改前已阅读 `presence.go`、`watch.go`、`resolveTurn`、现有后台自动战斗测试及 `fakeClient`；并实际获取 [Go 官方 Diagnostics](https://go.dev/doc/diagnostics)，依据其建议明确CPU/分配测量对象，用聚焦基准与真实流程回归支持结论，不以微基准外推生产容量。

`entity.attached()`要求 `connected=true`、client非nil，并在transport实现 `Connected() bool` 时再次验证实际连接状态。测试用fakeClient没有Connected方法，但正常Enter会设置connected=true，属于真实前台测试接收者；仅client存在不代表前台，后台保留的静默endpoint也不构成展示消费者。

## 修改与行为边界

原resolveTurn每次在引擎Resolve和afterMemberTurn之后，无条件分配 `proto.BattleTurn` 及events数组并逐个转换事件，最终发到后台静默endpoint。新 `sendBattleTurn` 在构造前检查参与成员与观战者是否至少有一个attached接收者；全部后台时直接跳过展示投影。存在前台成员或观战者时仍使用原字段映射，单次构造共享消息，并送到所有attached接收者；包含PetOut的OwnerSlot/BagSlot元数据。

以下路径保持原位置与语义：`Battle.Resolve`、afterMemberTurn装备/道具/宠物副作用、room.turn递增、PvP死亡计算、Over与endBattle、奖励和经验持久化、逃离/击飞、回合timer与 `len(ev)` 节奏。不会通过丢弃引擎事件省略游戏逻辑。观战进入仍发送完整当前roster，Attach仍使用sendResumedBattleStart恢复当前战斗，而非补发后台历史回合。

没有基于推测扩展其他hotspot优化，也没有改变战斗开始、结算或状态消息；此项仅针对每回合展示转换与无人消费的发送。

## 回归证据

`TestBackgroundBattleTurnAudience` 覆盖：全后台无BattleTurn、无前台成员但新attached观战者可收、前台成员和观战者消息一致、PetOut归属字段原样、connected仍true但transport已关闭不算接收者、nil transport安全跳过。

`TestBackgroundBattleProgressRewardAndReconnect` 使用真实world和原始数据，主动Detach后执行守护回合，确认room.turn递增且timer/deadline重设；再实际startWatch，验证完整BattleStart及下一回合BattleTurn；Attach验证完整live roster；最后撤除观战并重新Detach，后台击败敌人仍获得gold与经验，Flush后读取SQLite确认奖励实际持久化。

最终聚焦race回归通过（16.721s），含新增持久化读取及PetOut协议断言，`git diff --check`通过。运行命令：

```sh
GOMAXPROCS=2 go test -race ./internal/world -run 'TestBackgroundBattle|TestWatch|TestBattle|TestAutomationDetachedWin' -count=1
GOMAXPROCS=2 go test ./internal/world -run '^$' -bench '^BenchmarkBattleTurnAudience$' -benchmem -count=3
```

基准机器为Linux AMD64 / Intel Xeon E5-2670 v2 @2.50GHz，GOMAXPROCS=2；同一进程内64个既有引擎events、单成员、附加/脱离两种消费者状态。测试接收者只计数，不累积队列或另加序列化成本。

| 状态 | 三次ns/op | B/op | allocs/op |
|---|---|---:|---:|
| Attached | 17429 / 17685 / 27613 | 18464 | 2 |
| Detached | 17.53 / 14.19 / 13.72 | 0 | 0 |

第三次前台结果体现共享主机噪声，保留原值，不选择性隐藏。以上只衡量BattleTurn展示投影，**不包含战斗模拟、持久化、WebSocket序列化或整服负载，不是容量SLO**。无人观看时仍需执行游戏规则、自动策略、定时器和保存，因此不能将本数字作为整服CPU降幅。

原始日志位于本机 `/tmp/sa111303-background-bench.log`、`/tmp/sa111303-background-final.log`；最终完整集成与发行由主Agent统一运行。本专项不build、不更版本/README、不提交。
