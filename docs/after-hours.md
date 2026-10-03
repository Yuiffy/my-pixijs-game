# 岁己：零点之后

原创第一人称 3D 心理恐怖游戏。参考《米塔》由熟悉室内生活转向异常空间、角色陪伴与不可信叙事的节奏，场景、谜题、文本、角色模型和合成环境音均独立制作。玩家扮演下播后的岁己；公寓里的另一个「岁己」来自没有关掉的直播回声。

完整流程：收工 → 公寓断电与恢复供电 → 找到三段回声，解开午夜密码 → 穿过重复走廊辨认真实房间 → 追逐躲藏、关闭回声源 → 在留在循环／带回真实名字间选择结局。死亡从当前章节检查点重试，菜单可以继续进度或重新开始。剧情关键线索在手记中可回看。

## 技术与美术

Next.js、React Three Fiber 与 Three.js；独立规则状态、同源碰撞数据和 DOM 菜单。米为单位，Y 向上，第一人称站立视角。Blender 4.5 LTS 作者文件保存到 `assets/after-hours/`，GLB 运行模型在 `public/games/after-hours/`。角色使用银色双马尾、红瞳、紫黑衣装、猫耳帽、翅膀与金色光环的岁己特征，具有可动画的头／手臂／腿部层级。贴图打包进 GLB，不需要网络模型服务。

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

作者脚本 `scripts/blender/build_after_hours.py` 生成可编辑的场景和角色，压缩保存 .blend，关闭自动备份版本。优化脚本通过 glTF Transform 4.2.1 去重、焊接与清理，保留命名关节，无额外几何解码器；同时更新 manifest 中的相对源路径和实际运行文件大小。当前公寓 GLB 约 3.48 MB、角色约 1.46 MB，纹理全部内嵌。

角色保留 `Sui_Root / Head / Body / LeftArm / RightArm / LeftLeg / RightLeg` 层级，运行时驱动行走、待机和追逐姿态。场景统一使用米制碰撞与交互数据，玩家和回声共用地面与障碍规则；回声通过 A* 寻路，不能穿墙。关键灯光跨章节保留，避免因灯光数量变化重新编译材质。启动前预编译，画面丢失时暂停，重载后保留游戏进度。

## 本轮验证与复现

开发预览：`http://127.0.0.1:3940/game/after-hours`，独立目录 `.next-after-hours-dev`。生产预览：`http://127.0.0.1:3941/game/after-hours`，独立目录 `.next-after-hours-build`。游戏馆 `/demos` 已加入实景预览和入口。

```powershell
node --test scripts/tests/after-hours.test.mjs
node --test scripts/tests/game-library.test.mjs
pnpm exec eslint src/components/afterHours --ext .ts,.tsx
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

这是有完整探索、解谜、追逐与双结局的短篇首版。人物与室内美术采用原创风格化模型，动作是关节程序动画；目前剧情以字幕呈现，环境音为本地 Web Audio 合成，没有真人配音、面部表情动画或长篇过场。手机验证使用 Chrome 窄屏与触控模拟，尚未做真实手机 GPU 或 Safari 性能验收。

## 远程 master 交付

按用户要求，提交范围包含完整游戏、运行模型、Blender 作者文件与连接脚本，以及 `/demos` 的「岁己：零点之后」入口和实景预览。发布候选基于最新远程 `master` 在独立检出中验证，仅纳入本任务内容。提交到远程与托管平台完成上线是两个步骤，线上状态需以实际部署结果为准。

提交前再次通过 17 项游戏／游戏馆规则测试、修改源码 ESLint，以及顺序执行的 `pnpm run check` 与 `pnpm run build`。安装版 Chrome 对这份生产构建从 `/demos` 搜索、点击入口进入游戏并开始游玩，三张截图均完成像素检查与打开目检，游戏状态、DOM 和画布一致，页面／控制台错误为空。证据保存在 `tmp/after-hours-release-browser/`，门禁日志为 `tmp/after-hours-release-check.log`、`tmp/after-hours-release-build.log`。
