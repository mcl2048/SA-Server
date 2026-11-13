# SA-1113-03 · 快速战斗脚本诊断

本次未修改生产代码。读取真实全事件后，确认先前“quick ACK=true、battle=null、后续BattleTurn空”不是快速显示模式丢失连接。

## 已确认的根因

原受控场景将人物体力设为10、当前HP1。一次合法己方宠物攻击产生damage69、dead=true、fly=2；服务器随即发送BattleEnd(result=lose)以及“你被击飞了，回到了记录点。”。见 `browser/desktop-strategy-toggle-failure.json` 的首个BattleTurn和其后BattleEnd。

服务器 `battle.go` 的既有规则是单次伤害达到 `MaxHP*1.2+20` 或累计伤害达到门槛时击飞，击飞会离开战斗。此场景人物MaxHP41，攻击足以触发门槛；尸体画面仍在播放，不能推断服务器战斗仍有效。之后启用quick只能确认自动意图，无法让已终止战斗再次产生回合。

## 生命周期与采样核对

- `presentation()` 调用的 `setDeviceMode` 只调整CSS、stage父节点和清理输入；不reload、不重连、不改变战斗screen。
- `changeBattleQuick` 先设置闭包quick=true并调用setQuick，再app.go(back)。battleView.leave中的 `!quick` 为false，因此正常快速切换不会清空battle。只有真实BattleEnd处理后finish、连接断开/新世界等路径会清空。
- `sa.battle` 是读取模块battle的getter，不是旧缓存。`UI.events` 接收每个WebSocket JSON后只append；begin是Python整数索引，原代码没有清空列表或可变偏移问题。
- raw `AutoPlay` 发送绕过AutoPlayIntent.sent、本地desired和正常设置更新，可能与未确认意图/定时lease冲突，不适合认证真实UI开关。诊断改为 `ui.action('battle-quick-toggle')` 正常路径。

## 最小有效验证

场景改为体力1000但当前HP1，进场断言MaxHP至少1000；只有一只宠攻击主人，其余防御。服务器仍真实计算伤害和死亡，但避免击飞。开启快速前断言主人死亡、敌方存活、未收到BattleEnd且对主人事件fly=0。之后只用正常UI快速按钮，记录服务器ACK与至少两只不同宠物的正伤害事件。测试私密配置turnTime300、battleSpeed2，避免动画等待误跨自动超时；没有改变生产数据或二进制。

## 本轮最终结果：通过

唯一有效场景使用最终ELF SHA256 `35c368c0462a93ee41fe5d938c6712c393e58bd5a728dc85f1d4dd1d5a998505`，人物MaxHP4001、当前HP1。受控友伤后未击飞、未提前BattleEnd，正常UI开启快速模式成功。记录显示主人HP0、dead=true、action/frameType均为2（实际DEAD），回合推进至turn3；宠物actor7造成143伤害、actor8造成25伤害，二者都来自启用快速后的真实BattleTurn。后续回合还有其余宠物有效攻击。

`browser/desktop-owner-dead-result.json`、`desktop-strategy-diagnostic.json`、`integration-results.json`保存非认证协议证据；`desktop-surviving-pets-quick.png`已目视，显示“快速：开”及“服务端自动战斗 第4回合”，这是正确快速地图展示，不冒称该图显示尸体。尸体姿态见同轮`desktop-owner-dead-pets-alive.png`。

同一runtime内HTTP发行校验退出0，之后主动SIGTERM、wait得到exit0；SQLite保存floor300,x379,y186与预期完全一致，`runtime-shutdown.json`的position_matches=true。测试命令exit0，无残留runtime，无生产代码修改。先前失败只作为场景诊断，未计作产品通过。
