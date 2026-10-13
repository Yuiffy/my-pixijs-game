# 风邮小镇验收记录 · 2026-10-13

实现与研究依据见 [设计说明](wayfinder-design.md)。游戏入口 `/game/wayfinder`，游戏馆 `/demos` 搜索「风邮小镇」。开发试玩：<http://127.0.0.1:4093/game/wayfinder>；已验收生产版：<http://127.0.0.1:4094/game/wayfinder>。不同端口存档独立；在当前试玩端口继续即可保留本次进度。

## 范围与运行方式

在隔离工作树 `C:/Users/yuiffy/.codex/worktrees/wayfinder/my-pixijs-game` 实现及生产验收，保护主工作区其他游戏的改动。只同步风邮小镇源文件、页面、规则、验证、文档、预览及游戏馆对应条目；包版本和其他条目保留。没有新增运行依赖，没有提交、推送或外部部署。

```powershell
pnpm wayfinder:test
pnpm exec eslint src/components/wayfinder/*.ts src/components/wayfinder/*.tsx src/app/game/wayfinder/page.tsx src/components/gameLibrary/catalog.ts
pnpm run check
$env:NEXT_DIST_DIR='.next-wayfinder-v2-build'
pnpm run build
pnpm exec next start --port 4094
# 另一个终端，确认 HTTP 200 后执行；真实鼠标捕获测试应避开用户试玩：
$env:WAYFINDER_BASE_URL='http://127.0.0.1:4094'
$env:WAYFINDER_QA_DIR='tmp/wayfinder-v2-production'
pnpm wayfinder:verify
```

隔离工作树完整 check 后顺序 build 成功，构建 ESLint 保持启用；既有 RPG / 武侠代码只有未使用变量警告。生产构建目录独立，不覆盖正在试玩的开发服务。

## 四项增强的验收

1. 桌面鼠标无需按住按钮：Chrome 实际获取 pointer lock，真实 mouse move 转向；Esc 释放并暂停，继续再次捕获，打开地图释放。触屏保持拖动转向。用户试玩期间不再运行指针捕获测试；本轮测试浏览器已关闭。
2. Shift 跑步：浏览器真实按键和规则模拟确认速度为步行 1.85 倍；斜向归一化，狭窄石廊与断桥碰撞不被高速穿透。390px / 320px 触屏跑步按钮可切换。
3. 起点预告递进：标题可见海港旁的独立双层商场岛；远行路线在开始前即可查看四区域、八封信、断桥与洞窟挑战。第三封送达后桥仍完好，真实返程靠近才触发鲤鱼跃出、叼走桥板及水面缺口，之后合法绕路完成。第四、第五封到独立商场路网，包含两层、楼梯与另一侧返程。
4. 洞窟迷路与记忆：第七、八封在 33 节点、37 边的非规则石廊中往返。岩壁、拐弯、顶棚、短距视野、回环与死路形成封闭空间；地图、地面及碰撞共用道路图。完整穿过支路才记为走过；新/已走支路回想均实测，答题时冻结移动。自愿粉笔记号在现场与地图同步，刷新保留；结果展示重复路程与回想。手机洞窟复用合法桌面行旅产生的原始存档，验证触屏回想、重复记号、跑步和窄屏按钮。

## 覆盖与证据

18/18 规则通过：合法移动完成八封、40 张种子世界、楼层边界、封路绕行、独立 Floyd-Warshall 最短路、帮助/救援、暂停输入、损坏存档、旧六封完成存档解锁洞窟、断桥中途保存、岔路重复遍历及回想冻结、粉笔唯一性/保存、斜向洞窟图与碰撞。

生产浏览器覆盖游戏馆搜索、预览加载、点击进入及最近记录；八封合法往返、真实键盘/RAF、鼠标捕获、Shift、鲤鱼事件、两层商场、洞窟支路/粉笔/读档、旅记/设置/失焦、存储不可用、共享种子、触控行走/取消/转向以及 390px、320px 和横屏布局。

使用安装版 Chrome、`--mute-audio`、`--disable-speech-api` 和 speech stub，仅作用于测试。使用 `page.screenshot()`、PNG 像素 sanity，交叉核对文本状态、DOM、画布和错误。30 张生产截图均逐张打开目检，错误为空；横屏和手机洞窟使用整视口截图，避免全页覆盖临时改变 pointer 媒体查询。未使用共享 SwiftShader 客户端、canvas 导出或 preserveDrawingBuffer。手机为 Chrome 触控模拟，尚未验证实体手机 GPU / Safari。

- `tmp/wayfinder-v2-rules.log`：18 项规则。
- `tmp/wayfinder-v2-check-final.log`、`tmp/wayfinder-v2-build-final.log`：隔离工作树完整门禁。
- `tmp/wayfinder-v2-production/report.json` 与 PNG / JSON：生产运行和 30 张已目检截图。
- `tmp/wayfinder-v2-browser-production.log`：浏览器执行日志。
- `tmp/wayfinder-v2-integration.json`：主工作区同步文件 SHA256 与其他文件保护核对。
- 主工作区 `tmp/wayfinder-research/`：原始研究摘要及书目检索证据。

开发服务保留供用户当前试玩，开发/构建的类型 include 仍属于隔离工作树，不复制到主目录。验证只证明功能、通关和界面；真人是否愿意持续游玩、能否迁移到现实导航，需要设计说明中的使用评估。
