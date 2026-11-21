# SA-1121-01 · 导航独立复审

> 2026-11-21 · 独立经验/服务端审查 Agent · 不修改导航生产实现

## 复审范围

逐段读取 `maptransfers.go`、`mapplaces.go`、`World.NpcList/Move`、生成协议、`pathfinding.ts` 及 `Field` 的跨层状态机，检查条件传送、对角边界、落点触发、跨层确认、取消/战斗、同源多返回边、循环保护与缓存生命周期。主线的实际 Chromium、最终二进制和完整 normal/race/vet 检查另行记录。

客户端只执行所选传送的第一段步行；每次踩入口后，必须收到旧楼层、目标楼层和落点精确匹配的 `EnterFloor`，才允许执行下一段。两跳返回路线只使用真实有效且无条件的 `F → G → F` 原生传送，中间段不能经过其他传送点；落点自身是传送点时，落地不递归触发，离开后重新踩入才触发，与 `World.move` 一致。

## 可复现的独立检查

在仓库根目录，用支持直接执行 TypeScript 的 Node 26 运行：

```sh
node Report/SA-1121-01/experience/navigation-independent-graph.ts
node Report/SA-1121-01/experience/navigation-independent-lifecycle.ts
```

- [图搜索脚本](experience/navigation-independent-graph.ts) 使用独立 BFS 判断可达性，并逐步检查实际返回的第一段路径、对角支撑、禁止中途踩传送、所选 transfer 对象和步行终点。固定种子 `0x112101` 的 10,000 个样本全部通过；包含 8,426 组同源多边配对，以及 4,141 个落点仍为传送点的边。[结果](experience/navigation-independent-graph.txt)。这些是确定性随机样本，不是所有地图/输入的穷举。
- [Field 事件脚本](experience/navigation-independent-lifecycle.ts) 驱动真实客户端 `Field` 与虚拟连接，9 种顺序全部通过：中段手动取消、普通战斗、`PosCorrect` 停止；中段快速战斗后续行；第二次确认错楼层/错坐标取消；确认时摆摊/跟队取消；旧楼层的迟到 `NpcList` 不恢复远处实时 NPC。[结果](experience/navigation-independent-lifecycle.txt)。这里没有真实网络和浏览器，不代替 Chromium 或实体设备认证。

## 审查发现及跟进

发现历史/任意楼层 `NpcList` 在判断当前楼层前就计算 transfers，会让只查静态地点的请求触发冷连通性扫描。最终实现保留历史 `Places`，只在角色当前楼层投影 transfers；`TestHistoricalNpcListDoesNotBuildNavigation` 检查历史查询不会建立 transfer、endpoint 或 region 缓存。

发现候选跨层传送还没有有效返回出口时，先扫描了源图和邻图。最终实现先筛选安全、非零中间步的返回出口，再做连通性计算；没有返回候选的邻图不建立 region 缓存。

递归协议零默认的测试使用实际 Go JSON wire fixture，省略的入口/落点零坐标通过生成的 `fillDefaults` schema 恢复。取消手动目标会清除已选路线，精确确认之后才递增 `at`；第二跳执行时保留既定中间目标，不在邻图自行扩展额外跨层路线。

零步中间段已经排除：落点等于下一入口时不会自动重新触发；若将其作为完整两跳返回路径，会缺少第二次确认。客户端保留具体所选的 transfer，避免同源多条返回路线取错后续步骤。

## 缓存与限制

完整 `[]int32` 连通网格及洪泛队列只在计算时存活；世界实例只保留原生传送源/落点的区域编号。缓存由世界循环读写，`Game` 的地图、通行规则和有效 warp 在加载后不再修改，资源重载以新进程/新 `World` 获得新缓存。客户端 transfers 留在本次 `Field` 中且会被当前楼层的新目录替换；旧楼层响应不写回实时 NPC/transfer 目录。每个角色重新创建 `Field`，不跨连接共享。

范围限制是刻意保留的：自动路线不把有任务/道具条件的 warp 当作捷径，不进行任意多楼层的全局寻路；动态 NPC 仍是点击时的服务端坐标快照。循环保护按 `floor,x,y` 记录已进入的源点，并在每次原生 hop（包括返回路线第二跳）发送前限制 64 次；在静态图中，最短可达路线不需要重复同一源点。缓存查表耗时不包含 JSON 序列化、网络和客户端渲染。

真实地图模型的 4 个失败搜索分别消耗约 930–1,054 个规划帧。当前每次 `Field.update` 推进一步 generator、每 256 次扩展 yield；假设浏览器每帧只调用一次 update 且稳定 60Hz，对应约 15.5–17.6 秒的理论等待。模型中 1–3 秒的 Node 运行时间不能当成浏览器等待时间。期间搜索可在后续帧取消，本轮保留该分帧策略；实际 Chromium 的取消/到达证据由主线记录，不能把该算法描述为硬实时。

## 已核对的真实服务端移动证据

只读核对主线保留的 [候选Chromium结果](browser/candidate-close-race-progress.json)：817 宝箱路线实际发出 11 次 Move 并经原生同图 warp 到达；817 长出口路线发出 352 次 Move、经 6 次原生传送到 8000；702 看板路线发出 610 次 Move，并按真实 `702 → 703 → 702` 返回后到达 `(188,41)`；701 普通看板路线发出 66 次 Move 到达。四项均记录 0 次 `PosCorrect`。该轮在清理AI设置时因脚本读到过期关闭热区中断，不能视为完整矩阵通过；它仍是上述实际移动的证据，区别于本文的虚拟连接事件脚本。最终完整桌面／移动重跑结果见[final.json](browser/final.json)，最终发布状态以主线验收报告为准。

## 首次请求与缓存实测

[Linux Go overlay 脚本](experience/navigation-budget.py) 在仓库根目录执行 `python3 Report/SA-1121-01/experience/navigation-budget.py` 即可复现；可用 `SA_GO` 指定 Go 1.27.3。脚本只在临时目录添加编译 overlay，不修改生产源码或永久测试。每个楼层分别使用全新 `World` 缓存，共享只读已加载 `Game`；这避免按楼层依次访问带来的邻图预热低估。随后另用全新 `World` 构建全域一次，记录分配和 GC 后堆变化。[完整 JSON](experience/navigation-budget.json)、[Go 日志](experience/navigation-budget.txt)。

| 指标 | 本轮实测 |
| --- | ---: |
| 分别冷请求的楼层数 | 1,382 |
| 全部访问后缓存连通区域的楼层数 | 589 |
| 缓存源/落点坐标数 | 4,293 |
| 保留区域 ID 数 / ID 纯载荷 | 4,746 / 18,984 B |
| 保留 transfer 数 | 1,621 |
| 全域构建一次 wall / 进程 CPU | 2,156.384 ms / 843.914 ms |
| 全域构建累计分配 | 111,945,296 B |
| GC 后保留堆增量 | 1,200,264 B |
| 702 独立冷请求 wall / CPU | 94.554 ms / 62.781 ms |
| 817 独立冷请求 wall / CPU | 211.487 ms / 132.869 ms |
| 本轮最慢独立冷请求 wall | 375.644 ms（20401） |
| 702 / 817 预热函数查表均值 | 约 10.7 ns（各 1,000 次） |

CPU 为 `RUSAGE_SELF` 的 user+system 差值，含本进程其它 Go 线程；堆增量是 GC 前后测量差，均不是跨平台保证。测试与主线验证并发，wall 明显受调度影响；[另一次并发轮原始 JSON](experience/navigation-budget-concurrent-wall.json) 保留 817 冷请求 772.617 ms、702 181.649 ms 的记录。不能把较快的一轮当作上界。首次连通扫描仍在世界事件循环上，可能短暂停顿；预热后的查表避免重复扫描。全域分配是累计临时分配，不能与纯 ID 载荷或 GC 后保留堆混用。当前楼层保护与返回预筛选降低无用工作，不构成硬实时承诺。

## 四组隔离出口的最终分类

真实地图模型中的 4 组失败不是两跳上限造成的：

| 当前楼层 / 起点 | 未连通的入口组 |
| --- | --- |
| 703 / `(238,96)` | `(390,261..265)` |
| 704 / `(13,81)` | `(11,113)` |
| 704 / `(13,81)` | `(11,115)` |
| 704 / `(13,81)` | `(9,261..265)` |

导航审查进一步导出全部 1,382 张地图的有效原生 warp：5,677 条无条件边，另加全部解析出的 89 条 FREE/TO 条件目的地，共 5,766 条边。审计把条件一律放宽，并包含可落到墙格的原生传送：墙落点允许通向八邻格的普通区域，逐次落点还递归允许相邻 warp，均忽略对角支撑限制，形成实际 warp 移动的宽松上界。起点及全部 12 个入口坐标的 region ID 均非空，避免端点缓存缺索引造成假不可达。

不限制原生传送跳数的搜索在无条件图访问 234 个区域、含条件上界图访问 259 个区域后，全部 12 个入口仍不可达。详见 [无条件图结果](navigation-native-unconditional-graph-cases.json)、[更宽上界结果](navigation-allnative-graph-cases.json) 和 [导出实现](navigation-allnative-graph_test.go.txt)；可通过 [overlay 导出脚本](navigation-export-graph.py) 复现。独立的第一轮 [落点状态 BFS](experience/navigation-global-reachability.py) 与 [结果](experience/navigation-global-reachability.json) 也得到相同结论，但它只覆盖可走落点的安全子图，最终分类以上述更宽图为依据。

因此保留这 4 组为**原生 warp 图的可达性限制**。本次保持真实资源和门槛，不增加虚构传送。该结论覆盖步行与有效原生 warp；对话触发、交通 NPC、动态巴士/飞行以及道具等外部动作没有纳入模型，不能据此声称这些地图在整个游戏中绝对无法到达。自动路线继续使用安全同图传送或两跳返回，并在原生无路时提示不可达；不自动执行对话、付费或条件分支。

独立复审已闭合具体发现、路径/时序验证、冷请求测量和这 4 组样本分类；未将模型、静态目录或代表浏览器路线扩展成全部地图/全部设备的通关保证。
