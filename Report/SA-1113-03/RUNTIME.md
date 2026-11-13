# SA-1113-03 最终 ELF 与 Chromium 运行验收

## 方案与边界

脚本 `browser/runtime_integration.py` 用 SQLite backup API 将前批隔离测试数据库克隆到新的0700 `/tmp/sa-battle03-*`，复制既有测试凭据到0600文件，不修改原数据库。配置、角色数据、服务日志、令牌与浏览器临时上下文均不进入Git。原始 `gamedata`只读复制到私密目录，并追加敌984组成的fixture组90001及局部高优先区域，真实picker仍随机生成1..5只以命中五敌阵型；原始数据不改。`assets`只读，运行 `bin/saserver` 的内嵌客户端。

`browser/integration_battle.py`复用已验证的真实UI入口、WebSocket只读观察器。通过GM指令调整测试人物、创建真实战斗，五宠状态通过正常UI设置。此为受控测试场景，不宣称自然产生。按移动390×844与桌面1280×900分别验收：五敌血条位置、顶部敌人伤害渲染、实际击倒主人后活宠自动/快速攻击。

顶部数字用只读包装实际 `BattleScreen.popup`检测，随后保存真实页面截图；WebGL `toDataURL`可能全黑，不作为有效图形证据。受控倒地主人使用HP1弱主人防御及合法宠物攻击主人命令，由真实服务器计算伤害与死亡；之后独立清空观察窗口，开启auto/quick并要求至少两只不同活宠产生真实伤害事件。不注入伤害事件或篡改战斗HP。各证据记录最终ELF SHA256、实际BattleStart/BattleTurn与pageerror。死亡动作同时记录fighters dead/action及实际assets选中的动作类型，并保存真实截图。

## 生命周期

同一个 Python 进程拥有 ELF Popen 对象及Chromium。在try/finally内主动SIGTERM，wait取得真实exit code，读取私密SQLite中的floor/x/y与最后浏览器坐标比较。`runtime-shutdown.json`公开只含SHA、信号动作、退出码、位置一致性，不包含账号和凭据。不将running进程交给父agent后结束turn。

## 依赖及执行

需要主agent通知最终二进制构建稳定后才启动。现存Python环境 `/tmp/loft-hyraken-paas-venv/bin/python`，Chromium156真实headless shell均已确认；前批fixture包含2个活角色，避免重复注册seed。

执行：

```sh
/tmp/loft-hyraken-paas-venv/bin/python Report/SA-1113-03/browser/integration_battle.py
```

真实视口验收不等于实体手机、Safari或生产容量认证。正式35c368候选已实际完成mobile/desktop五敌布局与顶部黄色描边数字截图；mobile野外快捷on/off ACK、城市隐藏及DOM controls顺序已在同候选通过。主人DEAD真实姿态在mobile先验0bda与desktop35c368均目视确认；mobile自动策略在0bda真实结算后至少两只不同活宠产生正伤害，受控friendly-fire击倒场景。desktop快速策略浏览器验证尚未通过：真实quick ACK为true，开启前敌HP>0、主人DEAD姿态均确认，但后续观察到battle=null且未捕获begin后的BattleTurn，不能证明至少两只活宠继续攻击。诊断在 `browser/desktop-strategy-diagnostic.json`，已交主agent继续判断；不能把服务端单测代替此项浏览器通过。最终HTTP/停服使用独立 `integration_shutdown.py` callback，避免受战斗剧本失败阻塞。不同候选的证据不混写成同一SHA。

## 最终HTTP与停服保存结果

`integration_shutdown.py`在最终SHA `35c368c0462a93ee41fe5d938c6712c393e58bd5a728dc85f1d4dd1d5a998505` 上成功退出0：真实Chromium密码登录、GM移动至floor300,(371,183)，读取权威坐标；在ELF仍运行时执行最终 `verify-delivery.py --base` 并检查成功。最后主动SIGTERM、wait取得exit0，再用SQLite核对ID1位置完全匹配（`position_matches=true`）。公开证据 `browser/runtime-shutdown.json` 和主目录 `binary-http-verification.json`。本次没有留存运行中的ELF或浏览器。
