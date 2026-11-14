# SA-1114-03 · 研究与设计依据

更新时间：2026-11-14  UTC
基线：`256f7ab`（v0.2.13-LYNX）

## 外部资料

- [Epic Games · Behavior Tree Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/behavior-tree-in-unreal-engine---overview)：事件驱动状态观察器应在条件变化时取消已经不再适用的低优先级任务。这里采用相同原则：每个行动真正执行时重新检查 HP、离场和可行动状态；不依赖回合开始时预排的旧目标。
- [Go · Race Detector](https://go.dev/doc/articles/race_detector)：并发测试可以发现共享状态竞态，但不能代替确定性战斗回归测试。本轮对战斗状态使用真实回合事件测试，并在最终验证中运行定向 race 检查。
- [Go · Add a Test](https://go.dev/doc/tutorial/add-a-test)：失败用例先固定可复现输入，再用最小修复恢复行为。

## 代码审查结论

1. 自动和快速战斗均由服务端 `automationTick`/`automationBattle` 选择命令；客户端 `smartChoose` 是回退策略，不能代替服务端权威状态。
2. 战斗事件与目标列表可能在同一回合早期生成，执行时必须再次拒绝 HP<=0、`Flown`、`Escaped` 和不能行动的反击者。睡眠等受击后唤醒的规则保留，不能把所有异常状态当作死亡。
3. 自动恢复顺序需要与真实 `MAGIC_Recovery`、`MAGIC_OtherRecovery` 和 `ITEM_useRecovery` 语义一致：恢复精灵需检查实际 MP、战斗可用字段和目标类型；气力药必须按“气”参数识别，不能把“气绝回复”误当作 MP 药。
4. 自动恢复按 `healAt` 低于阈值触发，优先选择可负担且浪费较少的恢复精灵，再选择有效恢复道具；恢复精灵耗尽气力后，应在下一次自动决策使用有效气力道具。
5. 移动端全屏行走／战斗继续使用原生布局和按钮缩放，禁用双指缩放；转屏后重新计算摄像机锚点和可视边界，桌面与经典模式行为保持回归覆盖。

## 变更边界

- 服务端代理负责 `server/internal/battle` 的行动合法性；主代理负责 `server/internal/world` 的自动恢复策略。
- 客户端代理负责 `client/src/ai.ts`、`aismart.ts`、`battle.ts`、`aisetting.ts` 及对应测试，保持服务端事件为权威来源。
- 主代理负责公共层集成、发行、真实 Chromium、Linux AMD64、文档和最终提交；不上传 Assets、运行数据库或凭据。

## 莉莉丝动画与素材研究

- 移动审查代理实际读取MDN requestAnimationFrame官方页（原始摘录在私有临时文件），统一使用游戏时间戳推进原生动画和结算；不新增DOM动画。
- 尝试读取Pillow官方Image参考 https://pillow.readthedocs.io/en/stable/reference/Image.html ，当前网络返回403，未冒称成功读取。结合本机Pillow API及既有原生AnimDef接口，使用RGBA透明图集、MESH局部耳部变形、alpha_composite与Lanczos缩小。
- 雷龙比例直接测量正式Assets：布拉奇多斯100353，dir1首站立帧高145、dir3首站立帧高179；莉莉丝主体约100px，160px格含透明及漂浮余量，不以屏幕高度作为尺寸基准。
- 原图为带烘焙棋盘的JPG，透明化后分层处理。内置image_gen不可用，未切换需授权的CLI/API；报告注明实际制作方式。
