# 新检索与实现取舍

本轮修改前实际联网读取，获取时间／摘要见research-sources.json。未把历史文档或当前不存在的研究成果冒充本轮新证据。

| 本轮来源 | 采用 |
| --- | --- |
| Google Chrome [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames) | 长脚本会占用一帧；将A*改为256节点扩展切片，分别测量总CPU和每片耗时。它不能保证所有设备都在固定毫秒内完成。 |
| [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/) | 主指针与主按钮是两个条件；桥接输入要求button=0，防止右键／中键／笔侧键导航。 |
| [Red Blob A*实现](https://www.redblobgames.com/pathfinding/a-star/implementation.html) | 保持边成本、启发式单位一致；沿用整数索引堆和Chebyshev，不为分帧改变最短路代价。 |
| [Moving AI网格基准](https://movingai.com/benchmarks/grids.html) | 分开验证直线、对角、绕障、不可达，保留独立BFS差分和实际资源入口核对，不把一项基准当成全部地图性能。 |
| [Microsoft Cache Aside](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside) | 由服务端独立审查重新读取。按需缓存不变的Places，明确World生命周期失效；动态NPC不进入静态缓存。 |
| [Go HTTP Server](https://pkg.go.dev/net/http#Server.Shutdown) | 由服务端重新读取，复核HTTP shutdown、WebSocket和存档worker各自的退出责任。 |

微软Research的旧D* Lite链接本轮返回Page not found（HTTP内容标题已记录），未采用。该游戏地图权威且按块加载，当前缺陷是单帧工作量与输入取消，无证据支持更换为新的复杂动态路径算法；采用可验证的分帧A*窄修复。

游戏行为以已加载gamedata有效表、服务端Walkable／MOVE／Talk／warp判定为依据，不新增攻略推测坐标。NPC“当前场景”严格等于角色所在floor；离线全集审计与每次线上请求的处理范围分别报告。
