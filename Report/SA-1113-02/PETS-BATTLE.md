# SA-1113-02 · 神宠与战斗数值

## 结论

Task2、Task3 的源码实现与聚焦验证完成；最终候选二进制全链路浏览器集成由主Agent统筹，结果另追加。

## 修改前研究与源码依据

- 阅读 `Prompt/Task-Now.txt`、`server/internal/data/ai_pets.{go,json}`、`battle.go`、敌人生成器、`world/pet.go`、移动布局及 `client/src/battle.ts` / `ui.ts` 的实际绘制路径。
- 权威来源：[W3C WCAG 2.2 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)，修改前实际获取；普通文本4.5:1对比、加粗/增大字形、使用稳定底色而不是依赖场景背景。此处借鉴视觉原则，不宣称游戏Canvas达到完整WCAG认证。
- 游戏数值以仓库实际原始数据和服务端算法为准，不用外部攻略覆盖本服规则。GB18030 解码 `enemybase1.txt` 确认佩露夏有777/970/1501等多个模板，777普通宠物模板为初始40、每级4.50、体腕耐敏35/54/27/33；服务端按原版atoi读4.50为4。排除619异常NPC/10001特殊加强模板，避免选错参照。

## Task2 · 同级预算、角色差异

| 宠物 | 定位 | 体/腕/耐/敏 | 总预算 | 初始/野生成长 |
|---|---|---|---:|---|
| 佩露夏777 | 攻击参照 | 35/54/27/33 |149|40/4|
| 奥普埃 | 稳健风标辅助 |40/29/43/37|149|40/4|
| 克劳德 | 高体高耐坦克修补 |49/28/50/22|149|40/4|
| 格鲁克 | 高腕高敏、低耐速攻 |30/49/23/47|149|40/4|
| 吉米奈 | 较均衡双击输出 |32/48/25/44|149|40/4|

原四宠总预算104、初始28，现总预算增43.3%、初始增42.9%；无无条件伤害倍率、强行暴击或修改全服成长算法。保留属性、技能、捕获难度、栖息地、出生等级与ID。原攻击型神宠最高攻击仍由佩露夏保持，坦克牺牲敏捷、速攻牺牲耐久；已有真实技能流程回归不改规则。

JSON单一源保留 `legacyBase`，客户端目录重新生成。安装校验从旧104上限改为严格149预算，测试直接比较真实佩露夏777的初始及成长参数，不仅改变断言数字。

### 已有宠物迁移

- `parsePets` 在发送属性前同时处理随身和宠物店寄存宠物；下一次正常存档持久化，不直接写用户数据库。
- 只匹配四个稳定模板，且四维Alloc均在原始随机roll ±2内；按对应新旧分配比例增强已培养内部体腕耐敏，保留随机roll，并补足初始28→40差额。
- 有Born时同步增强出生记录；早期无Born存档不伪造Born，采用保守初始roll估计。野生成年捕获按GetLevel避免重复添加全部成长。
- 保留等级、经验、主人、自定义名、技能、档次、捕获等级、物品、属性及其他状态；HP按原伤势比例调整，死亡仍为0。
- 新旧Alloc范围互不重叠，以分配本身作为幂等标记；新捕获、重复读档、跨主人交易后再加载不会重复增强。自定义GM非原始Alloc宠物保持不动，以免猜测覆盖定制数值。
- 限制：旧存档没有每级随机成长历史，不能精确重放另一个世界中所有随机roll；采用可复现比例映射保留原培养差异。

## Task3 · 移动数值可读性

- 40×2逻辑像素旧贴图血条改为深色资源卡，白色 `HP 当前/上限`，边框、底槽、正常/警戒/危险进度色，颜色不再是唯一信息。
- 移动字体24（桌面16），伤害/治疗30（桌面20），不透明底色隔离复杂战斗背景；浮字上移避免与血卡重叠。姓名上移，不改变角色目标点击区或战斗位置。
- HP比例及数值夹取，处理负值、超上限与0上限；倒地仍明确显示0。保留本人MP条及骑宠HP卡。
- 修复读取可选旧协议stat/statVal/icon时TypeScript undefined错误：无元数据就不虚构百分比，无图标就跳过，避免NaN文本。

## 验证与证据

- `go test ./internal/data ./internal/world -run 'TestAIPet' -count=1`：通过。覆盖真实注册表、自然分布、捕获和四个真实技能；新增迁移测试覆盖四模板、1/50/140级、随身/寄存、重复载入、±2roll、无Born、成年捕获、死亡、无关模板/新宠/自定义分配。
- `node --test client/test/ai-pet-catalog.test.ts client/test/battle-multipet.test.ts client/test/battle-resource.test.ts`：16项通过，包括目录字节稳定、原五宠命令/重连/快速战斗状态与数值卡边界、旧协议缺失元数据。
- 真实浏览器：现有 `/home/coder/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`，实际版本 `Google Chrome for Testing 156.0.8078.4`。Node Playwright与Python环境 `/tmp/loft-hyraken-paas-venv/bin/python` 均现存可用。
- `node Report/SA-1113-02/browser/pets-battle-verify.mjs`：真实Chromium桌面/390px移动组件渲染通过，直接加载当前TS源码转译，使用真实BattleScreen及drawOverlay绘制，校验数字、尺寸与无pageerror。输出 `battle-resource-{desktop,mobile}.png`、`pets-battle-results.json`。
- **边界说明**：组件场景数值是合成输入，不能冒称已完成认证登录、完整战斗流程或实体设备验证。最终二进制专用 `browser/runtime.py` 与 `browser/acceptance.py` 复用已有UI登录/建角/宠物详情/五宠战斗路径但只向本批目录写新证据；凭据和数据库始终留在/tmp。

## 集成浏览器与已发现问题

- `d1f2cdedcce07d0aec3b3fd8b69a9c1ec70328e4eb2211a0687fe236644e16bf`：多角色真实UI再次通过，两个角色分别ID1/ID2同时在线；关闭首窗口、第三窗口密码登录可见后台徽标，恢复首角色不会影响第二角色；`multirole.json`记录SHA与无pageerror。
- 同一d1f二进制：1280×900原生桌面密码登录→线路→选角→Field通过（`desktop-login.json`）；桌面五宠指令/真实技能/逃跑通过（`battle.json`）。不是只看桌面组件图。
- 地图专项在2c491实测复现产品缺陷：从(371,183)真实小地图点击(379,186)，合法绕障路径10步，45秒仍停留原地，导航显示“正在加载地图并规划路线”，不是点击坐标错位或遇敌。已立即告知主Agent，Task5 owner修为已知局部合法路径立即走，不等待整张大地图。本次修复不在本子Agent文件所有权内。
- 最终发行SHA `f88d9ed94a834493510f89ad00806c72c77ab088cd0f882e8455fbc5208cdff5` 的真实Chromium地图验收通过：配置使用正确顶层 `minimapReveal: 1`，并实际断言 `sa.field.minimapReveal === true`；从(371,183)真实小地图点击(379,186)，合法绕障10步后精确到达并显示“已到达目标”；随后真实点击墙(385,178)，立即显示“目标不可达：目标格为墙体或障碍”。无pageerror，证据 `browser/minimap.json`、`minimap-detour-arrived.png`、`minimap-wall-unreachable.png`。
- 上述多角色/桌面验收SHA为d1f，最终f88仅含此后地图局部路径/已知墙反馈修复；不将旧结果冒标为最终SHA。交接时runtime在127.0.0.1:52427运行，角色ID1最终位置floor300,(379,186)。随后主Agent确认进程已退出；私密server.log记录08:50:59 UTC“已退出，在线角色位置已保存”，但子Agent结束turn后job句柄已回收，无法取得最终f88退出码或信号来源。未对f88主动发送SIGTERM，不能把该记录宣称为最终人工SIGTERM/exit0验收；此前中间候选主动SIGTERM退出0另有工具记录。
- 中间误把minimapReveal缩进rules的私密测试配置已纠正；此前截图只能用于路径复现，不作为全开认证。最终全开结果以 `minimap.json` 的fullReveal=true及f88为准。

## 首个候选二进制真实UI验收

候选SHA256：`4d55fd3fa3db9f0a6d88896ad9be3aed65a87685f30a40e1a3de65b9d19d1b8c`（v0.2.9；最终重建由主Agent另确认）。使用私密隔离runtime端口52427，真实Chromium 156与390×844触屏模拟视口：

- 正常注册、建角、登录通过；先以非GM注册，再重启授予私密测试账号GM，符合保留管理员账号规则。
- 四只新神宠由真实聊天UI逐一获取，40级属性有明确定位差异：奥普埃HP560/攻81/防102/敏78；克劳德640/79/128/52；格鲁克515/126/71/98；吉米奈515/108/71/90（本次随机roll样本，不是硬编码承诺）。
- 四宠详情、技能、快照、图鉴全部通过，见 `browser/details-mobile.json` 和 `mobile-detail-*`、`mobile-skills-*`、`mobile-album-*` 图片。
- 五宠独立选择/指令、实际风标技能回合事件、逃跑完整通过，见 `browser/battle.json`、`five-pets-four-distinct-mechanical-battle.png`。目视检查真实战斗中血量卡可读，无此前2px条问题。
- 后续多角色/地图验收独立脚本分别为 `browser/multirole.py`、`browser/minimap.py`。最终二进制若变化，需要以最终SHA复跑关键路径。

未改README或版本，未提交。生成dist/最终二进制由主Agent统一构建以避免并行冲突。
