# 变更前官方资料调研

2026-11-15实际联网读取下列官方当前文档，先于生产代码修改；采用与现有事件循环/存档结构适配的做法，没有为追求新API扩大改动。

| 来源 | 实读结论 | 本轮应用 |
| --- | --- | --- |
| [Go: Executing transactions](https://go.dev/doc/database/execute-transactions) | 一组更新需要全部成功或全部失败；Commit/Rollback检查错误。 | 世界事件循环中先校验费用/空位/宠物状态，再一起修改金币及Pets，沿用整个人物存档，避免另建异步培养写模型。 |
| [SQLite: Transaction](https://www.sqlite.org/lang_transaction.html) | 多读单写；自动事务以最后语句完成为界。 | 沿用现有单机SQLite和人物完整快照，核查正常停服排空，并用重新读取数据库确认培养状态/经验，不引入额外逐宠SQL。 |
| [Microsoft Playwright: Emulation](https://playwright.dev/docs/emulation) | viewport、screen、userAgent、hasTouch属于模拟参数。 | 使用真实Chromium/HTTP/WebSocket和隔离SQLite，桌面和触屏视口分别验收；明确不等于实体设备。 |
| [W3C WCAG2.2: Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | 目标尺寸24×24 CSS px或满足间距等例外。 | 保留现有至少44px移动操作目标，检查上一页/下一页/确认在竖横屏可达，避免创建难点的小分页按钮。 |

验证边界：文档是官方当前工程指导，不能据此宣称采用了尚未验证的最新研究算法或取得实体手机认证。
