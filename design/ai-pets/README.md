# AI机械宠物：原创几何、方向和动作源

造型与全部动作由 [scripts/generate-ai-pets.py](../../scripts/generate-ai-pets.py) 直接绘制。这里的SVG是可编辑的静态三分之四视角输出；动作源是脚本内的部件、铰链和姿势参数，而不是把一张静态图整体平移。没有使用外部图像生成模型、付费接口或来源不明的图片。

- 199100 奥普埃：机械猫头鹰；金属灰和古铜、青绿观察透镜、层叠工具羽翼、稳定的机械爪。
- 199101 克劳德：机械寄居蟹；横向钳、六腿、厚钢螺旋发条壳和珊瑚橙核心。
- 199102 格鲁克：小型机械狐狸龙；银灰硬面甲、青色能量接缝、耳翼、四足和长节尾。
- 199103 吉米奈：单头双核机械迅猛龙；额头与胸口蓝金双核、长节状刃尾、双爪和较高的颈身比例。

运行环境使用现有 Pillow、Playwright/Chromium。生成：

```bash
/tmp/loft-hyraken-paas-venv/bin/python scripts/generate-ai-pets.py --preview
/tmp/loft-hyraken-paas-venv/bin/python scripts/generate-ai-pets.py
/tmp/loft-hyraken-paas-venv/bin/python scripts/generate-ai-pets.py --validate-only
```

默认运行素材只写 `/tmp/sa-ai-pets-build/extensions/ai-pets-v1`；不会修改原1.23GB资源ZIP、原manifest/index或原图集。发布打包与安装器由主整合任务处理。
