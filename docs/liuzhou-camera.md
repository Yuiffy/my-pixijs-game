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
