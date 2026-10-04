# 岁己：零点之后

原创第一人称 3D 互动与心理恐怖短篇。参考《米塔》由室内陪伴转向异常空间、不可信叙事的节奏，场景、谜题、文本、角色模型和合成环境音均独立制作。玩家是来赴晚安之约的小饼干，真实岁己是同伴；零点后的另一个「岁己」来自仍在监听、拒绝结束的房间回放。

完整流程：回应欢迎 → 亲手泡茶、送茶 → 合照并保存照片 → 约定明天、向房间说晚安 → 发现照片反转与被扭曲的约定 → 询问岁己、强制停止监听 → 公寓断电、恢复供电 → 录音与午夜密码 → 重复走廊 → 追逐躲藏、关闭回放源 → 留在循环／走向天亮。死亡从当前章节检查点重试，菜单可以继续进度或重新开始，手记保留关键线索与合照。

## 技术与美术

Next.js、React Three Fiber 与 Three.js；独立规则状态、同源碰撞数据和 DOM 菜单。米为单位，Y 向上，第一人称站立视角。Blender 4.5 LTS 作者文件保存到 `assets/after-hours/`，GLB 运行模型在 `public/games/after-hours/`。新版依据仓库中的蓝色双马尾形象制作：银色分层发束、红色动漫眼、海军蓝贝雷帽与披肩、象牙白衬衣与褶裙、手套手指、羽翼与金色月桂光环；面部增加下颌、脸颊、鼻形和绘制贴图。贴图打包进 GLB，不需要网络模型服务。

欢迎、送茶、害羞与合照有对应姿势，眨眼和 Smile／Talk／Worry 嘴部形变配合呼吸、行走、头发与翅膀摆动。真实岁己投影，回放复制体不投影。前段对话与泡茶面板放在画面下部，保留同伴面部可见。

### 面部第四版：圆润动漫眼（2026-10-04）

按「二次元角色眼睛，不要长扁」的反馈，将眼宽从 0.076 米缩到 0.062 米，开口从 0.030 米增至 0.044 米，宽高比从约 2.53 降到 1.41。轮廓采用饱满的椭圆弧，缩短眼角与外侧睫毛；虹膜和瞳孔改为竖向椭圆，保留红色渐变和克制的高光。上睫毛由逐点变径曲线形成，外侧略厚、两端收细；刘海抬高 0.006 米，让上眼缘可见。

Blender 作者文件、重建脚本与优化 GLB 同步更新，角色版本仍为 2，实际加载的 `face_revision` 为 4。沿用柔和脸颊贴图、眼白／虹膜闭合隐藏与 Smile／Talk／Worry 嘴部形变。

### 面部第三版历史记录（2026-10-04）

面部参考实际的 [岁己四周年 3D 演出回放](https://www.bilibili.com/video/BV1XAt666E6M/) 约 10:08／10:16 的正面近景，采用独立制作的简化动漫脸。眼宽由 0.103 米收至 0.076 米，开口由 0.042 米收至 0.030 米；放松的上眼睑遮住部分红色虹膜，下眼缘只保留浅色局部轮廓，瞳孔和高光缩小。眼面靠近脸部，鼻深由 0.007 米减至 0.003 米，刘海下移、眉线收敛，减少眼部凸出与整圈黑边带来的惊悚感。

脸部使用独立材质与打包的 512px 绘制贴图，添加柔和的脸颊／鼻部血色；身体沿用原有肤色与几何。眨眼接近闭合时隐藏眼白和虹膜，嘴部 Smile／Talk／Worry 形变继续使用。GLB 的角色版本仍为 2，独立 `face_revision: 3` 由运行时读取，并显示在 `render_game_to_text()` 的 `renderer.character.faceRevision` 中。保留可编辑的 Blender 源文件与重建脚本，模型元数据仅记参考 BVID，运行时没有外部贴图请求。

WASD 移动、鼠标锁定／拖动与方向键转头、E 互动、Shift 跑步、F 手电、J 手记、Esc 暂停。手机提供左摇杆、右侧滑动与互动按钮。音效在玩家操作后才启动，菜单可静音；浏览器自测强制静音并禁用 TTS。

## Blender 与 Codex

本机已安装官方便携版 **Blender 4.5.14 LTS**：`D:/develop/Blender/blender-4.5.14-windows-x64/blender.exe`，开始菜单快捷方式为「Blender 4.5 LTS」。安装 ZIP 已与官方 SHA256 校对：`b9533d2397ac1984db4466fb23a7a4649391cca93f6e84209f9bcc60d071c8b9`。

Codex 已全局注册启用 `blender-local`，使用独立 Python 环境 `D:/develop/Blender/codex-bridge/.venv/Scripts/python.exe` 与 `mcp==1.26.0`。安装目录的 `codex_bridge.py` 和仓库源码哈希一致。配置由 Codex CLI 管理，当前字段如下；移动仓库后应同步更新项目路径。

```toml
[mcp_servers.blender-local]
command = "D:/develop/Blender/codex-bridge/.venv/Scripts/python.exe"
args = ["D:/develop/Blender/codex-bridge/codex_bridge.py"]
startup_timeout_sec = 30
tool_timeout_sec = 330

[mcp_servers.blender-local.env]
BLENDER_EXECUTABLE = "D:/develop/Blender/blender-4.5.14-windows-x64/blender.exe"
BLENDER_PROJECT_ROOT = "D:/workspace/myrepo/my-pixijs-game"
```

`scripts/blender/codex_bridge.py` 提供版本检查、bpy 执行、资产构建、场景检查和离屏渲染五个工具。每次操作在独立后台 Blender 进程中执行；编辑必须显式保存 .blend 文件。项目路径约束控制工具的路径参数，bpy 脚本限用于可信的本地作者脚本。当前会话通过真实 MCP stdio 客户端制作资产；新 Codex 会话可加载已注册的工具，已有会话需要刷新 MCP 连接或重开会话。

连接证据：`tmp/blender-mcp/connection-report.json`。`--registered` 读取实际 Codex 配置，初始化已安装的服务、发现五个工具、创建 114 顶点球体，并用 `--inspect` 读取两个实际 .blend 文件的对象、纹理与角色关节层级。此前的资产重建也通过 MCP 的 `run_asset_builder` 完成。

```powershell
codex mcp get blender-local
& 'D:/develop/Blender/codex-bridge/.venv/Scripts/python.exe' scripts/blender/verify_connection.py --registered --inspect
```

## 资产重建

```powershell
& 'D:/develop/Blender/codex-bridge/.venv/Scripts/python.exe' scripts/blender/verify_connection.py --registered --build --inspect
pwsh -NoLogo -NoProfile -NonInteractive -File scripts/blender/optimize-assets.ps1
```

作者脚本 `scripts/blender/build_after_hours.py` 生成场景，并调用 `build_sui_v2.py` 生成新版角色，压缩保存 .blend，关闭自动备份版本。只重建角色时，可通过 Blender MCP 执行 `build_sui_v2.build_character(OUT)`，随后运行 `pwsh -NoLogo -NoProfile -NonInteractive -File scripts/blender/optimize-assets.ps1 -Assets sui`，避免改写公寓资产。优化脚本通过 glTF Transform 4.2.1 去重、焊接与清理，保留命名关节和形变，无额外几何解码器；同时更新 manifest 中的相对源路径和运行文件大小。公寓 GLB 约 3.48 MB，当前角色为 1,966,196 字节（约 1.97 MB），五张绘制贴图全部内嵌。

角色有 20 个命名关节支点、46 个网格、83,832 个三角形与 14 个材质，新增前臂、小腿、发束、翅膀和眼部支点，由 `SuiActor.tsx` 驱动。场景统一使用米制碰撞与交互数据，玩家、同伴和回声共用地面与 A* 障碍规则；终点段也检查碰撞，玩家不能穿过真实同伴。关键灯光跨章节保留，避免因灯光数量变化重新编译材质。启动前预编译，画面丢失时暂停，重载后保留游戏进度。

## 晚安之约与回放线索

茶包、热水、蜂蜜／柠檬按实际顺序操作，茶杯出现在手中并送给同伴。固定相机由玩家按下快门，保存 640×480 JPEG 到本地存档，并显示在手记和实体相框中。拍摄时克隆相机，使用固定横向宽高比 640／450，同步临时渲染后加上照片底边，并在 `finally` 中恢复渲染器原尺寸；桌面和手机保存的照片都能保留完整角色，不启用持续 `preserveDrawingBuffer`。异常相框显示真实合照的镜像，提供照片近看面板，随后引导询问岁己。

「明天见」或「再坐一会儿，但我们还有明天」的选择会被房间歪曲，也在后续线索中回应。月亮茶杯、直播台的星和门口的太阳说明配电顺序；维护录音与 00:17 解释密码、时钟门和关闭回放源的原因，名字门要求保留原本的 SUI，而非镜像 IUS。天亮时真实岁己记得选过的茶。

存档版本为 v2，沿用 `sui-after-hours-v1` 键，保留照片、配茶和约定。首版 intro 存档迁入新序章；已经进入恐怖章节的首版进度继续保留，不要求重玩前段。

## 面部第四版验收（2026-10-04）

发布候选在独立检出 `D:/workspace/releases/after-hours-v2-20261004` 中先整合远程 `master` 的 `b13f393` 游戏馆命名更新，再验证圆润眼型。角色运行组件 ESLint、21 项游戏／游戏馆规则与完整 `pnpm run check` 均通过，随后顺序执行 `pnpm run build` 成功，Next 构建 ESLint 保持启用。最终优化 GLB 的校验错误与警告均为零。

最终 Blender 正面与三分之四侧面渲染已打开目检。开发预览从 `/demos` 搜索、点击进入游戏并开始游玩，三张截图全部目检，运行时脸部版本为 4；游戏馆预览采用其中的新眼型实际标题画面。最终生产包在 `http://127.0.0.1:3973` 通过 `FACE_QA=1` 专项验证，30 张 PNG 与两张实际保存的 JPEG 全部逐张打开目检，覆盖桌面和 390px 对话、闭眼／睁眼、蜂蜜／柠檬与两种约定、合照及刷新保留、异常照片近看和 320px 对话。截图像素、文本状态、DOM 和画布尺寸一致，实际脸部版本为 4，页面／控制台错误数组为空；两张合照为 640×480，亮像素约 90.3%，颜色数分别为 62,289／61,939。

证据为 `tmp/sui-face-v4-art-final/`、`tmp/sui-face-v4-final-preview/` 和 `tmp/sui-face-v4-production/`；门禁与浏览器日志为 `tmp/sui-face-v4-release-{rules,check,build,browser}.log`，模型校验为 `tmp/sui-face-v4-final-gltf-validation.log`。开发服务器已停止，仅移除本任务加入的 `.next-after-hours-eyes-dev/types/**/*.ts` 引用。`/demos` 的入口继续指向 `/game/after-hours`，已使用最终生产包验证搜索与点击。

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/yuiffy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:AFTER_HOURS_URL='http://127.0.0.1:3973'
$env:AFTER_HOURS_QA='D:/workspace/myrepo/my-pixijs-game/tmp/sui-face-v4-production'
$env:FACE_QA='1'
node scripts/verify-after-hours.cjs
```

## 面部第三版验收历史记录（2026-10-04）

基于远程 `master` 的 `8412fa3`，在独立检出 `D:/workspace/releases/after-hours-v2-20261004` 中完成修改源文件 ESLint、完整 `pnpm run check` 后顺序 `pnpm run build`，Next 构建 ESLint 保持启用。15 项游戏规则与 6 项游戏馆规则通过；最终优化角色经 glTF Transform 验证，零错误、零警告。`scripts/verify-after-hours.cjs` 的 `FACE_QA=1` 模式专门检查实际加载的脸部版本、闭眼／睁眼、两种配茶与约定、合照保存及刷新、异常照片和 320px 对话。

静音安装版 Chrome 的开发面部验证产生 30 张 PNG 与两张实际保存的 JPEG；最终生产包在 `http://127.0.0.1:3973` 通过完整流程，产生 57 张 PNG 与两张 JPEG。全部已逐张打开目检，覆盖正常对话与合照、恐怖章节回声、双结局、追逐抓人／检查点重试／衣柜躲藏、WebGL 恢复、暂停与 390／320px 双指触控。画面通过像素检查，并与文本状态、DOM、画布尺寸和页面／控制台错误交叉核对；运行时报告脸部版本为 3，错误数组为空。生产合照均为 640×480，亮像素约 90%，超过 6 万种颜色。

证据保存在 `tmp/sui-face-v3-dev/` 和 `tmp/sui-face-v3-production/`，门禁与浏览器日志为 `tmp/sui-face-v3-release-{check,build,browser}.log`，最终资产验证为 `tmp/sui-face-v3-final-gltf-validation.log`。`/demos` 的「岁己：零点之后」继续指向 `/game/after-hours`，预览已替换为目检通过的新脸实际标题画面。开发服务器已停止，本任务自动添加的临时 tsconfig 引用已移除。

推送前整合远程 `master` 的 `7e51993` 雨夜主角动作更新，进度文件保留双方追加段落，本次游戏源码和模型与完整验收版本一致。整合后再次通过 21 项规则、修改源文件 ESLint、顺序完整 check／build，并用静音 Chrome 从 `/demos` 搜索、点击入口和开始游玩。三张新增生产截图已逐张目检，像素／状态／DOM／画布一致，实际脸部版本为 3，页面／控制台错误为空；证据为 `tmp/sui-face-v3-integrated-smoke/` 和 `tmp/sui-face-v3-integrated-{rules,check,build,browser}.log`。

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/yuiffy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:AFTER_HOURS_URL='http://127.0.0.1:3973'
$env:AFTER_HOURS_QA='D:/workspace/myrepo/my-pixijs-game/tmp/sui-face-v3-production'
node scripts/verify-after-hours.cjs
# 专项面部验证时设 FACE_QA=1；完整流程不设置 FACE_QA 或 SMOKE。
```

## 新版验证与复现（2026-10-04）

本轮发布候选在同盘独立检出 `D:/workspace/releases/after-hours-v2-20261004` 中验证。规则用正常移动与公开互动完成晚安之约和两个结局，覆盖配茶顺序、蜂蜜／柠檬与存档、合照前置条件和保存、约定与异常推进、旧档迁移，以及优化模型的关节／面部形变。15 项游戏规则与 6 项游戏馆规则通过，修改源文件 ESLint 与完整 lint／TypeScript 检查通过。

```powershell
node --test scripts/tests/after-hours.test.mjs scripts/tests/game-library.test.mjs
pnpm exec eslint src/components/afterHours/AfterHours.tsx src/components/afterHours/Scene.tsx src/components/afterHours/SuiActor.tsx src/components/gameLibrary/catalog.ts
pnpm run check
pnpm run build
$env:PLAYWRIGHT_MODULE='C:/Users/yuiffy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:AFTER_HOURS_URL='http://127.0.0.1:3963'
$env:AFTER_HOURS_QA='D:/workspace/myrepo/my-pixijs-game/tmp/after-hours-v2-ship'
node scripts/verify-after-hours.cjs
```

最终生产构建使用静音安装版 Chrome，通过正常移动与公开互动完成桌面的蜂蜜／明天约定、手机的柠檬／稍坐片刻支线、恐怖全流程与两个结局。覆盖实际 JPEG 合照及刷新保留、异常照片近看、暂停／指针锁定／手记释放、WebGL 丢失后恢复、追逐抓人／检查点重试／衣柜躲藏，以及 390／320px 双指触控。`tmp/after-hours-v2-ship/report.json` 中的 57 张 PNG 与两张实际保存的 JPEG 已逐张打开目检；截图通过像素有效性检查，并与游戏文本状态、DOM、画布尺寸和页面／控制台错误交叉核对，错误数组为空。两张合照均为 640×480，有效亮像素约 90%，超过 6 万种颜色。

本轮同时修正合照姿势的目标叠加，让双手在胸前相合；提高甜蜜对话遮罩选择器优先级，防止手机样式重新模糊角色；保存合照采用独立横向取景，修正手机照片裁掉头部的问题。游戏馆预览取自已目检的实际游戏标题画面 `tmp/after-hours-v2-art/title.png`，`/demos` 已验证搜索、点击入口与开始游玩。最终 `pnpm run check` 后顺序执行 `pnpm run build` 成功，Next 构建 ESLint 保持启用，仅有其他游戏既有警告；门禁记录为 `tmp/after-hours-v2-release-check.log`、`tmp/after-hours-v2-release-build.log`，浏览器日志为 `tmp/after-hours-v2-release-browser-ship.log`。

推送前已整合远程 `master` 的 `9aa7182` 潮汐格斗更新，保留两项任务的游戏馆目录和进度记录。整合后再次通过 21 项规则、修改源文件 ESLint、顺序完整检查与生产构建，并用静音 Chrome 从 `/demos` 搜索、点击入口进入游戏和开始游玩；三张新增生产截图全部通过像素检查与逐张目检，页面／控制台错误为空。证据为 `tmp/after-hours-v2-integrated-smoke/` 与 `tmp/after-hours-v2-release-integrated-{check,build,browser}.log`。

Blender 中已检查正面、面部和侧面渲染，检查场景结构；优化后的角色经 glTF Transform 验证，错误和警告均为零。动作属于命名支点程序动画，面部使用三种形变；截图与模型统计不能代替角色制作质量评价。

## 首版验证记录（2026-10-03）

开发预览：`http://127.0.0.1:3940/game/after-hours`，独立目录 `.next-after-hours-dev`。生产预览：`http://127.0.0.1:3941/game/after-hours`，独立目录 `.next-after-hours-build`。游戏馆 `/demos` 已加入实景预览和入口。

```powershell
node --test scripts/tests/after-hours.test.mjs
node --test scripts/tests/game-library.test.mjs
pnpm exec eslint src/components/afterHours --ext '.ts,.tsx'
pnpm run check
$env:NEXT_DIST_DIR='.next-after-hours-build'
pnpm run build
```

11 项规则测试通过，覆盖正常移动完成两结局、谜题错误分支、防隔墙交互、追逐抓人、躲藏、重试保留进度、存档恢复和实际 GLB 几何／纹理／关节。游戏馆 6 项测试通过。完整 lint 与 TypeScript 检查完成后，顺序执行生产构建成功；构建 ESLint 保持启用。构建仅有其他游戏原有未使用变量与浏览器数据版本警告。本轮同时把既有格斗引擎的破防判定保存为布尔值，消除 TypeScript 错误窄化；相关 39 项规则回归通过。

浏览器命令如下。使用安装版 Chrome、页面完整截图、像素有效性检查，交叉核对游戏文本状态、DOM、画布和页面／控制台错误。测试强制静音与禁用 TTS；生产广告和第三方统计仅在测试上下文中返回空脚本。若截图无效，使用 `HEADED=1` 重跑，不能把均匀黑屏当作游戏状态。

```powershell
$env:NODE_PATH='C:/Users/yuiffy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
$env:AFTER_HOURS_URL='http://127.0.0.1:3941'
$env:AFTER_HOURS_QA='tmp/after-hours-production'
node scripts/verify-after-hours.cjs
```

浏览器测试通过正常移动、转头、跑步和互动操作完成六章；密码通过页面输入，未通过调试 API 设置进度或传送。验证两个结局、真实刷新续玩、错误密码与配电顺序、实际追逐抓人／衣柜躲藏／检查点重试、鼠标锁定与手记释放、暂停／失焦、WebGL context loss 后恢复，以及 390／320px 的真实 CDP 双指移动和转头。自动通关跳过阅读，不能作为实际游玩时长估计。

开发证据 `tmp/after-hours-verified/report.json` 包含 36 张有效截图，生产证据 `tmp/after-hours-production/report.json` 包含 37 张有效截图，两组均已逐张打开目检，页面／控制台错误为空。生产版额外验证了游戏馆实景入口，并完整通过六章、双结局、刷新续玩、抓人与重试、衣柜躲藏、画面恢复及两种窄屏触控。截图复查修正了门板遮住的线索牌、公寓门开向走廊挡住时钟、悬在门洞的相框，以及床头灯和录音带重叠；衣柜视角向外，并隐藏近处交互光点。

## 当前内容边界

这是有陪伴互动、探索、解谜、追逐与双结局的风格化短篇。新版加入面部形变与程序姿势，剧情仍以字幕呈现，环境音为本地 Web Audio 合成；没有真人配音或长篇过场。模型和动画属于独立风格化制作，尚未达到《米塔》的角色制作精度。手机验证使用 Chrome 窄屏与触控模拟，尚未做真实手机 GPU 或 Safari 性能验收。

## 首版远程 master 交付记录

按用户要求，提交范围包含完整游戏、运行模型、Blender 作者文件与连接脚本，以及 `/demos` 的「岁己：零点之后」入口和实景预览。发布候选基于最新远程 `master` 在独立检出中验证，仅纳入本任务内容。提交到远程与托管平台完成上线是两个步骤，线上状态需以实际部署结果为准。

提交前再次通过 17 项游戏／游戏馆规则测试、修改源码 ESLint，以及顺序执行的 `pnpm run check` 与 `pnpm run build`。安装版 Chrome 对这份生产构建从 `/demos` 搜索、点击入口进入游戏并开始游玩，三张截图均完成像素检查与打开目检，游戏状态、DOM 和画布一致，页面／控制台错误为空。证据保存在 `tmp/after-hours-release-browser/`，门禁日志为 `tmp/after-hours-release-check.log`、`tmp/after-hours-release-build.log`。
