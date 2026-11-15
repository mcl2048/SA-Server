# 新宠物增量素材升级

本目录分发机械宠、莉莉丝、雷萨利朵与双爪宠物的独立素材包，不包含官方基础资源包。当前版本为v0.2.19-LYNX；四宠更新及自动清旧方法见本文后半部分。机械宠目录如下：

```text
assets/extensions/ai-pets-v1/
├── manifest.json
├── pages/00000.png … 00003.png
└── anim/199100.json … 199103.json
```

## Linux 直接升级

在服务器拉取更新后执行：

```bash
git pull
cd update
bash install-ai-pets.sh
```

脚本总是以自身目录定位，默认目标为 `update/../assets`，与调用时工作目录无关。它先保守检查 `config.yaml` 和 `config.local.yaml` 的顶层 `assets` 覆盖值；如果配置实际指向其他目录，默认执行会退出并提示 `--assets`，不会把素材误装进默认目录。普通单/双引号和注释可以识别；复杂YAML合并/别名/多文档等不做猜测，要求显式指定路径。也可从其他目录执行脚本的完整路径。需要 Linux、Bash 和 Python 3.9+；不需要安装第三方 Python 包。脚本不会下载资源、调用 sudo 或修改系统配置。

如果服务器明确使用其他素材目录，先确认该目录是已存在的真实 `assets` 目录，再显式指定：

```bash
bash /srv/saserver/update/install-ai-pets.sh --assets /srv/stoneage/assets
```

为防止选错路径，末级目录名必须是 `assets`（大小写不敏感，允许服务器已有的 `Assets`）；显式目标必须已存在。目标或其任一父目录、`extensions` 或本扩展目录中含符号链接时拒绝安装。默认目标缺失时，只允许在具有 `server/`、`client/`、`config.yaml` 的本仓库根目录下创建 `assets/`。这只安装新增扩展，不能代替首次部署所需的官方基础素材。

## 机械宠增量包

- 文件：`ai-pets-v1-assets.tar.gz`
- 大小：6,941,740字节
- SHA-256：`7700e6921d57cc59140de25c4cee16e2963190c9a84fb38a6412453e9de437e5`
- 仅含4张图集、4个动画JSON及1个扩展manifest，共9文件。

## 校验和原素材保护

`ai-pets-v1-assets.manifest.json` 是独立校验清单，包含包名、目标目录合同、归档字节数/SHA-256，以及每个文件的相对路径、字节数和SHA-256。条目相对 `assets/` 根目录，例如 `extensions/ai-pets-v1/pages/00000.png`。

安装器在写入前完成：

1. 校验归档大小和SHA-256；校验清单只允许指定的9个文件。
2. 逐条检查tar成员；拒绝绝对路径、`..`、重复成员、未知路径、目录成员、符号链接、硬链接、设备文件及稀疏文件。
3. 校验每个文件的实际大小与SHA-256；归档与解压总量分别不得超过100 MiB。
4. 在目标 `assets/extensions/` 内创建独立临时目录，只写这9个新文件，然后一次原子重命名发布整个 `ai-pets-v1/`。不会先发布新manifest再等待图片复制。

原有 `assets/manifest.json`、基础图集、原动画以及其他扩展都不会被移动、删除或覆盖。临时目录是唯一会被自动清理的目录；安装失败不会删除已有扩展。

重复执行时，如果已有扩展的9个文件全部与清单相同，则报告“已安装”并保持文件及修改时间。若发现已有扩展内容不同、缺文件或有未知文件，脚本会报错退出并保留现状，不提供自动强制覆盖参数。请先检查并人工备份发生冲突的整个扩展目录，再决定是否重新安装，不要直接删除原素材。

仅补装此素材包时，HTTP素材文件会直接可用，刷新网页即可让客户端重新读取扩展。若本次升级同时替换了 `bin/saserver`，则需要按正常SIGTERM停服存档流程重启服务，以启用新宠注册与新程序。脚本只安装素材，不自动停止服务或替换二进制。

这些哈希用于防止归档损坏和安装错误，不是独立数字签名。请从可信的仓库提交取得脚本、归档和校验清单。

## 维护与复现

部署和验证证据保存在 `install-validation.json`；其中绝对路径只描述本次开发验收环境，不会被安装器用作部署目标。

生成素材后可在开发环境重建归档：

```bash
python3 update/package-ai-pets.py --source assets/extensions/ai-pets-v1
bash scripts/update-assets.test.sh
```

生成器只读取该扩展的指定9个文件，拒绝符号链接和额外文件。tar按路径排序、固定权限/所有者/时间戳，gzip不写当前时间或原始文件名；相同文件字节产生相同归档。它不会把官方素材压缩包或整个 `assets/` 纳入提交。

运行时 `assets/**` 已被仓库忽略；应提交的是本目录的增量归档、校验清单、安装器和说明。校验结果与实际归档摘要见 [升级包审查记录](../Report/SA-1113-01/UPDATE-REVIEW.md)。

## v0.2.18 四宠图包与自动清旧

在仓库根目录依次执行：

```bash
bash update/install-primal-claws.sh
bash update/install-lilith.sh
bash update/install-lisarido.sh
```

自定义素材目录时，为每个命令添加 `--assets /实际路径/Assets`；路径必须真实存在，末级名为assets或Assets。脚本只安装素材，不停止服务或替换二进制。

| 安装器 | 当前目录／归档前缀 | 自动清理的已知旧目录 | 新包文件数 |
| --- | --- | --- | --- |
| install-primal-claws.sh | primal-claws-v3 | primal-claws-v1、primal-claws-v2 | 7 |
| install-lilith.sh | lilith-v2 | lilith-v1 | 5 |
| install-lisarido.sh | lisarido-v2 | lisarido-v1 | 5 |

各图包归档为`<前缀>-assets.tar.gz`，归档与逐文件摘要见同名前缀的`-assets.manifest.json`。发行ZIP同时携带四份旧版manifest用于识别可删除文件，不要求重新安装旧图包。

三个安装器均先验证新归档摘要、精确白名单、路径／链接和解压总量，暂存后原子发布，并复核新版完整性，再清理旧包。已有新版也会清理旧残留，重复运行不重写新版、保持mtime。旧目录只删除与旧发行清单摘要一致的文件；可处理部分已知文件缺失的残留。未知文件／目录、修改内容和链接报错并保留；损坏新包或新版冲突时不会先删除旧包。基础资源和其他扩展不进入清理范围。

必须同步更新匹配的`bin/saserver`，使用外部client目录时同步新客户端。按正常SIGTERM停服存档流程重启服务，再刷新网页。仅删除旧目录无法让旧程序或已加载网页自动请求新目录。

### 双爪：比例、跑姿与地影

`extensions/primal-claws-v3/`含manifest、3张RGBA图集和3个动画JSON。角色199400／199401各376帧，共用红爪特效199402共24帧。v3按主体高度等比例校准八向体积，避免最长边限制导致横向缩水；萨鲁法斯跑步使用屈膝收腿、蹬地、前伸落脚与躯干俯仰，修正前腿／足掌分层，双爪均加入固定地面影。图号、动作、ticks与特效兼容。

用户img1／img2匹配旧v1默认战斗方向，进一步检查v2也发现独立的侧面缩小问题；不能只把截图问题归因于未升级。三版对照及实战见[截图与角度复核](../Report/SA-1114-05-angle-followup/index.html)。

### 莉莉丝与雷萨利朵：阴影、足底与边缘

`extensions/lilith-v2/`含manifest、两张RGBA图集和动画199200／199201，共5文件；208角色帧、28特效帧。保留漂浮高度，移除原图残留地环，独立地面暗影与金环不随身体受击旋转。

`extensions/lisarido-v2/`同样5文件，动画199300／199301；232角色帧、24特效帧。主体保持98px，校正脚底与地面关系，追加地影并修整边缘。两宠保持原技能特效PNG和动作契约；设计图与实际程序证据见[阴影设计报告](../Report/SA-1114-05-shadow-design/index.html)。

### 开发复现

生成器需Pillow／NumPy；安装器仅需Python标准库。源JPG和分层生成脚本均在仓库，未调用图像生成API。

```bash
python3 scripts/generate-primal-claws.py --output /tmp/sa-primal-claws-build/extensions/primal-claws-v3
python3 update/package-primal-claws.py --source /tmp/sa-primal-claws-build/extensions/primal-claws-v3
python3 scripts/generate-lilith.py --output /tmp/sa-lilith-build/extensions/lilith-v2
python3 update/package-lilith.py --source /tmp/sa-lilith-build/extensions/lilith-v2
python3 scripts/generate-lisarido.py --output /tmp/sa-lisarido-build/extensions/lisarido-v2
python3 update/package-lisarido.py --source /tmp/sa-lisarido-build/extensions/lisarido-v2
bash scripts/update-primal-claws.test.sh
bash scripts/update-lilith.test.sh
bash scripts/update-lisarido.test.sh
```

历史v0.2.14／v0.2.15采用lilith-v1／lisarido-v1；v0.2.17采用primal-claws-v2旁装保留v1。当前安装器已升级为上表的新装与清旧流程。可复用的八向、关节、阴影和验证要求见[stoneage skill](../docs/skills/stoneage/SKILL.md)。


## v0.2.19 雷萨利朵抬炮臂

`bash update/install-lisarido.sh`安装`lisarido-v3`。预备时以肩关节抬起完整右炮臂，指向敌方后开火，炮焰位置由实际炮口变换得到，最后收势回原位。图号／宠物编号／时序兼容；完成新包校验与发布后，按附带v1/v2清单清理已识别旧图包。未知、修改或链接内容保留并报错。源码生成、角色与特效文件由`update/package-lisarido.py`的当前版本声明决定。
