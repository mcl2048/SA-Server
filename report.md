# SA-1112-02 · v0.2.5-LYNX 发行前审查

已对43f63a2/v0.2.4-LYNX完成一轮发行前审查、问题复现和生产优化，交付新的静态Linux AMD64二进制 `bin/saserver`，内嵌匹配客户端。协议、游戏数据和SQLite结构兼容，桌面保持原4:3操作路径。

本轮修复手机面板后继续寻路、自动遇敌面板下移动、交易返回漏发取消、桌面模式控件吞方向键释放、输入法回车误提交；增加SIGTERM在线存档退出、JS ETag/304和正确gzip协商；构建清理旧JS并拒绝未知嵌入文件，本地与CI共用staging。手机静止登录页1.5秒DOM变更从761降到1，避免逐帧重复同步。

完整风险、原提交行号、复现、修复及边界见 [发行前审查报告](Report/SA-1112-02/ACCEPTANCE.md)。两个专项审查见 [输入](Report/SA-1112-02/INPUT-REVIEW.md)、[服务端/发行](Report/SA-1112-02/SERVER-RELEASE-REVIEW.md)；历史首次适配报告保留在 [SA-1112-01](Report/SA-1112-01/ACCEPTANCE.md)。

- 完整Go测试254个通过事件（含子用例）、222个顶层测试，0失败/跳过；完整vet、两个HTTP/入口包race通过。
- 客户端16项、构建边界4项、完整TypeScript检查通过。
- 最终ELF真实Chromium广泛回归18+3+4项、输入回归10项、双端交易取消均通过，页面异常0；桌面登录美术区域691,200像素与原版一致。
- 最终ELF保持真实浏览器角色在线后发送SIGTERM，实际验证停服前未落库的新位置在正常退出后保存，退出码0。
- HTML与35个JS经实际HTTP逐字节核验；JS条件请求304，gzip/identity/HEAD/Vary验证通过，重复客户端构建一致。

版本：`v0.2.5-LYNX`，15,114,400字节，0755。SHA256：

```text
b7b08408cbf374971971c8ee275601c242d7c72350f1d1ece13bfecabe5f1e5c
```

运行仍需config.yaml、gamedata和assets。实体iOS/Android、Safari、真实IME及高并发负载未认证；Windows/macOS附加交叉编译因依赖下载取消，本轮Linux交付不受影响。SIGKILL/断电无法执行正常保存。细节和复现中夹具问题已如实记录。

最终提交、非force推送和远端HEAD以实际Git核验为准；交付前已完成最终二进制的真实浏览器操作。
