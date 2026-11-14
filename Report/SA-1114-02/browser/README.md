# 真实 Chromium 验收

`runtime.py` 用SQLite backup从已有私有测试角色创建0700隔离运行目录；凭据/config/db/log不进入报告。`real-game.mjs`启动指定ELF并拥有完整停服生命周期。业务变化只通过真实原生按钮、触控、键盘和可见GM聊天；page.evaluate仅只读状态和几何，CDP只监听允许的业务消息。

```sh
python3 Report/SA-1114-02/browser/runtime.py --variant final
node Report/SA-1114-02/browser/real-game.mjs --variant final --matrix
```

需本环境已安装的Chromium/Playwright、真实Assets及私有seed metadata。种子文件路径可由runtime参数指定。默认工具路径在driver中可通过环境变量覆盖。

`--field-matrix`与`--combat-matrix`可在独立隔离运行目录分别执行72项与11项，再运行`python3 Report/SA-1114-02/aggregate-browser.py`核验相同ELF/正常退出并汇总。

`final-real-game.json`为最终83项分组汇总，必须核对binary SHA256及成功退出；`baseline-real-game.json`为旧版缺项。candidate/intermediate/superseded均不代替最终证据。截图不包含认证界面。实际Chromium触屏模拟不等于实体Android/iOS或Safari认证。
