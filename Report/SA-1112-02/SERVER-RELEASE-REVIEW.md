# 服务端与发行边界审查：43f63a2

审查对象为 `43f63a2e54067ec973f97e710e9c13321e165755`。范围：`server/webclient`、`server/cmd/saserver` 的客户端选择/配置/gzip/入口生命周期、`client/build.mjs`、`scripts/build-linux.sh`、`.github/workflows/release.yml`。初始审查只读；复现后，父agent明确追加授权，才对下列服务端与构建问题作窄修复。本文件不覆盖父agent的客户端性能审查或另一agent的移动交互审查。

下表行号指向被审查的 **43f63a2**，不是修复后的工作树。已披露的外部游戏资源依赖、战斗表现协议缺项、实体设备未验收、外部目录由运营者信任管理等，不重新列为新缺陷。

| 优先级 | 原提交位置 | 可复现问题与生产影响 | 修复状态/建议 |
| --- | --- | --- | --- |
| P1 | `server/cmd/saserver/main.go:71` | `signal.NotifyContext` 只订阅 `os.Interrupt`。Linux常用systemd/container停服发送SIGTERM，Go进程立即终止，跳过 `world.Run` 的在线角色存档与队列排空；角色位置最多丢失一次30秒自动存档间隔内的变化。 | 已追加 `syscall.SIGTERM`，保留原有 `worldDone`/WaitGroup等待。新增真实入口子进程测试，确认在线角色未落库位置在SIGTERM后保存。 |
| P2 | `server/webclient/webclient.go:69`、`:74` | JS要求 `no-cache`，但未发送ETag，传给ServeContent的modtime又是零值。因此浏览器无有效重验证凭据，每次刷新重新传输全部模块；手工条件请求同样返回200整份。 | 已对发布内容计算弱SHA256 ETag，交由ServeContent处理If-None-Match。内嵌内容在handler初始化读取/计算一次；外部客户端逐请求读取和重新计算，保持热更新正确。继续使用no-cache，不对任意query赋immutable。 |
| P2 | `server/cmd/saserver/gzip.go:22`、`:52` | 子串匹配将 `gzip;q=0` 误判为允许gzip；合法大小写 `GZip` 被遗漏。identity响应没有Vary，表示选择依赖Accept-Encoding却未完整表达给共享缓存。 | 已解析编码token和quality，支持大小写/通配符并优先尊重显式gzip排除；对可压缩扩展的identity/gzip/HEAD/304统一添加Vary。HEAD有对应GET编码元数据但不创建压缩流；304没有gzip尾部。 |
| P2 | `client/build.mjs:37`、`scripts/build-linux.sh:15`、`server/webclient/webclient.go:18` | builder只覆盖当前模块，未移除历史JS；本地staging复制dist中所有JS，导致已删除模块继续发布。同时只清理static/dist而 `go:embed all:static` 会带入static根下无关/隐藏文件，即使HTTP allowlist不公开它们，下载ELF仍可提取内容。 | builder在所有TS成功转换后重建专属dist；新增共享 `scripts/stage-client.mjs`，本地与CI共同使用，拒绝static顶层未知文件与symlink，避免把运营者本地文件嵌入发行。发现未知文件时明确失败，保留原数据。 |

本轮没有发现新的客户端HTTP路径越界：允许范围仍为根页面、index.html和非隐藏dist JS，私有配置/源码/maps/点段/反斜线被拒绝。GET/HEAD限制和nosniff保持。

## 复现证据

1. **SIGTERM**：使用未修改的交付ELF `v0.2.4-LYNX`、真实gamedata、临时SQLite分别启动。SIGTERM返回 `-15`，缺少“已退出，在线角色位置已保存”；SIGINT返回0，存在该日志。原始结果为 [sigterm-baseline.json](sigterm-baseline.json)。修复后的集成测试进一步验证实际在线存档，而非仅凭退出日志。
2. **缓存/gzip**：初始只读Go overlay测试使用2,200字节JS。无Accept-Encoding时200、无Vary/ETag/Last-Modified；`gzip;q=0` 和 `br, gzip;q=0, identity;q=1` 都返回 `Content-Encoding: gzip`；`GZip`没有压缩。设置If-None-Match及If-Modified-Since仍返回200/2,200字节。overlay仅在/tmp，不修改43f63a2生产文件。
3. **发行残留**：在/tmp复制原builder和build-linux脚本，注入 `client/dist/retired.js` 以及 `server/webclient/static/secret.txt`。真实Node构建报告35模块，staging却复制36模块，两个注入文件均保留。该复现将Go命令替换为只生成可执行占位文件，证实的是构建/staging流程；没有声称对这个注入fixture运行了完整Go编译，也没有声称原交付ELF实际包含秘密。`all:static` 的嵌入范围可直接由Go指令确定。

## 新增回归与验证

- `server/webclient/webclient_test.go`：同内容GET/HEAD条件请求304；任意query仍no-cache；内嵌快照稳定；外部同长度内容更新改变ETag，删除文件不使用旧缓存。
- `server/cmd/saserver/gzip_test.go`：12组编码协商，包括q=0、显式排除优先于通配符、合法大小写、NaN/越界quality；解压内容一致；两种编码的GET/HEAD条件响应；真实HTTP连接上的304无body/Content-Encoding，保留Vary。
- `server/cmd/saserver/shutdown_test.go`：独立测试进程运行实际main，临时DB预置角色，真实WebSocket登录后GM warp到1000/47/82。停服前DB位置仍是出生楼层，保持连接在线发送SIGTERM；退出0后数据库读取到新位置，并有排空退出日志。避免普通logout提前存档掩盖问题。
- `scripts/build-client.test.mjs`：4项隔离构建测试，覆盖重复构建稳定、已移除依赖/历史JS清理、未知嵌入文件拒绝且保留数据、TS解析失败保持前产物、输出symlink拒绝且不破坏目标。

Go1.27.3，`GOMAXPROCS=2 GOMEMLIMIT=400MiB`：

```sh
go test -C server -p=1 ./... -count=1 -json
go vet -C server -p=1 ./...
go test -C server -race -p=1 ./webclient ./cmd/saserver -count=1 -v
node --test scripts/build-client.test.mjs
bash -n scripts/build-linux.sh
```

完整Go结果：**254个通过事件（含子用例），222个顶层测试，8个包，0失败、0跳过**。完整vet命令退出0；空日志表示没有诊断。两个包race通过，包含在线SIGTERM测试。构建4项通过。完整JSON、race及构建日志均在本目录。workflow YAML通过Go yaml.v3解析；本地与CI共用staging，CI增加构建边界测试。

额外尝试完整Windows/Darwin交叉编译，但在下载平台特有依赖（go-isatty、go-strftime）时停滞，已取消该附加作业，不作跨平台编译通过声明。

尚未执行GitHub托管workflow本身。本轮未扩展可选assets网络下载流程，保持显式缺资源失败和默认关闭；该已知外部资源准备要求不列为新缺陷。最终发行二进制、客户端生成输出与真实浏览器验收由父agent在版本更新后统一完成，此处不将源码回归等同于最终ELF验收。
