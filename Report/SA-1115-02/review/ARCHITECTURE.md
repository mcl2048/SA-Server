# SA-1115-02 · 独立上下文与发行审查

基线：`4751c2b`（v0.2.19-LYNX）。范围限于宠物店、战斗结算、角色持久化及现有 HTTP／SIGTERM 行为；生产文件由对应负责人修改。本记录先固定已追到的调用关系，变更结论补充在 FINAL-REVIEW.md。

| 边界 | 已确认关系与约束 |
| --- | --- |
| 请求进入世界 | `NpcWindowReply` 通过 `World.Do` 进入世界串行执行；核对当前 NPC、seq 和战斗／交易／摆摊状态。消费旧窗口后再分派，重放旧确认不能直接重用该状态。 |
| 窗口按钮 | 公共层为 message/input 做位掩码检查，select 没有统一检查；宠物店必须自行验证当前页允许的 Prev/Next、单一按钮及行号范围。 |
| 邻近与楼层 | 回复按玩家当前楼层查 NPC，距离不能大于5格；最初对话仍要求面对面2格或相邻。 |
| 状态变化 | `PetDrop`、邮件、战斗、交易等可能在确认前改变携带宠物或状态；确认必须重新检查当前槽位及可寄放条件，必要时绑定所确认对象。 |
| 费用及转移 | `petsChanged` 先将 petBag（携带与Pool）序列化到 `Character.Pets`，再 `saveProgress` 捕获值快照。`SaveProgress` 在同一 SQL UPDATE 写 Gold 与 Pets；不存在分两次扣款／转移的数据库窗口。 |
| 异步保存 | 同一角色 prog key 合并为最新快照，由单存档队列执行；操作成功反馈先于磁盘完成。I/O错误记录日志，现有机制没有持久化ACK或失败重试保证。 |
| 经验来源 | 所有胜负结算共用 `endMember`；`BattleEnd.Exp` 仅存活、未逃离、PvE胜利人物获得，且已经过共享／独享、倍率及经验道具计算。培养分支应读取这个最终值，不能另算怪物经验或通用 gainExp。 |
| 升级 | `petGainExp` 复用宠物成长、升级、忠诚、声望及独立宠物等级上限。必须把Pool变更写入Character.Pets，即使本场没有携带出战宠物。 |
| 停服 | World先处理已投递回调，再保存位置／数值并关闭存档生产端、等待全部人物保存完成；main再等待共享家族队列与HTTP Shutdown，最后释放SQLite。 |
| HTTP | 内嵌客户端与外部路径共用公开文件边界；Assets静态处理禁止目录列表，gzip测试检查协商、条件GET与HEAD，并验证底层传输失败行为。 |

## 独立已运行验证

命令：`GOMAXPROCS=2 GOMEMLIMIT=400MiB go test ./cmd/saserver -run 'Test(Gzip|Precompressed|LoginArtwork|ClientGzip|SIGTERM|NoListing)' -count=1 -v`，退出0（39.027s），完整输出见 `http-shutdown-tests.txt`。

三个真实子进程SIGTERM场景通过：在线角色位置保存、四角色慢SQL保存（停服实际等待约16.09秒）、共享家族慢保存（实际等待约9.13秒）。这些是服务端入口集成回归，不代表最终发行ELF的浏览器验证；后者由主线程与浏览器负责人另行记录。

本轮关注的业务风险、容量及经验边界仍以变更冻结后的独立审查结果为准。未对生产数据库写入，未发送外部消息，未重启生产实例。
