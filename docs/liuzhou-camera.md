# 柳州与《旅居之魂》共用自由镜头

2026-10-24，用户报告首次转视角遇到角色与镜头之间的障碍时，镜头异常转动甚至反转，再次经过似乎正常。

## 原因与修复

旧 `resolveCamera` 在净空不足三米时尝试 ±0.35、±0.7、±1.2、±π/2、π 等替代朝向。`Scene.tsx` 又把返回的避障 yaw 写回输入 rig，因此一次障碍把用户自由视角永久转走；后续检查已经从被改动后的开阔角度开始。这不是第一次加载的缓存或 Pointer Lock 状态。独立浏览器在旧 4131 包沿正常步行到东门东侧，再输入约 π/2 的朝向，实际 yaw 变为 2.769（约159°），与目标相差约69°。旧证据 `.tmp/liuzhou-camera-before/report.json`，三张截图均已目检。

自由镜头现在只沿用户指定方向收近，用既有建筑、城楼、家具和地面碰撞裁短镜头距离，不搜索替代 yaw，也不再将碰撞结果写回输入。收近立即生效，清障后按原速率平滑拉远。平滑只作用于径向距离，避免快速半转时世界坐标插值横穿角色。朝向从 yaw/pitch 明确计算，极窄处距离为零也不会调用零长度 lookAt。

交谈镜头继续使用独立的双人取景规则。载具原有的两点五秒无鼠标输入后回正行为保留；它与本次碰撞抢占方向的错误不同。保存格式和正常游戏原生鼠标锁定不变。

## 共用模块与《旅居之魂》

两款游戏都接入 `src/components/gameCamera/boom.ts`：`clipCameraBoom` 采样当前视线并留出碰撞余量，`followCameraBoom` 立即缩短距离、按时间平滑恢复距离。模块没有 React 或 Three.js 依赖；各世界负责提供自己的碰撞适配器。共用的是镜头控制核心，并未重写整套游戏引擎。

《旅居之魂》没有发现柳州同样的避障 yaw 回写，但旧的世界坐标平滑在快速半转时会跨过角色，近障碍又强制保留最小0.65米距离。现在使用同一径向平滑，碰撞允许缩至零距离，继续检测世界规则与静态场景网格。战斗锁定、升降机和过场保留各自构图。仅 `?test=1` 暴露只读 `nightRainCamera()`，用于核对实际渲染位置与朝向，卸载时清理。

## 验证入口

`node --test scripts/tests/liuzhou*.test.mjs`：新增首次贴墙连续120帧、两轮正反方向全周旋转规则；将旧的“贴墙应自动转向”断言修正为保持朝向并缩短距离。保留地面、城楼、粉摊、长椅、真实建筑轮廓和挑檐碰撞检查。

设置 `LIUZHOU_CAMERA_ONLY=1` 后执行 `node scripts/verify-liuzhou.cjs`：沿普通步行靠近东门，首次遮挡、正反方向各两圈、快速半转、俯仰上下限、清障后拉远、暂停恢复与手机竖屏。读取实际渲染相机的位置和前向向量，逐帧核对输入朝向与渲染朝向/射线一致。浏览器 MouseEvent 位移是整数字段，目标角允许一像素0.003弧度量化误差，实际相机与实际输入角仍要求1e-6弧度内一致。

所有上下文经 `quietContext` 在创建页面前模拟 Pointer Lock，独立无头安装 Chrome、静音并禁 speech，仅发送浏览器文档内输入；不连接用户当前页面或捕获系统鼠标。

## 2026-10-24 验证结果

共用/柳州/夜雨镜头规则7/7通过；夜雨全规则194/194通过。源文件定向 ESLint、完整 `pnpm run check` 后顺序 `pnpm run build` 通过，Next ESLint 保持开启；构建 `.next-shared-camera-final`，BUILD_ID `KMcvnqgBdyxkvhuZtcVqW`。日志在 `tmp/liuzhou/shared-camera-{check-retry,build,focused-final-current,night-rules,source-eslint-current}.log`。收尾时本地 pnpm 的 `.bin/eslint` 入口缺失，脚本和当前源码的补充定向 lint 使用 `node node_modules/eslint/bin/eslint.js`，均退出0，未修改依赖或绕过 lint。

生产包报告均 errors=[]、脚本退出0：

- `.tmp/shared-camera-liuzhou-production/report.json`：7图、388次渲染镜头采样。
- `.tmp/shared-camera-night-production/report.json`：11图、344次采样，合法存档夹具覆盖房屋、屋顶、地下墓地、修道院和战斗锁定/解锁，不当作全流程步行通关。
- `.tmp/shared-camera-controls-production/report.json`：7图，左右移动/骑车、直接鼠标视角、Esc/Alt/地图/失焦和虚拟捕获生命周期。
- `.tmp/shared-camera-conversation-production/report.json`：12图，桌面/手机横竖屏交谈、暂停恢复、选择与购买、返回自由镜头。

上述37张生产全页截图全部逐张打开目检，与PNG sanity、文字状态、DOM/canvas及错误日志交叉检查。此前开发夜雨11图和旧柳州复现3图也已逐张检查。中间测试报告不作最终生产验收。

完整柳州规则当前69/71，未冒称全部通过：`liuzhou-dongmen.test.mjs` 的旧存档高度断言13.24对13.2，以及 `liuzhou.test.mjs` 车辆里程推进阶段3对4失败，均在地形/任务状态路径中，与镜头纯函数无调用关系。保留失败日志 `tmp/liuzhou/shared-camera-liuzhou-rules-final.log`，不通过修改无关玩法或放宽断言掩盖。

限制：紧贴障碍时角色仍可能占满画面，手机竖屏尤其明显；本轮没有加入角色淡出。原生锁定的真人手感不由模拟锁定证明。并行地形任务仍在更新 `Scene.tsx` 等文件；收尾新源码定向 lint 通过，但这些后续编辑不计入已冻结生产包的验证范围。

原本地试玩已切到该验收构建：柳州 `http://127.0.0.1:4131/game/liuzhou`（隐藏 Node PID27568），夜雨 `http://127.0.0.1:4127/game/night-rain`（PID45380）。两路均HTTP200；`.tmp/shared-camera-live-report.json` 为passed=true，普通入口进入游戏后核对实际加载的22/21个本地Next入口、动态游戏和样式资源SHA与验收目录完全一致，errors=[]。初版live检查错误地在夜雨标题页等待尚未挂载的canvas，失败报告保留为 `shared-camera-live-initial-report.json`；改为进入游戏后等待canvas，复测通过。未操作用户已有标签页或存档。

## 2026-10-24 · 飞行中的鼠标相对位移跳变

用户确认使用电脑鼠标、点击画面捕获后直接转视角。当前飞行模式没有载具回正；另一路风险是 StreetControls 对每次 movementX/Y 都不加检查地修改 yaw/pitch。旧实际4132验收包在正常起飞140米后，注入(1440,-900)的单次相对位移，yaw从-1.374变为-5.694（最短角变化约112.5度），pitch从0.126跳到-0.65。证据.tmp/liuzhou-flight-camera-before/report.json，两图已打开。这是合成输入对控制路径的复现，没有捕获用户原生鼠标日志，不能据此断言用户设备每次都由同一种原因触发。

捕获模式现在拒绝非有限值及任一轴超过256像素的单次采样，整条丢弃、不延后补偿；阈值相当于单次约44度，属于异常输入保护启发式。普通多次采样没有每帧/每秒转速限制；极快的真实合并采样超过该阈值也会被丢弃，若有此设备表现应采集实际输入后调整。触屏及未捕获拖动仍走原有look路径。优先请求unadjustedMovement原始输入；NotSupportedError（同步或异步）退回普通捕获，权限拒绝不循环，Alt/暂停/卸载后不补发回退请求。

新增scripts/tests/liuzhou-mouse.test.mjs覆盖异常正反采样、不积累补偿、快速多圈、俯仰限制、暂停/Alt/重新捕获、原始输入回退和权限错误；与共用/柳州镜头规则共17项通过。旧浏览器辅助脚本的大角度瞄准改用liuzhou-mouse.cjs分割成80像素以内的相对采样，异常单次事件保留在专门回归中。scripts/verify-liuzhou-flight-camera.cjs使用静音安装Chrome与模拟Pointer Lock，正常帧循环起飞，逐帧对照渲染朝向，检查快速左右转向、异常位移、加速/下降/悬停、Alt和Esc重新捕获。

最终结果：冻结版本17项规则、完整check→build通过，正式飞行176次/4图与地面388次/7图通过、errors=[]、11图逐张目检；实际4132飞行176次/4图再次通过且逐张目检，加载25份静态资源SHA匹配验收包。构建.next-liuzhou-flight-camera-final-build、BUILD_ID TkZbGAZ9pEg4IcHPxvJyy，实际隐藏Node40252。冻结副本用于隔离另一个地图任务的热更新；共享目录后续StationNeighborhoods制作代码均保留，源码修复仍在主目录controls.ts。源码快照tmp/liuzhou/flight-camera-release，门禁日志tmp/liuzhou/flight-camera-frozen-{check,build,rules}.log。此次未提交、推送或外部部署。

## 2026-10-24 · 可调鼠标视角灵敏度

用户反馈再次刷新后暂未出现拉扯，决定继续观察，同时要求降低过高的转向速度并支持设置。新增右上角“设置”和暂停页“视角设置”：20%—200%，每档5%，默认60%（100%等于此前速度），同时控制鼠标左右转向和上下俯仰。捕获鼠标及未捕获时的鼠标拖动共用比例，触屏拖动保持原手感。通过稳定ref读取最新值，不因修改设置重新创建控制器；输入框方向键不会触发角色移动，Esc仍可关闭设置并重新捕获。

选择保存在独立localStorage键liuzhou-look-sensitivity，读取时验证类型/有限值并限制范围；存储不可用仍可在本次游玩生效，并显示保存失败提示。默认值/刷新恢复/最慢与最快/恢复默认/地面及飞行转角已由安装Chrome的静音模拟捕获上下文验证，不以模拟事件证明用户原生鼠标手感。新增scripts/verify-liuzhou-look-settings.cjs；原镜头浏览器回归显式设置100%夹具，通用瞄准辅助按实际灵敏度换算像素。小屏设置面板按容器宽度限制，避免原95vw在内边距下右侧溢出。

最终验收：冻结副本顺序pnpm run check与pnpm run build均退出0（ESLint未关闭）；定向ESLint与18项鼠标/镜头规则通过。最终正式包设置交互7项/3张全页图通过，包含实际地面/飞行输入比例、40%刷新保留、20%/200%、恢复60%、输入框Esc、小屏容器边界及存储不可用，errors=[]；三图逐张打开目检。最终报告.tmp/liuzhou-look-settings-final/report.json。此前同一输入源码100%飞行回归176次/4图通过并目检，CSS修正后未重复无关运动回归。所有自动浏览器均为静音独立上下文、模拟Pointer Lock，不操作用户系统鼠标。

本机4132已切换到.next-liuzhou-look-settings-build，BUILD_ID ebPnYH_L2FFCMsWOIqZEq，隐藏Node PID56728。实际25份静态资源SHA与验收包一致、HTTP200、errors=[]，live-report.json在上述最终报告目录。仅停止核对归属后的旧4132 PID40252及本轮4134预览19356/43388；4135/4136等其他任务服务保留。四份源码主目录与冻结副本哈希相同，look-settings-source-manifest.json记录；未提交、推送或外部部署。用户需刷新一次获取新设置入口；拉扯是否原生复现仍待其后续游玩反馈，未声称本轮定位了新的根因。
