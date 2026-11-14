# SA-1114-05 官方资料核对

核对时间：2026-11-14T12:57:59.953713+00:00

在生产代码修改前读取官方维护页面，采用与现有运行时兼容的方法，不为新颖而更换引擎。

- Go race detector: https://go.dev/doc/articles/race_detector
  - HTTP 200; 页面 38421 bytes；核实术语：-race, runtime。
- MDN Canvas transforms: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Transformations
  - HTTP 200; 页面 169402 bytes；核实术语：save(), restore(), rotate。
- MDN requestAnimationFrame: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
  - HTTP 200; 页面 189941 bytes；核实术语：timestamp, refresh。

应用：动画按有界时间帧推进，分离躯干、腿、尾巴和左爪的局部变换；画布变换保存/恢复，避免影响其他单位。服务端以原生物理伤害与状态生命周期为边界，通过真实 Go 测试与 race 检测验证多目标、死亡及回合状态。
