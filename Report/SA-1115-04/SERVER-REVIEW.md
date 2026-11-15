# SA-1115-04 · 服务端地图目录、当前场景 NPC 与发行边界审查

日期：2026-11-15。审查基线：`08e2544`（v0.2.21-LYNX）。本文件记录独立服务端分工；最终客户端、Linux 二进制、浏览器、ZIP 与推送由主 Agent 集成验证。

## 本次变更与证据

1. **静态地点目录重复构建。** 每次 `NpcListReq` 原先都在单线程世界循环重新分组、解析条件分支并排序。复用启动后不再改变的 `Game.Floors / Tiles / Warps`，增加按需、按 World 生命周期的静态地点缓存。只缓存 `Places`，不缓存 NPC 实体投影，不引入跨线路共享写入或锁。空目录也缓存；资源更新须新进程／World，与现有资源加载契约一致。
2. **当前场景 NPC。** 按用户追加约束，只有请求楼层等于角色实时楼层时才遍历 NPC；远程楼层仍返回静态 Places，NPC 数组为空，既有协议结构不变。这是明确收窄历史地图 NPC 标记的产品范围，不将其描述为原有越权漏洞。真实远程楼层 1000 原返回 40 个 NPC，新增断言先失败，收窄后通过。当前楼层使用世界实时实体，排除玩家、宠物、空名、时间隐藏和越界坐标，巴士／飞机仍使用实时位置。并列姓名增加 Y／X 次序，避免周期刷新时 Go map 顺序使列表抖动。
3. **真实资源存在不可导航 NPC 坐标。** 31902 层“采石场的青年” `(9,67)`、7200 层“小孩” `(126,118)` 在楼层之外。目录过滤这些坐标，不修改原资源或角色。新测试同时验证可见 NPC 保留，隐藏／空名／玩家／宠物／越界条目排除。两个缺陷及其红绿输出分别保留。

| 证据 | 含义 |
| --- | --- |
| [server-map-red.txt](server-map-red.txt) | 真实重复目录请求原有 143 次分配，超过 20 次预算。 |
| [server-npc-red.txt](server-npc-red.txt) | 越界 NPC 被列出；同名坐标顺序随机，两条预期失败。 |
| [server-npc-current-scene-red.txt](server-npc-current-scene-red.txt) | 请求非当前楼层仍枚举 40 NPC 的预期失败。 |
| [server-map-green.txt](server-map-green.txt) | 地点全集、当前／远程场景、动态 NPC、坐标过滤、稳定顺序通过；当前楼层重复请求降为 12 次分配。 |
| [server-map-baseline-benchmark.txt](server-map-baseline-benchmark.txt) | 修改前静态目录计算基准。 |
| [server-map-final-benchmark.txt](server-map-final-benchmark.txt) | 原计算与热缓存对照；热查找 0B／0 次分配。这里只测静态 lookup，不代表完整消息或整服开销。 |

## 实际资源覆盖与单场景成本

全量审计加载后的实际表而不是照抄攻略坐标，测试不修改共享 Game 数据：

- 1382 个加载楼层、5832 个有效 warp 源坐标。135 个源格不可走。其余候选目标中 735 条为同层引用（包括条件 fallback），2 条目标越界；这些不作为可用跨层地点发布。已加载有效 warp 表的目标楼层不存在数为 0，不代表原始加载前没有丢弃的坏资源。
- 地点目录覆盖 1206 层、3309 组合并地点、4981 个唯一物理入口、5002 个“源坐标—目的层”对应关系。条件源格可对应多个目的地，不能把 5002 称为独立入口数。地图 100 有 21 项，200 有 29 项，300 有 31 项，400 有 6 项，703 有 12 项。
- 静态目录结构体 JSON 最大 9725 字节（完整协议含 t 字段为 9739 字节）（3021 层，100 个地点）。实际世界当前快照有 3062 个 NPC 实体，3028 个有名，3016 个当前可见有名（含需过滤的 2 个越界资源），43 个为移动运输 NPC；这些全集数字仅是离线验收统计，产品请求不聚合全世界 NPC。
- 逐层检查本次快照，单层最多 100 个可见且界内 NPC（1021 层）；NPC 与 Places 合并结构体 JSON 最大 14016 字节（完整协议 14030 字节）（3021 层）。时间 NPC、运输位置会变化，此数字是本次资源／世界快照测量，不是所有未来私服资源的硬上限。
- 10001 层“查罕族青年” `(16,4)` 为真实洞窟 NPC；该格及相邻 `(15,5)` 均可走且非 warp。该层响应只有 1 个 NPC，含 Places 的结构体 JSON 为 223 字节（完整协议 237 字节）。10701 层“怪力的小阵” `(23,51)` 及相邻 `(22,52)` 也可走且非 warp。浏览器可以通过原生 GM 传送到附近再走实际 NPC 列表。
- 生产代码只枚举所请求的当前层实体；远程请求在演员遍历前跳过，没有创建全世界 NPC 缓存。静态缓存只按实际请求填充，资源更新的失效边界是 World 生命周期。

全量最新数字以 [server-map-green.txt](server-map-green.txt) 中 `TestMapPlacesResourceExclusionAudit` 为准；[server-resource-audit.txt](server-resource-audit.txt) 保存较早同批资源快照与洞窟候选。源码已有实际资源全集覆盖测试，包含 NPC 覆盖 mapwarp 后的最终表以及 FREEMORE 多分支。目录仅保证存在有效步入入口，不能把仅由对话／脚本传送的 NPC 宣称为可自动穿越的入口；资格和随机分支仍由服务端决定。

## 新检索的官方资料与应用

改代码前在本轮重新联网读取，未以旧报告代替检索：

| 来源 | 核对／采用 |
| --- | --- |
| [Microsoft Azure Cache Aside](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside) | 反复计算的静态资源投影按需缓存；明确数据更新与缓存失效边界。动态 NPC 不放入静态缓存。 |
| [Go net/http Server](https://pkg.go.dev/net/http#Server) 与 [Shutdown](https://pkg.go.dev/net/http#Server.Shutdown) | ReadHeaderTimeout 只限制请求头，IdleTimeout 用于 keep-alive；Shutdown 先关 listener，不负责被劫持 WebSocket，调用者仍需等待其返回。 |
| [coder/websocket Conn](https://pkg.go.dev/github.com/coder/websocket#Conn) | SetReadLimit 限制入站消息；Close 有关闭握手，CloseNow 立即关闭。不能以 HTTP shutdown 代替 WebSocket 生命周期管理。 |

## HTTP、构建与停服审查范围

只读复核 `main.go / gzip.go / webclient`、`session.go`、World.Run/Do 的 stopping 与 saver join、共享 Families 退出，以及 `build-linux.sh / stage-client.mjs / package-linux.py / release.yml`。

HTTP 具有 10 秒请求头超时、2 分钟 keep-alive 空闲限制；WebSocket 入站最大 16KiB、40 条／秒、未登录 30 秒／登录后 90 秒读超时，发送队列满则断开。NpcList 只在已进入世界的角色请求中执行，单次只处理指定层。静态页面继续发布白名单和条件请求；目录探测句柄关闭。正常 SIGTERM 等待世界与共享家族保存 worker，主进程另外等待 HTTP Shutdown 完成后关闭数据库。此次范围没有确认新增 P0/P1，无凭据、数据库或运行资源加入交付。

构建仍为网页→允许列表 staging→embed→Linux AMD64 原子替换→摘要；打包采用公开文件允许列表，数据库、本地配置与 Assets 原树不进入 ZIP。最终二进制与 ZIP 一致性由主 Agent 另行验证，此处不将只读源码检查当作最终产物验收。

## 已执行验证与限制

- `GOMAXPROCS=2 go test ./cmd/saserver ./internal/server ./webclient -count=1`：PASS，分别 39.530s、8.268s、0.417s，包含真实子进程／WebSocket／SQLite 的正常 SIGTERM 与慢保存队列验收。输出：[server-http-shutdown-tests.txt](server-http-shutdown-tests.txt)。
- `GOMAXPROCS=2 go vet ./cmd/saserver ./internal/server ./internal/world ./webclient`：PASS（server-vet.txt 为空表示无诊断）。最终当前场景 guard 后的 world vet 与 race 结果追加如下。
- `GOMAXPROCS=2 go test ./internal/world -run 'TestNpcList|TestMapPlaces' -count=1 -v`：PASS，2.314s。
- `GOMAXPROCS=2 go test -race ./internal/world -run 'TestNpcList|TestMapPlaces' -count=1 -v`：PASS，12.484s；含最终当前层 guard。[server-map-race.txt](server-map-race.txt)。
- `GOMAXPROCS=2 go vet ./internal/world`：最终 guard 后 PASS，[server-world-vet.txt](server-world-vet.txt) 无诊断。
- `git diff --check`：PASS。

此服务端分工没有模拟或宣称浏览器／实体设备认证。最终桌面、触屏模拟、横竖屏截图由主 Agent 与移动审查 Agent 给出。正常停服队列排空不保证磁盘永不失败；SIGKILL、掉电、磁盘错误和跨重启离线收益不在成功声明范围。race 只覆盖实际执行路径。独立审查的早期 HTTP 测试不能替代最终集成后的全量测试。
