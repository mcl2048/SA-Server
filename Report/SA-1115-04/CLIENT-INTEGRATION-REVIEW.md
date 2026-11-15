# SA-1115-04 · 客户端集成独立复核

独立服务端审查 Agent 按主 Agent 追加要求只读复核 `field.ts / pathfinding.ts / main.ts / menus.ts`，未改生产源码。复核点：分帧 generator 生命周期、地图版本变化、NPC 墙／warp 邻接停靠、当前场景与坐标边界、刷新请求成本。浏览器与最终构建由主 Agent 独立完成。

## 发现并已反馈

**锁定／跟随取消目标时没有清理挂起的规划器。** `Field.update` 的 locked 和 follower 分支只清除 target；新 `routeSearch`、`mapNavigation` 以及“正在规划路线…”状态保留。不会因此继续发移动，但挂起的整层 A* 缓冲区留存至下一次导航或销毁；部分加载地图还可能继续补图。建议主 Agent 在这些明确取消移动的分支清理规划状态。报告时源码处于最终浏览器候选冻结阶段，由主 Agent 决定窄修复并重新验证。

在 Node 26.13.1 直接运行真实 Field、协议事件与规划器复现：96×96 地图，x=48 全列墙，起点(1,1)，目标(90,90)。先 update 一次使搜索挂起；设置 locked=true/update；解锁后再运行50次 update，得到：

```json
{"before":{"target":[90,90],"searchPending":true,"mapNavigation":true,"status":"正在规划路线…"},"after":{"target":null,"searchRetained":true,"mapNavigation":true,"status":"正在规划路线…","moveCount":0}}
```

复现脚本位于会话私有 `/tmp/sa111504-review-cancel.mjs`；不包含凭据、数据库或浏览器注入业务对象。此复现是 Field 生命周期测试，不是浏览器／设备认证。

## 其余已检查边界

- 地图／新目标、普通地面点击、方向输入、PosCorrect、换图和 dispose 均显式丢弃挂起搜索。快速战斗丢弃旧计算，保留意图，战后重置尝试签名并从当前权威位置重算。普通战斗取消导航。
- 失败搜索若期间地图 revision 改变，下一帧重新尝试；未知格保持不可走。已返回路线仍逐步验证墙体和墙角，NPC 最终点还拒绝 warp。地图数据增加边时已有成功路线可能并非新发现地图上的全局最短路，但仍为合法的已知路线；不能将按需规划等同于先下载完整地图再证明全局最短。
- NPC 只能从当前列表对象与当前楼层启动；整数、地图边界逐项验证。普通合法格精确到达；墙或 warp 使用相邻非墙、非 warp 格，未知格等服务端数据确认。列表入口不会自动 Talk，不会通过此分支直接领取条件资格。
- 当前楼层列表每5秒过期；在途请求最多一个，10秒无响应后重试，并保留上一份可用快照。换图清空 NPC 快照，旧楼层迟到响应不恢复 NPC。只在地图绘制入口调用列表查询，不创建世界 NPC 聚合。
- 新手动目标 setter 在 main 与 menus 的直接输入处替换旧导航并清理 pathGoal；不允许旧挂起搜索在手动输入后再完成并恢复先前目的地。

以上是源码与局部真实模块复核，不能代替主 Agent 的最终完整回归、浏览器和发行一致性核验。

## 主 Agent 修复与最终验证

locked/follower分支已改为统一setManualTarget(null)，同时释放生成器、路径、mapNavigation、NPC目标和规划状态。两项独立回归先出现预期失败（cancellation-red.txt），最终完整客户端／构建274项全部通过（client-tests.txt）。

进一步加入分帧地图修订测试：旧实现挂起后新增边会改变在途结果（map-revision-red.txt），现仅在可能yield的搜索阶段复制walk快照；未知／无效目标与直接最短路保留早返回。Field在失败且mapVersion变化时重试新修订，实际Move仍逐步校验。最终二进制474c883…441，真实浏览器最终证据只采用该摘要。
