# 新检索与实际取舍

本轮修改前重新检索并读取文档；HTTP时间与内容摘要见 research-sources.json。没有把旧报告当成本次网络检索，也不把搜索挑战页面当作游戏规则。

| 来源 | 读到的事实 | 本轮采用 |
| --- | --- | --- |
| [Google Go GC Guide](https://go.dev/doc/gc-guide) | 堆分配速率影响GC工作；先测分配与逃逸，再调运行时参数 | 提前跳过无消费者的纯展示；固定20战斗位的临时候选放栈上，保留每回合实时目标与原生结算 |
| [Go容器CPU说明](https://go.dev/blog/container-aware-gomaxprocs) | CPU配额与GOMAXPROCS会影响调度和尾延迟 | 维持现有共享世界调度、不为每个挂机角色加goroutine；基准固定GOMAXPROCS=2并报告环境，避免声称单机数字就是生产吞吐 |
| [Google Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) | hidden、frozen、discarded具有不同生命周期；冻结不能依赖页面定时器 | 保留服务端权威挂机、前景暂停租约和断线接管；真实Chromium验收冻结/关闭后的继续执行 |
| [Red Blob A*](https://www.redblobgames.com/pathfinding/a-star/implementation.html) | 边代价和启发式单位须一致，堆/整数网格和等价代价tie-break影响效率 | 8向每步1、Chebyshev、整数格索引，多入口作为同一组目标；保留禁穿墙角和非目标传送点规则，BFS作最短路对照 |
| [Microsoft Cache Aside](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside) | 缓存缺失/失效仍要以真实源加载 | 地点目录由已生效游戏warp资源派生；地图未知格先加载，不猜成可走 |

## 石器挂机策略的新搜索

Google、DuckDuckGo返回跳转或机器人挑战，百度握手超时，Bing本次返回无关语言结果；17173连接失败、资料Wiki403。均未用作规则证据。进一步通过[GitHub仓库搜索 stoneage assistant](https://api.github.com/search/repositories?q=stoneage%20assistant&per_page=5)，找到公开的 [SaSH](https://github.com/bestkakkoii/SaSH)，新读取其README与 mainthread.cpp。

该助手把复杂行为交给工作线程而非UI；mainthread.cpp约1480–1520行可见战后等待再走动，1640–1880行有野外HP/MP补给、肉优先、自身/宠物/队友阈值。只作为玩法与调度策略的对照；未复制、分发、编译或运行其代码。项目自己的Go实现复用 useRecoveryField 的原生效果与存档，只在明确开启自动遇敌且开启自动/快速战斗时整备，1秒最多一件补给，先自身HP、参与宠物HP、再自身MP；普通休息宠和仓库不额外消费补给。

原作的捕获、禁逃地图、技能范围、合击及伤害规则继续依据本仓库已有可信数据和原生实现，不从助手配置、玩家经验杜撰伤害倍率。逃跑补充的三失败上限是本产品自动策略契约，实际失败事件计数；物品交易/编辑隔离是本产品一致性要求。

## 验证的边界

性能基准隔离展示构建和决策分配，不能冒充整个服务器资源降低比例。挂机仍真实计算战斗、结算、掉落和培养经验；资源不足的20%安全停止、换图/手动移动停止、重启不恢复挂机意图均是明确边界。浏览器的移动视口/触屏模拟不代表实体手机或Safari认证。
