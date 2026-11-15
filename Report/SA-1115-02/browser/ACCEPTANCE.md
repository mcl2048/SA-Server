# SA-1115-02 · 真实浏览器验收

**26项通过：桌面11项、移动竖屏12项、移动横屏实际触控3项。** Chromium 156.0.8078.4，发行程序v0.2.20-LYNX，SHA-256 `35afa759b119be759a83a1f9bf195037545a2daa9dc27242767331db102f2270`。汇总见[final-petcare.json](final-petcare.json)，原始分场景结果保留为[主流程](final-main-petcare.json)与[横屏](final-landscape-petcare.json)。

真实ELF负责HTTP、WebSocket、战斗与SQLite；浏览器实际加载官方assets和该ELF内嵌客户端。只读页面原生状态/几何用于定位，业务变化通过鼠标、触屏、NPC按钮与原生GM聊天完成，没有注入协议、伪造战斗事件或直接写运行中的游戏对象。

## 已验证的行为

| 范围 | 实际证据 |
| --- | --- |
| 培养菜单与选择 | 桌面/移动所有5项可达；身上5槽完整显示，8汉字自定义宠物名保持身份；报价=(人物50+宠物等级)×100；取消和余额不足不扣费、不转移宠物。 |
| 500容量与分页 | 私有种子498只普通寄放+1只既有培养，UI付费培养第500只；列表每页5只，从第1页、次页往返直至第100页；首页无上一页，末页无下一页；培养与普通寄放均拒绝第501只。 |
| 两只各自80% | 桌面普通自动/快速、移动普通自动/快速共4场真实战斗，人物每场获875，两只培养对象**各自**获700，没有分摊。普通寄放对象经验/成长字段不变，GM人物经验不触发培养。 |
| 自动升级与无随身宠持久化 | 全部随身宠移出后战斗仍保存培养成长；新培养宠等级1→9→10→12，余经验按官方exp.txt逐级扣除核对。 |
| 领取与旧寄放 | 第100页选择正确培养对象，领取后回随身栏并清除training；再普通寄放仍收50+人物等级×4=250，保持非培养状态并从第100页正常领回。 |
| 移动尺寸与转屏 | 390×844与844×390真实Chromium触屏/视口模拟；按钮至少24 CSS px。横屏右栏独立滚动，实际触控培养、上一/下一页到100、滚动到最后一只并点击领取；[滚动截图](final-landscape-last-row-scrolled.png)。 |
| 停服与存档 | 两个自有隔离ELF均SIGTERM退出0，未超时，SQLite位置与结束前原生状态一致。横屏独立监督器记录Node实际退出0，见[landscape-process.json](landscape-process.json)。 |

客户端已具备服务端按钮位元驱动的分页与移动DOM镜像，本轮无需改客户端生产源码。500为共用寄放/培养容量；寄放与培养时随身栏固定5槽，一页完整显示这5只，仓库领取清单最多100页。

## 复现与证据边界

从仓库根运行（Node、Playwright与Chromium路径可按机器调整）：

```bash
python3 Report/SA-1115-02/browser/prepare-runtime.py --binary /home/coder/saserver/bin/saserver --meta /tmp/sa-1115-02-petcare-runtime.json
node Report/SA-1115-02/browser/real-game.mjs --variant final
```

初始化器默认通过SQLite backup读取既有私有测试账号夹具`/tmp/sa-1113-03-runtime.json`；可用`--seed-meta`指定包含`dir/test.db`及`credentials`路径的自有私有测试夹具。账号、密码、会话、数据库、配置和服务日志均留在权限0700的临时目录，不在报告或仓库内。`SA_PLAYWRIGHT_MODULE`与`SA_CHROMIUM`可覆盖本机依赖路径。

主流程完成后保留`final-main-petcare.json`；为横屏重新初始化独立meta，运行同一runner并增加`--meta /tmp/sa-1115-02-landscape-runtime.json --cases ./landscape-cases.mjs`。以外层监督器记录实际child返回码到`landscape-process.json`，最后执行`python3 Report/SA-1115-02/browser/merge-results.py`，其验证两个摘要、全部检查、浏览器错误、SIGTERM与存档一致后才生成26项汇总。

移动验证是Chromium触屏/视口模拟，**没有认证实体Android/iOS、Safari或生产部署**。浏览器采用受控GM战斗夹具，覆盖实际普通/快速发奖；其他战斗入口与所有PetShop配置由服务端确定性测试覆盖，本报告不冒充自然野外分布认证。

中间失败均保留并排除在最终通过计数外：旧版缺培养入口的基线RED；网络响应早于原生绘制、空text省略与桌面toolbar助手三个脚本问题；横屏遗漏GM房间前置。主流程工具外壳曾返回143，runner已完整写入成功与自有ELF退出/存档证据；补充横屏使用独立监督器确认实际Node退出0。没有把这些脚本或外壳问题当作产品功能失败，也没有隐去其原始结果。
