# SA-1113-04 移动交互审查

> 所有权：`mobile-shell.ts`、`mobile-preview.ts`、`ui.ts` 的移动界面与对应测试。主 Agent 负责公共输入、镜头与最终发行验证。

## 阅读与调用约束

`Ui.begin/end` 每帧登记画面热区；`getMobileActions()` 仅输出中心位置仍能命中原 ID 的可达热区，遮挡弹窗不能被移动按钮绕过。`main.mobilePresentation()` 提供已经接收的业务状态与标签。`MobileShell.frame()` 将这些热区、文字和原生输入翻译为保留 DOM，点击只提交原 ID，主程序下一帧再次验证原热区。原输入节点只迁移一次，保留密码类型、选区和输入法；返回桌面恢复原父节点与定位。

摇杆由公共 `mobile-controls.ts` 接管，菜单变化、切换设备、失焦与取消先释放输入。DOM 文字按钮不得引入新网络指令，也不能自行确认自动遇敌开关。世界内的 UI 文本仍为 800×600 原坐标；移动显示的缩放不改变业务坐标。

上述约束已经用于验证原始热区绘制顺序、窄横屏触控尺寸、长列表滚动/焦点/误激活，以及沉浸模式的菜单与退出路径。

## 官方资料（修改源码前读取）

2026-11-13 通过网络读取下列官方页面，HTTP 均为 200：

- [MDN：Grid 的对齐](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Box_alignment_in_grid_layout)，2025-11-07 更新。Grid 默认 stretch，可令同一行按钮等高；原绘制次序不能代替阅读行序。
- [W3C WCAG 2.2：目标大小](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)。最小等级为 24 CSS px，增强标准为 44×44；本游戏沿用 44 px 作为移动操作目标。
- [Google：优化 INP](https://web.dev/articles/optimize-inp)，2025-09-02 更新。复用 DOM、避免重复同步和布局工作；不把组件测试直接称为真实设备 INP。
- [MDN：touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)，2026-04-20 更新。浏览器开始处理滚动会产生 pointercancel；只有摇杆和场景手势保留 touch-action:none，菜单允许 pan-y。

## 基线

- 既有 `node --experimental-strip-types --test client/test/mobile-shell.test.mjs`：11/11 通过。
- 新增按列登记热区的回归在基线失败：`earth, water, earth-plus, water-plus` 将不同属性排成同一阅读行。
- 真实 Chromium 156.0.8078.4 在 320×568、390×844 复现上述按钮错配；844×390 的自动遇敌按钮仅 36 px。
- 390×844 长列表没有自己的高度约束，`overflow:auto` 与 `overscroll-behavior:contain` 把触摸滚动截留在没有滚动范围的元素；组件证据记录了滚动 0。

## 设计

沿用石器时代的海蓝绿、骨色和木质按钮；移动面板保持清晰边界、44 px 操作目标和行内等高按钮。动态列表依据原画面的纵向行、横向顺序排列；单项占整行，减少窄屏长文错配。沉浸模式使用独立底部操作区与可收合菜单，不改变传统桌面、传统移动或网络操作。

## 修复与新增

| 风险或需求 | 修改 | 证据 |
| --- | --- | --- |
| 按列登记动作导致手机阅读行错配 | 按原生纵向中心分行、横坐标排序；同 ID 按钮和焦点复用，单项占整行 | 新回归先失败后通过；320/390 竖屏行内等高、顺序与原生行一致 |
| 窄横屏自动遇敌仅 36 px | 操作目标提升至 44 px，保留服务端能力和确认状态 | 844 横屏原尺寸失败；四尺寸修后全部达到要求 |
| 竖屏列表不具备滚动范围，截留触摸 | 独立高度约束与 pan-y；移除矛盾的 portrait grid/flex 排序 | 四尺寸触摸列表实际滚动，未派发原生动作 |
| 新沉浸视图需要菜单与原操作 | 左下摇杆、右手交互/遇敌、菜单或操作抽屉；抽屉独立滚动，打开释放移动 | 可信 Chromium 点击能打开、执行状态命令并收合；静止 60 帧 DOM 变更为 0 |
| 裁剪战斗需要完整目标与镜头 | 原生目标按钮保留 ID 与业务校验，增加我方/敌方/跟随纯展示命令 | 10 个合成目标可滚动访问，第 10 项仍派发原 ID；镜头只走 command |
| 默认大指令面板盖住自己 | 默认收合，底部复用原生 auto/quick 与显式“指令”；三镜头键进入操作抽屉 | 真实 candidate 模型覆盖率100%；相同边界 Chromium 组件修后0%，默认攻击记忆不会重新盖人 |
| 裁剪后原上方互动按钮不在视口 | 沉浸 field 抽屉显示当前可达原生组队、交易、家族、摆摊、名片等，注明面对玩家条件，排除重复 toolbar 菜单 | 新回归检查原 ID、无重复状态入口和移除后的旧节点不派发动作 |
| 快速战斗与正常战斗菜单可能误用裁剪上下文 | 接收 host 的 context/cameraAvailable，quick 保留 field；阻塞面板优先完整 panel | 回归先复现 lobby≠field；四尺寸 quick 地图全屏、镜头/移动隐藏，battle panel 完整 |
| 原生全屏被拒绝或切换电脑版后难退出 | 平台进入/退出与独立沉浸显示分别处理；原生全屏期间始终保留退出按钮 | 四尺寸 Chromium 实际进入全屏，切电脑版后仍用按钮退出并恢复原 stage 父节点 |

源码改动仅在 `client/src/mobile-shell.ts` 与 `client/test/mobile-shell.test.mjs`。没有修改 `Ui.hitAt`、原生鼠标语义、协议或资源。

## 验证命令与结果

| 命令 | 实际结果 |
| --- | --- |
| `node --experimental-strip-types --test client/test/mobile-shell.test.mjs` | 18/18，通过；见 `mobile-shell-tests.txt` |
| `node --experimental-strip-types --test client/test/*.test.*` | 当前源码 115/115，通过；见 `mobile-client-suite.txt`，最终集成重新验证以主 Agent 日志为准 |
| `node Report/SA-1113-04/browser/mobile-components.mjs` | Chromium 156.0.8078.4，320×568、390×844、844×390、568×320，failures=[] |
| `node Report/SA-1113-04/browser/immersive-shell.mjs` | 同四尺寸，场景等比且 ≥800 px 画布宽、视口铺满、菜单/输入/目标/全屏/桌面恢复均通过，failures=[] |
| `git diff --check -- client/src/mobile-shell.ts client/test/mobile-shell.test.mjs` | 通过 |

`browser/mobile-components-baseline.json` 是原始行序/尺寸/滚动的基线；`browser/immersive-shell-baseline.json` 是新增模式首次组件验证，保留了首轮样式绑定错误的证据，不能当作旧发行版本已有沉浸模式的证明。最终组件结果分别为 `mobile-components-final.json` 和 `immersive-shell-final.json`；附图也区分 baseline/final。脚本可用 `SA_PLAYWRIGHT_MODULE` 与 `SA_CHROMIUM` 覆盖本机工具路径。

## 交接状态

移动源码与组件验证完成，保持原输入节点与 host 原生动作校验。追加复盘已使用真实旧 candidate 复现键盘手势、胜利结果“返回”和自己模型被完全覆盖，详情见 `CAMERA-REVIEW.md`；主 Agent 公共输入/镜头/位置补丁与最终 ELF 的矩阵再验正在进行。

主 Agent 负责最终发行构建、二进制/客户端一致性、版本文档及 Git 交付。任务文件多次复核未变化，读取时 SHA-256 为 `6d510059a3a749f9099121c02deb0d46680ba13146048bf9268a1a374a0cf6e6`。

## 验证边界

组件自动化使用真实 Chromium、真实 `Ui` 与 `MobileShell`、合成菜单内容；最终真实账号/服务器游戏流程由主 Agent 集成复核。没有实体 iOS/Android 认证。
