# SA-1114-04 · 雷萨利朵原生客户端

## 研究与协议

- 完整重读新Prompt，采用已安装TDD、writing-good-tests与verification-before-completion。修改前实际读取Mozilla官方requestAnimationFrame页面：统一时间戳推进，回调频率随显示刷新变化；不靠setTimeout或DOM动画安排五发伤害。缓存`/tmp/sa-1114-04-mdn-animation.html`。
- 与服务端确认29050 `PETSKILL_ElectromagneticCannon`、199301 effect、target1；每发独立KindMagic、combo=false，保留物理reflection/absorb/guardian/mount/ActorHP。驱离以紧随该炮的原生flee事件保留HP，之后由服务端重选活敌。

## 实现与真红绿

- 原地HAND→单体240×240原生图集→物理applyHit→下一发。回合构造队列时目标还未离场，因此每发真正播放时重新验证原目标及守护者存活、未gone/hidden/fly，避免向已空槽播放爆炸。已有flee播放和QuickFrame复用不清零HP。
- 4项战斗回归先有3项失败，确认原实现没有HAND、反射HP未结算、离场空位继续爆炸；修复后4项及旧幽灵风暴5项均通过。
- 独立`lisarido-v1`扩展set4、图像9200000..9299999、199300/199301，原有三组扩展不变。两项新测试先红，添加后全loader18项通过，覆盖各自GPU页、回收后正确URL重载、非法借用莉莉丝图像原子回退。
- 独立生成catalog来自`server/internal/data/lisarido.json`；追加第576格，前五扩展及原570格身份/昵称/照片稳定。GM通过原生idle动画预览角色，效果不当作宠物；详情共用故事摘要。图鉴/GM/目录先红，接入后通过。
- 客户端自动伤害prior按五发平均0.825，不按敌人数倍增。生存宠物白名单含新技能，缺少普通攻击时可选；随机炮击对捕获保护整体避让，包括主人倒下时显式计划，不能仅避开所点单体。此回退AI只能看到本地设置的捕获，队友保护由权威服务器统一处理。
- build先生成独立catalog再编译，故事改变使版本失效；测试先红确认未集成时发行hash不变，修复后构建工具9/9通过。测试均在私有临时fixture构建，未覆盖工作区dist。

## 当前验证与后续

- 完整客户端190/190，构建工具9/9，TypeScript main入口`--noEmit`和`git diff --check`均通过。真实红绿及完整日志保存本目录。
- 首轮生产源码已冻结；主Agent生成原生位图与最终发行ELF后，将在独立`Report/SA-1114-04/browser`验证桌面/触屏原生目录、普通右炮动作、5次顺序远程爆炸、麻痹/驱离与不重击离场目标、移动镜头。当前单元测试不代表浏览器或实体设备验收。

## 最终真实浏览器 · 6项新宠与14项移动回归

- 实际发行ELF `v0.2.15-LYNX`，SHA256 `06fec5241088b2be63987021dd007c96411e79e696c5185d21e803a1dbc982aa`。独立私有SQLite/凭据/runtime和端口执行，串行运行两套浏览器；所有业务变更均为原生GM、点击/触屏/键盘，evaluate只读，CDP只保留公开字段。
- `lisarido-browser-status.json`退出0，`browser/final-lisarido.json`桌面3项+触屏3项共6/6通过，errors为空；首轮通过，无中间失败。原生列表/详情/技能/照相/图鉴576均确认身份、火7风3、技能29050及完整故事。
- 普通攻击两端真实移动靠近目标，并在原生set4页0实际渲染动作中间2/3/4帧（捕捉到纹理9200098），核对右手炮口近爆；未以普通动作首帧代替炮口效果证据。
- 桌面2轮各5个权威shot，实际观察5个顺序burst、22/21个不同电磁图集帧；触屏1轮5shot/5burst、23个不同图集帧。每帧最多1个240×240原生atlas。施法主体持续原位，原生HAND中间发射帧实际到达渲染队列，未用DOM或CSS替代。
- 麻痹状态到达实际存活目标播放。桌面驱离slot16/18时HP仍3140/3287，触屏驱离slot17时HP3277；标准flee播放后gone=true，后续权威shot和实际特效/follow镜头均不再指向已离场位置。摘要`lisarido-browser-summary.json`列出每炮目标、连续burst和状态。
- `mobile-regression-status.json`退出0，`browser/final-mobile-regression.json`14/14通过：地图/战斗各5种尺寸与横竖屏、缩放+/−/重置、真实双指展开和移动，角色可见、游戏意图和镜头保持正确。未重复无改动的整套恢复矩阵。
- 两套最终errors均为空，SIGTERM正常退出0、无超时，SQLite最终位置与UI一致；均绑定相同上述SHA。
- 已人工打开两端右炮/电磁效果和详情PNG确认悬空主体、炮筒与蓝白电弧。准确截图为`browser/final-lisarido-{desktop,mobile}-{pet-detail,album-story,attack-energy,cannon-electric-explosion,paralysis-and-live-expulsion}.png`。
- 效果以真实目标为中心。最左目标的240×240外扩可超出原生800×600画布，超出部分按原生裁切；素材图集自身完整并不表示每个边缘场景都显示完整方形。主Agent确认维持原生居中及画布裁切，活目标与镜头焦点准确；未为截图库改动画/业务。
- 范围为真实Chromium+SwiftShader软件GPU、390×844触屏视口与桌面，移动回归另含320×568、430×932及横屏；不等同实体手机硬件/GPU认证。
- 本代理已停止全部浏览器/服务器后台任务。客户端生产源码、独立runner/runtime和本报告现冻结；主Agent统一发行校验、文档、提交推送。
