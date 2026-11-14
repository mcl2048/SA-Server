# SA-1114-01 移动全屏工作记录

## 2026-11-13 · 源码审查与设计

已读取 `mobile-view.ts`、`mobile-shell.ts`、`mobile-controls.ts`、`ui.ts`、`main.ts`、原生菜单与登录画面。根因：现有沉浸模式只在 field/battle 生效，NPC/面板一打开就退回 4:3 画面和外部侧栏；网页渐变按钮与原生素材风格脱节。

设计：全屏模式所有 context 使用同一个完整设备视口。场景占满屏幕；面板改为屏内窗口，纵向以底部完整面板为主，横向以左右内容分栏，保留可辨识的原生场景；触摸操作复用当前可达原生 hit ID、真实 InputBox 和协议校验。使用原素材九宫格窗口及工具栏图标，不新增素材。字体沿用游戏 CJK 无衬线；色彩取原游戏的石材边框、深蓝灰窗底、白色内容与黄色当前选择。桌面分支与经典模式保持现有行为。

## 研究依据

2026-11-13 抓取 Chrome viewport/virtual keyboard 文档（https://developer.chrome.com/blog/viewport-resize-behavior）与 Apple HIG layout（https://developer.apple.com/design/human-interface-guidelines/layout）。应用：通过 VisualViewport 跟随键盘可见区域；以动态高度和四边 safe-area 约束窗口；至少 44 CSS px 触控尺寸；按横竖屏调整内容而非缩小全部按钮。浏览器模拟不能替代实体设备安全区/键盘认证。

待做：先写面板全屏/输入语义回归；实现全屏各 context 布局和原生素材皮肤；移动测试；主代理真实 Chromium 集成验证。

## 已完成的移动实现

| 路径 | 变更与边界 |
| --- | --- |
| 全屏场景 / NPC / 菜单 / 登录 / 战斗子菜单 | 各 context 始终使用同一完整设备视口。窗口位于游戏屏幕内，支持四边 safe-area 和 VisualViewport 键盘收缩。经典模式与桌面主绘制保持原路径。 |
| 窗口与操作 | 复用现有 CG 26001..26009 组成九宫格；菜单与战斗使用原游戏图标。竖屏内容自然滚动；横屏将内容与命令分列独立滚动。鼠标左右键、选项切换和缩放保留在“更多操作”。 |
| 地图 | 从原生 map base/marks 两层直接合成到屏内地图，最多 20Hz；准确回传 map-area 的逻辑坐标，由主输入层再次检查。拖动取消点击，避免误寻路。缩放、全图、回到自己和区域切换继续调用原生操作。 |
| 宠物与相簿 | 记录当前已绘制模型的稳定原生姿态，屏内展示真正的原素材。桌面动画绘制不变。模型解码最多缓存 12 张 192×176 图片；关闭 / 换宠后旧解码结果不得重新显示。 |
| 解码与输入 | 窗口、图标、模型由一个异步 worker 串行解码；重叠帧只标记 dirty 重查，不能同时膨胀多个图集页。真实 InputBox、IME 和游戏 hit ID 保留。 |

## 本分工验证

- 已保留修改前 RED：`mobile-red.txt` 中两项确实失败（面板回到 4:3、dialog 未保持游戏全屏）；`mobile-map-red.txt` 与模型 RED 记录新增可视化缺失。
- 最后全客户端命令：`node --experimental-strip-types --test client/test/*.test.ts client/test/*.test.mjs`，134/134 PASS，见 `mobile-client-tests.txt`。
- TypeScript `--noEmit --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --lib ES2022,DOM client/src/main.ts` 退出 0，见 `mobile-typescript.txt`。
- `node client/build.mjs` 退出 0，见 `mobile-build.txt`。
- 真实 Chromium 静态资源布局自查（不是最终二进制验收）：390×844 全屏登录窗口 (10,92,370,742)，844×390 为 (10,62,824,318)，原生九宫格资源成功显示。发现横屏文本 / 输入争抢高度后，改为同一个可滚动内容列；最终实际 Go/WebSocket 路径由主代理另行验收。

## 仍需明确的限制

本分工没有实体 iOS/Android 硬件，因此不宣称实体设备键盘、安全区、GPU 或系统全屏认证。当前屏内地图支持精确轻点和原生工具按钮；地图内拖动作为窗口滚动，未把拖动接入原生地图平移。宠物屏内模型为稳定静态姿态，原场景动画绘制保持原样。最终主代理浏览器证据与交付报告优先于本工作记录。

## 地图平移补齐 · 主代理复审后的追加

已确认“地图内拖动只滚动窗口”会损失地图原生平移。追加方案保留独立轻点寻路，越过 10 CSS px 阈值后才建立 drag-only 原生指针流；将精确坐标送回现有 `MapWindow.pan`，不直接修改地图中心或跟随状态。即使 start/move/end 全部发生于两帧之间，也依次在原生帧中保留 start、最后 move、release；中间 move 合并为一个槽位，输入内存不随事件频率增长。

失效保护：`map-area` 在排队与消费时都必须可达且矩形未变；screen/modal/battle/floor/mapOpen 必须保持一致。取消、失焦、隐藏、第二指、旋转、模式/上下文变化时清理原生 drag/pressInside，不合成点击，不自动寻路。地图画布使用 `touch-action:none` 专门平移，窗口其余区域继续滚动。修改前失败记录 `mobile-pan-red.txt`；最终验证结果后续追加。

地图追加最终验证：`mobile-pan-client-tests.txt` 为完整客户端 141/141 PASS；`mobile-pan-typescript.txt` 为空、TypeScript 命令退出 0；`git diff --check` 退出 0。定向回归直接驱动真实 `MapWindow.pan`，确认平移改变 cx/cy 并停止跟随，且不会调用 navigateTo；包含高频 move 合并、矩形失效、pointercancel、lostpointercapture、上下文关闭、页面隐藏、第二指、失焦与旋转手势取消。上文初版“地图未接原生平移”的限制现已解除；未进行实体手机认证的限制仍成立。源码交由主代理冻结并构建最终二进制 / Chromium 矩阵，本分工未构建最终二进制。

## 2026-11-14 · 最终浏览器地图拖动失败的独立审查

独立真实 Chromium 组件流程复用了当前源码 `MobileShell`、`Mouse.attach`、屏内地图、指针队列与实际 `MapWindow.pan`；使用少量地图/文本数据隔离资产和服务器负载，不作为完整真实游戏或实体手机认证。

可见图层上的同样 CDP 五段拖动成功：cx/cy 从 50/50 改为 47.069/42.391，follow=false，松手 down=false，navigateTo 调用为零。真实事件顺序包含 gotpointercapture、pointerup、lostpointercapture，业务 pointer 流为 start/move/end，没有意外 cancel。start 中 hooks.cancel 只清理主画布 Mouse 状态，不释放地图图层 capture；pointerup 先清本地 press 再 release，后续 lostpointercapture 不会误取消已排队 release。

滚动反例也已复现：加入长原生信息后，单独对 map-me 工具按钮 scrollIntoView，sheet.scrollTop=739，地图 rect.y=-567、bottom=-313，旧脚本按地图中心计算的 CDP 点 y=-440、elementFromPoint=null。对地图画布 scrollIntoView 后 rect.y 恢复 172。因此菜单切换滚动复位应由主代理修正，验收脚本在工具操作后还需确认地图落点可见且实际命中该画布。证据完整保存于 `mobile-pointer-review.json`；本次独立审查未修改输入源码。
