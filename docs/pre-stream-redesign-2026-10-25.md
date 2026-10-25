# 《岁己：马上就播》移动与引导改造

日期：2026-10-25。入口：`/game/pre-stream`。源码已冻结；未提交、推送或部署。全仓 `check → build` 由主线程统一执行。

## 本轮假设

房间移动只有固定步速、嘉嘉堵路时只能等待，加上拿杯、接水与其他准备的关系不够明确，让实际操作偏被动。加入需要选择方向与时机的短快步，并把建议直接画到房间地面，有望改善开始几分钟的操作感。这是待人工试玩验证的设计假设，自动化通过不能证明游戏已经好玩。

## 已落地

- 新增快步：X/K 或移动端“快步”，持续240ms，速度6.8（普通步行2.65），冷却1250ms。按住不连发；快步能越过嘉嘉，仍被墙阻挡。暂停、读档会终止正在执行的快步，冷却保留。旧存档缺少movement字段时自动补齐。
- 主角快步有前倾、轻微抬升和淡金尾迹；按钮显示冷却进度。
- 新局优先建议拿保温杯，然后接水；接水等待时建议去做其他未完成准备。突发事件优先，全部准备完成后引导到OBS。
- 紫色脚印沿现有寻路目标绘制，包含卧室、卫生间的真实门口；玩家手动选择目标后优先显示所选路线。暂停及小游戏期间隐藏路线。
- 移动端清单默认折叠，只显示当前建议和清单进度；展开后可选任务，选择后收起。初始无关水杯卡隐藏，展开清单时隐藏水卡，提示移到移动控件上方。
- 修复移动端双指操作：左手持续摇杆时，右手按快步立即通过pointerdown触发，不依赖第二根手指产生click。键盘操作仍可使用按钮。
- `render_game_to_text()`新增移动状态、建议目标和实际绘制目标，供验证交叉检查。

## 文件

- `src/components/preStreamGame/gameplay3d.ts`
- `src/components/preStreamGame/PreStream3D.tsx`
- `src/components/preStreamGame/World3D.tsx`
- `src/components/preStreamGame/preStream3D.module.css`
- `scripts/tests/pre-stream-redesign.test.mjs`（新增）
- `scripts/verify-pre-stream-redesign.cjs`（新增）
- `scripts/verify-pre-stream-3d.cjs`（补全第二夜流程、安静浏览器上下文及移动清单适配）
- 本文档

没有新增图像或音频资产。砖块与streamer相关目录无差异。没有改动其他代理负责的游戏。

## 验证

以下已通过：

```powershell
pnpm exec eslint src/components/preStreamGame/gameplay3d.ts src/components/preStreamGame/PreStream3D.tsx src/components/preStreamGame/World3D.tsx
node --test scripts/tests/pre-stream-redesign.test.mjs scripts/tests/pre-stream-3d.test.mjs scripts/tests/pre-stream-controls.test.mjs
```

规则测试20/20通过，覆盖快步方向/距离/冷却/按键重复、墙与门口、嘉嘉碰撞差异、暂停和读档、旧存档迁移、水杯顺序、等待接水时的任务建议、突发事件及最终OBS建议。

浏览器使用已安装Chrome，静音并stub语音和Pointer Lock；没有控制系统鼠标。使用整页`page.screenshot()`，交叉检查DOM、canvas尺寸、游戏文本状态和console/page errors，像素检查拒绝透明、单色与近黑截图。

### 最终专项

- 脚本：`scripts/verify-pre-stream-redesign.cjs`
- 报告：`.tmp/pre-stream-redesign-2026-10-25/focused/report.json`
- 1440、390、320宽度；8张截图，errors为空，8张均已逐张打开目检。
- 桌面真实键盘快步、按住不连发、再次按下、暂停取消；390/320宽度真实CDP双指摇杆+快步；清单展开/选择/收起；手选点心后实际路线与系统建议区分；小游戏禁用快步且实际guide为null。
- 可优先查看：`guided-room-1440.png`、`dash-desktop.png`、`guided-room-390.png`、`touch-dash-390.png`、`expanded-checklist-320.png`。

### 三夜全流程

- 脚本：`scripts/verify-pre-stream-3d.cjs`
- 报告：`.tmp/pre-stream-redesign-2026-10-25/full-final/report.json`
- 33张截图，errors为空，33张均已逐张打开目检。
- 第一、第二、第三夜均通过正常UI和确定性时间推进完成七项准备并开播；完整流程未通过瞬移或直接写完成状态绕过游戏。独立突发事件用例使用fixture准备指定事件与解锁记录。
- 覆盖卫生间、装盘、猫粮、声卡、VTS、OBS、开播和结算，以及第二、第三夜和不同尺寸的突发事件界面。
- 自动解题第一夜约51.25秒、第二夜约34.39秒、第三夜约37秒；这些不是人类试玩时间，不能据此认定平衡已经合适。

## 待下轮

- 需要用户人工试玩评价快步是否形成有趣的路线和时机选择，还是只加速跑腿；本轮没有足够人工反馈证明留存或重复游玩改善。
- 最终目检发现390px的部分小游戏（点心、猫砂盆）左侧提示条会纵向拉长。没有挡住小游戏操作，但影响观感；在源码冻结后记录，下轮修复。
- 帮助弹窗尚未补充快步说明；标题和游戏内按钮已有按键提示。
- 本代理未运行全仓check/build，主线程统一执行并报告最终结果。
