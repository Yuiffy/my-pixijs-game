# 雨夜旧城：敌人动作与读招

敌人的攻击现在按直刺、重砸、横扫、居合、点射五种姿势展开。每招先快速抬手，再保留可辨认的蓄势轮廓，最后释放、命中、随势与收招。肩、肘、支撑手、站姿和重心一起变化；长延迟招会停在蓄势阶段，不会提前给出弹反提示。

## 时序与战斗规则

- `enemyCombat.ts` 同时提供动作、提示和转向承诺时间。抬手最多 200–240ms；最后约 240–300ms 脚步定向，此前以最多 2.7rad/s 渐进转身。
- 可弹反的武器在距离真实命中不超过 210ms 时亮金白光；此前只有微弱暖光。不可弹反的攻击用红光，并保留红色范围提示。
- 攻击随势由 240ms 延长到 360ms。真实命中仍在出手后 80ms，突进仍只发生在前 120ms。招式原有前摇与伤害保持原规则。
- Boss 在已经抬手或出手时暂缓二阶段切换，避免一招中途改变速度、范围或提示。
- 旧存档缺少 `motionVersion` 时，为正在出手的敌人补回 120ms 随势计时，保持原有距离命中的时间。迁移只运行一次，当前动作版本为 1。

## 画面与性能

`EnemyStrike.tsx` 按实际肩、肘和武器姿势生成刀光，复用顶点缓冲；武器亮光始终挂载，不增加动态灯光。敌人的旧旋转攻击环由刀光替代。地面预警在定向后增强，命中后消失。

锁定镜头向肩侧偏移 0.58rad，注视点朝敌人移动 38%，减少玩家身体对敌人持武器手的遮挡；保留原有镜头碰撞处理。陪伴精灵的“现在弹反”与武器亮光使用相同的命中倒计时，`render_game_to_text()` 暴露 `enemyTells` 供验证。

本次仍采用五套共享的程序姿势，适配现有方块角色和角色武器；没有逐个 Boss 的完整手工骨骼动画。

## 验收与复跑

113 项雨夜规则测试通过，覆盖全部敌人、两个阶段与三种攻击序号的姿势连续性、延迟招、真实命中与弹反、渐进转向、方向锁定、暂停、二阶段切换及旧存档迁移。修改源文件 ESLint、完整 `pnpm run check`、随后顺序执行的 `pnpm run build` 均通过，构建 ESLint 保持开启。

系统 Chrome 静音试玩从正常引擎输入生成存档，覆盖五种动作与危险招的蓄势、释放、命中和随势，以及暂停、按亮光弹反和 390px 手机画面。开发版 28 张、生产包 8 张截图均通过像素检查、状态 / DOM / canvas / 错误交叉核对并逐张打开目检；两组页面与控制台错误为空。通用客户端的静音系统 Chrome 适配版也在生产包完成移动 / 跳跃输入检查，截图已目检。

生产包拾取回归覆盖钱币、护符、药瓶升级，确认物品只结算一次、拾取后仍能移动、保存与刷新保留进度。三次拾取新着色器编译均为 0，无长任务；本机首帧分别约 40 / 37 / 32ms。四张截图完成状态、像素及目检，错误为空。这些时间仅表示本机该次测试结果。

证据与日志：

- `tmp/night-rain-readability-verified/report.json`
- `tmp/night-rain-readability-production/report.json`
- `tmp/night-rain-readability-production-shared/`
- `tmp/night-rain-pickup-readability-production/report.json`
- `tmp/night-rain-readable-release-{eslint,tests,check,build}-final.log`

复跑时先确认本地服务器 `/game/night-rain` 返回 200，再执行：

```powershell
pnpm run night:test
$env:NIGHT_RAIN_BASE_URL = 'http://localhost:3962'
$env:NIGHT_RAIN_QA_DIR = 'tmp/night-rain-readability-browser'
node scripts/verify-night-rain-readability.cjs
$env:NIGHT_RAIN_QA_DIR = 'tmp/night-rain-pickup-browser'
node scripts/verify-night-rain-pickup.cjs
```

可用 `NIGHT_RAIN_CAPTURES` 指定逗号分隔的截图名，交互断言仍全部运行。`NIGHT_RAIN_BEFORE=1` 仅截取蓄势画面，用于与基线比较。后续如增加独有动作，应保持姿势、刀光、命中与弹反提示共用同一模拟时间。
