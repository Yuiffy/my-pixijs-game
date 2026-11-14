# 旅居之魂 · 阶段交接

## 2026-10-26 续作收尾（本地，等待明确恢复）

用户恢复了自然地貌、敌人独有动作、遭遇难度及近墙镜头优化，随后明确要求停止扩展、保留成果并结束。本轮没有提交、推送或部署；远端上一阶段仍为 `f9c4681`。同仓库其他游戏修改保留。

- 岩壁：新增 `terrainVisual.ts` 静态分层岩面与共享矿物纹理。风化仅向原实体内部凹入，近接触带最多 8cm、深壁最多 22cm，保留路线顶边及下层净空；实体地基的旧蓝色厚板侧边改成 10cm 石沿，真实跨空桥保留厚板。调整沉庭排水孔东界。仍为规则街区上的风格化程序地形，不是完整山体重制。
- 动作：`enemyLocomotion.ts` 给普通角色及花礼、栞栞、七海不同站姿、步幅、重心和收招；步相来自真实位移及模拟时钟。保留攻击数值、0.08 秒接触时刻与总时长，改善起手/接触缓动，布料跟随同一动作。敌人使用 YXZ 局部俯仰，并按鞋底角点解析抬升，避免新低姿态陷地；死亡及 BOSS 跳跃仍有独立语义。
- 追击：复现并修复墓门矮墙附近合法玩家位置无法作为敌人寻路终点的问题。敌人选择同层、碰撞及视线均通过的近身位置，保留 320 节点预算、门墙碰撞与精确回岗。相同普通输入复现从原地 10.79m/5 次空搜索，改善为追至 0.69m 并攻击/0 次寻路。不因单一复现扩大或削弱全部敌人。
- 镜头：碰撞改用完整 `deckBottom` 地基厚度；近墙收缩后角色渐隐，离开后恢复。材质副本独立、持续同步换装颜色，拆卸及离开时释放；不改变玩家自由镜头方向。

验证记录：完整 `pnpm run night:test` 227/227 通过（`tmp/night-continue-rules.log`，发生在最后材质同步/鞋底校正之前）；最终镜头材质、动作鞋底、地形和贴墙追击专项合计 19/19 通过（`tmp/night-continue-final-focused.log`）。镜头浏览器回归 344 个转向样本、13 图、错误为空，`tmp/night-continue-camera-final/report.json`；两张最终岩壁低机位图已目检，`tmp/night-rock-bank-browser-cap-final/report.json`，普通步行维持 y=-3。三位首领各一招二阶段完整周期共 508 帧/9 图已目检，`tmp/night-motion-browser-final/report.json` 通过、错误为空，鞋底误差仅浮点精度。测试使用静音 Chrome、虚拟 Pointer Lock、全页截图并核对文字状态和 PNG。

主目录依赖缺失，沿用独立依赖副本 `tmp/night-earth-publish`，仅同步本轮源码验证，未重装共享依赖。最终源码哈希与副本逐文件相同；完整 `pnpm run check` 后顺序 `pnpm run build` 均通过，日志 `tmp/night-continue-check.log`、`tmp/night-continue-build.log`。Next 构建的 ESLint 保持启用，既有其他模块未使用变量警告仍在。副本 ESLint 的 `root: true` 仅用于防止父目录重复插件，不更改仓库检查规则。

遗留：真人遭遇难度、镜头在极窄场景的构图、全地区的自然轮廓及更完整足部 IK 仍待继续。当前只在既有动作上修正最低鞋底接地，转身仍有程序腿的侧向位移，未完成全招式视觉验收。三名子智能体已停止扩展；本轮独立开发服务 4187（PID 206052/202888）已关闭，其他服务未动。未经用户明确恢复不再自动继续。

---

## 2026-10-25 已推送阶段

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
