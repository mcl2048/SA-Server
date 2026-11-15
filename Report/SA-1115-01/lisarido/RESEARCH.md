# 动作研究与实施依据

读取时间：2026-11-15 UTC；通过 curl 实际取得当前官方文档，非搜索摘要。

- [Blender 最新手册：Posing](https://docs.blender.org/manual/en/latest/animation/armatures/posing/index.html)，页面标记 Last updated on 2026-11-14。骨架姿态提供 Transform、Rest/Pose 与 IK 的分层组织；本次以固定肩关节施加局部旋转，不挪动整体人物或地影。
- [Godot stable：2D skeletons](https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html)，页面注明正在针对 4.7 更新。文档明确先拆出独立多边形部件、核对遮挡顺序，再使骨骼变换影响所属图层；不能只变换炮管纹理而把握炮手留在旧位置。

应用：为八向源图逐一标注身体右炮臂的肩关节、完整部件掩膜及真实炮口轴；预备→抬臂瞄准→开炮后坐→收势使用同一变换。枪口闪光由变换后的炮口位置导出。保留既有 160px 逻辑画布、图像/动作编号、帧数与 ticks、固定地面影子、非攻击动作以及独立电磁爆炸特效。

这些资料用于方法选择，不证明艺术质量。最终仍需逐向预览、实际战斗帧和升级包验证。
