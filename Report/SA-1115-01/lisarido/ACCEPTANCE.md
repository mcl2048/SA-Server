# 雷萨利朵右炮臂 · 验收

已完成 Task 6：以固定肩关节抬起持炮右臂，握点与炮身协调瞄准，开炮后收势；火焰使用同一变换后的炮口位置。八向保留原图身体右侧，后向长发保留自然遮挡。没有烘焙额外世界位移。

| 验证 | 结果与证据 |
|---|---|
| 最终程序 | v0.2.19-LYNX，Linux AMD64，SHA-256 `c9118a90071366a2aedf38ef28cda70faa2e122792811a81d1be0caeb96aa8f4` |
| 实际 Chromium | 桌面1280×900、移动390×844触屏模拟，6项通过，浏览器错误0；普通攻击真实出击、新ATTACK帧、回位后HAND站定施放、原生电磁FX均由服务端事件与真实绘制四边形采样核对，见[browser/final-lisarido.json](browser/final-lisarido.json) |
| 运行结束 | 仅关闭本次私有实例；SIGTERM退出0，无超时，私有SQLite最终位置与退出前原生坐标一致 |
| 素材回归 | [5项艺术测试](art-green.txt)、[3项独立地影测试](ground-regression.txt)通过；先失败证据见[art-red.txt](art-red.txt) |
| 合同保持 | 256图像、64角色动作、图号/方向/帧ID/矩形/锚点/ticks不变；120待机/行走/受击/死亡/防守帧逐字节一致，112攻击/HAND/throw帧更新，24电磁特效PNG逐字节一致，见[art-validation.json](art-validation.json) |
| 可复现 | [5文件重复生成字节一致](generation-repeatability.json)，[离线包重建摘要一致](package-repeat.json) |
| 升级 | [42项安装器案例](installer-green.json)通过；先完整验证发布v3，再按旧清单识别清理v1/v2；未知/修改/链接旧内容和损坏新包保留现状；重复安装不改新版mtime |
| 实际本地安装 | [local-install.txt](local-install.txt)：v2→v3完成、按旧清单退役v2，重跑通过。客户端实际加载v3；assets未加入Git |

最终图包为 `update/lisarido-v3-assets.tar.gz`，2,435,124 bytes，SHA-256 `420b024dddea2d6c9f0dd8f530cb19dd9e2f64c0394df639d6ef24bf8c798750`。Linux离线升级入口为 `bash update/install-lisarido.sh [--assets DIR]`，部署时配套更新程序、外部客户端并刷新页面。

[八向动作分解](attack-eight-directions.png)、[八向循环](attack-eight-directions.gif)、[清晰瞄准姿态](aim-eight-directions.png)均是生产生成器的合成审阅图，不能替代真实程序截图。真实截图位于browser目录。

本轮没有进行实体Android/iOS/Safari认证，也不声明生产部署。旧相簿步骤属于上一轮图鉴发布范围：首次脚本仍假设575位于末页；有界翻页适配后遇即时按钮坐标采样超时，已保留两轮中间证据并收窄本轮验收到炮臂动作，未为该步骤修改业务源码、伪造页面状态或宣称相簿通过。最终核心路径使用独立私有账号、SQLite备份和正常GM/原生UI触发，未注入战斗事件或改写页面业务对象。
