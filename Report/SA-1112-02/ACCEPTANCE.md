# SA-1112-02 · 发行前审查与生产优化

本轮从 `43f63a2e54067ec973f97e710e9c13321e165755` / v0.2.4-LYNX 出发，完成独立代码审查、真实缺陷复现、窄修复和最终二进制复验。交付为 **v0.2.5-LYNX**，静态 Linux AMD64、CGO关闭，权限0755，15,114,400字节。未改变协议、游戏数据或SQLite结构。桌面保留原800×600、4:3场景和鼠标/键盘路径。

```text
SHA256 b7b08408cbf374971971c8ee275601c242d7c72350f1d1ece13bfecabe5f1e5c
```

审查结论：本轮已复现的问题均已修复并通过对应验证，可作为Linux发行候选交付。该结论限定于下述测试范围；不等同于实体设备认证、全游戏分支穷尽验证或无限负载保证。

## 风险与修复

原提交具体行号、优先级和复现方法见 [输入审查](INPUT-REVIEW.md) 与 [服务端/构建审查](SERVER-RELEASE-REVIEW.md)。两个子Agent分别审查交互与服务端/发行边界，主Agent审查性能、公共输入层和最终集成；发现问题后审查者也参与了其负责模块的修复，未将其描述为完全独立作者的最终审计。

| 问题 | 生产影响 | 本轮修复与证据 |
| --- | --- | --- |
| 手机面板取消只清方向，已有寻路仍继续 | 打开状态窗口后900ms又发4条Move；取消没有停止旧意图 | 清寻路和待交互目标；自动遇敌在手机面板下暂停。最终真实触摸后面板下0Move，原生AI启用后面板下700ms也0Move。 |
| 桌面模式控件吞掉keyup | 按方向后焦点移到“界面”再松开，游戏持续wantDir=6 | keyup继续到原全局释放处理；真实键盘事件复验wantDir=-1且停止。 |
| IME选词回车误提交 | 合成组合输入事件能发送真实Chat并关闭输入框 | InputBox捕获阶段隔离组合输入的业务按键，不调用preventDefault；isComposing、keyCode229和composition追踪三种路径均不提交，正常Enter恰好提交一次。 |
| 手机交易返回仅本地close | 自己窗口关了，对方窗口仍开、服务端交易状态保留 | 使用与原取消按钮相同的Trade cancel消息；最终双客户端均收到关闭，恰好发送一次取消。 |
| Linux SIGTERM直接终止 | systemd/container常用停服信号跳过在线保存流程 | 订阅SIGTERM，保留worldDone/队列排空等待；子进程在线测试和最终ELF实际浏览器在线停服均验证存档。 |
| JS no-cache没有有效验证器 | 每次刷新重新传输所有模块 | 弱SHA256 ETag；内嵌内容初始化时读取/计算一次，外部目录每请求重算以保留热更新；所有35模块实际网络条件请求304空正文。 |
| gzip;q=0误压缩、identity无Vary | 违反编码协商并影响共享缓存表示选择 | token/quality解析、大小写和通配符处理、Vary覆盖两种表示、HEAD/304不流出压缩尾；Go测试和最终HTTP真实连接验证通过。 |
| 废弃JS残留与未知static文件可进入embed | 已删模块继续发布，本地文件可能被打包进可下载ELF | 所有TS转换成功后重建专属dist；本地与CI共用stage-client白名单，未知文件/符号链接明确失败并保留原文件；4项隔离构建测试通过。 |

另外完善全屏面板及模式开关的安全区样式；实体设备安全区表现仍需实机复核。

## 性能优化证据

原UI采用立即模式逐帧登记，但手机DOM无需逐帧重写。现在比较实际呈现数据、视口和InputBox节点身份，未改变时跳过DOM同步；相同坐标的新输入节点仍会被收养，输入值/焦点不因缓存丢失。桌面提前跳过手机summary/actionLabels等派生工作。

在相同390×844触屏Chromium登录页、同一主机、静止1.5秒测量：

| 指标 | 原版 | 最终版 |
| --- | ---: | ---: |
| mobile-root子树DOM变更 | 761 | 1 |
| 样式重计算次数 | 182 | 0 |
| 布局次数 | 0 | 0 |

见 [before](browser/performance-before.json)、[after](browser/performance-after.json) 与 [测量脚本](browser/performance.py)。这是一个静止页面的局部测量，约99.9%的重复DOM变更减少；不是整机功耗或所有游戏场景FPS承诺。脚本时间/总任务时间受软件GPU、并行测试负载与采样影响，不据此宣称固定性能倍数。未增加UI定时节流，因此业务数据、节点更换及视口变化仍在下一帧处理。

## 最终二进制与HTTP

[构建日志](build.log)、[二进制HTTP核验](binary-http-verification.json)、[内容输入摘要](FINAL-INPUTS.json) 已保留。Node24 / Go1.27.3，`scripts/build-linux.sh`，`-trimpath -s -w`，Linux AMD64 CGO0；通过Go build info确认构建配置。二进制的VCS记录是构建前HEAD加modified，不冒充构建完成后的提交号。

- 最终ELF运行时无外部client目录，使用embedded；HTML及全部35个JS与本地构建文件逐字节相同。
- 重复客户端构建36个发布文件完全一致，见 [重复构建](client-build-repeatability.json)。
- 源码、配置、map、.git及README私有路径均404，GET/HEAD限制与nosniff保留。
- 35个JS分别验证identity/gzip/gzip;q=0条件请求返回304、空正文；首次identity模块总正文与重验证节省量见 [缓存证据](http-cache-verification.json)。缓存策略保持no-cache，不给任意版本query永久缓存。
- 最终GET/HEAD实测gzip、大小写GZip、gzip;q=0、显式排除优先于通配符；Vary存在，HEAD正文为空。ETag按解码内容使用弱验证器，避免gzip与identity强验证器混用。
- 配置、gamedata和官方assets仍外置；来源/资源SHA见原报告。没有资源包、运行DB或私密凭据纳入Git。

## 测试与真实操作

- 完整Go：**254个通过事件（含子用例），222个顶层测试，8包，0失败、0跳过**；全vet通过。
- 关键HTTP/入口两个包race通过，包含真实子进程在线SIGTERM落库测试；未声称全仓race。
- 客户端 **16项** 通过（原寻路脚本内断言保留），完整TypeScript检查通过；新增IME和相同呈现/节点替换回归。
- 构建边界 **4项** 通过，bash语法及workflow YAML解析通过。GitHub托管workflow本身未运行。
- 最终ELF的真实Chromium广泛验收 **18+3+4项通过**：注册建角、登录、聊天、六个菜单、物品/宠物、实际移动与取消、双指、320/360/390/430宽与横屏/平板、手动模式覆盖、真实战斗防御/攻击目标/结束返回、320px NPC对话及可见取消、桌面注册建角/菜单/键盘聊天，页面异常0。
- 最终ELF新增输入回归 **10项通过**、双端交易取消通过，页面异常0；运行ELF摘要在 [input-final-runtime.json](browser/input-final-runtime.json)。
- 最终桌面登录美术区域 **691,200像素与原版一致**，0差异；比较范围仅截图crop(240,90,1200,810)，不将其扩大成所有动态场景像素一致，见 [像素证据](browser/desktop-pixel-comparison.json)。
- 最终ELF实际浏览器保持在线后GM传送，再发送SIGTERM：停服前数据库仍1006/18/25、内存已1000/47/82；退出0且队列排空日志出现，停服后DB读到1000/47/82，见 [shutdown.json](browser/shutdown.json)。该测试通过原生聊天输入GM命令、只读SQLite断言；没有修改交付配置或用户数据库。

浏览器脚本与日志均在 [browser/](browser/)，全部业务操作用真实页面、CDP触摸/键盘和正常WebSocket路径；evaluate仅用来读状态、坐标或等待渲染。组合输入事件是合成事件，非实体IME。

复验核心命令：

```sh
node --experimental-strip-types --test client/test/*.test.*
node --test scripts/build-client.test.mjs
npm exec --yes --package typescript@5.9.3 -- tsc --noEmit --allowImportingTsExtensions --module esnext --moduleResolution bundler --target es2023 --lib es2023,dom,dom.iterable client/src/*.ts
go test -C server -p=1 ./... -count=1 -json
go vet -C server -p=1 ./...
go test -C server -race -p=1 ./webclient ./cmd/saserver -count=1 -v
scripts/build-linux.sh
sha256sum -c bin/saserver.sha256
```

浏览器需要Playwright/Chromium与完整官方资源，脚本使用/tmp隔离runtime元数据和测试账号，不把账号运行凭据作为报告附件。run-server.py要求先准备隔离runtime；它不是生产启动脚本。

## 复验中发现的夹具问题

- 交易默认被角色拒绝；通过原生设置明确启用双方交易，并保持两浏览器渲染活跃，避免背景软件GPU加载超时。
- 原生系统确认使用sys-yes/sys-no，初始脚本误等modal-yes；改为真实热区并另测全局错误密码modal。
- 广泛回归的GM夹具账号初定19字符，原生输入maxlength15导致实际注册名截短，隔离配置里的GM名不匹配；因此初次物品断言失败。修正测试配置匹配实际15字符账号后，用同一最终ELF重新跑18+3+4项全部通过。未以此修改业务或绕过权限。
- 首次适配历史测试保持在SA-1112-01；本轮失败调试截图不混入最终成功截图，原因在本节说明。

## 剩余范围与发行限制

实体iOS/Android、Safari、真实系统输入法、安全区、音频和GPU特性仍需实机验证；Chromium模拟通过不替代这部分。未对所有NPC、物品、社交/战斗分支或高并发负载做穷尽测试。原协议中已披露的战斗可选表现字段缺项保持原行为。Windows/Darwin附加交叉编译因平台依赖下载停滞取消，没有通过声明；本次交付范围为Linux AMD64。

SIGTERM测试证明正常信号停服会保存在线位置，不保证SIGKILL、断电、磁盘故障或外部过短强杀期限。部署需给正常存档留出时间。CI可选with_assets仍依赖完整资源准备，默认关闭；未将其扩展成自动下载发布资源的网络流程。

最终提交与非force推送状态由Git及远端HEAD核验确认；历史SA-1112-01报告和产物摘要保留，当前有效二进制校验以bin/saserver.sha256为准。
