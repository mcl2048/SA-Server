# Task5 小地图全开与点击寻路

## 配置与行为

顶层 `minimapReveal: 0` 为默认值：仅显示已探索范围。`minimapReveal: 1` 显示全图资料；两者都可点击地图窗口或右上角小地图启动自动避障。配置只接受 YAML 整数 0、1，拒绝布尔、浮点、字符串、null 及其他整数；`config.local.yaml` 可用 0 覆盖 1。配置经 `Server.MinimapReveal` → `Hello.minimapReveal` → `Field.setMinimapReveal` 下发。

点击目标后显示“正在加载地图并规划路线…”，完成后显示“自动寻路中…”、“已到达目标”；目标越界、当前无法移动、障碍或传送点分隔、服务端纠正都有明确反馈。不可达不再偷偷替换为附近可达格。普通场景点击仍保留原版 routeTo 语义。

触屏使用现有统一 Ui/pointer 输入，小地图有独立命中区域，地图窗口点击落点直接导航；地图窗口拖动门槛为逻辑坐标 6 像素，降低手指抖动误判。方向键或移动端方向控制可取消自动寻路；换层取消旧路线。

## 路线与权威校验

修改前阅读 `field.ts`、`worldmap.ts`、`mapcache.ts`、`world.go` 的 Move/MapReq 和 `mapver.go`。算法参考 [Boost Graph Library 官方 A* 文档](https://www.boost.org/doc/libs/1_85_0/libs/graph/doc/astar_search.html)：独立 `pathfinding.ts` 使用最小堆、单位步长、Chebyshev 可采纳启发式和前驱回溯；到达精确终点才返回路线，未知、阻挡、越界均不可进入。传送点只允许作为终点，不允许途中穿越；斜向必须两侧直角邻格均可通行，无穿墙角。

服务端仍逐个 Move 验证当前坐标、方向、步速、游戏状态与目标格通行，并新增斜向两侧校验；失败下发 PosCorrect，客户端停止并提示。客户端普通移动及旧 BFS 的逐步校验同步墙角规则。MapData 只将真正可走的传送点标记为可进入，避免地图标记与权威碰撞不一致。

`mapVerAlgo` 升为 `walk-v2-no-corner-cut`，版本杂凑含地图尺寸；IndexedDB 记录校验数组类型、尺寸与长度，旧或损坏的缓存不能污染路径网格。

## 传输与探索

地图全开或发起点击导航时，以 32×32 网格分块补全当前层，一次只发一个后台块；场景及窗口请求共享 pending，上限两条。服务端继续限制每条 MapReq 边长 64。无整图单包、无整图突发请求，缓存完整后停止遍历与重复获取。导航优先使用当前已知网格中能到达精确目标的合法路线并立即行走；只有当前已知部分找不到路线且全图未完成时才继续请求分块。远端大图在确实缺少路线资料时等待更长，状态文字持续可见；分块请求有10秒过期回收，避免丢包永久卡住。

下载全图仅补地图资料；探索标记只在主角附近 VIEW 范围内更新。关闭全图或重新登录默认探索模式不会因为后台预取而泄露成永久全图。

## 验证

- `node client/test/pathfinding.test.ts`：绕墙、斜角封锁、不可达精确失败、未知格、传送点、越界、起终点相同、399步远路，以及小迷宫所有起终点与独立 BFS 最短距离比对。
- `node client/test/minimap-navigation.test.ts`：96×96 分块获取、请求并发上限、自动移动精确到达、远程预取不修改探索、越界反馈、PosCorrect 停止；追加1000×1000大图仅局部已知时10步绕障立即行走并精确到达、远端仍未知，以及过期pending重试。
- 真实Chromium首次点击发现等待整图阻塞的产品问题；依据实际坐标371,183→379,186建立上述回归后修复。最终浏览器证据另见验收报告。
- `node client/test/route.test.ts`：原版普通点击路线回归。
- `go test ./cmd/saserver ./internal/world -run 'TestMinimap|TestEnterSeeMoveChat' -count=1`：严格配置、覆盖行为、服务器目标阻挡和两侧墙角拒绝、地图尺寸版本变化及现有进入移动流程。
- 完整客户端 TypeScript `tsc --noEmit` 检查通过。

以上自动检查通过；未执行真实浏览器触屏实机验收。没有提交代码，没有修改 README 版本。
