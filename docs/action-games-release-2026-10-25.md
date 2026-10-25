# 三款动作游戏发布记录 · 2026-10-25

用户授权：判断本轮改动是否适合上线，适合则合入线上主分支。实际远端默认及生产分支为 `master`，没有 `main`。最初以 `73112ec54ccaaa3514332ceef5091ab8adaa128d` 验证；推送前主分支收到独立的旅居之魂提交 `f9c4681db8498d2fe70e44d479d26cba8b727fd6`，因此先接上该提交，再重新执行最终构建验证。

独立工作树 `codex/action-games-release` 的本轮提交只接入肥岁健身、春日第一单、马上就播的源码、专项测试、游戏库说明及本轮文档。旅居之魂修改由其他线程单独提交，本轮仅保留主分支已有内容。没有引擎升级、数据库迁移或存档格式升级。

## 发布判断

适合以体验改进更新发布：已有完整流程回归、旧存档兼容和桌面/触屏验证，核心改动集中且可回退。健身窄屏角色偏小、3D部分390px小游戏提示条偏长不影响现有流程，保留为后续事项。未进行真实手机/Safari或真人趣味对照测试。

详细设计与原轮验证见 `action-games-review-2026-10-25.md`、`fitness-redesign-2026-10-25.md`、`spring-redesign-2026-10-25.md`、`pre-stream-redesign-2026-10-25.md`。

## 独立发布验证

依照锁文件在独立工作树安装依赖，没有更新依赖或锁文件。规则测试全部通过：fitness 40/40、delivery 72/72、pre-stream controls 20/20、library 6/6，共138项。修改源码的定向ESLint通过，随后 `pnpm run check` 通过，保留仓库既有的非阻塞unused-vars警告。

依次完成 `pnpm run check` → `pnpm run build`，均退出0，Next ESLint保持启用。固定生产构建目录 `.next-action-release`，BUILD_ID `ZJniCi14_vGHgwjCnVKTl`。只撤销Next自动添加的本机构建类型include，不改仓库配置。

在4162端口启动该生产包，以安装版静音Chrome进行真实RAF和普通键盘试玩，不调用测试推进或修改游戏状态：春日取汤、初跳、无Shift挑跃、满血落上400px屋顶；健身移动与破围；3D移动与快步，均通过。另核对桌面/390px试玩页三条入口及封面资源。报告 `live-production/report.json` passed=true、errors=[]，7张全页截图通过像素健康检查并全部逐张打开，与游戏状态、画布、DOM交叉核对。

验收日志与截图保存在本工作树 `.tmp/action-release/`，不将本机产物或绝对路径测试脚本作为线上资源提交。初次复用依赖目录缺失Next命令，因此改用本工作树独立的锁文件安装；最终验收不依赖该失败环境。

接上 `f9c4681` 后再次顺序执行check→build，全部退出0。最终构建 `.next-action-release-integrated`，BUILD_ID `EOa86zdXQTvmXIaAOD4wM`；同一普通键盘/真实RAF试玩再次通过，`live-integrated/report.json` passed=true、errors=[]，7张最终截图全部打开确认。本轮三款源码与首次验证一致。

线上由既有Vercel Git集成跟随master发布；目标为 `my-pixijs-game`（`prj_e23a2C91u2dLCxboS8qeGyrskvRG`），所属 `team_aF6FAokynXxHva4NxQmIkRoL`，正式域名 `www.suiji.site`。发布后单独确认目标提交的Production部署及页面，不将git推送等同于部署完成。
