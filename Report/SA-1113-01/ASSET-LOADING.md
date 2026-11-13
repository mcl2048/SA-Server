# 四机械宠增量资源加载

## 范围

生产改动仅为 `client/src/assets.ts`；测试为 `client/test/assets-extension.test.ts`。本子任务不修改原 `assets/manifest.json`、`assets/index.bin.gz`、官方压缩包或 `server/tools/assetindex`。实际机械宠插画、扩展文件生成、安装和最终浏览器视觉验收由对应任务负责。

## 原资源检查

读取 `/home/coder/TMP/assets-v0.2.3.zip`（1,233,027,874 字节，9,720 项）及当前原二进制索引，确认原包共2,051个动画，编号范围100000–106193，最大图像编号1000927。四个新动画编号199100–199103均未被占用。

原索引的图像页为16位字段，动画帧图像编号为32位字段。因此新资源不追加到旧索引，也不扩大原 `SETS` 数组，而使用独立的JavaScript映射及运行时集合2。

原始文件检查时SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `assets/manifest.json` | `cc2772d66aa11cab4da0c81387fc11418d231755b677d74aaa950846dcff2f7a` |
| `assets/index.bin.gz` | `fc46b250a92e69aa466a2e9c215cab16e69cd2253ba7e7e8d62d2dbb0d8e5664` |

## 扩展文件合同

入口为 `assets/extensions/ai-pets-v1/manifest.json`：

```json
{
  "format": 1,
  "id": "ai-pets-v1",
  "pages": [{"file": "pages/00000.png", "width": 2048, "height": 2560}],
  "images": [[9000000, 0, 0, 0, 160, 160, -80, -140]],
  "animations": [{"id": 199100, "file": "anim/199100.json"}]
}
```

该片段用于说明字段，完整清单必须列出199100–199103四个动画。`images`每行依次为图像编号、清单内页索引、x、y、宽、高、锚点x、锚点y。图像编号允许9000000–9099999；页面仅允许包内 `pages/<文件名>.png`，动画文件必须为 `anim/<动画编号>.json`。不允许目录跳转或绝对路径。

动画JSON沿用原 `AnimDef`：

```json
{"id":199100,"actions":[{"dir":0,"type":3,"ticks":6,"frames":[[9000000,0,0,0]]}],"pages":["ai-pets-v1/0"]}
```

帧数组为图像编号、绘制偏移x/y和事件编号。加载器从实际帧引用推导页列表，不信任JSON提供的页路径。支持原来的方向、动作、节拍和freeze规则。美术合同要求每宠八方向、站立/行走/攻击/防御/受伤/倒地/手部/投掷八类动作，至少192帧；实际文件整合测试会逐一检查。

每页最大4096×4096，整包总像素数最多32×1024×1024。正式四张2048×2560页面合计20,971,520像素，在限制内；按RGBA8计约80MiB显存。

## 原子加载与降级

`Assets.init()`完成原清单、地图表、调色板和SAIX/JSON基础索引后，尝试加载可选扩展。缺少清单的404静默忽略；坏格式、编号冲突、超时或纹理解码失败只发一次扩展警告，不使原启动失败。

扩展使用总计5秒期限。只有四份动画和清单内全部PNG解码成功、纹理尺寸与清单相同后，才一次注册图像、页路径和动画。失败时成功解码的兄弟纹理回滚；超时立即释放已完成纹理，随后迟到的纹理也释放，避免后台加载占住显存。

运行时图像映射优先于旧索引，独立页键为 `2/<页索引>`。PNG使用非索引纹理，并进入原有显存预算和淘汰机制；动画再次访问时会从扩展PNG路径重新加载，不走原 `i8/rgba` 页目录。

缺包或坏包时，四个新动画编号统一使用原机暴100374作为可见降级。已直接读取实际SAIX并逐帧检查100374的所有帧存在。候选编号102166没有出现在当前官方动画索引内，因此未将其用作降级资源。重复访问不会请求不存在的199100–199103原动画JSON。

## `imageCanvas` 原始帧接口

接口为：

```ts
imageCanvas(mapNumber: number, rawIndex = false): Promise<[HTMLCanvasElement, number, number] | null>
```

默认仍将小于1000000的参数视为地图图号，高编号视为直接图像索引。`rawIndex=true`明确跳过地图图号转换，供动画帧、图鉴头像等用途。这样原机暴的小编号帧也可解码、缩放后使用 `ui.pic` 绘制；新9000000系列帧在默认或显式raw模式下均可解码。

返回画布保持原帧尺寸和透明度，另两个返回值仍为锚点。索引页使用原0号调色板、索引0透明；RGBA扩展页直接复制四通道，不读取调色板。解码后的ImageBitmap在绘制的finally中关闭，读取像素时使用仍然有效的OffscreenCanvas尺寸。

真实浏览器验收发现：`ImageBitmap.close()`会将位图宽、高置0，关闭后继续读取其尺寸会使`getImageData`抛出源宽度为0的错误，影响图鉴头像和光标解码。已改用画布尺寸，并让索引页与RGBA测试的假位图在close时同样清零宽、高，断言像素读取尺寸仍为原值；同时保留finally释放，绘制失败也不会漏关位图。

## 实际验证

执行：

```bash
node --test client/test/assets-extension.test.ts
npm exec --yes --package typescript@5.9.3 -- tsc --noEmit --allowImportingTsExtensions --module esnext --moduleResolution bundler --target es2023 --lib es2023,dom,dom.iterable client/src/*.ts
git diff --check -- client/src/assets.ts client/test/assets-extension.test.ts
```

最新结果：14项全部通过，零失败、零跳过，总计4.226秒；TypeScript全客户端检查和差异格式检查通过。正式美术文件已安装，真实四宠资源整合测试已自动激活并通过。此前资源包尚未落盘时该项曾明确跳过，未计作通过。

已通过的检查覆盖：

- 原SAIX图像、核心页、地图转换不变。
- 缺扩展清单及实际原索引降级动画可见，且请求去重。
- 基础索引缺失时的原JSON回退，以及该模式下独立扩展加载。
- 越界图像、非法编号、重复项、目录跳转、错误帧和原动画碰撞的整包拒绝。
- 坏PNG、解码尺寸不符、成功兄弟纹理回滚。
- 显存预算淘汰后从独立PNG路径重新加载。
- 5秒期限已完成和迟到纹理释放。
- `imageCanvas(0,true)`与默认地图图号29025映射同一真实索引帧，调色板透明和锚点相同；默认0不误作地图图号。
- 新扩展高编号在默认和显式raw模式下的RGBA、透明通道及锚点。

实际资源整合测试已读取真实清单、四份动画JSON和PNG的实际IHDR，核对RGBA格式、纹理尺寸、四个新动画成功注册、全部八方向×八动作及每宠至少192帧的图像引用，结果通过。该文件检查不替代真实WebGL绘制、动画表现与图鉴排版验收。
