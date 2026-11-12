# SA-1112-01 · 平台依据与实施边界

修改前读取原发布README、实际JS和Go build-info；确认上游v0.2.3提交b28455eb9e25033ded04bd5ac43f6f143b26e6be。保留SA-Server提交36b8c89及其前置历史，以对应版本源码渐进整合，不混入上游后续游戏规则。

- [MDN Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)：统一触摸/笔输入，pointer capture、cancel/lostcapture/失焦释放；避免兼容鼠标重复处理。桌面原鼠标路径保持。
- [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)：移动端软键盘改变可视视口，不一定改变布局视口；仅移动根容器跟随可视尺寸及偏移，保留浏览器外部缩放。
- [W3C WCAG2.2 Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)：增强目标44×44CSSpx作为常用操作设计基线，不因此宣称全产品通过AAA。
- [官方v0.2.3发布元数据](https://api.github.com/repos/OpenGameSys/stoneage-web/releases/tags/v0.2.3)：assets-v0.2.3.zip1,233,027,874B，SHA256d675799f8ba5cf1338c6c32e0bca788076a4da4ab990a5f8234ef7bcbeff2baf。首次网络截断963,227,969B的hash不匹配，未使用；Range续传后长度/摘要确认再解压。9720条目包含assets/前缀，防路径逃逸解压。

实现约束：设备能力+尺寸判断，可手动覆盖；桌面800×600/4:3/快捷键/右键原路径；移动地图近景与可读DOM操作层分开。DOM控件复用当前游戏状态生成的有效操作及原业务入口，不直接伪造网络业务绕过验证。地图命中按实际场景矩形转换，双指手势不触发走路；原输入DOM移动而非复制密码值/监听器。

最终交付前必须操作真实完整游戏：仅几何/DOM样例测试不满足验收。Chromium触摸模拟不冒充真实iOS/Android硬件。模拟软键盘只能证明布局逻辑，实际IME/浏览器环境差异独立披露。
