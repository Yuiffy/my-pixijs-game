# 雨夜寻味 · 拾取卡顿修复

2026-10-03。用户报告「一捡东西就会卡住好几秒」。在安装版 Chrome 中分别复现钱袋、护符和药瓶拾取：引擎更新仅 0.8–2.1ms，存档写入不超过 0.2ms，但随后的渲染产生约 4.6–4.9 秒长任务，每次新编译 16 个着色器。

原因是 `Landmarks` 把拾取光源放在会隐藏的物品组内。拾取后设置父组 `visible = false`，Three.js 不再收集该光源；点光源数量参与着色器程序缓存键，因此大批受光材质需要新的程序。追踪捕获的点光源数组长度依次为 63、62、61，与逐件拾取相符。

`WorldView.tsx` 现将光源作为拾取图标的同级对象，拾取时隐藏图标并把光源强度设为零。光源的位置继续跟随原浮动动画，照明会熄灭，渲染中的光源数量保持稳定。这与已有雨灯切换亮度的方式一致，保留原奖励、存档与交互规则。

在相同桌面 Chrome／1440×900 条件下，记录从公开拾取输入到两个 RAF 回调结束的墙钟耗时：

| 拾取 | 修复前开发版 | 修复后开发版 | 修复后生产版 |
| --- | ---: | ---: | ---: |
| 晾衣巷钱袋 | 4908.3ms | 35.5ms | 25.0ms |
| 屋脊金铃护符 | 4811.0ms | 48.9ms | 25.8ms |
| 刻露瓶 | 4604.0ms | 24.0ms | 35.1ms |

修复后上述拾取均为零着色器编译、零长任务。时间仅用于此问题的前后对比，受驱动缓存和系统负载影响，不代表整体帧率或手机性能；物品光源仍保留为零亮度对象，整个世界的区域灯光优化另行处理。

新增 `scripts/verify-night-rain-pickup.cjs`：通过普通引擎移动与战斗生成三个合法的拾取前存档，在真实场景中触发公开输入，记录 WebGL 编译、存档、长任务和渲染帧；默认要求拾取期间没有新着色器编译。随后核对奖励，验证重复交互不重复发奖、拾取后立即移动和存档刷新恢复。没有注入无敌、角色位置或收集进度。

```powershell
$env:NIGHT_RAIN_BASE_URL = 'http://localhost:3926'
$env:NIGHT_RAIN_QA_DIR = 'tmp/night-rain-pickup-verify-dev'
node scripts/verify-night-rain-pickup.cjs
```

诊断基线可设置 `NIGHT_RAIN_PICKUP_ALLOW_COMPILE=1` 仅取消零编译断言。所有测试浏览器均静音并替代语音 API。截图使用整页捕获，检查像素、DOM、画布尺寸和 `render_game_to_text()`。

修复前证据在 `tmp/night-rain-pickup-before/`；最终开发和生产证据在 `tmp/night-rain-pickup-verify-dev/`、`tmp/night-rain-pickup-verify-production/`。两组最终截图各四张，均已逐张打开目检，页面／控制台错误为空。100 项游戏规则测试、修改源文件 ESLint、完整 `pnpm run check` 及随后顺序执行的 `pnpm run build` 全部通过，保留构建 ESLint。浏览器脚本另通过 Node 语法检查与开发／生产运行验证。

开发预览 `http://localhost:3926/game/night-rain` 使用 `.next-night-rain-pickup-dev`；生产验证使用独立 `.next-night-rain-pickup-build`。已清理本任务自动加入的 tsconfig 路径，保留其他任务配置；本轮未提交、推送或部署。
