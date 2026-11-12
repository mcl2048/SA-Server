# SA-1112-01 验收记录

本次交付 v0.2.4-LYNX，集成与原二进制对应的上游 v0.2.3 源码，保留桌面原场景，增加手机可读操作界面。最终文件 `bin/saserver` 为静态 Linux AMD64、Go1.27.3、CGO=0、0755，大小 15,098,016 字节，SHA256：

```text
ec8cfb0204227ab449f841e0c16902abcddc0539d22e9811215abc217a5a63b8
```

## 结果与证据

| 范围 | 结果 | 证据 |
|---|---|---|
| 源码与资源基线 | 原 ELF 对应上游 b28455eb… / v0.2.3；官方资源 1,233,027,874B 校验后使用 | SOURCE-BASELINE.json、ASSETS.json |
| 最终二进制内嵌客户端 | 隔离运行目录没有 client/；实际 HTTP 返回 HTML+35 个模块与交付文件逐字节一致 | binary-http-verification.json |
| 手机实际操作 | 18 组验收断言通过，页面异常 0 | browser/acceptance.json、acceptance.log |
| 最小宽度与NPC | 320×740 注册、建角预览、地图按钮，NPC实际对话与触摸取消通过，页面异常 0 | browser/extras.json |
| 桌面实际操作 | 原鼠标注册、建角、进入游戏、五个画布菜单和键盘聊天、窄桌面，共4组通过 | browser/desktop.json |
| 桌面视觉 | 1440×900 中登录美术区域691,200像素与原版登录截图完全一致 | browser/desktop-pixel-comparison.json |
| 客户端 | 14个测试条目通过（含原寻路脚本8条断言）；完整TS5.9.3 noEmit通过 | client-final-tests.log、typescript-final.log |
| Go | 完整非race套件238个测试通过，完整vet通过；最终嵌入文件就绪后HTTP相关包再通过 | go-tests.jsonl、server-final-tests.log |
| 数据竞争检查 | 仅 cmd/saserver 和 webclient 两包race通过，未宣称全套race | server-race.log |
| 构建输出 | 同一输入连续构建网页，HTML和35模块哈希相同；源文件和二进制冻结记录 | client-build-repeatability.json、FINAL-INPUTS.json |

## 真实浏览器操作

使用实际 Chromium、Playwright、CDP 触摸输入、SwiftShader WebGL2，连接真实 Go 服务、SQLite、WebSocket 与完整官方游戏资源。浏览器版本写入 acceptance.json。手机主视口390×844、DPR3，另测320×740、360×800、430×932、844×390、768×1024和恢复竖屏；桌面1440×900与窄窗口390×844。

实际注册、选线、建角和进入地图通过可见输入与按钮完成。`seed.py` 在独立临时数据库创建测试账号；完成注册后，仅在该临时配置授予测试账号GM权限，以真实聊天命令生成物品、宠物、传送位置和战斗。交付配置、游戏数据、原运行数据库未更改。调试对象只读取状态；没有通过 evaluate 调用发包、伪造战斗或直接改人物位置。

覆盖内容：

- 可读输入、原节点身份与焦点保持、合成composition事件、可见视口缩小；不把该检查冒充实体软键盘验证。
- 登录、选线、建角；角色选择和创建保留只读画面预览。
- 状态、背包、宠物、任务、地图、系统进入与返回；物品真实名称与原生使用/装备动作；宠物真实列表。
- 实际聊天发送；按住方向按钮改变实际人物坐标，松开后停止，touchCancel后停止。
- 双指缩放/平移及剩余手指抬起没有产生Move指令或地图寻路目标。
- 横竖屏及不同尺寸、输出画布上限、手动桌面覆盖与自动恢复。
- 防御指令、攻击指令和目标选择发出原BattleCommand，真实战斗结束后返回地图。
- NPC交互显示实际对话，触摸“返回 / 取消对话”走原Escape取消处理。
- 桌面全部业务操作使用原画布鼠标热区、原输入框与键盘，未使用移动按钮代替桌面回归。

最终截图以 `browser/final-*.png` 命名。`mobile-login-first.png` 保留首轮布局失败证据，其余重复探索产物已移出交付目录。

## 首败与修复

1. 手机全屏面板最初依附零高度chrome容器，输入框落到844px以下：改为VisualViewport定位，并使用真实页面输入边界断言；最终可见。
2. 导入mobile-view影响原无DOM寻路测试：增加浏览器环境守卫，原测试不改动即可通过。
3. 方向按钮初版仅click设置方向，没有释放生命周期；修复pointer捕获、up/cancel/lostcapture/blur和键盘释放，真实CDP验证停止。
4. 原生聊天输入曾被面板状态隐藏；修正输入采用及发送按钮显示。固定文本映射、原热区文字取样避免按钮合并名称，去掉背景NPC/工具条文字，限制信息区滚动高度。
5. NPC面板首轮只有选项而缺少可见取消入口：补充触摸取消按钮，保持原取消协议，最终320px实测通过。
6. 整体类型检查发现上游残留类型错误：采用窄类型修正，比较类型擦除输出确认不改业务；已有战斗stat/icon协议缺项保持不变并披露。
7. 原构建时间戳导致同源输出变化，替换为内容哈希；生成代码去掉类型擦除残留行尾空格。
8. 浏览器脚本曾用错误按钮文案、BattleCmd名称和过早的回合完成条件，以及在低帧率下过快连续点击：修正测试定位、真实BattleCommand断言及渲染/回合就绪同步；没有放宽游戏断言或修改游戏规则来使其通过。

## 审查与验证命令

移动基础、面板和服务端由明确文件所有权分工实现，另作跨模块只读审查；服务端审查者此前参与该模块实现，因此其报告明确称二次审查，并未包装为独立作者安全审计。

```bash
node --experimental-strip-types --test client/test/*.test.*
npm exec --yes --package typescript@5.9.3 -- tsc --noEmit --allowImportingTsExtensions --module esnext --moduleResolution bundler --target es2023 --lib es2023,dom,dom.iterable client/src/main.ts
# 在server目录
go test -mod=readonly -p=1 -json ./... -count=1 -timeout=600s
go vet -mod=readonly -p=1 ./...
go test -race -count=1 -p=1 ./cmd/saserver ./webclient
# 在仓库根目录
scripts/build-linux.sh
sha256sum -c bin/saserver.sha256
```

构建程序不需要TypeScript npm依赖，npm exec仅用于本次额外类型检查。完整源码依赖与上游相同。Go build-info的vcs.revision来自交付仓库构建时HEAD，且modified=true，不能将其当作上游源码提交；两种来源分开记录。

## 运行与限制

默认二进制提供内嵌网页；`client: ./client`可显式选择外部客户端。仍需config、gamedata和单独的assets；本次已在本机准备校验后的资源，但没有把1.23GB资源归入Git。运行步骤见根README和docs/手机适配.md。

本次为Chromium模拟浏览器验收，没有实体iPhone/Android或Safari验收，没有声称全部NPC分支、道具、社交和管理员功能均经逐项手工验证。安全区使用env规则但未以实体刘海屏验证；IME为合成事件和节点稳定性验证。上游少数战斗stat/icon提示协议缺项及Safari部分Opus兼容限制仍存在。128MiB是移动纹理淘汰目标，不是总内存硬上限。
