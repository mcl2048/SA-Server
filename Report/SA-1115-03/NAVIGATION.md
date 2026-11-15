# SA-1115-03 小地图与自动寻路验收

基线：`9a56234`。本次仅修改导航、地点目录和对应协议；挂机、公共输入及发行集成由主线负责。未修改生产资源、角色数据库或条件传送规则。

## 实施结果

- 小地图默认左栏为“本区地点”，每页九项，可访问当前地图全部目录；“区域”页保留历史楼层。显示原生地图名称、入口坐标及“条件入口”，移动原生热区保留完整名称。
- 目录从实际加载的 `Game.Warps`、LS2MAP 名称和通行数据派生，覆盖 mapwarp 与 NPC 覆盖后的有效入口。只合并相邻且目的楼层相同的入口，保留每个入口格供客户端选择可达边缘；排除墙格、不存在或越界的目的地及同图传送。
- 当前仓库资源覆盖 **1206 张地图、3309 个地点、5002 个“源坐标—目的楼层”组合**。5002 不是唯一物理入口数：一个条件入口可对应多个目的地。世界地图 100 有 21 项，703 有 12 项。
- 点击地点调用真实 Field 寻路与 Move，八向多目标 A* 选择可达的最短入口；未知地图阻挡、斜角校验和非目标传送格阻挡均保留。清晰直线／对角路线逐格验证，并仅在代价已证明最优时提前返回；整数索引数组及支持 decrease-key 的堆避免重复旧节点。
- 导航按目的区块、起终点走廊、扩大绕路的顺序加载地图；保持最多两个未完成地图请求及 10 秒丢包重试。找到有效路线后停止导航引起的全图下载；显式全图显示仍可继续。NPC／地点请求也有 10 秒重试，换图清理旧导航，手动方向取消导航，快速战斗暂停／恢复逻辑保留。

## 实际发现并修正的边界

**零坐标协议。** Go 的 `omitempty` 会省略入口的零坐标；协议生成器不会对可选嵌套数组递归补默认值。最初将 `NpcList.places` 设为可选会把真实 `{y:43}` 解码为缺失 x，导致洞窟出口不能寻路。现将新增数组定义为必需数组，兼容旧响应时补 `[]`，递归恢复入口 `x:0`／`y:0` 及 `conditional:false`。真实 Connection／Socket 回归覆盖从省略零值的 wire 到实际 Move，最终浏览器另验证 11001 洞窟 `(0,43)/(0,44)` 返回世界地图。

**FREEMORE 条件分支。** 此类 warp 的默认目的地可能就是源地图，真实目的地藏在 FREE／TO 分支中。只看默认目的地会遗漏任务入口。目录现复用原有 TO 解析语义，列出所有有效分支并按目的楼层分组；运行时资格检查、随机选择和 CHECKPARTY 顺序保持原有行为。例如 703 `(334,182)` 保留 7453／7454 两个条件分支。点击目录只走到该入口，实际通行资格及最终分支仍由服务器决定。

## 验证证据

- [完整客户端与构建测试](final-client-tests.txt)：Node **26.13.1**，`node --test client/test/*.test.* scripts/build-client.test.mjs`，**252/252** 通过，失败 0。覆盖原有最短路 oracle、300 个确定性混合墙／未知／warp／多目标网格、丢包重试、入口选择、旧图导航拒绝、分页、完整 label 及真实省略零值的协议链路。
- [全量 TypeScript 验证](final-typescript-all.txt)：`tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --lib ES2022,DOM,DOM.Iterable client/src/*.ts`，exit 0；命令及结果汇总于 [final-client-validation.json](final-client-validation.json)。
- [服务端目录及解析器测试](map-places-conditional-green.txt)：`GOTOOLCHAIN=go1.27.3 go test ./internal/world ./internal/data -run 'Test(NpcListIncludesAllPlayableWarpEntrances|MapPlaces|FreeWarp)' -count=1 -v`，exit 0。包含全资源响应一致性、分组稳定性、条件分支、无效目的地、重复分支、实际 TO 解析边界。
- 零坐标与条件分支的初始失败证据分别保存在 [map-places-wire-red.txt](map-places-wire-red.txt)、[map-places-conditional-red.txt](map-places-conditional-red.txt)；修复后的对应证据为 [map-places-wire-green.txt](map-places-wire-green.txt)、[map-places-conditional-green.txt](map-places-conditional-green.txt)。
- [最终 Chromium 结果](browser/final-navigation.json) 与 [运行输出](browser/final-navigation-run.txt)：实际 `v0.2.21-LYNX` ELF SHA256 为 `6bbafe1e8812f04252630ceb12f6a1c182bec841e567b70557929a677ee4e731`，客户端版本 `5e4867fa738c689d`，Chromium `156.0.8078.4`。**14/14** 通过，桌面 1280×900 与移动 390×844 各七项：21 项地点原生分页；村庄、洞窟及零坐标出口真实行走跨图（每次至少六个 Move，位置纠正均为 0）；条件入口双分支标签；原生鼠标／触屏拖动只平移地图；坐标越界拒绝及输入关闭清理。移动另旋转至 844×390，未重复输入节点。
- 最终浏览器无脚本／控制台错误。独立测试实例 SIGTERM 后 exit 0、无超时，最后位置与只读数据库保存的 `floor=100,x=633,y=491` 一致。没有触碰生产实例。

## 寻路性能

使用 [可复现脚本](pathfinding-benchmark.mjs) 从 `git show 9a56234:client/src/pathfinding.ts` 读取基线，在同一 Node 26.13.1、相同 600×600 网格上预热 4 次、采样 12 次，交替执行基线／当前版本；[原始结果](pathfinding-performance-final.json)如下。结果只代表本机微基准，不能换算为整服 CPU 收益。

| 场景 | 基线中位 ms | 当前中位 ms | 基线／当前平均 ms | 基线／当前 P95 ms |
|---|---:|---:|---:|---:|
| 开放直线 | 60.463 | 0.236 | 84.820 / 0.744 | 211.504 / 3.788 |
| 开放对角 | 0.934 | 0.241 | 0.925 / 0.502 | 1.423 / 2.921 |
| 不可达 | 320.534 | 321.747 | 337.539 / 307.668 | 492.308 / 368.579 |

直线与对角中位时间改善；不可达中位相差约 0.4%，在本次负载噪声下基本持平。对角 P95 也未改善，不能宣称所有场景或所有分位均加速。曾出现不可达性能退化的中间候选及测量均保留在 `pathfinding-performance-intermediate*.json`，最终版本已消除该明显退化。

## 研究与范围

修改前于 2026-11-15 新抓取 [Red Blob Games A* 实现](https://www.redblobgames.com/pathfinding/a-star/implementation.html)（214153 字节）与 [Microsoft Azure Cache Aside](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)（60436 字节），用于启发式单位、优先队列去重、按需加载及显式失效设计。新的 StoneAge 攻略搜索分别返回重定向或无关结果，未作为坐标证据；坐标以本次实际加载的原生资源为准。

目录覆盖本仓库有效跨图步入 warp；要求对话、脚本交互而未进入有效 warp 表的 NPC 不能声称均可自动通过。离线客户端未收到的区域保持未知阻挡；不可达任务仍可能需要加载完整楼层。真实 Chromium 使用 SwiftShader，移动模式覆盖触屏模拟与横竖屏，不代表实体 Android、iOS 或 Safari 认证。条件入口不授予任务资格，也不保证进入用户选中名称的分支。
