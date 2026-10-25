# 旅居之魂 · 2026-10-25 阶段交接

上一轮按用户“收尾本次改动，下次继续”的要求停止扩展并保留本地。用户随后要求将适合发布的本次改版提交远端；已确认远端默认主分支为 `master`，本次只提交旅居之魂的代码、测试和交接记录。

## 已实现

- 街道增加与碰撞共用的实体地基；真实跨空的桥梁、屋顶、廊道保留薄桥面。地基按下层路线切分，保留阶梯、地下与多层通行净空。桥下增加石拱，远处增加不可达山脊。
- 第一街区增加听雨沉庭（低于街面 3 米）、两端阶道、石庭落脚点、可行走岸坡和遮挡残柱。沉庭与原屋顶路线形成上下对照。修复入口商店墙冲突和新栏杆阻挡原夜市主线的问题。
- 复活点改为“归焰龛”：兜帽守焰石像、残缺金轮、捧火与升烬，未点亮冷色、点亮暖色。保留旧存档 ID、地点名称、首次登记与后续休息规则。
- 敌人按角色扩大前后警戒与追击距离，增加最后目击记忆、有限绕障、回岗与平滑转向。跨地下层不获取目标，已承诺的攻击不因普通脱战距离被打断。
- 花礼、栞栞、米汀二阶段扩为六拍变化，增加追打、迟拍和招牌招式；阶段切换等待收招结束。突进改为解析缓动，步幅与披布使用模拟时间，暂停时不继续走步。

## 关键文件

- 地形：`src/components/nightRain/terrain.ts`、`TerrainView.tsx`、`TerrainBackdrop.tsx`、`earthTexture.ts`、`world.ts`。
- 复活点：`HomewardShrine.tsx`、`NightRain.tsx`、`WorldView.tsx`。
- 战斗：`enemyTactics.ts`、`engine.ts`、`enemyCombat.ts`、`bossCombat.ts`、`EnemyPresence.tsx`、`types.ts`、`companion.ts`。
- 验证：`scripts/tests/night-rain-terrain.test.mjs`、`night-rain-enemy-tactics.test.mjs`、`scripts/verify-night-rain-earth.cjs`。

## 验证与记录

- 全量 `pnpm run night:test`：212/212 通过，零失败、零跳过；日志 `tmp/night-earth-rules-accepted.log`。
- 源码定向 ESLint、`pnpm run check` 后顺序 `pnpm run build` 均通过，Next 构建保留 ESLint 检查。日志为 `tmp/night-earth-lint-source-final.log`、`tmp/night-earth-check-final.log`、`tmp/night-earth-build-final.log`；全仓检查仍有其他模块既有的未使用变量警告。
- 测试夹具同步新收招时序、真实障碍位置及扩大警戒后的合法击杀奖励。自动试玩通过正常输入应对 12 米射手、切换真实锁定，保持完整章节与地下路线的行为断言。
- 浏览器验证通过入口、归焰龛未燃/点亮/休息、沉庭下行至夜市出口、花礼二阶段迟拍，控制台与页面错误均为空。11 张全页图均已打开检查，PNG 非黑屏、画布与文字状态正常。原批次 `tmp/night-earth-browser-final/report.json` 因旧入口夹具中断，`passed=false`，不能当作整批成功；已完成的前三组及 7 图保留。入口修正后两组和 4 图见 `tmp/night-earth-browser-final-route/report.json`（`passed=true`）。
- 浏览器测试使用独立静音 Chrome 上下文与虚拟 Pointer Lock。高处截图被屋顶遮挡，登市出口截图有镜头贴近角色的情况，仅用于通行状态交叉核对，不作为优质地形构图证明；镜头遮挡继续列为下次改进项。
- 提交前按暂存树生成独立验证副本，完整规则再次 212/212 通过，`check` 后顺序 `build` 通过。日志 `tmp/night-earth-publish-rules.log`、`tmp/night-earth-publish-check-isolated.log`、`tmp/night-earth-publish-build-isolated.log`。首次复用共享依赖时因本机 React 包文件缺失而失败；副本按锁文件离线重装后通过。副本仅为 ESLint 增加 `root: true` 隔离父目录重复插件，原有规则与构建检查保留，该测试环境设置未纳入提交。

## 下次继续

1. 从实际游玩反馈调整扩大警戒后的遭遇密度、脱战和远程压迫；尤其复查地下弩手与巨像的共同追击。
2. 继续把规则切分的地基做成更自然的崖壁、侵蚀岸线与建筑基础，逐段设计可互望的地标、捷径和视线；当前仍为风格化程序几何。
3. 深化敌人与 BOSS 独有体态、足部落点、重心、招式衔接与音效，进行真人难度验证。当前改动没有达到《只狼》《黑暗之魂》《艾尔登法环》的资产和动作制作水准。
4. 绕障搜索限制为 320 节点、每个游戏状态每 0.12 秒最多一次；复杂路线可能重试。后续测量帧耗再决定是否建立共享导航结构。

共享工作区同时存在其他游戏改动，收尾时不得整体回滚、暂存或覆盖它们。

收尾仅停止本轮开发服务，并移除本轮 `.next-night-earth-dev` 自动类型 include；其他服务及配置改动保留。大目标保持暂停，等待用户下次继续。
