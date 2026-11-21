# SA-1121-01 · 小地图导航修复与资源验证

> 2026-11-21 · Go / TypeScript · 资源图、客户端状态机与独立复审

## 根因与修复

泪之海海底 `817` 的多片可走区域由原生同图 warp 相连；旧规划器将非最终目标的 warp 一律阻挡，地点目录又过滤了同图传送，因此地图全部加载后依然没有导航边。独立基线 Chromium 已复现 `(146,19) → 宝箱(148,35)`：点击正确设置目标，完整加载 240,000 格后报告不可达，未发送 Move。该案例不是地图点击穿透问题。

尼克斯城区 `702` 的边缘入口与城市主体也不在一个步行区域。真实原生路线需要 `702 → 703 → 702` 后再继续；只补同图 warp 仍无法导航到看板或城市出口。

最终实现从加载后的有效 `Game.Warps` 派生两类静态导航边：源和落点都可走的无条件同图传送；经一个相邻 floor 返回原 floor 的确定性两跳通道。第二类中间步行必须普通连通，且不能穿过其他 warp。落点等于下一入口时不会原地重触发，故排除零步中间段。条件、随机、对话传送继续由服务端判定，导航不代替资格检查。

普通路线先执行原有 A*。只有步行不可达且存在有效传送边时，再用零启发式 Dijkstra 规划传送可达性，避免跨传送后失效的几何启发式。结果携带具体选择的边，支持同一源入口的多个返回通道。它用于安全可达规划，不承诺跨图全局最短路线。

客户端只走到当前入口；收到来源 floor、目标 floor 与落点坐标全部精确匹配的 `EnterFloor` 后，才继续下一步或恢复原 NPC／出口目标。每个实际原生 hop 都检查已访问源点和 64 次上限。手动输入、新目标、普通战斗、错层／错坐标确认、`PosCorrect`、锁定与跟随均撤销旧意图；快速战斗暂停 Move，结束后重新规划，首段被打断时保留原目的而非入口坐标。

目录只在角色当前楼层投影 transfers。历史地图浏览保留静态 Places，不触发连通性 BFS。服务端先筛出有效返回候选再计算网格；完整连通网格与队列只临时存活，长期仅缓存原生端点的区域编号。客户端释放 `Field` 时同步释放 transfer 缓存。

## 可复现验证

| 检查 | 证据与结论 |
| --- | --- |
| 同图传送原始失败 | [客户端 red](navigation-transfer-red.txt)、[服务端 red](navigation-server-red.txt)，基线 `5ffb526` |
| 两跳返回原始失败 | [客户端 red](navigation-via-red.txt)、[服务端 red](navigation-via-server-red.txt) |
| 历史地图不触发连通扫描 | [red](navigation-historical-red.txt)；最终 Go targeted 通过 |
| 最终针对性客户端 | [35 项通过](navigation-final-targeted-client.txt)，含真实 Go wire → Connection → 两跳续行 |
| 最终针对性服务端 | [proto 与 world 通过](navigation-final-targeted-go.txt)，含真实 `817` / `702` 目录与历史请求保护 |
| 独立图差分 | [10,000 例 BFS 对照](experience/navigation-independent-graph.txt)，包含 8,426 组同源多边与 4,141 个 warp 落点 |
| 独立事件时序 | [9 种顺序通过](experience/navigation-independent-lifecycle.txt)，涵盖中间层取消、战斗、最终错误确认、迟到 NPC 列表 |
| 全资源合法性 | [1,382 楼层审计](navigation-resource-audit.txt)，706 条同图边 + 915 条安全返回通道；该初次审计的缓存量测早于返回预筛优化，最终缓存数字见下表 |

递归零值验证使用 [Go Encode 生成契约测试](../../server/internal/proto/maptransfers_test.go) 与 [共同 wire 夹具](../../client/test/testdata/maptransfer-wire.json)。夹具确实省略 `y=0`、`toX=0`、`toY=0`；真实 `Connection` 解码补齐后，`Field` 完成 `817 → 900 → 817` 并到达 NPC。没有用显式写零的理想对象替代 wire 验证。

## 实际地图模型

[资源案例脚本](navigation-resource-cases.mjs) 使用私有导出的有效原生通行格、warp、地点和 NPC 坐标驱动真实 `Field`，冷加载地图并检查每个 Move、对角支撑、传送确认和地图请求并发。完整资源网格仅留在临时目录，不随报告提交。

[114 个案例结果](navigation-resource-cases.json) 覆盖 `700–708` 与 `817`：38 个 NPC 全部到达；63 个无条件出口走到入口并记录原生传送；5 个条件目录条目到达源入口，不模拟或声称通过服务端资格；4 个起点本就在目标入口，记为零步到达；另 4 个隔离出口明确显示不可达，按下节的全域图核查归因。`818` 没有本次可用的 NPC／入口案例，没有把它计入成功样本。所有 Move 均通过格子与拐角检查，最大在途地图请求不超过 2。

| 代表案例 | 模型观察 |
| --- | --- |
| `701 (305,14) → 看板(243,22)` | 普通步行保留，无需传送捷径 |
| `702 (388,10) → 看板(188,41)` | 610 Move；`702(391,12) → 703(9,14)`，`703(8,48) → 702(388,49)` 后到达 |
| `702 (388,10) → 尼克斯庄园` | 670 Move；先完成相同两跳返回，再由 `702(128,53) → 7030(76,15)` |
| `817 (146,19) → 宝箱(148,35)` | 11 Move；`817(144,25) → 817(143,34)` 后到达 |
| `817 (146,19) → 史东尔换气道` | 359 Move；6 次同图传送，最后 `817(386,199) → 8000(17,31)` |

这些是客户端与资源格子运输模型，不能替代真实服务端、浏览器或实体设备认证。实际 Chromium 的原生 UI 点击、Move／EnterFloor、PosCorrect 与最终二进制一致性由主报告单独记录。

## 全域可达性核查

703 的 `(390,261..265) → 704` 入口组，以及从 `704(13,81)` 出发的 `(11,113)`、`(11,115)`、`(9,261..265) → 703` 三组入口，是模型中的 4 个不可达目标。不能仅凭当前两跳限制就认定它们需要更长路线。

[独立逐格全局 BFS](navigation-global-oracle.json) 在已导出的 11 个实际 floor 中允许任意原生传送，仍全部不可达。[全 1,382 floor 无条件端点图](navigation-global-graph-cases.json) 检查 5,653 条有效安全 warp，起点与目标均断言为非空端点区域；主图可访问 234 个步行区域，没有这些目标。为防区域压缩漏掉“落点直接踩相邻 warp”，审计递归放行所有相邻 warp，甚至乐观忽略对角墙角，四组仍不可达。

原生服务端可能将角色落到墙格后再走出，因此安全边子集的无路结论不能冒充所有 native warp 无路。[全原生宽松审计](navigation-allnative-graph-cases.json)进一步纳入所有有效坐标落点、墙落点八方向邻接区域、起点及每次落点可直接进入的相邻 warp、原生解析的 FREE／TO 各分支；墙落点及相邻 warp 的对角支撑也乐观放行。5,766 条展开边包含 89 条条件分支，起点可访问 259 个区域，12 个目标入口坐标全部仍不可达。仅保留无条件边、但包含墙格落点时，[5,677 边审计](navigation-native-unconditional-graph-cases.json)结论相同。

因此四组属于本次加载资源的“任意有效原生 warp 图也无路”，不是当前两跳 planner 漏掉已有无条件路线；当前明确提示不可达符合资源。审计没有模拟对话、交通 NPC、脚本或任务强制传送，不能声称它们在所有任务状态下都不可访问。条件分支和墙格落点仅用于无路证明的宽松上界，不作为产品自动捷径。

只读复现使用 [导出脚本](navigation-export-graph.py) 与 Go overlay，避免改动生产包或正在执行的完整检查：

```sh
python3 Report/SA-1121-01/navigation-export-graph.py --output /tmp/navigation-graph.json
node Report/SA-1121-01/navigation-global-graph-cases.mjs /tmp/navigation-graph.json
python3 Report/SA-1121-01/navigation-export-graph.py --all-native --output /tmp/navigation-allnative.json
node Report/SA-1121-01/navigation-global-graph-cases.mjs /tmp/navigation-allnative.json
```

## 资源成本与范围

[独立量测及完整复审](NAVIGATION-REVIEW.md) 使用每个 floor 全新 `World`，共享只读加载资源，并区分 wall、进程 CPU、累计分配、GC 后保留堆和纯 ID 载荷。[原始 JSON](experience/navigation-budget.json)。

| 指标 | 实测 |
| --- | ---: |
| 单独冷请求楼层 | 1,382 |
| 全部访问后缓存区域的楼层／端点 | 589 / 4,293 |
| 保留区域 ID／纯 ID 载荷 | 4,746 / 18,984 B |
| 保留 transfer | 1,621 |
| 全域构建一次 wall／CPU | 2,156.384 / 843.914 ms |
| 累计临时分配／GC 后堆增量 | 111,945,296 / 1,200,264 B |
| 702 独立冷请求 wall／CPU | 94.554 / 62.781 ms |
| 817 独立冷请求 wall／CPU | 211.487 / 132.869 ms |
| 702／817 warm 函数查表 | 约 10.7 ns，各 1,000 次均值 |

并发验证中 wall 时间会抖动；[另一轮记录](experience/navigation-budget-concurrent-wall.json) 保留了 `817` 冷请求 772.617 ms。首次计算仍在世界循环，可能短暂停顿；warm 仅查表的数字不含 JSON、网络与渲染，不能当作整次目录请求耗时。长期缓存已包含 Go map 等开销的实测堆增量与纯 ID 字节不同；累计临时分配也不等于保留内存。

自动路线支持确定性同图传送及一个邻图的返回通道；条件／随机／对话、交通 NPC 和任意全世界多层寻路继续服从原生规则。NPC 是服务端点击时快照，不承诺追踪移动运输人物。没有引入后台全世界扫描或客户端未知格放行。

## 研究依据与可复用经验

修改前参考 Google [Optimize long tasks](https://web.dev/articles/optimize-long-tasks)（页面更新 2024-12-19）与 MDN [Prioritized Task Scheduling API](https://developer.mozilla.org/en-US/docs/Web/API/Prioritized_Task_Scheduling_API)，保留可中断分片、原生输入取消和实际主线程成本量测。算法以 [Red Blob Games 的 A* 实现说明](https://www.redblobgames.com/pathfinding/a-star/implementation.html)核对启发式单位、前驱重建与传送后的可采纳性；没有为本次窄修复增加必须依赖的浏览器调度 API。

可复用规则已交主 Agent 整理至 stoneage skill：先确认真实资源连通性；同图 warp 不因地点目录排除而丢导航边；相邻返回路线精确逐跳确认；同源多边保留选择对象；零步中段和原地入口分开处理；可选嵌套协议用真实 Go omitempty wire；缓存只保留端点；历史目录不触发大图扫描；静态无路证明需包含相邻 warp／墙格落点等原生边界，并明确条件与对话资格。
