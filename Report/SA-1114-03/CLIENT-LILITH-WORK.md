# SA-1114-03 · 莉莉丝原生战斗与图鉴

## 研究与接口诊断 · 2026-11-14 UTC

- 修改前重读 `Task-Now.txt` 新增任务和共享 `RESEARCH.md`；使用已安装 `systematic-debugging`、`test-driven-development` 与 `verification-before-completion`。
- 阅读 Mozilla 官方 [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)：动画按统一时间戳推进，而非依赖回调次数；沿用原战斗队列时间和原生图集，不增加DOM/CSS动画或异步定时结算。研究缓存位于私有临时路径 `/tmp/sa-1114-03-animation-clock.html`。Epic Animation Notifies 官方页面本次返回403，未把未能读取的内容当作依据。
- 现有播放链：`BattleTurn` → 同施法者combo分组 → `magicSteps` → `animOnce` → `Ui.image`原生图集；`kind=magic`避免近战走位。通用`applyMagic`仅覆盖魔法结果，无法正确结算物理反射等结果，因此幽灵风暴需要按权威物理结果走`applyHit`。

## 客户端实施

- 稳定协议编号：莉莉丝199200，幽灵风暴效果199201。原地播放原生HAND(6)双手施法，普通精灵继续原地STAND；主体尺寸和悬浮锚点由主Agent统一生成的原生pack提供，客户端不额外放大。
- 幽灵风暴每个受击半场只播放一次440×330图集：敌侧中心(220,185)、己侧中心(580,415)。单个目标幸存时仍保持半场位置；移动跟随镜头在效果开始转向实际目标。28帧×ticks3的精细素材由主Agent交付，测试不代替素材视觉验收。
- 结算复用`applyHit`，保留伤害、石化、反射、吸收、屏障、闪避、死亡、骑乘和光镜守原逻辑；`guardian`指定守护者时更新实际承伤者，避免把其HP覆盖到原目标。伤害计算、状态概率及目标合法性仍由服务端负责。
- 新增独立`lilith-catalog.ts`和同步脚本，从`server/internal/data/lilith.json`生成故事、成长、属性和地区；`pet-catalog.ts`只聚合展示身份，不改原四宠catalog与同步契约。图鉴追加第575格，原570格和四个扩展格位置不变；GM与宠物详情复用原生动画、缩略图和故事面板。

## 可复现验证

- 先写失败回归，确认旧实现缺少HAND施法、反射死亡不结算、守护者伤害写错目标、莉莉丝图鉴缺项、GM把角色当静态图。修复后专项测试通过。
- 完整客户端命令 `node --experimental-strip-types --test client/test/*.test.ts client/test/*.test.mjs`：173/173通过，无失败；日志 `/tmp/sa-1114-03-lilith-client-tests.txt`。
- TypeScript `main.ts --noEmit`通过；`git diff --check`通过。没有生成dist、构建二进制或提交。
- 真实Chromium、原生PNG视觉、最终ELF与完整发行由主Agent集成；上述Node回归不代表实体设备认证。

## 恢复浏览器工具修正

- 主Agent真实运行已通过桌面12场；移动持久化测试调用`ui.enter()`会通过`?view=classic`重建页面，使仅immersive存在的`inv-act-*`失效。工具恢复移动immersive，并按实时原生命中决定显式动作或拾取/放置路径；不修改产品。
- 最终发行ELF的24场恢复矩阵待发行产物就绪后重跑；此前结果不能冒充最终二进制验证。

## 莉莉丝真实浏览器验收工具

- 新增`browser/lilith-cases.mjs`，调用`ui=await runLilith(ui,results,{variant,out})`；桌面与触屏视口分别通过真实GM给29005宠物、原生出战、照相、图鉴和战斗技能选择。
- 私有runtime增加90005原生高HP防御敌人及区域；仍由正常服务器遇敌选择器生成1–5目标，工具真实重遇直到至少3个。不会改变产品数据或伪造浏览器事件。
- 观察真实`BattlePetCommand`与`BattleTurn`，并只读`Ui.quads`和已载入Assets映射，确认普通攻击位移、原生能量图集、HAND定点动作、199201对应set3第1页440×330动画逐帧及原生石化状态。截图保留列表、详情、技能、图鉴、普通攻击、半场火焰和石化。
- `node --check`与私有runtime `py_compile`通过；最终ELF运行结果另行补录。

## 最终选技缺口修复

- 服务端审查发现主人倒下后的客户端offensive白名单遗漏新技能。先新增回归，实测两个多目标用例错误选择普通攻击；补入`PETSKILL_GhostStorm`并在共享prior使用原生75%倍率，防止单目标时仅因技能槽靠前而选风暴。
- 新增用例覆盖主人死亡时多目标风暴、单目标普攻、死亡/离场敌人不计入全体收益、明确风暴计划沿用21全敌目标。红证据`/tmp/sa-1114-03-ghost-ai-red.txt`；全量客户端178/178通过，TypeScript main入口检查和`git diff --check`通过。
- 客户端生产源码已冻结，后续仅执行真实浏览器验收及工具修正。独立meta/端口/SQLite避免恢复矩阵与莉莉丝验收同时登录、修改同一账号。

## 最终真实Chromium验收 · 莉莉丝

- 最终`bin/saserver`版本`v0.2.14-LYNX`，SHA256 `5184f6b440a4369a6073fb22ae17a83ddbacc3442f0861cd9e2dc163b6b49cc1`。`lilith-browser-status.json`退出0，最终`browser/final-lilith.json`桌面3项+触屏视口3项共6/6通过，errors为空。
- 原生GM给宠物、真实列表/详情/技能/照相/图鉴确认风8火2、29040全敌技能、追加575格故事；原生出战与技能目标点击发出真实`BattlePetCommand`。普通攻击观察到超过20px悬浮位移和实际set3页面0能量帧。
- 原地HAND施法、每敌方半场仅一个440×330原生效果、实际图集逐帧与活目标石化均通过。桌面观察20个不同火焰帧及3个石化目标；触屏视口14帧及5个石化目标。人工打开两端火焰PNG确认幽蓝火焰和骷髅轮廓。
- 最终关键截图：`browser/final-lilith-{desktop,mobile}-{pet-detail,album-story,attack-energy,storm-half-flames,petrified-targets}.png`。SIGTERM正常退出0，无超时；SQLite最终位置与真实UI一致。
- 工具中间失败分别保存在`native-click-intermediate-*`、`screenshot-sampling-intermediate-*`、`sliding-menu-intermediate-*`、`album-back-intermediate-*`。修正包括等待原生菜单滑入可点范围、只在原界面未转换时重试实际输入、连续只读采帧避免截图编码遮过短动作、以图鉴原生关闭返回。高HP私有fixture移到真实分布覆盖层之外，仍按正常遇敌解析与随机选择。
- 范围为真实Chromium + SwiftShader、390×844触屏视口和1280×900桌面；未宣称实体手机GPU或实体设备认证。全程`evaluate`只读，不注入业务状态、协议或动画。

## 最终恢复矩阵与文件冻结

- 同一冻结SHA最终恢复矩阵已结束，`recovery-browser-status.json`退出0，26/26检查（24场战斗+两端设置重载/同步）通过，errors为空，正常停服和SQLite位置一致。详细场景与断言见`CLIENT-WORK.md`和`recovery-browser-summary.json`。
- 本代理已结束所有浏览器/服务器进程；最终runner、runtime、客户端工作记录与两份summary均完成，不再后台写入。生产代码自GhostStorm选技修复后无变动，发行与推送由主Agent统一完成。
