# SA-1114-02 · 移动原生交互记录

## 2026-11-14 · 调研与接口

- 基线：`b8e8195` / `v0.2.12-LYNX`。当前任务是宠物一览→详情、原生站立动画、人物头像与就近加点。
- 文件所有权：mobile_review 修改 `pets.ts`、`menus.ts`、`ui.ts`、`mobile-native-skin.ts` 与对应测试；主 Agent 修改 shell/cards/items 并承担最终集成与发行。
- 修改前阅读现有原生窗口、移动 metadata 和 atlas 解码逻辑。`imageCanvas` 会临时展开完整图集页，所以继续用同一串行 worker，动画只缓存有像素预算的输出，不每帧重新解码图集。
- 已使用 `test-driven-development` 与 `verification-before-completion` 技能。
- 官方研究：Apple HIG 的触控尺寸与上下文一致性；Chrome Android Visual Viewport 行为；W3C WCAG 2.2 Target Size（2026-11-02 更新）；Google web.dev [prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion)。采用就近且保留原生命中的加点按钮、保持视觉视口适配；JavaScript 动画动态监听 reduced-motion，窗口隐藏/切换时取消播放。
- metadata 约定：`MobileCard.category/primaryAction`；`MobilePanelInfo.stats` 描述标签、值及原生 `st-upN`；`MobilePortrait.animation` 描述稳定动作 key、native ticks 和 frames。主 Agent 可保持现有 `skin.sync` 调用。

## 验证计划

1. 先编写失败测试：移动宠物一览不因名字悬停展开详情；点击名字仍通过原生页切换。
2. 验证人物 metadata 使用原生 face 和四属性，点数耗尽时不再暴露可用加点。
3. 验证动态图确实按原生 ticks 推进；切换/关闭撤销旧结果；解码串行且缓存有界；减少动态效果设置可运行时生效。
4. 主 Agent 使用真实 Chromium 覆盖移动和桌面主要路径；证据不表述为实体设备认证。

## 2026-11-14 · 实现与第一轮验证

- 宠物全屏一览：触摸释放留下的名字 hover 不再追加成长/抗性扩展框；点击仍走原生 `pet-nameN`→detail，桌面 hover 保留。关闭重开仍回一览。
- 宠物详情：使用原生站立动作的图号、朝向、ticks、frame offsets；skin 驱动 `requestAnimationFrame`，metadata 不随当前帧变化，单帧宠物和相簿仍可静态展示。缓存至多两个动作、每动作至多32个192×176以内输出；长动作均匀采样且保留原生总循环时长；解码仍走单 worker。新选择、关闭、隐藏标签页取消旧播放；运行时 reduced-motion 使用静态首帧。
- 人物：使用原生 `st.face`，原始四属性值分别关联 `st-up0..3`，点数为0时不提供加点操作。队伍页单独记录当前人物/宠物/队员HP/MP，不沿用头像与属性操作。
- 新增要求使用 `systematic-debugging` 技能调查。失败测试复现：全屏双指把按钮zoom=2改为4；390px竖屏从battle x=100切x=700时，旧easing让目标首帧投影x=947.85；横转竖首帧同样越界。
- 根因修复：保存最新native target与eased camera两个状态；目标越过48px安全边界即显示、视口尺寸变化首帧使用最新target、按钮缩放锚定当前target。全屏双指消费事件并取消native holds，不改变scale/pan；classic双指行为保留。
- 第一轮新鲜验证：client完整测试159/159通过；TypeScript `main.ts --noEmit`通过；`git diff --check`通过。日志：`/tmp/sa-1114-02-mobile-review-tests.txt`。主 Agent 的真实Chromium矩阵继续验证实际sprite bitmap边界与输入链路；此处不声称实体设备认证。
- 补充审查：人物MP显示当前值/上限；原生时间线重复同图号（不同偏移）曾重复展开整图集，失败测试 `901,902,901` 证实三次解码，现动作内只解码两张bounded crop且保持偏移。第二轮完整client测试160/160、TypeScript、diff-check通过。当前源码准备好，等待实际人物bitmap范围证据决定是否还需相机边界修复。
