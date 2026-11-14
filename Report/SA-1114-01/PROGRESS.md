# SA-1114-01 · 实施进度

- 基线：1c5bd7f / v0.2.11-LYNX，工作区原有 Task-Now.txt 为用户本轮任务更新，保留。
- 目标版本：v0.2.12-LYNX。
- 主Agent：战斗HP生命周期、输入/集成、真实浏览器、发行与文档。
- mobile_review：mobile-shell/view与移动专用模块、对应测试。
- server_audit：HTTP/停服构建复核与独立战斗分析。
- 已确认服务端 Alive/Over 以HP>0为准；正在复现客户端HP与dead双状态、毒伤/回复/快速播放分支。
- 用户补充自动与快速战斗均疑似出现，必须覆盖这两条真实路径。

## 真实复现与集成复核

- 旧发行 ELF + Chromium + WebSocket 已实际复现：Fly>0/HP0 敌人被同回合 ReLife 拉起，继续攻击，后续攻击空位。修复版自动/快速两条路径均完成胜利；另外覆盖 HP0 不击飞 fixture。
- 服务端统一排除 Flown（Alive / magicTargets / 敌人辅助技能 / 自动回复候选）；普通倒地仍可被明确复活技能救起。客户端所有 HP 写入同步 dead，毒死播放倒地，拒绝离场目标命中。
- 第一轮真实矩阵 29 项通过，含桌面原生菜单、经典/全屏五尺寸、六类原生窗口、触屏摇杆/抽屉、手动/自动/快速战斗。
- 逐张检查截图后发现背包/宠物重复全文摘要挤压操作，因此继续修复：原窗口登记当前可见槽位元数据，屏内按槽位卡片重排、物品复用真实CG，原动作ID与输入验证保留。新增 RED/GREEN 证据 mobile-cards-* / mobile-card-art-red.txt。
- mobile_review 正把屏内地图拖动接入原 MapWindow.pan；需要重新构建并对最终产物重跑真实浏览器矩阵。
- 正常 Go 全包测试已获得明确退出0（go-test-status.json）。race 在独立 supervisor 下重跑，避免工具PTY生命周期结束掩盖真实进程状态。

## 最终产物回归 · 2026-11-14 UTC

- 真实五尺寸×六窗口几何全部通过；截图确认背包原生槽位图格、宠物卡片可见。补上详情当前宠物的明确HP/攻防敏等字段，去除其他宠物摘要；补上保留sheet在窗口切换时滚动归零。
- 原生地图初轮真实拖动脚本落点失败：map-me工具按钮 scrollIntoView 把地图推到视口外；独立真实 Chromium 已复现 y=-440 空落点。脚本改在工具后滚回地图并用 elementFromPoint确认命中；输入链独立真实拖动正常，非假定输入代码修复。
- 客户端支持类敌人revive播放补齐实际执行时gone/fly检查；有 RED/GREEN。全部HP更新与四种复活入口维护相同离场语义。
- 高负载并行测试中既有素材deadline用例一次因100轮setImmediate未等到异步read而失败；保留 client-tests-loaded-failure.txt，改为串行完整测试151/151通过，未改测试断言掩盖失败。
- 普通自动fixture服务端已产生一次胜利，软件WebGL播放5回合队列超过通用90s验收等待；保留intermediate证据，正常播放单例等待放宽至360s，必须等实际fieldReady完成，不在页面注入跳过。

## 验收完成 / 交付准备

- 最终二进制 SHA256 ea63b938956121a174afcde76cbaae4c01c0839d499b71602f4b360804221694；重复构建相同。
- 最终监督进程明确退出0：151项客户端/构建、TypeScript、vet、最终webclient；Go normal与race全包均退出0。
- 最终真实浏览器62项矩阵、4项死亡复现均通过，0页面错误，两个私有服务器SIGTERM退出0、位置存档匹配。源指纹295文件一致。
- 内嵌46文件、gzip/HEAD/304/私有路径与旧补丁核验通过。新ZIP4358文件逐一匹配公开文件，已移除旧ZIP，保留新ZIP及SHA256；Assets无变更。
- Prompt两个核心任务与执行概述已据证据更新；README、CHANGELOG、版本说明、report与验收报告完成。下一步仅Git提交、推送和远端HEAD核对。
