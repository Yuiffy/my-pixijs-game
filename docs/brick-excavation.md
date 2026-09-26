# 维阿发掘局

## 玩法来源

本游戏借鉴《新弹丸论破 V3》赌场小游戏 Treasure Hunter! Monolith 的连色挖掘规则，不使用原作图像或角色。

- [公开求解器的盘面逻辑](https://github.com/westpipe/treasurefinder/blob/main/Assets/Scripts/MapLayout.cs)：原作盘面为 22 × 11、四色；四向相连的同色组一起消除，外围存活格沿色阶变换一次。
- [公开求解器的计分逻辑](https://github.com/westpipe/treasurefinder/blob/main/Assets/Scripts/Scorer.cs)：消除砖块得分，覆盖宝物的所有砖块清空后获得宝物奖励。
- [玩家攻略](https://www.reddit.com/r/danganronpa/comments/i7do3m/treasure_hunter_monolith_strategy_guide/)：记录四色顺序与方块点数的辨色用途。

## 本作规则

- 9 × 9 固定棋盘；点击一块砖，敲除与它四向相连的所有同色砖。砖块不下落，也不会自动连锁。
- 被敲区域四向相邻的每块存活砖，按朱红 → 青绿 → 琥珀 → 紫晶循环推进一个色阶。第一份档案只用前三色，并在琥珀后回到朱红。
- 带菱形印记的格子覆盖人物图像。全部目标格显露后找到主播；剩余非目标砖在结算时一并淡出，展示完整肖像。
- 每击消耗一锤；一次敲除至少六块可返还该锤。锤数用尽可撤销或重试；按剩余锤数评定 S/A/B/C。
- 三份档案依次解锁，使用仓库现有的岁己、栞栞、悠亚透明 Q 版立绘。本机只保存最佳评级和落锤数。

相比原作，单砖也能敲，避免最后留下无法清理的孤砖；不设倒计时，改用可重试的步数挑战。鼠标悬停或键盘聚焦可预览同色区域及变色外圈，四色使用不同符号辅助辨识。目标格按立绘透明像素取样并固定在规则数据中，页面不依赖运行时图像解码。

## 实现

- 路由：`/game/brick-excavation`，入口位于 `/demos` 的“轻松挑战”。
- 规则：`src/components/brickExcavation/engine.ts`，纯函数状态更新，固定种子让同一档案可重复练习。
- 界面：React + CSS Grid。砖块使用原生按钮，支持触屏、鼠标、方向键与 Enter/Space；Web Audio 音效默认关闭。
- 调试：`window.render_game_to_text()` 返回棋盘、目标格、剩余步数与关卡状态。

## 验证

规则测试：`node --test scripts/tests/brick-excavation.test.mjs`。浏览器流程：`node scripts/verify-brick-excavation.cjs`，使用已安装 Chrome 截图并检查界面和控制台。修改源码后依仓库要求顺序运行 `pnpm run check` 与 `pnpm run build`。
