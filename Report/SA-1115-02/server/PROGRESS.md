# SA-1115-02 · 宠物寄放与培养服务端

## 范围与协议

- 普通寄放与付费培养共用角色的 `petBag.Pool`；上限固定 500，与转生次数无关，旧存档自然兼容。
- 每页 5 只，真实数量决定页数，500 只共 100 页。上一页／下一页只接受窗口实际提供的单一按钮；行号严格限制为本页 1–5 且实际存在的对象。
- `pool_flg:1` 店铺菜单：寄放 1、领取 2、出售 3、培养 4、离开 5。`pool_flg:0`：领取 1、出售 2、培养 3、离开 4。保留两类店铺旧出售索引。
- 培养选宠沿用原生 `petselect`，seq 270；确认 seq 271。所有宠物店均可培养、领取。宠物新增可选 JSON 字段 `training:true`，普通寄放为 false，领取立即清除。
- 培养费用为确认时 `(人物当前等级 + 宠物当前等级) * 100`，一次收费。报价后等级变化会重新报价，需再次确认；确认期间槽位换宠不会操作替代对象。
- 普通寄放维持旧收费 `50 + 人物等级 * 4`。骑乘、送信、家族守护兽、容量、余额与战斗／交易／摆摊占用均在移动对象和扣款前复核。

## 经验与资源

最终 `endMember` 中，在人物实际获战斗经验的分支，以 `BattleEnd.Exp` 为唯一依据；每只正在培养的宠物独立获得向下取整的 80%，不分摊、不减少人物经验。倍率、智慧之果与原生共享分配先应用于人物，再派生培养经验。普通、自动、快速、离线和队伍共用该结算；PvP、失败、逃跑、人物死亡及非战斗 `gainExp` 不额外训练。

复用原生宠物成长、模板／规则等级上限、忠诚与声望计算。培养批次先用无存档副作用的 `petApplyExp`，再聚合原有逐级取整的 feed；维持既有个人／家族收益，同时避免 500 次升级产生 1000 笔家族快照。没有出战宠时也序列化培养池，最终一次角色存档包含余额和宠物状态。

独立性能探针见 `../review/performance-probe*`：500 只同批升级，家族队列 job 1000 → 2，个人 Fame／家族 Feed 均为 4500，培养对象各自获得完整 80。单次受控采样 6.782ms → 167.665µs，不作为通用吞吐保证。

## 实际验证进度

1. 修改前读取官方 Go 事务指导与 SQLite 事务文档：
   - https://go.dev/doc/database/execute-transactions
   - https://www.sqlite.org/lang_transaction.html （页面标记更新 2026-02-18）。
   - 采用既有世界单协程所有权和同条 `SaveProgress` SQL 原子保存 Gold/Pets，避免引入独立扣款写模型；审查所有异步存档的结束顺序。
2. 红证据 `red.txt`：`TestPetCareCapacity|TestPetCareTrainingEvery|TestPetCareBattle` 在原实现失败；证明未转生容量不足、无培养入口／标记、无培养经验和仅培养池时未持久化。
3. 首次扩展旧测试发现 `TestPetShopRejectsAwayPet` 在非普通寄放店直调 helper 时，新增 flag 检查先返回空串；将约束检查顺序调整为先保留送信等原错误提示，再处理店铺普通寄放权限。
4. `green-initial.txt`：目标及原宠物店、成长测试通过，world 3.049s。
5. `green-expanded.txt`：最终扩展目标 `TestPetCare|TestPetShop|TestPetLevelUp` 通过，world 8.919s。新增常驻覆盖：
   - 500 / 第501只边界、100页末宠领取、越权按钮与跨页／畸形行号；
   - 两类店铺培养、取消、精确收费、重复确认、真实 SQLite 持久化、领取停止培养；
   - 八种实时约束、槽位换宠、等级变化重新报价、既有溢金出售二次确认；
   - 两位队员各两只培养宠、共享经验开关两种配置；127 基础 × 2 倍率 × 1.5 智慧 = 381 人物经验，每只独立得304；
   - 真实自动／快速／离线 automationTick 路径，重复20次tick只结算一次；
   - 死亡、逃走、PvP、失败、非战斗经验、1经验的向下取整和原生模板等级上限保留剩余经验。
6. 新改动 lint 首轮只报 QF1003，培养选宠分支改为等价 tagged switch，原输出留 `lint-initial.txt`。生产文件再次冻结，petshop SHA256 为 `ad17b711bfbdaeba530ca74afd8b514156a385380c6caa18349d024f2518d144`。
7. `race-final.txt`：最终源码执行 `GOMAXPROCS=2 GOMEMLIMIT=400MiB go test -race -p 1 ./internal/world -run 'TestPetCare|TestPetShop|TestPetLevelUp' -count=1 -v -timeout=180s`，全部通过，world 22.774s。完整 Go / race / vet 与最终二进制浏览器由主 Agent 集成。
8. `lint-final.txt`：golangci-lint v2.15.0 在最终源码执行 `run --new-from-rev=HEAD ./internal/world`，退出0，输出 `0 issues.`。`lint.txt` 同步为最终结果，首轮问题单独保留。目标 race 共14个顶层组、26个子用例，40条 PASS 记录。最终生产文件未再次变动。

## HTTP、构建及停服审查

只读核对 `main.go`、`webclient.Handler` 的调用边界及现有 HTTP 测试：客户端限定发行文件，Assets 禁目录列表，gzip 保持 HEAD／条件请求和断流处理；此次不新增 HTTP 路由。构建使用同一次客户端 staging、固定 GOOS/GOARCH、CGO=0、trimpath 与临时输出替换。停服先等待各世界角色队列，再排空共享家族队列，并等待 HTTP shutdown 完成后关闭数据库。没有发现本轮必须另行改动的 HTTP／停服 P0/P1 问题；主 Agent 完整回归与最终 ELF HTTP／SIGTERM 证据作为交付依据。

不将视口／触屏模拟声称为实体手机认证；不更改素材、数据库格式或向外发送凭据。
