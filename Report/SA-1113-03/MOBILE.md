# SA-1113-03 · 移动摇杆与自动遇敌

## 变更

移动控制带放在移动游戏画面之后第一位，DOM顺序与CSS视觉顺序一致；状态、菜单和智能映射选项排在其下。打开长列表时控制带保留在独立行；摇杆启用条件仍只允许普通场景，不能在菜单/对话/战斗偷偷移动。竖屏菜单以移动chrome自然滚动，横屏左轨中的选项sheet独立滚动；摇杆不覆盖列表命中区。横屏保留原本左右轨与中间场景，不改变桌面布局。

控制带新增“自动遇敌：开/关”，仅接收到服务器`AutoPlayState.canEncounter=true`时显示，菜单时禁用，战斗/对话时隐藏。点击沿用既有`autoEncounterWanted`与`syncAutoPlay(true)`配置通道，保留autoBattle/quick/settings，不伪造移动、战斗或客户端成功状态。文字及`aria-pressed`只显示服务器ACK的`encounter`值。

## 权威协议

原Hello只含全局配置，EnterFloor只有位置/地图元数据，原AutoPlayState只含挂机意图，不能判定当前位置是否允许遇敌。新增`canEncounter`字段，由world计算：有效AreaAt、正遇敌概率且有敌群、EncounterRate>0、未驱魔/免遇敌装备阻挡、非战斗/观战/队员/交易/摆摊/买摊/窗口状态，以及HP严格高于自动遇敌20%安全门槛。

安全村1000的encount表也有AreaAt（概率0/0、空敌群）；因此仅判断AreaAt!=nil是不足的。新回归使用真实村庄和野外数据，捕获并修正了这一边界。

移动和换层后以及既有世界clock中刷新能力，只对attached消费者检查；能力未变化不推送，后台挂机角色不加额外能力包。Resume/Attach既有完整AutoPlayState快照直接包含当前能力。概率变化/驱魔过期/装备/队伍等状态由clock回收，地图及移动及时刷新。服务器仍在每步与自动行为中独立验证，不信任该展示字段。

## 研究依据

修改前读取MDN官方文档：

- [touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)：浏览器在手势开始时相交目标与祖先触控策略；仅摇杆`touch-action:none`，列表及列表按钮`pan-y`允许浏览器正常滚动，点击事件不全局preventDefault。
- [overflow-y](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-y)：选项scroll容器使用auto和明确的收缩边界，横屏长列表不靠绝对定位叠在摇杆下面。

## 验证

- `node --test client/test/mobile-shell.test.mjs`通过：现有输入身份/原生action/重复frame/摇杆相关回归，新增长60选项时DOM控制优先、安全区隐藏、野外显示、点击不伪造ACK、服务器ACK才更新aria-pressed、菜单禁用与战斗隐藏。
- `go test ./internal/world -run TestEncounterCapability -count=1`通过：真实安全村1000与野外100,650,450、驱魔/死亡/EncounterRate0阻挡、状态变化发包、不变去重及后台不推送。
- 完整main入口TypeScript检查通过，协议Go/TS已统一生成；未自行build-dist，交主Agent一次统一构建。
- 真实Chromium156组件：390×844竖屏和844×390横屏合成60项长列表；控制带在选项上方，鼠标滚轮及CDP真实touch滚动均可操作，未出现pageerror。证据`mobile-layout.json`、`mobile-top-*.png`、`mobile-layout-*.png`；脚本为`mobile-layout-verify.mjs`，直接转译当前源码，不写dist。组件输入是合成菜单，不能冒称最终ELF登录与开关验收。
- 最终ELF安全城隐藏、野外出现和真实开关ACK的端到端验收由主Agent真实浏览器owner执行，结果见同批最终验收报告；物理设备/Safari未认证。

## 文件范围

`client/src/mobile-shell.ts`、`main.ts`、协议源及生成文件；新增world/encounter_availability.go与测试，仅world.go增加字段和刷新调用。未修改fight.go/automation.go/battle.ts，AutoPlayState两个发送分支CanEncounter赋值由策略owner协调完成。无需改client/index.html的基础桌面/移动宿主样式，布局样式集中在MobileShell既有installStyle中。未改版本/README，未提交。
