# 独立输入与桌面兼容审查

审查基线：`43f63a2e54067ec973f97e710e9c13321e165755`，最终发布二进制内嵌客户端。审查重点为 `mobile-shell.ts`、`mobile-view.ts`、`ui.ts`、`main.ts` 的输入生命周期、模态阻止、排队动作、焦点和桌面兼容。初始阶段只读；父 agent 在收到复现结果后明确授权窄修复 `main.ts`，其余修复由父 agent 负责。

## 已复现问题

### P1：手机打开面板后仍继续向旧目的地移动

- 基线位置：`client/src/main.ts:785-787` 与 `1044`，`client/src/field.ts:536-554`。
- 操作：使用触摸点击一个可通行、至少七步远的地面目的地，120ms 后点击手机工具栏“状态”，保持面板打开900ms。
- 实测：打开面板时坐标 `(14,25)`、`wantDir=-1`、`target=[12,29]`、布局 `full`；900ms 后坐标到达 `(12,28)`，服务端连接又发送了4条 `Move`。
- 原因：取消只清方向和鼠标，未清寻路目标；`wantDir=-1` 恰好让 `Field.update()` 继续消费旧路线。面板阻止方向键并不能停止已有寻路。
- 后果：看状态、处理物品或取消时角色仍在遮挡界面后行走，可能踩传送格或遭遇战斗。
- 证据：`browser/input-baseline.json` 第一项及 `browser/mobile-path-panel.png`。修复在手机取消路径同时清 `field.target`；修复效果以候选/最终回归JSON为准。

### P1：桌面新“界面”控件截断方向键释放，导致粘键

- 基线位置：`client/src/mobile-shell.ts:120-127`，`client/src/main.ts:537-542` 与 `1044`。
- 操作：在电脑版场景按住 `ArrowRight`，保持按住时点击右下角新“界面”summary，再释放方向键。
- 实测：焦点为 `<summary aria-label="界面模式">界面</summary>`，释放后 `wantDir` 持续为6，650ms后仍为6。测试地点遇墙，坐标未持续变化；因此证据直接证明方向状态粘住，未虚称该次沿道路持续行走。
- 原因：新DOM chrome无条件阻止 `keyup` 冒泡，窗口级 `keys.delete()` 收不到释放。桌面 `hooks.cancel` 又不会清 `keys`。
- 后果：桌面新控件造成原方向键释放行为回归，需再按/释放同键或窗口失焦才能恢复。
- 证据：`browser/input-baseline.json` 第三项及 `browser/desktop-mode-key-latch.png`。父 agent 修复shell不再截断keyup。

### P2：组合输入确认Enter被当成发送聊天

- 基线位置：`client/src/main.ts:670-672`；其他原生InputBox业务keydown同样未统一处理组合状态。
- 操作：聊天框填入“拼音确认未发送”，派发 `compositionstart`，然后派发 `keydown`：`key=Enter`、`isComposing=true`、`keyCode=229`。
- 实测：聊天框被移除，连接实际发送 `Chat`，正文为“拼音确认未发送”。
- 原因：原生监听器仅检查 `e.key`，没有组合状态守卫。移动shell保留了原DOM监听器，因此输入框身份保留并不等于组合输入行为正确。
- 后果：选择中文候选可能提前提交聊天；其他使用Enter确认的输入存在同类触发路径。
- 边界：此项实际运行了Chromium合成组合事件与真实业务发送，没有声称使用实体设备/真实操作系统输入法。父 agent 在InputBox捕获阶段统一阻断组合期间的游戏keydown传播且不preventDefault；候选回归分别覆盖isComposing、keyCode229和composition追踪。
- 证据：`browser/input-baseline.json` 第二项。

### P1：手机交易“返回”仅关闭本地面板，没有取消服务端交易

- 基线位置：`client/src/main.ts:961`，`client/src/trade.ts:65` 与 `122`；服务端忙碌状态判定 `server/internal/world/trade.go:48-50`。
- 操作：两个真实浏览器账户进入同一线路，原生游戏设定中将对方“交易”置YES，走到相邻格、面向对方，通过原桌面Ctrl+T发起交易；在手机端触摸工具栏“返回”。
- 实测：手机 `trade.open=false`，对方 `trade.open=true`，返回后没有发出任何协议。测试前后均读取了两个独立客户端的交易状态。
- 原因：手机返回直接调用 `TradeWindow.close()`；该方法只改本地状态和移除石币输入框。原生交易取消按钮实际调用 `host.send("cancel")`，然后由 `TradeClose` 关闭双方UI。
- 后果：玩家误以为已退出，但双方服务端交易状态和busy限制仍保留，对方界面仍被占用，直到服务端因其他事件取消。
- 基线证据：`browser/trade-baseline.json`、`browser/trade-back-baseline.png`。修复后通过同样双浏览器操作，实际发送了恰好一条 `{t:"Trade",cmd:"cancel",slot:0,amount:0}`，双方 `trade.open=false`；证据 `browser/trade-after.json`。

## 已执行验证与范围

- 审查起点实际执行 `git rev-parse HEAD`、`git status --short`；HEAD为43f63a2，初始工作区干净。
- 实际执行初始全部14项客户端测试：通过。
- 父 agent 加入统一IME修复后，实际执行全部15项客户端测试：通过；实际执行 `node client/build.mjs`：35个模块构建成功。
- 基线浏览器使用真实Chromium/SwiftShader，对独立临时SQLite、正式本地资源和最终发布二进制操作；测试账号通过实际界面注册、建角。
- 此审查未执行Go全套测试、vet、race，未将上一轮报告结果冒称为本轮执行。
- 未确认P0。未从hitaction队列、顶层hit快照或pointer捕获路径中发现另一项已经可复现且可归因的缺陷；不以此声称这些路径穷尽覆盖。
- 可重用实际回归入口：`browser/regression.py`，通过 `SA_RUNTIME` 指向隔离服务元数据，`SA_REVIEW_OUT` 指向本次证据目录；不打印测试密码。
- 外部候选客户端实际浏览器10项全部通过，0页面异常：原生登录Enter焦点、真实错误密码提示Escape恢复输入、面板取消旧路线、真实CDP方向按钮释放、三种合成IME确认不发送、普通Enter恰好一次发送、原生系统确认Escape不回城、AI自动遇敌在手机面板下暂停、桌面keyup释放，以及页面异常检查。证据 `browser/regression.json`。自动遇敌暂停同时读取路线与协议，不只看角色动画。
- 外部候选客户端双浏览器交易取消实际通过；可重用 `browser/trade-regression.py after`，证据 `browser/trade-after.json`。
- 上述候选回归最初使用43f63a2服务端二进制配显式外部候选client。随后对最终 **v0.2.5-LYNX 内嵌客户端二进制** 单独完整重跑两脚本：输入10项全部通过、0页面异常；双端交易返回关闭双方窗口且恰好发送1条cancel。当前 `browser/regression.json` 的 `runtime_kind` 为 `final-embedded-v0.2.5-LYNX`；最终日志为 `browser/regression-final.log` 与 `browser/trade-final.log`。独立读取运行进程 `/proc/3048021/exe` 得到SHA256 `b7b08408cbf374971971c8ee275601c242d7c72350f1d1ece13bfecabe5f1e5c`、15,114,400字节，证据 `browser/input-final-runtime.json`。最终阶段未重新构建或编辑生产源码。
- 回归脚本调试期间的失败：系统回城确认实际使用 `sys-yes/sys-no`，首次误等 `modal-yes`；AI自动遇敌实际使用 `ai-enc-val`，首次误用 `ai-enc`。均已按原生ID校正后完整重跑通过；未据这两个测试定位错误声明产品缺陷。交易脚本调试期间还校正了新角色默认拒绝交易、后台渲染超时与设置焦点问题，最终基线/修复双端结果来自完整成功运行。
