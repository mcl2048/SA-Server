# SA-1114-02 · 移动全屏原生交互验收

**v0.2.13-LYNX 已通过本轮验收。** 基线 `b8e8195 / v0.2.12-LYNX`。客户端/构建168项、真实Chromium83项全部通过，匹配ELF/ZIP与源码输入交叉校验通过。

## 修复与原生交互

| 项目 | 实现与风险控制 | 实际证据 |
|---|---|---|
| 宠物一览/详情 | 初开仅基本列表；点击原名字热区进入详情；使用原图像/帧序与偏移播放 | `browser/pet-status-panels.mjs`，`final-native-pets-*`截图与最终分组结果 |
| 动画开销与取消 | 串行图集解码、同动作重复图号去重、两动作缓存，每动作最多32张192×176以内帧；换宠/关闭/切屏防迟到结果；减少动态效果暂停 | `mobile-native-skin` 回归，实际多src变化与减少动态效果验收 |
| 人物状态 | 原 `Status.face`；四属性及 +1 相邻，原 StatUp逐次、服务端Status权威；耗尽移除；队伍页独立信息 | `browser/native-actions.mjs`，真实1点回执及旧位置点击检查 |
| 道具 | 原CG图片、人物/宠物装备及可用道具分类，明确装备/使用/卸下；原目标选择、合法场景、当前有效热区 | 真实装备ID1、HP1500、MP1510、不可用信1329，消耗/Inventory/Status检查 |
| 全屏缩放 | 行走/战斗双指只取消输入，不缩放或平移；按钮 +/−/复位保留 | 单元red-green、真实CDP两指spread/translate及业务消息零泄漏 |
| 转屏镜头 | 平滑焦点目标越界立即对准，视口尺寸变化/按钮缩放重新锚最新原生目标 | 五尺寸真实人物bitmap与控制覆盖验收 |

## 本轮验证

- 客户端与构建测试 168/168；TypeScript、Go全包测试、Go vet通过。
- 独立服务端审查的真实装备/HP/MP/宠物动作、128并发加点/race、HTTP与慢存档队列停服通过；未发现本范围需改服务端的P0/P1。
- 实际ELF的46个嵌入文件逐字节匹配源码输出；gzip、HEAD、304、11项私有URL404与SIGTERM退出通过。
- 最终 Chromium **83/83**：72项桌面/经典手机/全屏窗口/原生业务/地图镜头与11项战斗/转屏/双指/手动/自动/快速战斗，使用相同SHA的两个隔离运行目录；均无pageerror/failure，SIGTERM退出0且位置落库一致。详见 `browser/final-field-game.json`、`browser/final-combat-game.json`，汇总 `browser/final-real-game.json`。
- 重复构建 SHA-256 一致；322项生产/客户端/测试/构建输入摘要保持一致。ZIP4358项逐项匹配，文件0644、内置ELF0755，旧ZIP与旧摘要均已替换。
- `aggregate-browser.py`、`verify-final.py`、`make-report.py`全部退出0。机器可读清单 `release.json`；可视概览 [index.html](index.html)。

二进制 SHA-256：`9e40985918a054f020d030064ebf801d4a57bfcdeadb477f075c1ba3fe32e833`。

ZIP SHA-256：`534390fac272ffce79ff8ddd06d263611239a9a7ab1526162794e7259fe817ad`。

## 验证边界

实际运行静态 Linux AMD64 ELF、原Assets/WebSocket/隔离SQLite、真实Chromium；手机触屏与尺寸由浏览器模拟，GPU为SwiftShader。**未认证实体 Android/iOS、Safari、真实移动软键盘/系统安全区与刘海。** 原生全屏请求仍受浏览器能力限制。镜头按所选我方/敌方/跟随焦点显示。

运行fixture、凭据、SQLite和服务端原日志只留在0700私有临时目录，不在本报告/发行包/仓库。无新增Assets，沿用已有增量包。

## 中间记录说明

`candidate-*`为中间UI核验；首次状态详情测试误判默认收起（原生默认展开），已校正脚本。`superseded-*`矩阵在最后两处源码合并后由主代理停止并重跑，不作为最终通过证据。`intermediate-http-*`检测到构建期间源码更新而拒绝通过；冻结源码后完整重建和HTTP复验通过。`touch-cleanup-*`中游戏断言已通过，随后脚本重复取消已结束触摸流被CDP拒绝；`screen-api-*`在72项通过后，脚本误将战斗画面当地图画面调用openCount。修正两处验收脚本后，以同一ELF的72项地图/窗口与11项战斗两个独立进程运行并严格汇总；`collector-init-*`与`tray-readiness-*`另记录采集数组初始化、关窗后DOM就绪时序修正；这些均为验收工具，中间失败报告不计入最终通过。保留中间记录以说明最终证据边界。
