# 四机械宠增量素材包与 Linux 安装器审查

## 负责范围

仅新增 `update/**`、`scripts/update-assets.test.sh` 和本报告。没有修改服务端/客户端业务源码，没有构建二进制，没有上传官方基础资源包。素材由独立美术任务生成后，按指定9文件合同制作增量归档。

## 安装合同

入口为 `update/install-ai-pets.sh`，从任何工作目录执行均按脚本目录定位；默认目标为脚本上级的 `assets/`。完整仓库内缺少默认 `assets/` 时才可创建；`--assets DIR` 必须显式指定已存在且末级名为 `assets`（不区分大小写，允许 `Assets`）的真实目录。默认执行先检查 `config.yaml` / `config.local.yaml` 顶层 `assets` 标量；覆盖到其他目录时拒绝修改默认目录，提示人工核对后使用 `--assets`。该检测不充当完整YAML解析器：对复杂合并、别名、多文档或不明确标量保守失败，不执行任何配置内容。

Linux Bash脚本调用同目录Python标准库助手，需要Python3.9+，不依赖第三方包、网络、sudo或系统服务管理。默认安装不会移动、删除或覆盖基础资源，只增加 `assets/extensions/ai-pets-v1/`。

校验清单字段：`schemaVersion=1`、`packageId=ai-pets-v1`、`targetRoot=assets/extensions/ai-pets-v1`、`installPrefix=extensions/ai-pets-v1`。`archive` 含文件名、字节数和SHA-256；`entries[].path` 相对 `assets/` 根目录，另带大小和SHA-256。

tar内只允许以下普通文件，无目录条目：

- `extensions/ai-pets-v1/manifest.json`
- `extensions/ai-pets-v1/pages/00000.png` 至 `00003.png`
- `extensions/ai-pets-v1/anim/199100.json` 至 `199103.json`

写入前先验证完整压缩包、精确文件白名单、每条大小和SHA-256。拒绝绝对/父级路径、重复、未知成员、符号链接、硬链接、设备和稀疏文件。目标及各级父目录、扩展目录中的符号链接均拒绝；压缩包和清单也拒绝符号链接。压缩大小和文件合计分别上限100MiB，并在解析tar元数据前有界解压，防止异常膨胀。

在 `assets/extensions/` 内暂存校验过的全部资源后，单次同文件系统目录重命名发布完整扩展，比逐文件复制避免了半更新manifest/图片。对目标assets目录加协作锁，避免同安装器并发抢占。异常仅清理本次创建且经过路径核验的临时目录，不清理已安装扩展。已有扩展若9文件全同则幂等；冲突、缺文件或未知文件均保留现状并退出，不提供强制覆盖。

哈希清单是完整性/防错机制，不是独立签名；需从可信提交取得包与脚本。脚本不停止游戏服务。仅补装素材后刷新网页重新加载扩展即可；同时替换 `bin/saserver` 时，才需由管理员按SIGTERM正常存档停服流程重启，以启用新程序及新宠注册。

## 已执行验证

- `bash -n update/install-ai-pets.sh scripts/update-assets.test.sh`：通过。
- Python语法编译：通过；生成的`__pycache__`已从交付目录清理。
- `bash scripts/update-assets.test.sh`：最终29项全部通过；包括有界解压及配置覆盖/大小写目标/复杂YAML保护，退出码0。
- 所有集成测试使用独立 `/tmp/sa-ai-assets-test-*` 夹具，不操作仓库真实素材；结束核验临时目录位置后清理。

用例涵盖默认相对路径、任意工作目录、九文件安装、原素材保持、重复执行与修改时间保持、冲突和不完整扩展不覆盖、显式目标、错误目录和缺失目录、各层符号链接、恶意tar父路径/绝对路径/未知成员/符号链接/硬链接/设备/目录条目、缺失/重复文件、归档篡改、单文件哈希不匹配、清单越界、压缩包符号链接及解压体积限制。

## 实际素材归档

最终9个真实文件来自独立美术任务已冻结的 `/tmp/sa-ai-pets-build/extensions/ai-pets-v1`，全部SHA-256逐项匹配 [美术验证](art/validation.json)。源扩展manifest摘要为 `0328cbe83aea72875db3a7fe401a768296b3393ce244b28c93117b8e2047826b`。四张RGBA图集均为2048×2560，动画199100–199103合计768个图像帧；包中没有基础官方图集或官方ZIP。

| 交付 | 实际结果 |
| --- | --- |
| 压缩包 | `update/ai-pets-v1-assets.tar.gz` |
| 字节数 | 6,941,740 |
| SHA-256 | `7700e6921d57cc59140de25c4cee16e2963190c9a84fb38a6412453e9de437e5` |
| 外部校验清单 | `update/ai-pets-v1-assets.manifest.json`，完整列出9个路径、大小和SHA-256及归档摘要 |
| 运行时安装 | `/home/coder/saserver/assets/extensions/ai-pets-v1`，9文件实际校验通过 |
| 重复安装 | 成功识别已安装；所有资源修改时间保持不变 |
| 重复打包 | 由已安装资源重新生成的tar.gz与校验清单均逐字节相同 |

真实安装从 `/` 工作目录显式执行 `bash /home/coder/saserver/update/install-ai-pets.sh --assets /home/coder/saserver/assets`；随后从 `update/` 重复执行。安装前后基础目录顶层文件 `README.txt`、`index.bin.gz`、`manifest.json`、`palettes.png`、`tiles.json` 的字节数与SHA-256完全不变。其中原索引SHA-256为 `fc46b250a92e69aa466a2e9c215cab16e69cd2253ba7e7e8d62d2dbb0d8e5664`，原manifest为 `cc2772d66aa11cab4da0c81387fc11418d231755b677d74aaa950846dcff2f7a`。详细逐文件证据见 [install-validation.json](../../update/install-validation.json)。

实际安装后执行 `node --test client/test/assets-extension.test.ts`：**14项全部通过**，包含四宠真实包全部768帧解析、原本地索引回退、扩展原子注册、纹理失败回滚及高编号RGBA图像解码。该结果只声明资源加载测试；真实游戏浏览器验收由主整合任务另行执行。

本分支没有修改美术源、客户端/服务端业务逻辑或构建发行二进制。原运行时 `assets/**` 仍被Git忽略；应提交的是 `update/` 增量归档与安装器。
