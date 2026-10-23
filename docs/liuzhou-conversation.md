# 柳州交谈镜头与手机布局

2026-10-24。延续真实柳州开放 3D 街区目标，本轮改善 NPC 交谈呈现，不把此项验收当作完整游戏完成。

## 行为

- 发起交谈时记录当前 NPC 的稳定 `speakerId`，停止双方速度并互相转身。接单、购买、取消和第二章选项的后续台词仍使用同一个场景说话人；现场录音旁白不会因为有米汀头像就把镜头拉向远处的米汀。对话仍是瞬时状态，不改变 v1 存档格式。
- 相机在双方侧面及相对侧寻找取景，沿用建筑、城楼、粉店与长凳的相机碰撞。根据两人全身包络和 58° 镜头计算距离，检查头部到相机的静态视线。普通自由视角的 yaw/pitch/zoom 独立保留，交谈结束后恢复。进入江边放映前清除交谈专用投影偏移。
- DOM 对话框通过 ResizeObserver 报告真实尺寸，动画完成后重新测量。根据台词换行、选择项和窗口尺寸，把相机光轴移到剩余画面中心，避免简单“人物在屏幕中心”仍被对话框覆盖。
- 桌面/竖屏台词留在底部、最高占 44svh；低矮横屏台词移到右侧，人物留在左侧。长内容可滚动，操作最小高度 44px。交谈时隐藏任务、小地图、速度、旅行工具和通知；保留标题及声音/帮助/暂停入口。
- 交谈继续沿用释放鼠标、冻结世界及订单热气、E 继续/收起、数字或触摸选项、Esc 暂停和恢复的流程。

## 验证入口

规则 `node --test scripts/tests/liuzhou*.test.mjs`。新增四条规则使用独立 Three.js 投影验证四方向/三种宽高比，检查墙旁选择另一侧、说话人/朝向/冻结/选择后续和录音旁白。

交谈专项：设置 `LIUZHOU_CONVERSATION_ONLY=1` 后执行 `node scripts/verify-liuzhou.cjs`。所有测试上下文在创建页面前调用 `quietContext`，禁用原生 Pointer Lock，使用独立无头安装 Chrome、静音和禁用 speech；没有操作系统鼠标操作或用户当前浏览器连接。路线只发正常移动/骑行/交互输入，不改任务或坐标。

专项读取实际挂载模型的世界包围盒，使用实际渲染相机投影，断言两个角色都在可用画面内且不与对话框实际矩形相交；同时检查台词、选择、冻结、横竖屏、暂停恢复、原 yaw/pitch/zoom 恢复与触摸购买。PNG sanity、DOM/画布、文字状态与 console/page 错误一起核对；采用的截图均逐张打开目检。

## 本轮验收与本地服务

60/60 柳州规则、修改源文件 ESLint 和独立 Node/browser 脚本 ESLint 通过。完整 `pnpm run check` 后顺序执行 `pnpm run build` 通过，保留 Next.js 构建 ESLint；日志在 `tmp/liuzhou/conversation-{rules,source-eslint,scripts-eslint,check,build}.log`。验收构建 `.next-liuzhou-conversation-final`，BUILD_ID `3wFRDMha0RoqVAznQF-sl`。源文件最后修改早于构建完成，后续仅整理文档和清理本轮临时类型 include。

最终生产三份报告：`.tmp/liuzhou-conversation-production/report.json` 12 张、`.tmp/liuzhou-conversation-controls/report.json` 7 张、`.tmp/liuzhou-conversation-regression/report.json` 39 张，全部 `errors=[]`。58 张最终全页截图已全部逐张打开检查，结合报告里的像素 sanity、实际 canvas/DOM、文字状态和错误核对。开发最终专项另有 12 张，亦全部目检。覆盖 A/D 屏幕方向、无需按住鼠标的视角输入、虚拟鼠标锁定生命周期、交谈和暂停恢复、两章剧情、三次送餐、存档和触摸横竖屏。`evening-02-neighbor-memory` 拍摄时流动居民已离开固定测试位置，只显示靠近提示，不能用这张图证明该可选居民回忆对话；实际居民对话由送餐收件人截图覆盖。

React/R3F 复核：面板测量使用 ref，不逐帧设置 React 状态；ResizeObserver 与 animationend 监听在隐藏/暂停/卸载时清理；相机求解按人物和面板/视口变化缓存；正常视角参数独立保留，退出交谈先清除投影偏移再进入放映；模型投影检查器仅 `?test=1` 安装并有卸载清理。

本地 4131 原进程在续作时已停止，恢复为以上验收包，隐藏 Node PID 12648。`http://127.0.0.1:4131/game/liuzhou` HTTP 200；独立无头 Chrome 经 quietContext 加载标题场景，实际请求的 22 个 Next 脚本、动态块及样式逐一 SHA256 匹配验收构建磁盘文件，画布 1440×900、589 draw calls、无浏览器错误。证据 `.tmp/liuzhou-conversation-production/live-report.json`。未连接用户正在玩的页面或操作其存档，没有外部部署、提交或推送。只移除本轮 conversation-dev/final 两条临时 tsconfig 类型 include。

## 限制与后续

镜头避让当前只覆盖静态场景；停放自行车、汽车和其他人仍可能挡住部分身体，粉店镜头已经观察到自行车遮腿。极窄空间不保证总能同时保持理想距离和无阻挡。人物目前仍为程序化简化造型；侧面交谈没有口型、配音或独立表情。自动验证不能证明真机性能、原生鼠标手感或真人趣味。真实街区细节、模型质量、可进入店铺、更多活动和故事仍需继续制作。
