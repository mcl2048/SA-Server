# SA-1114-01 · 真实游戏验收复现

这里使用实际发行 ELF、真实游戏素材、SQLite 与 WebSocket，以及真实 Chromium。仅触屏/视口由浏览器模拟，渲染使用 SwiftShader；不代表实体手机认证。操作通过游戏 UI、键盘/触摸与 GM 聊天，页面 evaluate 仅读取状态/几何，不注入战斗或替换网络。

`runtime.py` 用 SQLite backup 克隆一个**自己持有的私有测试角色**。默认种子沿用本机上一轮 `/tmp/sa-1113-03-runtime.json`；其他机器须用 `--seed-meta` 指定私有 JSON，内容为 `dir`（其中有 `test.db`）及 `credentials`（另一个 0600 JSON，包含 account/password）。这些文件、数据库、配置、cookie、服务日志都不进入仓库。不要在生产服执行 GM fixture。

```bash
python3 Report/SA-1114-01/browser/runtime.py --variant final --seed-meta /private/seed.json
node Report/SA-1114-01/browser/real-game.mjs --variant final --matrix
python3 Report/SA-1114-01/browser/runtime.py --variant candidate --seed-meta /private/seed.json
node Report/SA-1114-01/browser/real-game.mjs --variant candidate --knockout
```

需安装 Playwright/Chromium（runner顶部沿用本仓库已安装模块/可执行路径，其他主机应按安装位置调整），Node 26、匹配基础素材与既有机械宠补丁。运行器取得私有目录独占锁，自建服务器仅监听随机localhost端口，结束发送SIGTERM并核对人物位置已写入数据库。

`--matrix` 包括桌面原鼠标菜单、经典/全屏5尺寸、各类原生窗口、30组窗口几何、素材/模型/输入、地图真实拖动/取消/寻路、摇杆/抽屉以及手动/自动/快速战斗。`--knockout` 在临时游戏数据中创建5个使用现有ReLife(500)的敌人，通过真实战斗触发击飞与复活选择；另有现有不击飞外形的HP0实例。没有修改仓库gamedata，也不把此夹具声称为自然地图遭遇。

旧版可用 `runtime.py --variant baseline --binary /private/old-saserver` 重放。旧版报告显示 Fly→ReLife→后续攻击空位；修复版要求离场单位永不恢复、实际胜利与客户端真正返回地图。普通动画夹具可产生多个完整回合，软件WebGL下允许360秒播放；这不是跳过动画或强制修改客户端状态。

`intermediate-*` 保留曾失败的验收：地图工具按钮滚动后旧落点在屏幕外，以及正常回合动画超过通用90秒等待。旧轮截图可能随最终验收覆盖，JSON内的二进制SHA与最终报告是证据归属依据。
