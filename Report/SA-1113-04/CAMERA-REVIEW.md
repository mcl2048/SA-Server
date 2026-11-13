# SA-1113-04 镜头与输入独立复盘

> 只读审查：`main.ts`、`mobile-view.ts`、`mobile-camera.ts`、`battle.ts` 新接口及其调用链。实际前证据使用独立 candidate ELF：`971b98c42eabcc9bd385480e2f5ab8c685408eb5cde4d609ef11dff6a189a949`。

## 保持的约束

- `immersiveScene` 使用一个有限、至少为 1 的缩放系数；800×600 原坐标和两轴比例保持一致。左/上边缘在原场景边界内约束，不扩展服务器坐标或放宽移动校验。
- 主程序选择 field/battle/panel/lobby；原生菜单和模态优先完整 panel，quick 使用实际 field。相机方法只读 Fighter 的展示状态，未增加战斗行动、排队延时或网络指令。
- 文字/目标来自当前展示 HP，不提前应用未来回合数据；隐藏或离场对象排除。原 ID 继续通过 host 的 screen/modal/battle 标签和当前热区验证。
- 真实运行只用 UI 登录、按钮、键盘/CDP 触摸及聊天 GM。`page.evaluate` 读取状态/几何，未直接修改 `sa`、发送业务消息或安装假的战斗结果。

## 实际发现与处置

| 项目 | 可复现事实 | 处置与边界 |
| --- | --- | --- |
| 键盘持有与双指手势 | 首次 ArrowRight 只走一格，不能排除前方墙，保存为 `candidate-input-first.json`。随后读取真实 MapData 通行标记选出 8 步合法非传送走廊；ArrowLeft 的 wantDir 在手势后仍为 2，坐标从 370,182 继续到 365,177；repeat 到 363,175，keyup 稳定，fresh down 可继续 | 前证据 `candidate-input-repro.json`；主 Agent 修公共释放和取消后的重复键激活。最终 ELF 再验，不能把第一次停下当作修好证据 |
| 胜利结果窗 | 实际 BattleEnd=win、exp=1；原生 result-close 存在，但 `openCount=0`、移动 layout=field；真实“返回”后仍存在结果窗 | 前证据 `candidate-result-repro.json`；主 Agent 增加仅手机的结果窗计数和原生关闭路径，桌面路径保留 |
| 自己模型被默认指令挡住 | 390×844，实际 Native rect=(659,451,34,58)，CSS 模型约47.83×81.59，y634.4..716.0；sheet y468.6..764，覆盖率100% | `candidate-camera-repro.json` 与真实截图。移动 shell 改为默认收合、原生 auto/quick 小条和显式“指令”；目标/guard/escape提交后收合，战斗子菜单返回所需 target 时展开 |
| 场景切换保留旧焦点 | Context 改变只重置 focusAt，旧 focusX/Y 继续插值；可能暂时把新场景人物放在裁剪外 | 主 Agent 已写首焦点 RED 并修为新场景直接首焦点；这是显示边界，不是业务坐标错误 |
| 固定敌方视角选尸体 | 可见对象包含 dead，固定 enemy 原来取第一个敌方，即使其他敌人存活 | 主 Agent 改为活敌优先、全部倒地后保留尸体回退；follow 仍按实际演出和受击对象 |
| 抽屉手势和旧控件位置 | 公共 `[data-mobile-control]` 的 none 会覆盖抽屉 pan-y；经典/沉浸原来共用 orientation key | 主 Agent 的真实 Chromium control-layout 取到 RED 后修：抽屉内滚动、外部控件长按，位置按 display 隔离。不是以仅 source 的猜测宣称已修 |

## 新模式的显示选择

镜头三键放在“操作”抽屉内，默认让实际场景和人物可见。默认攻击记忆已经产生的 t-* 不自动展开；只有玩家显式打开指令、或从战斗原生子菜单返回并需选择目标，才显示文字指令。原生 auto/quick 按钮复用同一节点，避免重复 ID 和重复业务触发。

原蓝色按钮继续绘制并保留原点击区域。仅隐藏绘制而保留 hits 会产生不可见的操作区，超出此次窄修；本次通过收合 DOM 面板解决已证实的模型遮挡。

## 运行与证据归属

`real-game.mjs --variant candidate --probe` 支持 `--input-only`、`--result-only`、`--camera-only`；非 probe 的 `--matrix` 交给主 Agent 的 `matrix-cases.mjs`。Owner runner 验证 ELF 摘要、拥有服务器子进程，finally 发送 SIGTERM、等待并查询只读 SQLite 保存位置。

所有 credentials、session、cookie、配置、数据库和服务器日志留在 0700 私有目录；公开 JSON 仅保留白名单游戏字段和几何。首次被外部 SIGTERM 中断的运行不作为产品失败。三项后续前证据均正常停服并保存位置匹配。

本复盘使用真实 Chromium 156、真实 ELF/WebSocket/SQLite/官方素材，但图形驱动为 SwiftShader 软件 GPU，手机采用可见视口和触摸模拟，不能代表实体 iOS/Android 的键盘、安全区、GPU 或 Safari 认证。
