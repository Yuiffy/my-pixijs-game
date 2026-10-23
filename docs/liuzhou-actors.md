# 柳州人物关节与移动姿态

延续柳州开放 3D 街区制作。四位主角、故事 NPC、普通市民和自行车骑手共用 `ActorView.tsx`；人物仍是程序化简模，尚未替换为精细角色模型。

## 外观与动作

先查看 `public/images/livers/{sui,shiori,nagisa,nana7mi}.png` 原图，再保留岁己的银色双卷发、猫耳帽与淡紫外套，栞栞的侧辫、棕色贝雷帽与奶油色开衫，米汀的银蓝长发、浅色帽子和外套，以及七海的棕发、耳机和深色制服轮廓。没有生成或替换原画像。

模型分出髋、膝、踝、肩和肘关节，`actorMotion.ts` 用双段肢体求解脚和手的位置。步行/跑步步频跟随实际移动距离，受阻时不继续原地迈步；跳起、下落和落地缓冲读取真实物理接触与垂直速度。暂停与交谈沿用现有游戏时钟。市民保留拍照、伸展、购物及相机/购物袋道具，晚间放映保留观看姿态。

骑行使用同一人物和服装，脚跟随实际曲柄转动，手到车把；上下车后切换可见模型。曲柄和踏板是实际渲染节点，测试读取挂载后的世界坐标核对接触，并非只检查姿态公式。暂未加入上下车过渡、滑行时停止蹬踏或每级台阶的脚底贴合。

高频动作保留在 `useFrame` 和 refs 中，不按帧写 React 状态；共用几何体，每个角色的材料按配色缓存并在替换/卸载时释放。测试用 `liuzhouTest.visual()` 读取实际关节，只有 `?test=1` 页面安装场景检查器，不把易滞后一帧的渲染诊断混入模拟文字状态。

## 发现与修正

首轮规则测试误把转弯路径长度等同起终点直线距离，已改为逐步累加真实位移。第一轮浏览器测试发现站在地面仍显示下落：现有全局地面将角色高度限制在零，但控制器接触间隙可使 grounded 为假且垂直速度持续积累。现将高度为零且非上升的角色视为受地面支持，并清零垂直速度，保留真实跳跃和高处接触。

步行模型的父节点是整张场景，初版检查器会误找到场景里未乘坐的自行车踏板；现仅对 `rider-*` 节点计算踏板/车把距离。修正回调条件表达式的 ESLint 括号要求，没有关闭规则。

## 测试隔离

用户要求自测不得影响 Windows 鼠标。所有桌面和手机测试上下文继续经 `scripts/lib/liuzhou-test-browser.cjs` 的 `quietContext` 创建，在新页面建立前替换原生 Pointer Lock，采用文档内相对鼠标事件或 Playwright 的浏览器虚拟输入。独立安装 Chrome 使用无头、静音及禁语音设置；不操作用户正在玩的页面，不调用桌面鼠标接口。正常游戏保留原生鼠标捕获。

## 验证记录

`scripts/tests/liuzhou-actors.test.mjs` 覆盖距离步频、支撑脚、整圈踏板与车把求解、跳跃/落地、暂停/交谈和市民/放映动作。柳州规则共 56 项通过，日志 `tmp/liuzhou/actors-rules-verified.log`。

开发专项 `.tmp/liuzhou-actors-dev-v2/report.json` 无错误，19 张截图已逐张检查；该开发轮次早于检查器范围、交谈静止和七海袜色的最后三处调整。更早失败报告保留，不作通过证据。

最终源文件 ESLint 通过，`pnpm run check` 后顺序执行 `pnpm run build` 通过，构建目录 `.next-liuzhou-actors-final`，保留构建 ESLint。日志 `tmp/liuzhou/actors-{eslint-source-verified,check,build}.log`；脚本使用既有独立 Node/browser ESLint 配置，日志 `actors-eslint-scripts-verified.log`。React 检查确认模型几何/材料复用、材料释放、帧内 refs 更新和测试检查器隔离，没有新建数据请求或逐帧 React 状态更新。

生产测试全部使用 4132 上的同一构建，五份报告 `errors=[]`，共 91 张全页 PNG 全部逐张打开检查，并与像素 sanity、DOM/画布尺寸、文字状态及错误记录交叉核对：

- `.tmp/liuzhou-actors-production/report.json`：19 张，四位角色走跑/上升/下落/落地、暂停、交谈、骑行、上下车和手机存档恢复。实际脚底到踏板距离均为设计侧偏 0.025 米，手到车把距离为零。
- `.tmp/liuzhou-actors-regression-production/report.json`：39 张，首章步行/骑车/开车、三次邻里送餐、第二章采样/编排/放映/回看、手账、存档和多点触控。
- `.tmp/liuzhou-actors-controls-production/report.json`：7 张，浏览器虚拟鼠标视角、实际帧 A/D 屏幕方向、骑行右转、Esc/解锁事件暂停、Alt/地图/交谈和失焦。
- `.tmp/liuzhou-actors-dongmen-production/report.json`：12 张，普通输入穿洞、真实 31 级台阶、台上跳跃和存档恢复、完整下楼及手机触控。
- `.tmp/liuzhou-actors-citizens-production/report.json`：14 张，正常移动找到五位市民的伸展/拍照/购物、道具、对话暂停、准确日程存档和手机地图/横竖屏。

本地原试玩 `http://127.0.0.1:4131/game/liuzhou` 已更新为此验收构建，隐藏 Node PID 14808，HTTP 200。`live-report.json` 对比验收 4132 与试玩 4131 的本地 Next 脚本清单和 9 个脚本 SHA 全部相同。未操作用户当前页面或存档。核实命令与端口后停止旧生产 14340、开发父 17596/子 42796 和验收服务 45252，仅移除本轮两个 Next 类型 include，保留其他任务正在添加的类型路径和源码。未提交、推送或外部部署。

完整城市内容、精细人物模型、动态遮挡、专用交谈取景、手机真机性能与真人操作感仍待继续。自动测试不证明原生鼠标手感或游戏趣味。
