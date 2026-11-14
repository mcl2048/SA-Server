# SA-1114-03 · 客户端自动策略与倒地状态审查

## 2026-11-14 · 修改前诊断

- 基线 `256f7ab` / `v0.2.13-LYNX`。文件所有权：`ai.ts`、`aismart.ts`、`battle.ts`、`aisetting.ts` 与关联客户端测试；不修改移动公共层、dist或发行产物。
- 使用 `systematic-debugging`、`test-driven-development`、`verification-before-completion`。
- 修改前阅读 Epic Games 官方 [Behavior Tree Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/behavior-tree-in-unreal-engine---overview)。参考其事件驱动状态、条件变化取消已选任务及高优先恢复任务的规则；本仓库继续使用原有回合状态机，不引入额外框架。
- 权威边界：`BattleScreen.autoCommand` 在 `host.serverAuto()` 时退出；正常自动/快速战斗由服务端策略决定，客户端负责同步设置与逐事件演出。`smartChoose` 仅作为客户端回退策略。
- 目标排除：客户端 smart AI 已过滤 `gone` 与 HP≤0，BattleScreen adapter也将本地dead映射为HP0。播放层 `onTurn` 提前构造整回合动作，`eventSteps` 只在构建时排除gone；`applyHit` 只屏蔽gone/fly。需要实际权威事件序列区分无效服务端事件与客户端错误倒地，不能直接删除服务端有效回合。
- 可疑协议风险：`applyHit` 无条件使用 `actorHp` 更新行动者；若某服务端特殊技能漏报默认0，客户端会显示倒地而服务端仍存活。已告主Agent检查所有特殊技能事件字段。
- 恢复差异：客户端MP补充仅统计 `MAGIC_Recovery`，遗漏 `MAGIC_OtherRecovery`；道具凭说明字符串识别且未检查目标范围，可能误认“气绝回复”。服务端有类型/参数与目标合法性判断，客户端修复应与其边界一致。
- 设置文案差异：目前UI承诺“肉优先、预计致死就补”，但权威server先可负担精灵后道具、低于healAt触发；最终文案待主Agent确认权威策略后统一。

## 2026-11-14 · 客户端窄修与回归

- 已阅读共享 `RESEARCH.md`，主Agent确认权威恢复顺序后同步设置说明：低于比例先恢复，优先可用恢复精灵，再用肉等恢复道具；气力不足时使用气力恢复道具。移除“肉优先、预计致死必补”的服务端不实承诺。
- `aismart.ts` 恢复精灵统一识别 `MAGIC_Recovery` 与 `MAGIC_OtherRecovery`，包括施法MP储备和低MP补气判断。失败测试证实 OtherRecovery 原会放弃补气改攻击，现选择气力药。
- 气力药说明要求明确“气力”及恢复含义，排除“气绝”。失败测试证实复活药原被当作补气给存活人物使用，现保留用于真正复活。
- 所有敌人HP0/离场时，回退AI输出防御而非 `attack target=-1`；宠物不生成攻击意图。
- `ai-settings-recovery.test.ts` 使用真实 `Ui`、`AiWindow` 原生命中与本地持久化，在desktop/mobile两模式确认同一阈值说明与 `35→40` 点击结果，`loadAi` 读取40，与main送往权威服务端的读取路径一致。
- 服务端审查代理已定位两个症状相关根因：不能行动者仍可反击、状态到期事件 `Cure(0)→Stun(旧状态)` 让画面错误保留不能行动状态；服务端代理负责修复。客户端不丢弃或重写权威事件，不用隐藏动画掩盖服务端错误。
- 最新验证：完整client测试164/164通过；TypeScript `main.ts --noEmit`通过；`git diff --check`通过。完整日志 `/tmp/sa-1114-03-client-tests.txt`。未构建dist、未构建二进制、未提交。

## 验证边界

- `SmartFighter` HP/离场合法性、复活与主人倒地宠物行为由既有完整client套件回归覆盖。
- 客户端回退AI的恢复物品仍依据现有wire Memo识别；权威自动/快速策略应继续使用服务器ItemDef函数与参数。未添加协议字段或依赖未提供的资源。
- 真实Chromium的桌面/移动设置与权威回复、完整自动战斗事件链由主Agent集成验证；本记录中的DOM单元测试不等同于实体移动设备认证。

## 2026-11-14 · Chromium 恢复验收模块

- 新增 `browser/recovery-cases.mjs`，调用 `ui=await runRecovery(ui,results,{variant,out})`。模块创建桌面与移动触屏视口上下文，返回存活的最终移动 `ui`；依赖私有runtime原生防御敌人90004。
- 全部业务变更使用原生UI和GM聊天：补血时机35→40、重新导航后持久化、AutoPlay.settings策略、宠物休息、实际装备1001/1002、药品1500/1510及肉1234；页面回调只读取状态，CDP只保留公开字段，不记录登录/凭据。
- 每个视口普通自动和快速各6场：两种恢复精灵优先于HP药和肉、MP0先用气力药次回合施法、HP药、肉、达到阈值不补。对真实BattleTurn事件、MP消耗、恢复值与Inventory数量断言；截图在本任务Report目录。
- 工具验证：`node --check Report/SA-1114-03/browser/recovery-cases.mjs`和`git diff --check`通过。真实发行ELF/Chromium执行由主Agent进行，本段不宣称浏览器验收已通过。

## 最终发行ELF恢复验收 · 全部通过

- 本代理按主Agent集成后的最终ELF实际执行：`bin/saserver v0.2.14-LYNX`，SHA256 `5184f6b440a4369a6073fb22ae17a83ddbacc3442f0861cd9e2dc163b6b49cc1`。运行`recovery-browser-status.json`已结束，退出0。
- `browser/final-recovery.json`26/26检查通过，含桌面/触屏视口各1项真实补血阈值35→40、重载持久化、AutoPlay.settings验证，以及两端×自动/快速×6种场景共24场实际服务器战斗。`recovery-browser-summary.json`提供每场首个真实行动摘要。
- 两种恢复精灵1001/1002在可负担时优先于补血药1500和肉1234，MP分别扣5/8；MP0时1510气力药先恢复18–22，下一回合用1002且扣8MP；无恢复精灵时HP药/肉实际消耗并恢复；达到40%阈值时首个可行动事件为普通攻击。每场核对真实`BattleTurn`、数量变化、最大HP/MP边界及胜利。
- 24场均通过原生GM准备、原生装备/休息/设置操作进入，`evaluate`只读；正常奇袭引发的turn1 none单独保留在证据并仅对其豁免首个可行动事件断言。未修改产品以配合工具。
- 最终浏览器errors为空，正常SIGTERM退出0、无停服超时，SQLite最终坐标与UI一致。关键PNG为`browser/final-recovery-{desktop,mobile}-{auto,quick}-{spirit-1001-before-items,spirit-1002-before-items,mp-potion-then-spirit,hp-potion-recovery,meat-recovery,threshold-not-below}.png`。
- 中间工具失败保存在`mobile-reload-intermediate-*`和`native-click-intermediate-*`：修正真实导航重建视图后恢复immersive、等待可见菜单滑入、每次拾取/放置验证held转换后再继续。未将失败样本列为最终成功。
- Chromium使用SwiftShader、1280×900桌面与390×844触屏视口；此为真实浏览器测试，未宣称实体手机GPU或实体设备认证。最终Lilith集成后完整client测试178/178及TypeScript入口检查已通过，详见`CLIENT-LILITH-WORK.md`。
