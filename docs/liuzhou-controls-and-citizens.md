# 柳州键鼠操作与市民散步

2026-10-23 玩家反馈左右反向，且希望沿用《旅居之魂》的鼠标操作。步行输入仍定义 D/向右为正，但转换到 Three.js 镜头平面时使用屏幕右向量 (-cos(yaw), sin(yaw))；自行车和汽车同步纠正转角与前轮朝向，倒车保持正常反向转弯。

鼠标捕获参考 nightRain/controls.ts 的生命周期，独立放在 liuzhou/controls.ts。点击进入、继续或画面后隐藏鼠标，用 movementX/Y 直接转视角，灵敏度采用同样的 0.003。Esc 释放并暂停，也处理浏览器只发 pointerlockchange 的情况。地图、手账、暂停、交谈、放映释放鼠标；明确关闭后尝试恢复。按住 Alt 临时显示鼠标并清空移动输入，松开后恢复。失焦释放、暂停并清除 Alt 状态，卸载移除监听。触屏保留方向按钮与拖动视角；捕获失败显示重试提示并保留拖动后备方式。

## 不干扰电脑鼠标的自动测试

用户明确要求测试不要移动或抢占系统鼠标。原先安装版 headless Chrome 的原生 Pointer Lock 可能仍影响 Windows 光标，因此停止该测试路径。后续自动测试一律在独立文档中替换 requestPointerLock / exitPointerLock / pointerLockElement，用局部变量和 pointerlockchange 验证生命周期；鼠标事件通过 Playwright 浏览器输入或文档内相对移动事件发送，不执行原生捕获。正常游戏代码保持原生 Pointer Lock。

scripts/verify-liuzhou.cjs 和 scripts/verify-liuzhou-traffic.cjs 通过 scripts/lib/liuzhou-test-browser.cjs 统一创建上下文，桌面、手机和活动分支在新页面创建前都安装该测试替身，报告明确标注 pointerLockMode。LIUZHOU_CONTROLS_ONLY=1 覆盖进入、无按键转视角、真实模拟帧中的 A/D 屏幕方向、Esc 和仅解锁事件暂停、按钮继续、Alt 点击地图、M 开合、交谈、骑行右转和失焦。虚拟捕获测试不冒充原生系统捕获证明。用户提出限制之前的一轮原生 Chrome 检查已通过，此后不再重复。

## 市民活动

保留本轮先前正在实现的五位普通市民路线：叔叔、两位散步居民、摄影游客、买菜居民。citizens.ts 使用固定步长沿避开真实建筑轮廓的路线走动，经过停留、看景、拍照、伸展和买菜动作。相机、帽子和菜袋帮助辨认。接近会停下朝向玩家，对话随活动变化；会让行车，绕开停放车辆，接单收餐期间停留等待。地图显示当前位置。

路线游标、停留计时和已走距离随既有 v1 存档保存，旧档安全补默认值，异常坐标和时钟清洗。日程、店铺和活动均为虚构玩法，不代表真实当地居民生活。仍是五人小规模循环，不能据此声称完整城市生态。

## 验证入口

- 方向规则：scripts/tests/liuzhou-controls.test.mjs，多个相机朝向的屏幕左右，以及两类载具正反向转弯。
- 市民规则：scripts/tests/liuzhou-citizens.test.mjs，路线建筑净空、十五分钟循环、让行/绕行、暂停/交谈、送餐等待与存档清洗。
- LIUZHOU_CITIZENS_ONLY=1：正常移动拜访五位市民，活动姿态、对话、读档、手机地图和横竖屏。
- LIUZHOU_LIFE=1 LIUZHOU_EVENING=1：完整首章、三单和第二章回归，仍使用普通玩法输入。

测试使用静音安装 Chrome、禁用语音、全页截图及像素 sanity，与文字状态、DOM/画布和错误交叉检查，逐张打开采用的截图。开发完整回归 .tmp/liuzhou-controls-virtual-regression-dev/report.json，市民 .tmp/liuzhou-citizens-virtual-final-dev/report.json，操作 .tmp/liuzhou-controls-virtual-dev/report.json。

最终定向 ESLint、完整 pnpm run check → pnpm run build 顺序通过，构建目录 .next-liuzhou-controls-build，日志 tmp/liuzhou/controls-{gate-source,check,build}-final.log。37/37 柳州规则通过。共享构建阻塞仅补 Sui Delivery 的格式、迭代兼容和弹簧特效落点字段，配送规则回归通过。

本地 4131 已切换到该生产构建，进程 98656。生产操作 .tmp/liuzhou-controls-virtual-production/report.json（7 张）、市民 .tmp/liuzhou-citizens-virtual-production/report.json（14 张）均错误为空，全部逐张打开检查；开发最终三份报告共 60 张同样已检查。生产自动测试继续禁用原生系统捕获。未提交、推送或外部部署。移动横屏对话仍会遮住部分角色，简化人物、建筑与小规模日程仍需继续完善；自动输入不证明真人手感和真机性能。
