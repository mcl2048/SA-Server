# SA-1113-03 · v0.2.10-LYNX 验收

三项任务均已实现并完成验收，Task-Now任务已标记✅，源码、匹配客户端、Linux二进制与公开证据已交付。实现提交59e17bb，后续验收记录提交可由Git历史查询。

| 任务 | 实现 | 证据 |
|---|---|---|
| 战斗显示 | 资源条移至外形下方，黄色粗体描边伤害保持画面内，修复双方HP0快照、方向缺失及后续回合的倒地姿态 | [UI](UI.md) |
| 自动策略 | 主人倒地后每只活宠以自己的技能与有效目标决策，适用单人多宠和多人PvE；保留手动/PVP命令路径 | [策略](STRATEGY.md) |
| 挂机资源 | 无前台成员及观战者时跳过BattleTurn展示转换，保留模拟、timer、经验石币与存档，接入恢复当前快照 | [性能](PERFORMANCE.md) |
| 移动控制 | 摇杆控制区在智能按钮列表之前，列表独立滚动；可遇敌野外提供服务端确认的遇敌开关 | [移动](MOBILE.md) |

## 研究与验证依据

修改前获取 [W3C非文本对比](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)、[Game Programming Patterns 状态建模](https://gameprogrammingpatterns.com/state.html)；性能与移动专项另记录官方参考。使用描边和稳定锚点提高辨识，以行动者有效状态决定策略，以真实消费者决定展示工作。

确定性world/真实BattleScreen回归与独立审查通过：逐宠技能归属、自动/快速、多人PvE及PVP/手动负控制；审查发现的首回合计划重复与复活星星残留已修，并独立重验通过。完整Go与vet通过，客户端97项及完整TypeScript检查通过；移动外壳补充单测通过。后台专项race通过，后台仍推进timer、经验石币、Flush及新观众/Attach快照。组件截图使用合成模型与数值，明确区别于最终ELF真实战斗。

## 已生成产物

v0.2.10-LYNX静态Linux AMD64为16,404,640 bytes、0755，SHA256 `35c368c0462a93ee41fe5d938c6712c393e58bd5a728dc85f1d4dd1d5a998505`。发行ZIP为23,653,673 bytes、4358个文件，SHA256 `c44fd09637752d95e56294964e0db338a23a369806c8be9e348248471e956a95`；testzip、内嵌二进制一致及私密文件排除检查通过。对应 `release.json`。最终35c368c0候选已真实截图核验移动390×844及桌面1280×900五敌顶部黄色描边伤害完整可见，六友方资源卡分离且不遮挡模型。前一0bda候选受控击倒主人后普通auto产生至少两只活宠的真实伤害；该记录仅说明策略路径，未将旧候选冒标为最终SHA。最终HTTP、静态ELF、重复构建、完整嵌入客户端与服务文件一致、缓存ETag/HEAD/304、私密路径404检查全部通过，见 `binary-http-verification.json`。`browser/runtime-shutdown.json`记录最终quick同轮SIGTERM主动发出、wait退出码0，浏览器位置floor300/x379/y186与SQLite保存位置完全一致。

最终35c候选的真实quick验收已通过：以高最大HP/当前HP1受控击倒主人，初始fly=0且无BattleEnd，正常UI开启quick。主人HP0、DEAD动作类型2保持至第3回合；宠7与宠8独立攻击敌人，分别造成143与25伤害，后续仍继续产生攻击事件。证据为 `browser/desktop-owner-dead-result.json`、`desktop-strategy-diagnostic.json`、`integration-results.json`、`desktop-surviving-pets-quick.png`。同一运行内完成HTTP检查和停服保存，退出0。

前序脚本失败已由完整服务器事件定位为测试主人最大HP太低，准备轮触发fly=2并立即BattleEnd lose；这不是普通倒地场景。详见 `QUICK-DIAGNOSTIC.md`。修正隔离fixture后通过，生产代码无需改变。

## 边界

- Chromium移动视口不是实体手机、Safari、IME或操作系统休眠认证。
- 展示微基准只测协议转换路径，不构成生产并发或容量SLO；SQLite仍是单机单写者。
- 没有死亡动作的原始素材不能凭空生成；已有DEAD动作优先按正确方向或有效替代方向选择，Assets未追加。
- 自动策略不保证所有属性对局胜利；低血、缺技能、无有效敌人等情况允许独立防御，修复的是死主造成无效全宠防御。
- 测试凭据、数据库、profile、私密配置与原始Assets不入Git或发行ZIP。
