# 晴海对决 · 浏览器验证

验证入口为 `scripts/verify-tidal-duel.cjs`，默认访问 `http://localhost:3970/game/tidal-duel`。脚本启动安装在电脑上的 Chrome，使用 `--mute-audio`、`--disable-speech-api` 并替换测试页面的 `speechSynthesis.speak`；这些设置仅作用于测试浏览器。

在开发服务器启动且目标 URL 已可访问后运行：

```powershell
$env:TIDAL_DUEL_URL = 'http://localhost:3970/game/tidal-duel'
node scripts/verify-tidal-duel.cjs
```

可通过 `TIDAL_DUEL_OUTPUT` 指定证据目录。默认目录为 `tmp/tidal-duel-qa/`，包含 `report.json` 和代表性页面截图。指定 `HEADED=1` 或 `TIDAL_DUEL_HEADED=1` 可使用有窗口的 Chrome。

完整验证通过实际按键检查移动、跳跃、下蹲、拳、踢、防御、反击、投技、侧移和必杀。战术对照场景通过开发环境的 `window.tidalDuel.game()` 设置双方位置与初始资源，再走相同的游戏更新逻辑，检查防御减伤、对应段位反击、投技破反击、打击中断投技，以及直线攻击与追踪攻击对侧移的区别。另检查双方必杀的能量消耗、同机双人独立输入、AI、超时判定、平局、两回合获胜、再战复位与暂停保护。

触屏检查使用 Chrome DevTools 的原生触摸事件，覆盖两根手指同时移动与出拳、仅松开出拳手指后移动继续、系统 `pointercancel` 后停止移动、跳跃、全屏和竖屏结算。布局覆盖 1440×900、390×844、320×740 和 844×390。

生产服务器没有可修改状态的开发钩子，使用公开控制的冒烟路径：

```powershell
$env:SMOKE_ONLY = '1'
$env:TIDAL_DUEL_URL = 'http://localhost:3977/game/tidal-duel'
$env:TIDAL_DUEL_OUTPUT = 'tmp/tidal-duel-production'
node scripts/verify-tidal-duel.cjs
Remove-Item Env:SMOKE_ONLY
```

冒烟路径覆盖选人、玩法、练习、键盘移动与打击、暂停/继续、返回选人及四种屏幕尺寸。它不替代完整开发验证中的战术规则与触摸检查。

设置 `TIDAL_DUEL_PUBLIC_MATCH=1` 可在生产冒烟路径中加入完整同机对战：通过公开键盘与时间推进接口完成两次真实 K.O.、回合转换、结算和再战，不访问开发状态钩子。竖屏完整验证还对原生 HUD 的角色名、生命、能量、计时字号和位置做断言，确认它与公开状态一致且不遮挡擂台。

完整开发路径还会模拟 `navigator.getGamepads()` 返回标准手柄，恢复浏览器实际帧循环验证双手柄移动、拳脚、反击、投技、防御、侧移、跳/蹲和必杀映射。可用 `TIDAL_DUEL_GAMEPAD_ONLY=1` 单独跑这部分；测试结束会恢复原来的浏览器手柄 API。这证明轮询与映射路径，不替代真实硬件兼容性检查。

每张截图通过 `page.screenshot({ fullPage: true })` 获取，并与公开 `window.render_game_to_text()`、画布尺寸、DOM 和控制台/页面错误共同记录。像素检查拒绝均匀、透明或几乎全黑的截图；遇到截图路径问题时，整套验证会在有窗口的安装版 Chrome 中重试。使用截图作为验收证据前仍须逐张打开目检；像素检查不能判断角色姿态、视觉精度或遮挡是否合格。

2026-10-03 验收结果：完整开发验证通过，证据为 `tmp/tidal-duel-final-dev/report.json`；12 张截图已全部打开目检，覆盖两个角色、战术规则、原生多指触摸、暂停保护与四种屏幕尺寸。手柄轮询专项通过，证据为 `tmp/tidal-duel-gamepad/report.json`，对应截图已打开。

最终生产构建在 `http://localhost:3977/game/tidal-duel` 的公开操作验收通过，证据为 `tmp/tidal-duel-production/report.json`；8 张截图已逐张打开目检，跳跃裁切完整，胜负、选人和海报均正常。验收通过键盘完成两局真实 K.O.、自然回合转换、结算及再战，并确认生产环境未暴露可修改状态的开发钩子。大厅搜索“晴海”保留格斗与排球两项入口，格斗海报 WebP 返回 200 并成功解码，入口可跳转到角色选择。测试浏览器拦截访问统计写入并屏蔽外部广告/统计脚本，所有验证均无页面或控制台错误。
