# SA-1113-03 · Task1 战斗数值与倒地显示

## 实现

本子任务仅修改 `client/src/battle.ts`、`client/test/battle-resource.test.ts`，新增 `client/test/battle-dead-owner.test.ts` 与本目录组件脚本/证据；没有修改 main/net/settings/aisetting/server/版本/README，没有生成dist、没有运行发行构建或提交。

HP卡从人物头顶移至实际动画帧矩形下沿，保持5逻辑像素间距；宽度限制128，手机20px、桌面14px，数字采用黄色粗体描边与低透明深底，底部细进度条。本人MP为蓝色细条、骑宠HP为紫色细条，也置于模型下方；不会为每一条再堆一整块数值卡。真实五敌集成截图发现旧横向避让在最底部全部候选被占满时仍保留冲突位置，导致叠卡；现改成联合二维空位求解。候选同时考虑所有模型/已有卡片的矩形边界和底部多行lane，按与当前角色的距离挑选合法空位，并将本人MP/骑条全部高度一起预留。每个候选必须在舞台内、不盖模型、不盖之前的卡；不会将失败位置clamp回已占用空间。如果特殊自定义外形完全盖满舞台而无空位，临时省略该卡而非画到角色或其他数值上，指令/状态面板HP仍保留。所有坐标继续使用800×600逻辑舞台，没有变更场景点击范围或外形资源。

伤害/治疗浮字改为900字重、圆润sans-serif字体栈，黄色 `#ffdf45` 与5px深棕描边，手机32px、桌面24px，取消整块深矩形。字体在战斗本地Canvas绘制，有限128项缓存复用；不影响公共UI字体和其他页面。每个弹跳帧依据完整Canvas尺寸夹取到舞台4px安全边缘，最上方敌人受到伤害时不再弹出画面；横向亦保留完整字形。复用同一数字的Canvas，不在稳定帧重绘同样标签。

## 倒地问题根因与修复

确认 `assets.ts` 的原版 `ANIM.DEAD=2`。旧 `Fighter` 构造函数仅设 `dead=true`，但动作仍为循环STAND；`findAction` 对当前朝向不存在DEAD时会直接回退同方向STAND。因此HP0快照、部分宠物只有其他方向DEAD帧、后续idle覆盖，均可能仍显示站立。

现在HP0构造即选择DEAD；帧选择先查当前方向真实DEAD，再查其他方向真实DEAD，最后才按原通用回退。伤害事件以权威HP<=0或dead标记驱动倒地，兼容缺失/false旧dead字段。死亡且没有仍在进行的击退/返回/击飞时，frame守护防止后来STAND覆盖尸体；复活则恢复STAND并清除星星和倒地时钟。保留原受击→击退→走回→倒地流程，不改服务端伤害或目标合法性。

有些静态地图图号或原资源完全没有DEAD动作，无法凭空生成原版躺姿；这类资源仍走原通用回退，没有修改Assets。组件躺姿使用合成DEAD素材，只证明实际Fighter动作选择链路，不冒充原资源逐宠认证。

## 与 Task2 的最小协作

按主Agent后续授权，在 `sendAllPets` 给倒地主人且自动/快速PvE逐只调用 `smartChooseSoloPet`（历史名字，当前策略也覆盖多人PvE）。每次传入当前宠物自己的技能表与slot、完整战场、明确pvp字段；禁止把首宠skill直接套其他宠。死人不发人物指令、活宠继续发；已提交的宠物不重发。手动与PvP保持原fallback，活主人保持原smartChoose。策略实现归其他Agent所有，本子任务仅接入口。

## 验证

- `node --test client/test/battle-resource.test.ts client/test/battle-dead-owner.test.ts client/test/battle-multipet.test.ts`：21项通过。覆盖HP/MP边界与数值夹取、5敌整段弹跳上下左右安全、真实sprite rect下方安全、缺失旧事件元数据、双方玩家与宠物HP0快照、方向缺DEAD回退、idle不能站起尸体、复活恢复、伤害事件HP0驱动倒地。倒地主人真实BattleScreen openMenu回归覆盖自动/快速、异构宠物skill1/4发各自指令、重复提交防护、manual/PvP负控。
- 审查追加两个P2修复：dead openMenu整批宠物提交后推进aiFirst，防止后续每轮重复petFirst；事件型revive与applyMagic revive均显式清stars/deadAt/dying再进入STAND，避免仅靠frame动作检查漏清。新增两轮petFirst→petThen真实openMenu断言及两个真实复活入口状态回归，20项最终通过。技能fixture使用真实`PETSKILL_NormalAttack`函数名，以覆盖策略白名单。
- 真实移动五敌截图 `mobile-five-enemies-bars-below.png` 曾复现卡片叠字；新增精确11个sprite矩形fixture：本人 `[658,451,34,59]`、四只大宠 `[501,292,160,160]`/`[437,340,160,160]`/`[565,244,160,160]`/`[373,388,160,160]`、小宠 `[684,303,42,43]` 及5敌。双端断言6卡全部显示、完整卡及MP/骑条在舞台内、不盖模型且卡与卡严格不交叠。二维布局修复后21项最终通过。
- 完整客户端入口 `tsc --noEmit` 通过；仅类型检查，没有dist输出。
- `node Report/SA-1113-03/browser/ui-components.mjs`：真实现有Chromium 156.0.8078.4，桌面1000×800与390×844触屏视口通过，无pageerror。加载当前TS源码转译，使用真实BattleScreen、Fighter、drawOverlay以及真实Canvas绘制/字体测量，截图已分别目视。组件验证所有标签在舞台内、资源卡不与合成模型相交、缓存复用与真实DEAD帧选择。
- 组件证据：`browser/ui-components.json`、`battle-ui-mobile.png`、`battle-ui-desktop.png`。场景中的人物轮廓、DEAD位图和数值为合成输入，截图标题明确标注；没有登录服务端，不属于实际战斗或实体设备认证。最终真实ELF认证由主Agent集成。

## 研究依据

修改前阅读旧战斗资源测试、实际BattleScreen渲染与动画选择、公共drawOverlay及上一批真实组件脚本。主Agent已有W3C contrast/state研究，本子任务补取 [MDN Canvas strokeText](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeText)：先stroke后fill，以font/textAlign/textBaseline确定字形位置；Canvas尺寸含描边安全边距，避免只夹文字基点导致字形裁切。使用可测量边界而非凭固定头顶偏移推断。
