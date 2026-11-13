# 官方资料与实现取舍

检索日期：2026-11-13 UTC。下列页面通过真实网络请求访问，不把搜索页空结果当作研究证据。

| 来源 | 实际读取的内容 | 本任务应用 |
| --- | --- | --- |
| [Go 1.26 发布说明](https://go.dev/doc/go1.26) | Green Tea GC 默认启用；小对象标记扫描改善局部性和 CPU 扩展；官方给出的 10–40% 是特定程序的 GC 开销范围。 | 先测量实际热点与分配，避免把官方 GC 数字套用到本游戏或擅改 GC 参数。 |
| [Go 性能诊断](https://go.dev/doc/diagnostics) | CPU、heap、goroutine、block profile 的用途与测量互扰。 | 使用基准、分配量和可复现负载识别热点；保持世界协程单写模型。 |
| [Go 1.27 发布说明](https://go.dev/doc/go1.27) | 2026-08版；小对象分配有按大小专用调用，某些小分配降低成本，flate实现改进会改变压缩字节。 | 最终使用已安装Go1.27.3，比较同工具链上的实际热点；不把官方性能上限当成本游戏提升。 |
| [SQLite WAL](https://sqlite.org/wal.html) / [原子提交](https://sqlite.org/atomiccommit.html) | 2026 WAL-reset修复边界、WAL单写者、FULL提交同步与checkpoint限制。 | 已实际检测runtime3.53.4含修复；保留WAL/FULL，不以NORMAL换取基准提升；真正排空存档与恢复事务。 |
| [Google：减少布局开销](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) | 页面于 2025-05-07 更新；批量读取、写入，减少强制布局与 DOM 数量。 | 控件仅在状态改变时更新；复用动态按钮节点，保持滚动和焦点。 |
| [Chrome Android 视口行为](https://developer.chrome.com/blog/viewport-resize-behavior) | 软键盘主要缩小 VisualViewport，布局视口不一定变化。 | 全屏控制层跟随可见视口，键盘、旋转和页面放大需要输入取消与布局复核。 |
| [WebKit：全屏安全区](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) | `viewport-fit=cover` 和四边 `env(safe-area-inset-*)`；全屏画面仍需保护交互。 | 游戏场景可铺满，按钮/菜单留安全区；后续明确实体设备验证限制。 |
| [MDN：Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API) | 页面于 2026-10-30 更新；API 支持检测、用户激活、状态事件和退出。 | 独立沉浸显示模式与浏览器原生全屏分别处理；用户手势发起请求，失败保留可用模式。 |
| [Google：OffscreenCanvas](https://web.dev/articles/offscreen-canvas) | 渲染可转移到 worker，但需要独立消息和生命周期。 | 本任务先修实际热点，不扩大为整个 WebGL 渲染线程迁移。 |

## 设计原则

沿用石器时代素材、海蓝面板与木/骨色按钮。移动端以大场景、拇指操作、短文本按钮和可滚动菜单为核心；桌面继续完整 800×600。新增模式须独立选择、可恢复传统显示，不拉伸人物，不修改服务端坐标或放宽业务校验。

战斗优化采用可解释的合法行动与协作优先级，依据已有回合数据；不引入模型推理、外部 AI 服务或随机业务捷径。
