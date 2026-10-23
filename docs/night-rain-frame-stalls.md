# 旅居之魂：跑动时的长时间停顿

2026-10-24。用户报告跑动或转镜头时偶尔静止几秒。在原生产试玩 4127 的第三关旧测星台，通过正常移动从 `(-150, 26, -627)` 走到 `z < -632`，记录到一次 13892.2ms 的渲染帧和 13894ms 的主线程长任务。CPU profile 中 `getProgramInfoLog` 占 13835.5ms；同时新编译 24 个着色器，生成的点光源数组长度为 90。测试期间的存档写入最多 0.3ms。

## 原因

修道院场景以 `player.z < -630` 隐藏远处建筑，两盏点光源原本也在这个组和 `StaticDistrict` 的烘焙组内。走过边界会使 Three.js 收集到的点光源从 88 变成 90。灯数参与着色器参数，大量受光材质需要重新编译；浏览器等待编译结果时整帧被阻塞。

这是游戏侧可以复现的问题。塔台和折光桥都穿过该边界，玩家尚在第三关时就能触发。旋转前后的独立阶段均为零新编译；原报告往返的后续阶段已命中程序缓存，未再次出现同样长任务。不能用这些暖缓存阶段否认首次进入的停顿。

## 修复

`BellAbbeyView` 将两灯移到始终参与渲染的兄弟节点，放在 `StaticDistrict` 之外，原有位置条件只改变 60/15 与 0 的亮度。坐标、颜色、范围和衰减保持原值，远处建筑仍按原条件隐藏。

`CompanionView` 的精灵光源也改成始终挂载，位置跟随原模型组，关闭宝宝模式只归零亮度。该开关原本同样会改变灯数。正常玩家的声音与鼠标捕获保持原行为。

只固定灯数的中间版本仍在首次显示修道院时编译两个材质着色器，产生 1816.2ms 帧间隔和 1820ms 长任务（`tmp/night-stalls/production/`，该中间报告不通过）。因此 `WorldView` 进一步在现有加载层内调用 `compileAsync(scene, camera)`，覆盖隐藏区域材质；预热后显式唤醒渲染，首帧完成几何、贴图和阴影上传后才通知模拟开始。正优先级回调接管唯一渲染，保留现有动画和相机先更新的顺序。

上下文丢失或组件卸载会取消旧异步完成通知，预热失败走现有画面恢复界面。预热包括材质编译，隐藏区域的几何和贴图仍在实际显示时上传。

## 验证方式

`scripts/verify-night-rain-frame-stalls.cjs` 使用安装版 Chrome、独立存档和真实运行时钟：

- 在旧测星台连续转镜头、两次往返跨界，保留自动存档。
- 断言实际坐标跨过边界、镜头 yaw 确实变化，使用真实时钟且不冻结或快进模拟。
- 通过真实菜单关闭、重新开启宝宝模式。
- 采集 RAF 帧间隔、PerformanceObserver 长任务、WebGL 编译及同步存档耗时、CPU profile。
- 默认要求测量期间零新着色器编译，且没有超过一秒的帧或主线程长任务。
- 核对合法旧档、游戏模式、DOM、画布与错误，并对塔台、礼拜堂和抄经室做全页截图 sanity 检查和人工目检。

测试浏览器静音、禁用语音，并在页面创建前安装文档内虚拟 Pointer Lock；不捕获或移动系统鼠标。性能数值仅用于同机同路线的前后比较，不代表所有硬件或首次载入性能。

基线文件在 `tmp/night-stalls/before/`。设置 `NIGHT_RAIN_ALLOW_SHADER_COMPILE=1` 可以记录旧版，不作为修复后的零编译验收。

开发最终报告 `tmp/night-stalls/dev-final/report.json` 通过：六个跑动/转镜头阶段全部零编译、零长任务，最大帧间隔 16.4ms。真实菜单开关精灵两阶段同样零编译，最大 59.6ms。四张全页截图均已打开目检，塔台与修道院原灯光正常。首次开发测试期间修改源文件触发 Fast Refresh 重置了页面状态，该失败尝试已重跑，未作为最终证据。

本轮源文件定向 ESLint 通过。较早一次主工作区检查被并行开发中的柳州文件 lint 错误阻断（`tmp/night-stalls/check-final.log`）。隔离快照 check 通过，但 Windows 跨盘依赖路径使该快照 build 失败，没有采用这个包。用户随后要求提交本项目全部改动，验证回到完整主工作区：不关闭构建 lint，完整 check 后顺序 build。归档快照时共享依赖受影响，已离线强制重装全部依赖并实际确认 React/React DOM 可解析；中间失败构建不作最终证据。临时 worktree 已归档。

全项目回归同步更新柳州旧测试的绝对高度：对话、城楼、家具和镜头使用实际地面高程。测试还发现 `restoreWorldPosition` 会把非桥梁位置的原始存档高度覆盖回已恢复的城楼平台高度；现在只在确有桥面且恢复结果选中该桥面时保留桥面高度。增加任意超高存档不能使人物悬空的断言，保留原碰撞、构图和存档语义。

`scripts/verify-night-rain-render-recovery.cjs` 另测预热期间真实 WebGL context loss：在首个着色器编译后丢失上下文，等待旧异步结束，临时解除独立暂停仍确认模拟时间保持 0；点击重新载入后恢复运行。随后连续三次正常渲染期间丢失/恢复，检查单画布、位置、资源数量和堆占用。开发 `tmp/night-stalls/recovery-dev/report.json` 通过（exit 0、errors=[]），两张截图已打开目检。该测试只在独立上下文中暂时控制首次 KHR 完成查询，确保旧异步确定收尾，不修改正常游戏行为。

最终生产构建 `caSMyvU795TzlKakE-kpQ` 的报告 `tmp/night-stalls/final-production/report.json` 通过（exit 0、errors=[]）。六个跑动/转镜头阶段最大帧间隔 43.2ms，p95 均约 10.9ms，全部零新编译、零长任务；菜单关闭精灵阶段最大 135ms，记录一个 119ms 长任务，重新开启阶段最大 21.6ms。八阶段均无一秒级停顿。加载层用时约 3.78 秒；四张全页截图通过像素检查并已打开目检。

完整主工作区 `pnpm run check` 与随后 `NEXT_DIST_DIR=.next-night-stall-final pnpm run build` 均 exit 0，构建保留 ESLint。Night Rain、柳州及共享镜头规则合计 273/273 通过。日志为 `tmp/night-stalls/check-all-final.log`、`build-all-final.log`、`rules-all-final.log`。预览 4127 已切换到该生产构建，游戏与测试存档入口均返回 HTTP 200。

```powershell
$env:NIGHT_RAIN_BASE_URL = 'http://127.0.0.1:4127'
$env:NIGHT_RAIN_QA_DIR = 'tmp/night-stalls/final-production'
node scripts/verify-night-rain-frame-stalls.cjs
```
