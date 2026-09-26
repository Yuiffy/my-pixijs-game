# 雨夜寻味：动作游戏输入

2026-09-26。目标：键鼠玩家左手保留在 WASD 周围，右手用鼠标转视角与攻击；手柄玩家从开始、战斗到菜单和设置都能独立操作。

## 默认操作

| 动作 | 键鼠 | 标准手柄（Xbox 名称／对应位置） |
| --- | --- | --- |
| 移动／奔跑 | WASD／按住 Shift | 左摇杆／L3 切换奔跑，停下结束 |
| 镜头 | 鼠标直接移动；滚轮缩放 | 右摇杆 |
| 轻击／重击 | 左键／右键；J/K 为备用 | RB／RT |
| 弹反／闪避 | F（L 备用）／空格 | LB／B |
| 锁定 | 中键或 Q | R3 |
| 交互／喝水 | E／R | A／X |
| 精灵／地图 | C／M | Y／View |
| 雨灯整备 | Alt 显示光标后点击整备 | 雨灯旁十字键↑ |
| 暂停 | Esc 或 P | Menu |
| 菜单 | 鼠标或 Tab、Enter、Space | 十字键或左摇杆选择，A 确认、B 返回 |
| 全屏 | F10 或暂停菜单按钮 | 暂停菜单按钮 |

点击开始或游戏场景后捕获鼠标，无须按住鼠标转视角。按住 Alt 暂时显示光标，松开恢复；打开菜单、死亡、结尾和失焦时释放。Esc 释放并暂停；浏览器拒绝捕获时显示重新点击提示，不循环强抢焦点。

暂停菜单提供鼠标／手柄各自的镜头速度和上下反转，并保存到本机。手柄菜单可以调节这些设置。摇杆采用径向死区和幅度保留，轻推慢走、斜向不额外加速；离散动作按下只触发一次。支持浏览器映射为 `standard` 的设备，非标准布局不猜测按键。未实现全键位自定义或震动。

## 查阅资料与采用的经验

- [MDN Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)：使用相对位移，不受光标边界限制，让鼠标按键用于其他动作；必须处理用户触发、异步变化、错误和退出。本项目加入 Alt 临时释放、菜单释放、快速 Alt 时序恢复、Esc／失焦暂停。
- [MDN Using the Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)：逐帧重新读取 `navigator.getGamepads()`，按设备 index 和标准映射读取轴与按钮，处理连接和断开。本项目不缓存旧 Gamepad 对象，重新连接或失焦期间按住的按钮不会在恢复后突然攻击。
- [Game Accessibility Guidelines：简化操作](https://gameaccessibilityguidelines.com/ensure-controls-are-as-simple-as-possible-or-provide-a-simpler-alternative/)：不因按键存在就使用它，避免不必要的组合和伸手。本项目把轻重击放在鼠标，弹反移到 F，J/K/L 仅保留兼容，不要求同时在键盘两端操作。
- [Xbox Accessibility Guideline 107：Input](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107)：菜单也要支持数字／模拟输入，考虑长按负担和镜头反转。本项目加入手柄完整菜单导航、选择设置、L3 冲刺切换及设备对应提示。并非声称已满足该指南的全部可访问性要求。

## 验证方式与不干扰桌面约定

用户需要同时使用电脑，后续自动化不得真实锁住鼠标、抢前台或用可见测试窗口。所有雨夜浏览器专项默认在隐藏的系统 Chrome 中运行；`scripts/lib/night-rain-virtual-pointer.cjs` 只在测试上下文替换 Pointer Lock 的浏览器边界，保留异步 change 事件。游戏自身的鼠标处理、菜单、相机和战斗逻辑照常执行。生产代码不导入此测试模拟器。

`scripts/verify-night-rain-devices.cjs` 另在浏览器 Gamepad API 边界注入虚拟标准手柄。它验证双摇杆、死区、按下边沿、轻重击／弹反／闪避、笔记本交互、实敌锁定、受伤后喝水、菜单设置、断连暂停与恢复；没有直接修改玩家位置或生命。到实敌附近的准备阶段使用合法移动输入。

22 项规则测试通过。专项最终报告：`tmp/night-rain-devices/report.json`；原键盘／触屏回归：`tmp/night-rain-input-controls/report.json`；精灵、双指触屏与异常恢复：`tmp/night-rain-input-assistance/report.json`。三组共 16 张截图通过像素检查并逐张目检。虚拟测试证明应用处理逻辑，不代表所有浏览器的原生 Pointer Lock 行为或实体手柄驱动均已验证。

最终顺序全仓 check／生产 build 通过，Next 内 ESLint 与类型检查保持开启。成功构建与主目录源码哈希一致。生产地址 http://127.0.0.1:3871/game/night-rain 已更新，完整虚拟设备专项再次通过且无错误，4 张生产截图已逐张目检；报告为 tmp/night-rain-input-production/report.json。
