# 雨夜寻味：地下支路与装备造型

## 玩家体验

- 弃灯墓地入口在旧寺西侧的停灯小堂内；门缝暖光、残灯与阶前陈设引导发现。
- 风息洞窟入口在茶屋北面的支路石径尽头；岩石、漏光、风动布条提示可进入。沿用第三章开启条件。
- 进入前室显示副本名称与「发现支路 · 地下秘境」，站到圆形机关踏板中央交互后乘梯。墓地下降 7 秒、洞窟 8 秒；铁链、井壁与平台提供连续运动参照，原井可返回。
- 两处都是可选支路；原有敌人、侧路、巨人、独一装备和雨灯保留。地图发现后才显示对应地下区域，标出雨灯、当前位置与返程升降台。
- 行装菜单包含 6 件武器、3 件防具、3 件护符各自的原创 SVG 造型；锻造界面显示雨伞、铁骨伞、雨切刀的不同形态。空护符槽有单独空位图。无需额外下载或图片解码。

## 实现与存档

`dungeons.ts` 保存地面入口、地下平移量、墙体与升降井数据；渲染和碰撞共用实体。墓地入口 (-38, 6, -23.5)，底层 -24；洞窟入口 (-147, 2, -316)，底层 -36。坐标单位米，+x 东、+z 南、+y 上。

`dungeonTravel.ts` 以 smoothstep 连续更新高度，xz 保持原井坐标。乘梯期间动作与移动锁定，敌人和弹体冻结；暂停冻结升降，途中刷新可续行。乘梯不恢复生命、体力或药瓶。镜头缩至井内，地面两层水面留真实井口，避免水面遮挡下降角色；进入地下不动态移除地面灯光，以免灯光数量变化触发着色器重新编译。

存档世界版本为 10。v9 及更早存档的两处远方副本坐标仅迁移一次，涵盖玩家、落地点、血迹、敌人和出生点；物品、生命、敌人进度与图鉴保留。地下雨灯可正常复活和传送；跨层精灵寻路禁用，电梯期间精灵站在角色侧后。

## 验收与复跑

规则回归 `pnpm night:test` 共 125 项通过。新覆盖包含入口可达、连续双向乘梯、输入与战斗冻结、暂停与途中存档、非法状态拒绝、旧档一次迁移、地下死亡与就地复活、跨层行旅保留补给，以及两个副本完整普通输入探索与战斗。既有主线、第三章与基地结局回环同时通过。

静音系统 Chrome 专项 `scripts/verify-night-rain-underground.cjs` 覆盖两个入口、到达特效、下降、地下、返回、地图，以及 1440 / 320 宽度的武器、防具、护符和锻造菜单。装备选择实际生效。每张截图进行像素 sanity、状态、DOM、canvas 与控制台核对，并打开目检。浏览器使用 `--mute-audio` 与 speech stub，保留正常游戏音频设置。夹具从已有合法存档经规则探索、收物和锻造生成，浏览器内没有直接修改游戏状态。

```powershell
pnpm night:test
pnpm run check
$env:NEXT_DIST_DIR = '.next-night-underground-release'
pnpm run build
pnpm exec next start --port 3960
```

在另一个终端运行：

```powershell
$env:NIGHT_RAIN_BASE_URL = 'http://127.0.0.1:3960'
$env:NIGHT_RAIN_QA_DIR = 'tmp/night-underground-production'
node scripts/verify-night-rain-underground.cjs
```

本轮开发证据：`tmp/night-underground-final-dev/report.json`（24 张）、`tmp/night-underground-final-shared/`（通用客户端 1 张，无错误）；规则日志 `tmp/night-underground-tests.log`。生产验收证据为 `tmp/night-underground-production/report.json`，初次顺序门禁日志 `tmp/night-underground-{check,build}.log`，整合 master `9aa7182` 后的最终门禁日志 `tmp/night-underground-master-{check,build}.log`。完整门禁在隔离检出执行，避免其他游戏正在开发的改动混入本次发布。

装备图是行装与锻造菜单中的物品插图；没有为防具新增三维换装模型。电梯为本地实时演算，无视频素材或生成积分消费。
