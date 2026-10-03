# 岁己 · 今天也要动

入口：`/game/sui-fitness`。一局为五天，每天 40 秒；每天结束后选择一项永久强化。食物从场边追来，岁己会自动挥哑铃抵抗，玩家负责移动、闪避和腾出训练时间。

DQ 是慢速厚血敌人，牛肉干会短暂加速，西西里柠檬柚会先瞄准再冲来。接触食物会增加游戏中的体重负担；负担达到 72 或肌肉降到 20，挑战结束。第五天结束时还要达到体重不超过 62、肌肉不少于 55 才能通关。肌肉会缓慢消耗，所以只跑圈或只看体重都无法长期坚持。

三个训练区均需站在区域内并按住训练两秒。开始前必须攒够 24 动力，“自我鼓励”升级后为 18：健身房恢复 9 肌肉、减轻 0.45 负担并强化攻击；游泳恢复 2 肌肉、减轻 1.4 负担并加速移动；居家训练恢复 6 肌肉、减轻 0.75 负担并减少接触负担。击败食物掉落星形动力，地图还会出现绿色瓶装 P 蛋白补给。

| 操作 | 键盘 | 触屏 |
| --- | --- | --- |
| 移动 | WASD / 方向键 | 拖动虚拟摇杆 |
| 冲刺 | Space | 点按冲刺按钮 |
| 拒绝诱惑 | Q | 点按拒绝诱惑按钮 |
| 训练 | 按住 E | 按住锻炼按钮 |
| 暂停 | P / Esc | 暂停按钮 |
| 全屏 | F | 全屏按钮 |

冲刺消耗体力，并提供短暂保护；拒绝诱惑会消耗动力，击退或消除周围敌人。训练时停下移动，保证训练进度不被打断。暂停、打开说明或离开页面会停止模拟；从后台返回后需主动继续。触摸取消会释放输入，多根手指的输入分别维护。

暂停或结算菜单中的“重新挑战”用相同种子立即开始，“换个开局”生成新种子并回到准备页面。分享链接保留种子，但不包含本局进度或本机纪录。最高分、胜利次数和结算局数保存于浏览器的 `sui-fitness-record-v1`；存储不可用时仍可游玩。

浏览器验证使用仓库脚本和安装版 Chrome，测试浏览器静音，并将语音合成替换为空函数。先启动开发或生产预览服务，再运行：

```powershell
$env:FITNESS_BASE_URL = 'http://localhost:3971'
$env:FITNESS_QA_DIR = 'tmp/sui-fitness-dev'
node scripts/verify-sui-fitness.cjs
```

需要查看有窗口的 Chrome 时设置 `$env:FITNESS_HEADED = '1'`。脚本只使用公开键盘/触摸输入及 `window.advanceTime(ms)`，不修改引擎状态。覆盖移动、自动战斗、三个训练区、五天升级通关、失败、暂停/后台保护、全屏、种子分享、纪录刷新、存储受限、390/320px 及横屏的真实多点触摸。证据包含全页 PNG 和 `report.json`；截图同时验证像素、页面宽度、1100×700 画布及 `window.render_game_to_text()` 状态，生成后须逐张打开目检。

游戏使用原生 Canvas 2D 绘制固定 1100×700 的世界，规则以 60 Hz 固定步长运行，CSS 缩放显示尺寸。调用 `advanceTime` 后该页面进入手动计时，浏览器动画帧继续绘制，避免自动计时与测试输入重复推进；截图快进 CSS 入场动画以记录清楚的稳定画面。

17 项规则测试覆盖三类食物、训练启动动力门槛、升级、负担/肌肉失败边界和最终 62/55 通关目标，其中 51 个不同种子（含页面默认开局）通过普通移动、冲刺、清场和训练输入完成五天。运行命令：

```powershell
node --test scripts/tests/sui-fitness.test.mjs
```

开发版与生产版浏览器全流程均已通过，生产预览为 `http://localhost:3972/game/sui-fitness`。生产验收还用一张全新页面验证真实动画循环，完全不调用 `advanceTime`：按住方向键 450 毫秒移动、时间推进与敌人出现、暂停 300 毫秒冻结，以及再次按 P 恢复。`report.json` 的 `liveObservations` 保存前后公开状态。

修改文件 ESLint、`pnpm run check` 和随后顺序执行的 `pnpm run build` 均通过，构建保留 ESLint。为隔离工作区内其他进行中的游戏改动，全量检查与生产预览使用 `C:\Users\yuiffy\.codex\worktrees\sui-fitness-check\my-pixijs-game`，只带入本任务源码及大厅、分享、命令入口；本游戏运行源码与主工作区逐项哈希一致。生产使用 `.next-sui-fitness-final-build`，开发服务已停止并移除本轮临时 TypeScript 引用。6 项大厅规则回归通过；现有 RPG 未使用变量与浏览器数据过期提示仍为警告。本任务未提交、推送或部署。

完整战役的浏览器路线使用种子 41，存储受限使用种子 3；手机验收验证真实触摸与界面操作。51 种子通关来自规则层输入路线，浏览器中的单一种子路线与手机控制验收各有对应范围，不据此推断所有路线或操作水平都会通关。

复跑生产验收：

```powershell
$env:FITNESS_BASE_URL = 'http://localhost:3972'
$env:FITNESS_QA_DIR = 'tmp/sui-fitness-production'
node scripts/verify-sui-fitness.cjs
```

`tmp/sui-fitness-dev/report.json` 与 `tmp/sui-fitness-production/report.json` 各对应 14 张已打开目检的截图，文件名一致：

| 文件 | 状态 |
| --- | --- |
| `01-desktop-ready.png` | 桌面开场与初始目标 |
| `02-desktop-playing-abilities.png` | 键盘移动、冲刺和决心波后的场景 |
| `03-desktop-paused.png` | 暂停与焦点保护 |
| `04-desktop-workout.png` | 健身房训练完成与强化效果 |
| `05-desktop-upgrade.png` | 每日升级选择 |
| `06-desktop-won.png` | 五天目标达成与结算 |
| `07-desktop-lost.png` | 诱惑负担失败与重开 |
| `08-mobile-390-multitouch.png` | 390px 摇杆与训练同时按住 |
| `09-mobile-320-paused.png` | 320px 暂停菜单 |
| `10-mobile-landscape-paused.png` | 844×390 横屏菜单 |
| `11-storage-blocked.png` | 存储禁用下仍可结算 |
| `12-desktop-three-foods-midwave.png` | 三种食物均在场内，果茶瞄准预警 |
| `13-mobile-390-ready.png` | 手机开场与完整立绘 |
| `14-mobile-390-help.png` | 手机规则与通关目标 |
