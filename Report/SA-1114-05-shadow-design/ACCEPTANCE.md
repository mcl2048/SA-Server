# 莉莉丝与 Lisarido 阴影／贴地修整

两宠使用新的独立v2素材目录。莉莉丝保持原角色高度与漂浮姿态；Lisarido保持原98px主体尺度，将脚底约20px的悬空校准至地面。投影采用近黑色、alpha145、46–56px方向宽度与12px厚度，软边0.7px。投影及地环先合成在地面，再叠加身体，不随受伤／死亡旋转。白毛和发丝的半透明边沿使用内部颜色外延减轻JPG灰边。

## 已验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 地面投影、漂浮与足底行为 | 3项通过；修正前4处失败 | `art-red.txt`、`art-green.txt`、`art-regression.py` |
| 角色逐帧完整性 | Lilith 208帧；Lisarido 232帧；均非空、未越160px逻辑画布 | `final-assets.json`、`validate-assets.py` |
| 动画兼容 | 两宠各64动作的ID／方向／帧ID／时长与v1相同；图号和锚点不变 | `final-assets.json` |
| 特效兼容 | 两个特效PNG分别与v1逐字节相同，保持28／24特效帧 | `final-assets.json` |
| 安装器 | 各41项通过，覆盖新装、已安装重清旧、残缺已知旧包、未知／修改／链接保护、新包错误时保留旧包 | `lilith-installer-green.json`、`lisarido-installer-green.json` |
| 本地真实升级与幂等 | 两个v2各5文件摘要正确，已知v1均删除，重复安装不改mtime | `local-install-verification.json` |
| 视觉审阅 | 八向前后、待机／攻击／死亡与dir3／7放大关键帧；浅色原生地面上黑影明确可辨 | `index.html` |

## 产物

- `update/lilith-v2-assets.tar.gz`：5510538字节，SHA256 `4898c80869ea091dc1da43bcff4f25b6d6189f7b174b1a23b577dd7477adfe3f`。
- `update/lisarido-v2-assets.tar.gz`：2711868字节，SHA256 `92524b93ae85a88973f3fce4cd8328fb126f064f65097e19448b647b3a7b09ae`。
- 各包另有逐文件manifest、Shell／Python安装器、可重现生成与打包脚本。v1 manifest须保留在发行包中供安全识别旧目录。

## 范围与限制

以上PNG、GIF是从真实素材图集读取后生成的离线审阅图，带原生地面的图片同样是合成对照，不冒充实战截图。此报告验证素材生成、动作契约、升级与合成效果；最终ELF、客户端v2目录选择、原生战斗、移动横竖屏及发行ZIP由主代理整合验证。没有使用图像生成API，没有重做角色设计，艺术审阅不作绝对完美承诺。

复现：使用带Pillow／NumPy的Python运行两生成器，输出到`/tmp/sa-pet-shadows-build/extensions/{lilith,lisarido}-v2`，再运行相应`update/package-*.py --source ...`；运行本目录`validate-assets.py`与`art-regression.py`、仓库`scripts/update-{lilith,lisarido}.test.sh`。
