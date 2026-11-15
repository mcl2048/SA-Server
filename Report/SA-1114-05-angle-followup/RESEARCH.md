# 修改前资料与采用范围

2026-11-14在实现安装器修正前读取以下官方资料：

- MDN：[CanvasRenderingContext2D.drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage)。源矩形与目标矩形分别定义；核验战场实际绘制宽高比是否维持图像比例，不能只检查素材外框。实际客户端为WebGL，采用的是相同的源／目标矩形检查思路，并未替换渲染器。
- Pillow官方：[Image module](https://pillow.readthedocs.io/en/stable/reference/Image.html)。使用RGBA原始帧、等比例resize和裁切组合图；保留原始方向及脚部纹理，不对骨架再次横纵独立拉伸。

截图逐帧匹配用于区别旧v1和校正v2的可见像素，不以相关系数单独证明远端程序版本。清理采用先安装校验新包、后按旧发行清单识别并删除旧包的次序；路径／链接／未知内容保护与原有安装器保持一致，使用Python标准库完成。没有调用外部图像生成API，也没有新增游戏原画。

- 后续跑姿需求采用[Blender IK官方说明](https://docs.blender.org/manual/en/latest/animation/armatures/posing/bone_constraints/inverse_kinematics/introduction.html)的末端驱动／关节约束思路，结合本地原生金格萨贝鲁9帧跑姿（ticks=2）分解。实现为二维源图纹理两段变换，不添加Blender运行依赖。
