# 岁己 · 零日余烬 / ECHO ZERO — 序章 Demo 设计说明

> 一句话：把「旅居之魂」的魂系箱庭骨架，搬进近未来丧尸封锁区；玩家扮演岁己，靠弹反与架势穿过第七区，栞栞在无线电另一头指路。
>
> 路由 `/game/echo-zero` · 目录 `src/components/echoZero/` · 资源 `public/games/echo-zero/` · 首次可玩发布 2026-11-13

## 1. 参考与取舍

| 参考 | 借什么 | 在本作里的落地 |
| --- | --- | --- |
| 旅居之魂 (`/game/night-rain`) | R3F + 纯 TS 引擎的分层、检查点/近路、首领起手预警、第三人称相机 | 沿用 `engine.ts`（无 DOM / 无 three）与 `Scene.tsx`（只渲染）拆法，复用 `sui.glb` 关节层级 |
| 只狼 | 架势条、弹反窗口、忍杀、复生点 | `posture`/`deflect`/`deathblow`/`checkpoint`，弹反只在前 0.24s 有效，架势破后按 E 处决 |
| 艾尔登法环 | 锁定、耐力预算、重击蓄势、Boss 二阶段、开阔广场 | `Q` 锁定相机、重击/冲刺斩消耗耐力、Boss 半血进入二阶段并解锁冲击波 |
| 影之刃零 | 冷色刀光、雨夜霓虹、高速突进斩、处决演出 | 青色 `slash` 弧光、`dashSlash`、`deathblow` 时的慢镜 + FOV 收缩 + 镜头震动 |

不做的部分：开放世界、装备 Build、多人。序章只有一个约 70m 的线性街区，目标是把**一场战斗的手感**做扎实。

## 2. 角色与场景

- **岁己（玩家）**：直接复用 `public/games/after-hours/sui.glb`（1.84m、完整 `Sui_*` 关节、14 材质 / 5 张内嵌贴图），拷贝为 `public/games/echo-zero/sui.glb`。`SuiActor.tsx` 按关节名驱动跑、翻滚、三段轻击、重击、弹反、格挡、受击、处决姿态，武器与刀光为程序化几何。
- **栞栞（无线电同伴）**：`ShioriActor.tsx` 程序化 rig，站在站台高处的信号屏旁作开场演出的视觉锚点；全程以字幕/无线电台词引导（不参与战斗，避免 AI 同伴抢戏）。
- **感染者 / 零号 · 回声**：`EnemyActor.tsx` 程序化人形 rig，起手时红色预警弧光；Boss 二阶段换成更深红并额外生成地面冲击波环。
- **场景**：`City.tsx` 纯程序化几何 —— 末班站台 → 霓虹长街 → 信号塔前庭 → 检疫广场。湿路面反射、CanvasTexture 生成的中/英文字形灯牌、实例化窗户、废弃车辆与路障、体积雨、雾、ACES 色调映射与 RoomEnvironment IBL。`world.ts` 里同一份 `OBSTACLES` 同时供物理与渲染使用，保证碰撞和视觉一致。
- **封面**：`public/games/echo-zero/preview.webp`。由 `scripts/generate-echo-zero-cover.py` 复用相邻仓库 `danmaku-to-summary-ts` 的 `tuzi_chat_completions.call_tuzi_images_generations`（`gpt-image-2` / `size=16:9`）生成，走 `api.tu-zi.com` + `127.0.0.1:7890` 代理，密钥读自该项目 `config/secret.json`；不消耗 WorkBuddy 的 ImageGen 积分。

## 3. 战斗系统

纯函数式定步长模拟，`STEP_MS = 1000/60`，`stepGame(state, ms, input)` 可在 Node 中直接跑（单测即基于此）。

| 机制 | 参数 / 行为 |
| --- | --- |
| 生命 / 耐力 / 架势 | 130 / 100 / 100；耐力在动作后延迟 0.62s 再以 29/s 回复，架势脱离防御时 13/s 衰减 |
| 三段轻连招 | `light1 → light2 → light3`，伤害 21/24/38，可在动作 52% 后取消接下一段，或结束后 0.34s 窗口内续接 |
| 重击 / 冲刺斩 | 重击 0.42s 前摇、56 伤害、52 架势；Shift+攻击改为 3.4 位移的突进斩 |
| 弹反 | `F`，动作前 0.24s 有效；成功给对方 48 架势（Boss 34）、回 7 耐力、减自身 14 架势，并触发 hitStop |
| 闪避 | `空格`，0.04–0.35s 为无敌帧，消耗 20 耐力；锁定时无方向输入自动后撤 |
| 格挡 | `C` / `Ctrl`，减伤但涨架势，架势满则崩防；冲击波不可格挡 |
| 忍杀 | 敌人架势破 → `stagger` 2.8s（Boss 3.2s）→ 靠近按 `E`；触发慢镜、FOV 44、镜头震动 |
| 应急针 | `R`，3 支，0.55s 后回 58 HP；信号塔点亮时补满 |
| 锁定 | `Q` / `L`，19m 内最近目标；相机自动朝向并拉远 |

敌人状态机：`dormant → chase → tell（红光预警）→ strike → recover`，另有 `stagger / deathblow / dead`。三类敌人参数在 `types.ts` 的 `ENEMY_STATS`：游荡体、疾行者、Boss「零号 · 回声」（720 HP / 230 架势，半血进二阶段，招式池 sweep / slam / lunge / shockwave，远距离强制突进）。

## 4. 序章流程

1. **标题**：雨夜站台，电影感环绕镜头，黑边 + 胶片颗粒。
2. **开场演出**（约 12.6s，可按 X / 点击跳过）：栞栞的四条无线电、系统封锁提示、字幕与运镜。
3. **Stage 1–2 末班站台 → 霓虹长街**：沿 z 轴北上，按触发线刷出 4 个感染者，教学提示依次点亮（移动 → 攻击 → 弹反 → 锁定）。
4. **Stage 3 信号塔**：靠近按 E 点亮检查点（补满资源、写入 localStorage `echo-zero-v1`），检疫门通电。
5. **Stage 4 检疫广场**：Boss 登场，血条 / 架势条出现。
6. **Stage 5 结局**：忍杀 Boss 后慢镜收束，「序章 · 完」结算（命中 / 弹反 / 忍杀 / 死亡数），可重玩或从检查点继续。

死亡回到信号塔（未点亮则回站台），只保留检查点、章节与累计统计，不恢复战斗状态。

## 5. 操作

| 键位 | 动作 |
| --- | --- |
| `W A S D` | 移动（相对相机） |
| 鼠标移动 / 方向键 | 相机；点击画面锁定指针 |
| 鼠标左键 / `J` | 轻攻击（三段连招） |
| 鼠标右键 / `K` | 重攻击 |
| `Shift` | 冲刺；配合攻击为突进斩 |
| `空格` | 闪避 |
| `F` | 弹反 |
| `C` / `Ctrl` | 格挡（按住） |
| `Q` / `L` | 锁定 / 解除 |
| `R` | 应急针 |
| `E` | 交互（信号塔 / 忍杀） |
| `H` | 操作说明 · `Esc` / `P` 暂停 · `X` 跳过开场 |

手柄：左摇杆移动、右摇杆相机、A 闪避、X 轻击、Y 重击、B 弹反、LB 格挡、RB 锁定、Start 暂停。触屏设备显示虚拟按键。音频为 `audio.ts` 的程序化 WebAudio（刀风、弹反、雨声），无外部音频资源、用户交互前不自动播放。

## 6. 代码结构

```
src/app/game/echo-zero/page.tsx          路由 + metadata
src/components/echoZero/
  types.ts        状态、输入、动作、数值表
  world.ts        关卡几何、碰撞、刷怪表、无线电台词、确定性随机数
  engine.ts       ★ 纯 TS 战斗 / AI / 章节状态机（可单测）
  Scene.tsx       Canvas、GLB 加载、光照、相机、色调映射
  City.tsx / SuiActor.tsx / ShioriActor.tsx / EnemyActor.tsx / Effects.tsx
  EchoZero.tsx    控制器：RAF 循环、键鼠/手柄、HUD、演出、存档、错误边界
  audio.ts        程序化音效
  echoZero.module.css
```

`window.echoZero`（`getState/input/tap/start/respawn/pause/skipIntro/mute/save`）、`window.render_game_to_text()` 与 `window.advanceTime(ms)` 是给浏览器验证用的只读/受控钩子，不暴露内部可变 state。

## 7. 验证

```bash
pnpm echo:test                 # 13 项纯逻辑单测（连招、弹反、架势、忍杀、检查点、Boss 门控、碰撞）
pnpm library:test              # 游戏库：路由 ↔ 目录条目 ↔ 封面文件 ↔ 日期
pnpm run check                 # next lint + tsc --noEmit
pnpm run build                 # 生产构建（ESLint 不跳过）
pnpm echo:verify               # 需先启动 dev server；Playwright 检查渲染/演出/战斗/暂停/移动端并截图
```

浏览器脚本使用 `scripts/lib/night-rain-virtual-pointer.cjs` 的虚拟指针锁，不会移动用户鼠标；启动 Chrome 时 `--mute-audio --disable-speech-api`，截图经 `inspectPng` 拒绝纯黑/单色/透明帧，输出到 `tmp/echo-zero-qa/`。

封面重新生成（需要 `requests` + `Pillow` 的 Python，以及相邻仓库的 `config/secret.json` 与 7890 代理）：

```bash
py -3.12 scripts/generate-echo-zero-cover.py --provider tuZi
```

## 8. 后续可扩展

- 第二段街区与「近路」机关（旅居之魂式的回环）、可破坏掩体
- 处决分支与 Boss 多阶段演出、栞栞的即时支援技
- 完整存档（技能树 / 道具）、难度选项、手柄键位自定义
- 把 GLB 换成带骨骼动画的正式资产，接入 IK 与脚步贴地
