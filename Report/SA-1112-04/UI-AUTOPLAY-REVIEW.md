# 自动与快速开关：确认时序及快速画面入口修复

## 浏览器证据与判断边界

依据 `browser/DOM-TAP-ISSUE.md` 和 `browser/dom-tap-probe.json`，真实移动端 DOM 与画布点击都曾出现快速开关未生效。记录中的 `ai-quick-val` 命中、中心坐标和指针事件正确，失败不能简单归为滚动或视口取消。

需区分原始数据与问题描述：探针文件第三次记录（约第 433 行）确实包含 `quick:false` 出站包，且 `serverAfter.quick=false`；因此此问题是间歇失败，不能声称所有快速点击都未发送或快速开关完全不可用。现有日志没有记录本地变量每次赋值与逐条 ACK 的精确因果，尚不能证明生产中的每次失败都由同一竞态造成。

源码可独立确认一个会丢失点击意图的时序：

1. `frame` 开始发送仍为旧开关值的暂停租约更新。
2. 同一帧的 `AiWindow` 经真实 `Ui` 命中调用 `Menus.toggleQuick` 或 `toggleAuto`，修改 `settings`。
3. 原 `settingsChanged` 只更新显示、鼠标、音频；修改要等下一帧开头才发送。
4. 两帧之间旧 `AutoPlayState` 到达，无条件覆盖本地 `settings`，下一帧不再发送刚才点击所需的新值。

另有确定的入口缺失：快速战斗仍显示 `FieldScreen`，移动端系统快捷操作因 `battle` 存在而退出；原战斗按钮只在普通 `battleView` 中绘制。用户在快速画面中没有持续可用的入口关闭快速并转回手动战斗。

## 最终修复

- `main.ts` 的 `settingsChanged` 立即调用 `syncAutoPlay()`，同一次真实菜单点击中发送新意图；不依赖下一帧。
- `autoplay-sync.ts` 用 `AutoPlayIntent` 保存当前期望的三个开关及本地修订号，记录本连接已发送状态；旧暂停确认和前一个开关确认不能覆盖更新的本地意图。处理 ACK 前也捕获尚未发送的设置变更。
- 每次登录/恢复会话重置该跟踪器，首个服务端快照权威恢复状态。该实现不改协议；依赖现有单连接 WebSocket 顺序回包，无跨连接确认合并。
- 服务端带原因的停止通知按实际三个布尔值生效。只停止自动遇敌的低 HP 通知不会凭空清掉仍为真的快速/自动开关；真正清空三个开关的安全停止照实清空。停止之前的在途确认不能重新开启旧状态。
- `serverOwnsAutoTurn(wanted, actual)` 同时考虑本地期望与最后服务端实际自动/快速值。开启等待确认时不运行旧客户端自动决策；关闭等待确认时等服务端释放回合后才允许手动。
- 普通战斗与快速地图共用 `drawAutoPlayToggles`，只绘制一组 `battle-auto-toggle`、`battle-quick-toggle`。快速地图不开放背包、交易和其他世界操作窗口；移动端可选动作保留这两个真实 UI 命中。观战、决斗和模态窗口不开放这些按钮。
- 快速关闭后的实际画面切换继续使用既有 `setQuick` 和 `changeBattleQuick`，保留当前战斗对象、回合及宠物提交记录。
- 浏览器后续发现最后一层 DOM 消费条件仍缺失：虽有两个画布命中，原 `mobileFrame.phase` 将快速战斗报为 `field`，`MobileShell.fieldNormal` 因而隐藏动作面板并传空数组给 `syncActions`。现改为只要战斗存在就报 `battle`；实际地图和快速演出不变，手机使用战斗布局显示这两个按钮，并隐藏移动工具栏与摇杆。先前仅验证真实 `Ui` 命中的测试不能覆盖这层，现补真实 `MobileShell.frame` 的集成回归。

## 验证

新增 `client/test/autoplay-sync.test.ts`，通过真实 `Ui` 命中计算 → `AiWindow` 行 → `Menus.toggleAuto/toggleQuick` → `changed` 回调测试，未通过直接修改开关绕过菜单行为。测试覆盖：

1. 自动、快速真实点击同步发送且不被旧暂停确认覆盖。
2. 旧确认在点击与下一帧之间到达时，尚未发送的意图仍被保留。
3. 前一次确认到达前连续切换，包含重新回到原值以及同时修改另一个开关。
4. 仅遇敌停止、全自动安全停止、停止后的旧确认，以及恢复会话的新权威快照。
5. 自动开启等待确认和自动关闭等待确认期间的回合所有权。
6. 快速地图的共享按钮可从真实 `Ui.getMobileActions()` 找到并点击关闭快速，且每个命中只登记一次。

最终验证全部通过：新增 6 项与既有 12 项战斗合同测试共 **18/18**，约 0.559 秒；随后全量 `client/src/*.ts` TypeScript 检查通过，授权源码差异空白检查通过，组合命令退出码为 0。完整测试名称与结果记录在 `UI-AUTOPLAY-TEST-EVIDENCE.txt`。

最后 DOM 消费层补充完成后，`node --test client/test/mobile-shell.test.mjs` **10/10 通过**，约 0.539 秒；覆盖同一组快速命中在旧 `field` 阶段被隐藏，在 `battle` 阶段生成唯一且可见的两个 DOM 按钮，点击按真实取消输入→派发动作顺序执行，移动工具栏与摇杆区域保持隐藏。随后全量 TypeScript 和本次差异空白检查也通过，组合退出码 0。最初该新增测试错误预期点击只有动作回调，忽略现有取消输入回调；已对照实际 `MobileShell.syncActions` 合同修正为 `cancel`、`action` 两步，未修改产品行为来迁就测试。

第一轮 5 项测试亦通过（约 0.668 秒），同轮 TypeScript 曾因并行中的 `album.ts:127` 缺少 `spritePortrait` 方法失败；已告知主代理，未越界编辑图鉴文件。最终检查中该并行错误已消失，不再影响全量检查。

实际命令，工作目录 `/home/coder/saserver`：

```sh
node --test client/test/autoplay-sync.test.ts client/test/battle-multipet.test.ts
npm exec --yes --package typescript@5.9.3 -- tsc --noEmit --allowImportingTsExtensions --module esnext --moduleResolution bundler --target es2023 --lib es2023,dom,dom.iterable client/src/*.ts
```

真实浏览器验收仍由主代理协调，必须在包含最终修复的相同构建上重跑 DOM 探针、快速转手动、组队与救援场景后再声明通过。此委派没有连接测试账号、构建或替换运行中的二进制。
