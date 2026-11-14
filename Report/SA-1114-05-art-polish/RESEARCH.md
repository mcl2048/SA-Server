# 修改前资料与实现依据

2026-11-14 已读取官方文档（HTTP 200）：

- Pillow ImageOps：<https://pillow.readthedocs.io/en/stable/reference/ImageOps.html>。contain 的单一比例缩放保留源图宽高比，避免把不同姿态塞入同一参考外框。
- MDN Canvas imageSmoothingEnabled：<https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled>。本项目使用WebGL原生图像尺寸；失真在离线素材生成处产生，不能依靠浏览器平滑开关修复。

采用离线确定性Pillow分层修整，保留用户提供原图及八向朝向，不调用外部图像生成服务。研究与原生资源对比先于生产修改；回归同时验证原图比例、足底锚点、裁边还原、实际战场绘制和移动屏幕。
