# 潮夜格斗 · 浏览器验证

验证入口为 `scripts/verify-tidal-duel.cjs`，默认访问 `http://localhost:3970/game/tidal-duel`。脚本启动安装在电脑上的 Chrome，使用 `--mute-audio`、`--disable-speech-api` 并替换测试页面的 `speechSynthesis.speak`；这些设置仅作用于测试浏览器。

## 2026-10-04 最终三人版本

独立发布检出基于最新 master `6dbb653`。修改源码 ESLint、98 项规则/素材/缓存测试、6 项大厅测试及 600 场 CPU 比赛通过；完整 `pnpm run check` 后顺序执行 `pnpm run build` 通过，保留构建 ESLint。最终生产地址为 `http://127.0.0.1:4048/game/tidal-duel`，使用该构建的 `.next`，没有可修改状态的开发钩子。

| 验收集 | 截图数 | 本机证据 |
| --- | ---: | --- |
| 开发接触判定 | 13 | `tmp/tidal-contact/dev-final/report.json` |
| 开发弥月动作与对局 | 24 | `tmp/tidal-mizuki/dev-final/report.json` |
| 通用客户端空中动作 | 1 | `tmp/tidal-contact/shared-final/shot-0.png`、`state-0.json` |
| 生产接触判定 | 13 | `tmp/tidal-contact/production/report.json` |
| 生产弥月动作与对局 | 17 | `tmp/tidal-mizuki/production-final/report.json` |
| 生产三人电影演出 | 12 | `tmp/tidal-cinema/production-final/report.json` |
| 生产空中模组 | 8 | `tmp/tidal-contact/production-air/report.json` |
| 生产完整流程与大厅 | 12 | `tmp/tidal-contact/production-base/report.json` |

以上最终验收集共 100 张截图，全部通过像素 sanity、公开文本状态/DOM/画布/错误核对并逐张打开目检；另外检查 `tmp/tidal-contact/contours/` 的九张身体/肢体轮廓图集。页面和控制台错误为空，演出故障测试的预期 404 另列。门禁与规则日志为 `tmp/tidal-contact/{check-final,build-final,rules-final,library-final,simulation-final}.log`。

接触专项通过真实移动和按键验证三角色肢体拼招、近身相打、两侧正确方向的精防、返波后真实扣血与训练分段判定框。规则回归区分栞栞高横踢掠过蹲姿和岁己/弥月较低横踢需蹲防，另覆盖低空接触、双 K.O.、回波归属/寿命与再次化解。生产空中路径确认俯冲从有效期开始、保留起手惯性，原皮与换肤均能进入真实有效帧并落地接招。

生产演出使用原生 video 自然播放三人的真实文件，并验证命中后规则冻结、一次伤害、自然结束/跳过、暂停/说明/模拟失焦、2P 真实积能与演出 K.O.、镜像缓存零新请求以及原生 AAC 非零 PCM 解码。减少动态效果通过带该媒体偏好的新页面加载验证：缓存为零、超杀照常结算且没有电影。Chrome 自动化中 `emulateMedia()` 曾更新 `.matches` 却未派发变化事件，因此本次不以该测试证明动态媒体事件分发。其他故障与省流量项通过独立页面测试。

生产复跑先确认 URL 有响应，再运行以下命令；证据写入独立的 replay 目录：

```powershell
$env:TIDAL_DUEL_URL = 'http://127.0.0.1:4048/game/tidal-duel'
$env:TIDAL_DUEL_PUBLIC_MATCH = '1'
$env:TIDAL_DUEL_OUTPUT = 'tmp/tidal-replay/contact'
pnpm run duel:verify:contact
$env:TIDAL_DUEL_OUTPUT = 'tmp/tidal-replay/mizuki'
pnpm run duel:verify:mizuki
$env:TIDAL_DUEL_OUTPUT = 'tmp/tidal-replay/cinema'
pnpm run duel:verify:cinema
$env:TIDAL_DUEL_OUTPUT = 'tmp/tidal-replay/air'
pnpm run duel:verify:air
$env:SMOKE_ONLY = '1'
$env:TIDAL_DUEL_OUTPUT = 'tmp/tidal-replay/base'
pnpm run duel:verify
Remove-Item Env:SMOKE_ONLY
Remove-Item Env:TIDAL_DUEL_PUBLIC_MATCH
```

这轮确认安装版 Chrome 的键盘、原生多指触控与响应式布局，未验证实体手机、Safari 或实体手柄；手柄 API 模拟的历史结果仍仅证明映射与轮询。下文保留各验证入口说明及早期双人版本的历史记录。

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

弥月专项使用 `pnpm run duel:verify:mizuki`，默认 URL 为 `http://127.0.0.1:4044/game/tidal-duel`，也接受同样的 URL、输出目录和有窗口参数。覆盖三人选角、黑丝原皮镜像、56 个弥月动作帧、地面/空中出招、两段踢击、两侧真实 K.O. 结算/重赛、单人 CPU、移动端原生触控与大厅搜索入口。`TIDAL_DUEL_PUBLIC_MATCH=1` 选择公开操作生产路径，无需 `SMOKE_ONLY`；生产还验证升击/超杀费用、训练重置、辅助路线与空中暂停。当前实现和验收记录见 [tidal-duel.md](tidal-duel.md)。

超杀演出专项为 `pnpm run duel:verify:cinema`，使用安装版静音 Chrome、真实键盘/原生多指触摸与原生 video。三角色自然播放、规则/生命/计时冻结、一次伤害、旧键清理、暂停/说明/模拟失焦恢复、K.O. 与回合保护、跳过、镜像缓存零新请求、原生 AAC 非零 PCM 解码、320/390/844 尺寸全部检查；另用测试隔离环境验证 404、损坏 MP4、冷请求停滞、自动播放拒绝以及省流量。预期 404 单独记录，其他页面/控制台错误必须为空。

接触专项为 `pnpm run duel:verify:contact`，支持同样的 URL、输出目录与 `TIDAL_DUEL_PUBLIC_MATCH=1` 生产参数。它使用公开输入，不依赖开发场景 fixture；规则与烘焙限制见 [接触设计](tidal-duel-contact-design.md)。

加 `TIDAL_DUEL_PUBLIC_MATCH=1` 验证生产，不暴露或访问可修改游戏状态的钩子；2P 通过真实拳击积满能量后用组合键完成演出 K.O.。非演出回归脚本只在测试环境关闭演出，以稳定固定步长验证。大厅验证重新加载原生 RAF 文档，避免 Framer Motion 缓存测试 RAF 后停在透明入场状态；不修改产品动画。

以下为 2026-10-03 原始双人版本的历史记录：完整开发验证通过，证据为 `tmp/tidal-duel-final-dev/report.json`；12 张截图已全部打开目检，覆盖两个角色、战术规则、原生多指触摸、暂停保护与四种屏幕尺寸。手柄轮询专项通过，证据为 `tmp/tidal-duel-gamepad/report.json`，对应截图已打开。

最终生产构建在 `http://localhost:3977/game/tidal-duel` 的公开操作验收通过，证据为 `tmp/tidal-duel-production/report.json`；8 张截图已逐张打开目检，跳跃裁切完整，胜负、选人和海报均正常。验收通过键盘完成两局真实 K.O.、自然回合转换、结算及再战，并确认生产环境未暴露可修改状态的开发钩子。大厅搜索“晴海”保留格斗与排球两项入口，格斗海报 WebP 返回 200 并成功解码，入口可跳转到角色选择。测试浏览器拦截访问统计写入并屏蔽外部广告/统计脚本，所有验证均无页面或控制台错误。
