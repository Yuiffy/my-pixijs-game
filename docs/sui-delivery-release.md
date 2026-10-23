# 《春日第一单》阶段版本 · 2026-10-24

本次按用户要求收尾并发布当前可玩成果。入口`/game/sui-spring`，游戏库「动作与探索」中显示《岁己 · 春日第一单》。旧原型移至`/game/sui-spring/archive`，继续使用旧存档；新版使用独立版本化存档。

## 包含内容

- 四个街区、十二个连续配送订单，从小馆取汤到亲自摆饭并走到红椅子入座。
- 长短跳、托盘挑击与踩踏借力；第一街区后隔热反弹，第二街区后一次空中蒸汽冲刺。
- 厨房升降烤盘、下陷反弹棚、移动/斜轨餐车、三层分餐带、雨棚与温室、剧场吊台及宴席机关。
- 检查点续玩、快速重试、辅助设置、片段练习和自愿参加的计时热气配送；永久奖励只能领取一次。
- 六位街坊与配送后续、小馆四件可购买/收起装饰、纪念物和餐会重访。开场修理师已换为栞栞。
- 主角16张独立动作姿态，早餐街/面包房/烘炉蟹/午市/货运站与分餐机新增手绘素材；环境18图运行文件总计4693300字节。

## 操作

左右或A/D移动，空格跳跃，Shift加速，J挑击，E取餐/交谈/交付，R回歇脚点。获得蒸汽扣后在空中按K冲刺；落稳后恢复。触屏使用画面按钮，可以同时按移动、跳跃和挑击。主线没有强制配送倒计时。

## 验收与本地复现

本次从独立暂存树快照验证，避免依赖其他游戏尚未提交的改动。完整`pnpm run check`通过后，顺序`pnpm run build`通过，构建ESLint保持启用。63项配送规则及14项旧原型规则通过。生产BUILD_ID为`5q0kX5alRbFlvGll2VWYC`。

```text
pnpm install --frozen-lockfile
pnpm run delivery:test
pnpm run spring:test
pnpm run check
pnpm run build
pnpm start --port 4145
```

确认`http://127.0.0.1:4145/game/sui-spring`返回200后，设置`DELIVERY_BASE_URL=http://127.0.0.1:4145`运行`pnpm run delivery:verify`，或将`DELIVERY_ART_FOCUS=freight`后运行`node scripts/verify-sui-delivery-environment.cjs`验证本轮场景。浏览器脚本需要安装版Chrome和可解析的playwright包。

发布生产环境已通过十二单正常输入路线、实际入座、装饰购买回访、机关状态与渲染对齐、手机横竖屏，以及键盘/触控/暂停/续档/旧归档回归。开发27张、生产27张、控制与归档20张，共74张截图全部逐张打开检查，同时检查像素、DOM、画布、文字状态与控制台。测试浏览器静音，speech关闭，Pointer Lock在测试上下文内模拟。

本机4145试玩已更新至干净生产快照`D:/workspace/myrepo/sui-delivery-release-20261024`，31个实际脚本和环境文件的SHA与验收服务一致；切换后再次通过开场栞栞支线验证。服务运行期间保留该快照目录。

## 后续边界

雨天屋顶、剧场和远景仍有程序化占位；敌人与居民的独立动作、更多可操作人物关系、手机竖屏地下留白和声音还需精修。尚未完成多人真人试玩、人工声音验收及手机真机性能测试。自动通关不能证明两至三小时体验或真人趣味。

完整方向保存在[sui-spring-direction.md](sui-spring-direction.md)，制作历史在[sui-delivery-progress.md](sui-delivery-progress.md)。美术使用内置`image_gen.imagegen`生成，原始素材在`docs/art/sui-delivery/`，运行素材在`public/games/sui-spring/`；完整提示词与SHA见[sui-delivery-art.json](sui-delivery-art.json)和[sui-delivery-environment-art.json](sui-delivery-environment-art.json)。
