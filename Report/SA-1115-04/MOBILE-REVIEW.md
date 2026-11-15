# SA-1115-04 移动地图审查

基线 `08e2544` / `v0.2.21-LYNX`。只修改地图窗口、移动原生地图桥接和对应测试；Field 寻路、服务端目录与最终发行由主线集成。

## 已确认风险

- 移动原生地图将 `isPrimary` 错当作主按钮。`isPrimary` 标识同类指针的主指针；鼠标右键／中键、笔侧键仍可为主指针。基线真实 Chromium 在手机界面右击地图后实际改变导航；单元回归也证明中键拖动会发送原生平移事件。
- 左栏旧字号16px 对长地点名省略，NPC 仅在图上显示点，缺少本层可点击目录。新增“NPC”页；列表按当前场景的服务端 NpcList 派生，点击交由 Field.navigateNpc 保持服务端及路径规则。NPC格可通行时到达准确坐标；墙／传送格用可达邻格。不会自动对话，也不会把NPC列表扩大到洞窟其他层。

## 实施

只允许 button=0 进入移动地图目的地桥接；触屏、笔尖与左键保持原坐标换算。地点与NPC名称用12px完整换行，坐标独立一行，按实际行高分页；原生移动热区保留完整名称、坐标和条件入口提示。排版缓存随楼层、Field或服务端数组更换而失效。

“地点／NPC／区域”三页均使用12px完整换行；当前NPC标记与列表不会对历史楼层发起NPC请求。

单元验证覆盖67个NPC的全部分页、精确对象选择、换图重置、完整长名字渲染、主指针设备、非主按钮、取消再点击。证据：mobile-native-map-red/green.txt、mobile-sidebar-red/green.txt。真实浏览器基线证据：browser/baseline-mobile-input-run.txt、browser/baseline-automation.json；最终发行真实浏览器验证见下文。

## 修改前研究（2026-11-15）

重新抓取 W3C Pointer Events Level 3：<https://www.w3.org/TR/pointerevents3/>，采用其主指针与按钮分离、捕获取消语义；重新抓取 WCAG 2.2 Target Size：<https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>，保持移动列表由原生完整label和重排控件显示，避免因缩小地图字体缩小移动DOM按钮。原始研究文件保存在本机 `/tmp/sa111504-pointerevents.html` 与 `/tmp/sa111504-targetsize.html`。

Chromium使用真实浏览器及SwiftShader，手机模式为视口／触屏模拟，不作为实体Android、iOS或Safari认证。


## 浏览器中间验证

首个候选矩阵在查罕族青年 `(16,4)` 实际到达准确坐标后，因为旧脚本仍要求“必须相邻一格”而失败；只读状态及SIGTERM后的SQLite都为 `floor10001,x16,y4`，零停服超时。此为脚本断言未随明确的准确坐标需求更新，保留 `browser/candidate-*` 证据。最终脚本改为断言真实 `Move`、准确坐标、到达状态及零纠正，再使用新私有实例完整重跑。


## 最终发行验证

`browser/final-navigation-status.json` 记录独立后台监督进程 **exit 0**；`browser/final-navigation.json` 的 **19/19** 项均通过，浏览器错误0。实际发行ELF为 `v0.2.22-LYNX`，SHA256 `474c883b4e9d16b542d96dd76ec2be4adb9f50cde191ebfdbccc454b842fd441`；Chromium 156.0.8078.4，内嵌客户端版本 `16aad116d5c399c2`。桌面1280×900九项、手机390×844十项，手机另旋转844×390。

覆盖当前世界地图100的21处地点全部分页及12px完整名称文本；村庄、洞窟和真实零坐标出口都通过原生Move步行跨图；条件入口保留两个分支。阿布洞窟地下1楼10001仅列本层查罕族青年，桌面和手机均从 `(9,11)` 实际7步到达准确NPC坐标 `(16,4)`，PosCorrect=0。切换历史地图100后，NPC列表仍只列当前层10001，未发送任何其他楼层NpcListReq。移动右键不会移动／导航，实际触屏拖动只平移地图；坐标越界拒绝、输入关闭清理和横竖屏无重复输入通过。

最终实例SIGTERM正常退出0、无超时；只读SQLite保存 `floor100,x633,y491` 与浏览器最终位置一致。截图包括 `browser/final-navigation-cave-npcs-desktop.png`、`browser/final-navigation-cave-npcs-mobile.png` 和对应到达截图。主线最终完整客户端与构建套件 `client-tests.txt` 为274/274通过。

此前两轮因生产代码继续修正而主动中断，证据保留在 `intermediate-pre-cleanup-*`、`intermediate-rebuild-*`；另一次工具前台进程约300秒外部终止143，保留 `intermediate-143-*`，不计为成功。最终通过 `run-detached.py` 创建独立进程会话、写入可检查退出状态，完成整套真实浏览器矩阵。

验证范围限当前仓库数据、有效warp和服务端当时可见NPC。不会自动完成对话／任务资格，也不保证随机／条件warp进入所点分支；资源之外地点不作覆盖声明。手机为真实Chromium的触屏／视口模拟，未声称实体Android、iOS或Safari认证。
