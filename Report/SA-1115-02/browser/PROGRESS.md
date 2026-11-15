# SA-1115-02 浏览器验收进度

- 已阅读PetShop、通用NPC窗口、Ui.getMobileActions和移动DOM镜像；客户端已有服务端控制的上一页/下一页按钮，不另建第二套分页状态。
- 身上固定5槽，寄放/培养选择完整显示这5槽；500容量针对共用寄放/领取列表，以每页5只展示100页。
- 官方资料（2026-11-15实读）：Playwright Emulation（https://playwright.dev/docs/emulation）明确视口与hasTouch模拟边界；W3C WCAG2.2 Target Size Minimum（https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html）用于检查移动按钮可触及、滚动后可点和至少24 CSS px，既有移动UI按钮采用44px。
- 准备复用真实Chromium/官方assets/发行ELF/SQLite隔离场景；场景代码只读原生状态与坐标，业务操作仅原生鼠标/触屏及GM聊天。
- 服务端协作风险：主菜单新增行不得与footer重叠；仓库每行不得超过40半角宽导致折行后选择错位。已反馈服务端Agent。
- 最终浏览器结果须绑定最终ELF摘要；移动为Chromium触屏/视口模拟，不是实体Android/iOS/Safari认证。

- 用户补充同步：隔离种子改为498普通+1既有培养对象，原生UI再培养第500只；每场分别核对两只培养对象各得完整80%，不相互分摊。

## 基线复现

- 旧发行v0.2.19-LYNX / SHA256 c9118a90071366a2aedf38ef28cda70faa2e122792811a81d1be0caeb96aa8f4，在真实Chromium中登录、GM聊天准备角色、点击官方PetShop演员，失败于“培养 option absent”。
- 基线报告baseline-petcare.json；基线ELF由runner拥有，SIGTERM正常退出0。基线场景在桌面断言时关闭了context，因此其saved-position未核对；已修正验证脚本在失败时保留页面，最终需严格核对停服存档。
- 业务操作走原生NpcWindowReply按钮，不调用page.evaluate写游戏对象或直接发送协议。sqlite种子与运行数据库仅私有/tmp，公开产物只包含受控宠物字段/计数、菜单及费用/经验。

## 最终冻结

- 最终唯一ELF摘要35afa759b119be759a83a1f9bf195037545a2daa9dc27242767331db102f2270，Chromium156.0.8078.4。
- 主流程23项通过（桌面11、移动12）；横屏补充3项通过，包括实际滚动末行领取。merge-results.py校验后汇总26项。
- 四场真实战斗人物各875，两只培养宠各700；新培养宠Lv1→9→10→12，普通寄放不变；领取清training及普通寄放250收费回归通过。
- 两个owned ELF SIGTERM0、未超时、位置存档一致；横屏独立监督器Node child rc0。原生UI/事件无页面错误。
- 中间脚本问题各自归档：intermediate-menu-frame、intermediate-empty-text、intermediate-desktop-toolbar、intermediate-landscape-room。主流程最初工具外壳143不混同owned ELF退出0，完整边界写入ACCEPTANCE。
- 浏览器验收资料冻结；本子Agent没有修改任何client生产文件、版本号或发行包。
