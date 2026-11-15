# SA-1115-01 服务端进度

2026-11-15：源码基线 v0.2.18-LYNX。服务端权威自动策略位于 automation.go；恢复先精灵后背包且 MP 只为治疗精灵预留，导致肉无法优先、无精灵时低气力不恢复。

修改前已读取 Google Go 团队现行最佳实践（https://go.dev/doc/security/best-practices）：保持权威状态归属、真实行为测试、race 与 vet 检验，不为本次窄功能引入依赖升级。

合击原作证据：公开历史 gmsv 源码 https://github.com/librae8226/gmsv/blob/master/battle/battle.c 的 ComboCheck 与 https://github.com/librae8226/gmsv/blob/master/battle/battle_event.c 的 BATTLE_Combo。排序后相邻、同阵营、同目标、近战普通攻击、可行动；组首玩家/宠物50%、怪物20%概率。伤害是每成员原伤害100%累加，不另加未经证实倍率；忽略闪避且不反击。最初官方网页与巴哈玩家站返回挑战，之后已实际读取两篇原版 PTT 玩家讨论，链接与限制见 RESEARCH.md。

接口约定：settings v2 增 autoEscape、autoDrop、dropKeywords，默认关闭；BattleEvent增 coattack 整数组id，不复用 combo 连击字段。

已完成：恢复策略红绿、逃跑三失败与新场景重置、关键词丢弃红绿（含设置编辑租约）、合击普通/技能/远程/异目标/异常/死亡/忠诚/光镜守/骑乘边界回归。全套 go test ./... 已通过（main 61.885s，world 51.081s）；专项 race 已通过（battle 1.213s，world 32.275s）；最终额外释放战后 escapeRoom 引用后，自动策略/丢弃/逃跑/离线结算专项重新通过（world 3.269s），最终 vet 与 diff --check 通过。HTTP/构建/停服窄审未发现新增 P0/P1。主 Agent 负责最终二进制、真实 Chromium、版本与交付。

生产代码最终冻结摘要见 source-freeze.sha256（4 文件）；仅主 Agent 后续版本/发行工作继续。本子任务不再改动生产代码。
