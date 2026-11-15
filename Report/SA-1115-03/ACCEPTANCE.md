# SA-1115-03 · 发行验收

基线 `9a562347255c765aeb8292eb581142d271673989`／v0.2.20-LYNX。用户预先修改的任务文件保留，本轮读取后SHA持续核对；不停止既有生产实例。最终交付为v0.2.21-LYNX，精确摘要、检查数量与包信息以[release.json](release.json)为准。

## 修复与依据

| 风险／需求 | 最终行为与证据 |
| --- | --- |
| 危险逃跑、捕获无目标在非优先逃跑模式下无上限 | 所有自动Escape共用本场三次实际失败，选择轮询不计数；新场重置。服务端与客户端fallback回归见automation-red/green、client-escape-red/green。 |
| 复用主宠决策的提前返回遗漏防御 | 显式逃跑也计算主宠防御；已有手工人物命令时按实际意图重新选宠，已交宠命令保留。独立复核红绿见review-red、automation-green。 |
| 断线后仍构建大量无人消费的展示 | 在状态／背包／宠物／任务／战前消息构建前短路；不绕过权威消耗、结算、任务旗标、培养和保存；在线队友仍收到离线队员状态，Attach重建最新快照。详见SERVER-REVIEW。 |
| 挂机无野外整备、丢肉越过事务 | encounter且auto/quick才整备；每秒最多一件、人物HP→参与宠HP→人物MP、肉优先，走原生useRecoveryField。尊重Field限制、负副作用、阈值0、编辑租约／窗口／事务；恢复先于战后丢肉及20%安全停止。专项还验证休息宠不消耗与真实MP药。 |
| 换图后补给先消耗才停止 | 地图失配先撤销遇敌，不消耗补给。review-red记录原HP1→22，automation-green验证修后不变。 |
| 地图目录只有历史楼层 | 默认本区地点，每页9行，保留历史区域tab。有效资源1206层／3309地点／5002入口-目的地对应关系，地图100共21处。相邻同目的地合并且保留全部入口格，多目标选择可达边缘。 |
| FREEMORE的同层fallback漏条件地点 | 复用原生TO解析读各FREE分支，保留多目标、原生10条限制及畸形项break；不执行／绕过passCheck、随机和队伍判定。真实703(334,182)的7453／7454有红绿。 |
| 可选数组未补Go省略的零值 | places为正常数组，SCHEMA递归补MapPoint。真实wire省略x=0→Connection→Field→实际Move通过；旧端缺places兼容[]。真实Chromium从11001的x=0出口实走返回通过。 |
| 地图加载无关块、A*分配及失败负担 | 先目标与走廊、再扩大绕路；未知仍阻挡，找到路线后停止导航预取。整数堆decrease-key、逐格验证明路；300混合网格与独立BFS最短路差分。NPC列表10秒重试。 |

## 最终验证

- [Go结果](go-checks.json)：完整test、vet、race均真实退出0；源码摘要前后稳定。每包日志可查，race只证明实际覆盖路径，不能证明不存在所有竞态。
- [客户端结果](final-client-validation.json)：Node26.13.1，客户端／构建252项通过、失败0；全src TypeScript退出0。
- [最终挂机浏览器](browser/final-automation.json)：普通4秒／快速1秒的五宠胜利；编辑暂停后真实肉优先整备；真实CDP冻结后SQLite经验增长；关闭角色所有页面后两次独立经验增长；原生密码登录／接管恢复奖励和五宠。
- [最终导航浏览器](browser/final-navigation.json)：桌面7＋移动7共14项，村庄／洞窟／零坐标出口每次至少6个实际Move，跨图且0 PosCorrect；条件分支标签、21地点分页、鼠标／触屏拖动不穿透，坐标拒绝／关闭清理与转屏。
- 两份浏览器报告应与最终ELF SHA一致，均要求无failure／errors，正常SIGTERM退出0、不超时、人物位置落盘一致；`verify-release.py`会强制核验。
- [HTTP](http-content.json)：78文件逐字节匹配，gzip解压后比对；HEAD200空体、ETag304、私有配置／源码404；隔离实例正常SIGTERM退出0。
- [重复构建](build-repeatability.json)：二次ELF SHA一致、4691个生产输入不变；最终Linux ELF64/AMD64无动态解释器、可执行模式与sha sidecar核验。
- ZIP显式允许列表逐文件比对、CRC、唯一安全路径、ELF模式／版本／摘要核验；新包验证后替换唯一确定旧ZIP，禁止完整Assets、数据库、私有配置和凭据。
- 仓库与已安装StoneAge skill同步，两个quick_validate通过。未新增素材，因此本轮不新增素材补丁；完整包保留既有独立素材安装器。

## 性能范围

[Go前](performance-before.txt)／[后](performance-after.txt)均固定GOMAXPROCS=2。自动决策448B／5alloc→0B／0alloc。状态＋45格背包＋5宠＋战前展示组合，离线约88144B／1064alloc→0；在线保持同样内容与开销。时间受同机并发影响，分配数字更稳定；不换算为整服CPU／内存收益。

[寻路最终采样](pathfinding-performance-final.json)用同Node26、600²、4预热／12采样、交替基线与当前顺序：直线中位60.463→0.236ms、对角0.934→0.241ms、不可达320.534→321.747ms基本持平，对角P95未改善。保留不可达退化中间候选，不宣称所有场景都提速。

## 中间失败与限制

保留automation／field／review／协议／条件目录红测试。早期在World.Do回调中Fatal导致测试Goexit、清理等待，已改Error；这不是产品死锁。TSC首条漏dom.iterable，修正工具参数后退出0。浏览器中语法、ownerSlot默认0误纳敌方宠、pet状态ACK／渲染等待、菜单相邻帧竞争及墙坐标夹具问题均保留，最终只以匹配ELF的两份final报告为准。候选及第一次最终关闭后90秒未观察到新经验，重登录诊断证明仍在挂机。根因是私有遇敌夹具1/120概率，不是1即100%；改为120/120后重跑最终路径。不能用冻结收益替代断线收益。

真实Chromium／SwiftShader使用桌面与触屏／视口模拟，不认证实体Android／iOS／Safari或系统长期休眠。私有数据中追加原生被动敌群，真实解析／战斗／结算运行；不是生产自然刷新率证明。目录覆盖有效步入warp，未入表的对话／脚本NPC不保证自动进入；条件入口实际分支可由条件或随机决定，点击名称不强制目的地。

服务器运行期间挂机有效，重启清除挂机意图／恢复令牌，不补停服收益。磁盘满、SIGKILL、掉电不属于正常SIGTERM保存保证。不把有限验收描述为数学上的“100%完美”。

新检索与出处见[RESEARCH.md](RESEARCH.md)／research-sources.json。公开SaSH仅参考等待／肉优先／阈值策略，未复制、编译、运行或分发其代码；数值仍依据本项目原生实现。原始下载留临时目录，不全量上传第三方源文件。

用户在验证期间另行修改config.yaml，并明确要求一并提交及用于ZIP。最终公开配置按其全图／角色位／倍率等现值保留；configuration-update.json记录摘要变更，未改变ELF编译输入。
