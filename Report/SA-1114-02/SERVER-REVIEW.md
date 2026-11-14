# SA-1114-02 · 服务端动作与发行边界审查

审查日期：2026-11-14。基线：`b8e8195`。范围：人物/宠物与道具窗口所依赖的协议、原生动作、加点并发，以及 HTTP、客户端暂存和停服持久化。本文由独立服务端审查 Agent 编写；客户端实现、最终版本和最终 ELF/ZIP 由主 Agent 集成。

**结论：本范围未发现需要服务端生产代码修复的 P0/P1。现有协议足够提供人物头像、宠物动态图与道具图片；新移动按钮应复用原生动作和服务端回执。** 本轮没有修改服务端生产代码、没有构建或覆盖最终发行包。

## 1. 协议与显示依据

| 需求 | 权威字段 | 边界 |
|---|---|---|
| 人物头像 | `Status.face` | 直接使用原始图号；不要把人物 `sprite` 当静态头像 |
| 人物形象 | `Self.sprite`、后续 `ObjSprite` | 装备/骑乘/变身可改变形象 |
| 人物属性和点数 | `Status.hp/maxHp/mp/maxMp/vital/str/tgh/dex/points/detail` | 服务器消息刷新；不要按点击次数乐观写属性 |
| 宠物动态图 | `PetInfo.sprite` | 复用原生动画数据和资源，列表默认基本信息 |
| 宠物基础/详细资料 | `name/freeName/level/exp/nextExp/hp/maxHp/atk/def/agi/loyalty/attrs/ext` | 名字选择与详情应使用原宠物槽号 |
| 道具图片 | `InvItem.image` | 是游戏素材图号，不是道具 ID |
| 人物装备类别 | `InvItem.equip >= 0` | **头槽值为 0，不能使用 truthiness** |
| 宠物装备类别 | `InvItem.type` 对应 `PetEquipSlot` | `petItems` 将 `equip=-1/usable=false`，不能套人物装备标志 |
| 地图使用条件 | `usable`、`field`、`target` | `usable` 不代表任意场景和目标都可使用 |

源码：`server/internal/proto/messages_gen.go` 的 `PetInfo/Self/Status/InvItem`；`server/internal/world/item.go::invItem`、`fight.go::statusOf`。

`InvItem` **没有** `UseFunc/Argument`。精确的 HP/MP 分类只存在于服务器 `ItemDef`（`UseFunc == ITEM_useRecovery`，`Argument` 含“体/气/全”）。客户端若只使用已有字段，宜把可用消耗品标为“使用”，不可把所有 `usable` 都称为“恢复药”。名称和说明只能用作展示文案，不能替代动作能力判断。

### 装备槽映射

人物装备位 0..8，背包 9..53（45 格）。`EquipSlot(type)`：

| type | 人物槽 |
|---|---|
| 6 头盔 | 0 |
| 7 铠甲 | 1 |
| 0..4、17..19 武器 | 2 |
| 8..15 饰品 | 3（第二饰品可手动移到 4） |
| 24 腰带 | 5 |
| 5、25 盾 | 6 |
| 26 鞋 | 7 |
| 27 手套 | 8 |

宠物装备位 0..6：type 29→0、30→1、31→2、32→3、33→4、34→5、35/36/37→6。某些道具名和部位注释不一致，应以服务端映射为准。

## 2. 应复用的原生动作

- 人物包内装备：`ItemMove{from:slot,to:-1}`，经过 `canEquip` 的等级、腕力、敏捷、转生、职业、冲突装备等权威检查。已装备物品同一操作自动卸到第一个空背包格。成功发送 `Inventory/Status`，必要时发送 `ObjSprite`。
- 宠物包内装备：沿用客户端 `equipPet(slot,-1)`，发 `PetItemEquip{pet,from,to}`。客户端原有骑宠限制需要保留。服务器验证宠物存在、装备类型、等级和内部 `VariableAI >= 100`（不是面板显示忠诚度），成功更新 `Inventory/Status/Pets`。
- 地图使用：沿用 `items.ts::useItem`，`field===1` 拒绝；`target%100===0` 对自己直接发，`===1` 打开原生目标选择。拼图保留 `useJigsaw` 分支；全体目标在地图不能凭空变成对自己使用。
- `ItemUse.target`：0 自己，1..5 对应宠物槽+1，6..10 对应队伍位置。服务器只允许背包位置；忙碌时拒绝。装备通过 ItemUse 最终仍进入 `ItemMoveLocked`，直接发送 `ItemMove` 可复用同一装备验证。
- 恢复药物使用后等待权威消息；HP/MP变化有 90%..110% 随机值且会截断到最大值。适用效果即使已满也可消耗，不能由前端猜测“不需要消耗”。宠物可以地图恢复 HP；**纯 MP 药对宠物地图无效且不消耗**。

服务器沿用原版不统一检查 `Field/Target`，相应场景限制由原客户端 `useItem` 实现。新移动按钮若跳过该入口，会绕过已有交互边界。恢复实现还保留原版把人物 HP/MP 最低截到 1 的行为；本任务没有更改恢复算法。

## 3. 加点与消息速率

`StatUp{stat}` 每条仅加 **1 点**，stat 0/1/2/3 分别对应体/腕/耐/敏。战斗中、点数耗尽、非法索引静默拒绝；成功发完整 `Status` 并持久化，无独立请求 ID/失败 ACK。

`World.Do` 在世界命令循环串行执行。本轮额外以 `-race` 发送 128 个 goroutine 的加点调用：初始 7 点只产生 7 次成功 `Status`，四属性总和只加 7，剩余为 0；非法 stat 和战斗时均不扣点。该并发检查调用真实 world 动作，**不代表 WebSocket 限流压力测试**。

WebSocket 会话共享上限为 40 条/秒。原生长按为 400ms 后启动，120ms/点，1.2 秒后 50ms/点（最多 20 条/秒），并以上手按下时剩余点数限制发送总数。移动按钮可以复用该入口，点数耗尽后必须移除或禁用操作，避免无效请求。

## 4. 本轮真实数据 fixture 与动作证据

下表经本轮 Go `data.Load` 加载真实 `gamedata`，并在真实 `World` 上执行验证（不是仅解析文本）：

| ID | 名称 | image | type | field/target | 验证 |
|---:|---|---:|---:|---|---|
| 0 | 小斧头 | 20033 | 1 | 0/0 | 有效 ID=0，装入武器槽、原生卸下 |
| 1 | 贝诺美斯Lv1斧头 | 20032 | 1 | 0/0 | 定义核对，供浏览器可见按钮装备 |
| 1500 | 耐久力回复药 | 23013 | 16 | 0/1 | 人物 HP 回复并消耗；宠物 HP 回复并发 Pets |
| 1510 | 气力回复药 | 23005 | 16 | 0/1 | 人物 MP 回复并消耗；对宠物不消耗 |
| 1329 | 皇后写的信 | 22265 | 16 | 2/0 | `usable=false`，地图调用不消耗 |
| 1247 | 治疗中毒的肉 | 24043 | 20 | 1/1 | `usable=true` 但战斗专用，地图不消耗 |
| 22626 | 合成牙套1 | 22545 | 33 | 0/8 | 原生宠物装备操作进入宠物槽 4 |

`/item 0` 也受 GM 解析器支持。浏览器验收可通过可见 GM 聊天 `/item <id> 1` 创建物品；`/hp 1`、`/mp 0`、`/points 1`、`/stat 20 20 10 10` 设置隔离测试角色，无需直接改 SQLite 或 JavaScript 业务状态。

## 5. HTTP、构建与停服

- HTTP：客户端只公开 `index.html`、`art/login.png` 和 `dist/*.js`；源文件、私有文件、目录列举、路径穿越、未知 artwork 返回拒绝；本轮重跑 gzip/HEAD/ETag/外部客户端更新相关测试。
- 客户端暂存：builder/stager 仅接受 JS 构建输出及单一 PNG，拒绝源码/输出/素材的符号链接和多余文件；失败保持先前有效输出。临时目录 fixture 的 8 项测试全部通过，没有覆盖主工作区最终客户端。
- Linux build：先生成匹配客户端再构建临时 sibling ELF，成功后 replace；显式版本、静态 AMD64、digest。发行脚本显式 allowlist，排除 Assets/运行 DB/本地配置，先测试 ZIP 完整性再 replace。本轮只审查脚本，最终版本和成品由主 Agent 构建校验。
- 停服：`main` 等待 world 保存结束，再关闭共享 family 队列，再等待 HTTP 结束，最后关闭 SQLite。本轮真实 subprocess SIGTERM 验证正常在线角色持久化、四角色约 16 秒慢保存队列、共享家族慢保存队列，均通过。

## 6. 可复现命令与文件

在仓库根目录运行：

```sh
python3 Report/SA-1114-02/verify-server.py
node --test scripts/build-client.test.mjs
cd server
GOMAXPROCS=2 GOMEMLIMIT=400MiB go test -p 1 -count=1 -v ./cmd/saserver ./webclient ./internal/server
```

证据：

- `server-review_test.go` + `verify-server.py`：Go overlay 注入本轮独立验证，不修改原服务端包/测试文件。
- `server-native-verification.txt`：2 个顶层测试（含 6 个动作子例）通过，`-race` 无报告；真实数据未跳过。
- `server-http-shutdown-verification.txt`：三个 Go 包全部通过，含正常/慢队列/共享家族 SIGTERM。
- `build-staging-verification.txt`：8 tests passed，0 failed，0 skipped。
- `browser/native-actions.mjs`：导出 `nativeActions(ui, record)`，交由主 Agent 与真实发行 ELF 的 Chromium driver 集成执行；仅编写模块不能充当已完成浏览器验收。
- `browser/camera-lock.mjs`：针对本轮补充的沉浸模式禁用双指缩放、旋转后人物准确可见需求，导出 `fieldCameraLock` / `battleCameraLock`。检查五种尺寸的实际 bitmap 边界、可见缩放按钮与真实两指输入；页面函数只读取既有动画帧/资源缓存。执行结果以主 Agent 的最终 Chromium 日志为准。

## 范围限制

本文是相关动作和发行边界的定向审查，不是全代码库漏洞扫描，也不声称不存在所有安全问题。并发 world 验证、HTTP/subprocess 检查和真实 Chromium验收各自独立；只有主 Agent 运行后的浏览器日志可证明最终 UI 行为。没有实体移动设备认证，最终 ELF/ZIP 的新版本、源码匹配和 digest 仍由主 Agent 的最终发行检查证明。
