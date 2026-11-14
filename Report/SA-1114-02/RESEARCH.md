# 修改前研究与应用

资料于本轮修改前联网获取并阅读（2026-11-14）。

1. [Apple HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons.md)：明确动作文本、按压反馈、充分间距；建议命中区域至少 44×44 pt。本项目沿用至少 44 CSS px 的触屏入口，装备/使用独立明确标注。CSS px 与物理 pt 不作等同认证。
2. [W3C WCAG 2.2 Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)：24×24 CSS px 或间距例外；本轮按现有更大触屏目标验证，防止密集属性按钮误触。
3. [Chrome viewport / keyboard behavior](https://developer.chrome.com/blog/viewport-resize-behavior)：软键盘可仅改变 visual viewport；保留真实输入框、visualViewport 与屏内滚动。该文是平台行为资料，非宣称本轮新增浏览器技术。

原生游戏 CG、调色与窗口边框继续作为视觉基础；分类、图片区与动作区重排进手机屏幕，避免缩小桌面窗口。实际 Chromium 验证不替代实体 Android/iOS、Safari 与软键盘认证。
