# 新宠物增量素材升级

本目录分发新增机械宠、莉莉丝与雷萨利朵的独立素材包，不包含或替换官方基础资源包。机械宠安装后的目录固定为下列路径；莉莉丝的独立目录与安装方法见本文末节。

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

## v0.2.14 莉莉丝增量包

```bash
bash update/install-lilith.sh
# 自定义目录须真实存在，末级名为assets或Assets：
bash update/install-lilith.sh --assets /srv/stoneage/Assets
```

独立目录 `extensions/lilith-v1/`：`manifest.json`、`pages/00000.png`、`pages/00001.png`、`anim/199200.json`、`anim/199201.json`，共5文件。包名 `lilith-v1-assets.tar.gz`，摘要和条目见同目录 `lilith-v1-assets.manifest.json`。安装的路径校验、符号链接拒绝、逐文件校验、冲突保留与原子发布规则与上文一致；不会更改原四宠扩展或官方素材。

原生客户端加载独立RGBA set3，角色208帧、幽蓝骷髅火焰28帧；未安装时保留原资源回退。绘制使用用户提供的JPG和可复现Pillow/NumPy位图脚本，没有调用图像生成API。

开发复现（需Pillow与NumPy；部署安装器仅需Python标准库）：

```bash
python3 scripts/generate-lilith.py --output /tmp/sa-lilith-build/extensions/lilith-v1
python3 update/package-lilith.py --source /tmp/sa-lilith-build/extensions/lilith-v1
bash scripts/update-lilith.test.sh
```

## v0.2.15 雷萨利朵增量包

```bash
bash update/install-lisarido.sh
# 自定义目录须真实存在，末级名为assets或Assets：
bash update/install-lisarido.sh --assets /srv/stoneage/Assets
```

独立目录 `extensions/lisarido-v1/` 含manifest、两张RGBA图集及动画199300/199301，共5文件；归档为 `lisarido-v1-assets.tar.gz`，每项摘要见同名manifest。角色232帧、单体电磁爆炸24帧，主体98px，与莉莉丝一致。源JPG、可复现Pillow/NumPy分层与位图特效生成脚本留在仓库；没有调用图像生成API。

三个素材安装器均已修正USTAR结束块后向10240字节记录补齐的精确解压上限，避免合法包在记录边界被误拒绝；仍在写入前完成摘要、精确白名单、路径、链接及总量检查，冲突保留，幂等安装。

```bash
python3 scripts/generate-lisarido.py --output /tmp/sa-lisarido-build/extensions/lisarido-v1
python3 update/package-lisarido.py --source /tmp/sa-lisarido-build/extensions/lisarido-v1
bash scripts/update-lisarido.test.sh
```

## v0.2.17 萨鲁法斯／克劳德斯增量包

```bash
bash update/install-primal-claws.sh
bash update/install-primal-claws.sh --assets /srv/stoneage/Assets
```

独立`extensions/primal-claws-v2/`含manifest、3张RGBA图集、3个动画JSON，共7文件。角色199400／199401各376帧，共用十字红爪特效199402共24帧；使用上传JPG的八个真实方向、局部关节分层和位图特效，无图像生成API调用。档案与逐文件SHA-256见`primal-claws-v2-assets.manifest.json`。

路径／符号链接拒绝、摘要与精确白名单验证、冲突保留和原子发布规则同上。该扩展独立于此前三个包，不改基础素材。部署仅需Python标准库，开发复现需要Pillow／NumPy：

```bash
python3 scripts/generate-primal-claws.py --output /tmp/sa-primal-claws-build/extensions/primal-claws-v2
python3 update/package-primal-claws.py --source /tmp/sa-primal-claws-build/extensions/primal-claws-v2
bash scripts/update-primal-claws.test.sh
```


v0.2.17修正原图拉伸与战场足底定位，优化侧面关节与动作。v2与旧v1并存，安装器不会覆盖或删除v1；新程序只加载v2。必须一并更新 `bin/saserver`（或完整重新构建客户端），正常保存停服后重启、刷新网页。仅安装v2而继续运行v0.2.16程序不会切换至新素材。其他三组扩展不受影响。
