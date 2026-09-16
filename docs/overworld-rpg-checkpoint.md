# 虚境归途 · 用户要求暂停

2026-09-12：用户表示 token 用尽，要求“先开发到这，保留阶段性成果”。所有开发子代理已中断；暂停后不再新增功能，不代表完整目标或 v0.2 已完成。

## 已验证基线

v0.1 已完成自由探索、四位伙伴招募、自动/手控战斗、三枚碎片、最终 Boss 与返乡结局，10 项规则测试和完整浏览器流程通过。稳定独立副本及生产构建在 `D:/workspace/rpg-validation-20260912`；报告 `artifacts/overworld-rpg-v01-verification.json`、`tmp/rpg-verify/report.json`。

## 当前工作区与备份

当前工作区保留 v0.2 进行中的源码。另复制一份到 `artifacts/rpg-checkpoints/v0.2-paused-20260912/`，包含 RPG 组件、路由、规则测试、浏览器脚本及版本文档。没有提交、推送或部署。

v0.2 的 types 已扩展为版本 2（area、worldReturn、story）；核心代理正在实现四个室内 inn/archive/forge/ruin、岁己留灯支线与栞栞书信支线，以及旧存档迁移。场景代理正在接入室内渲染和区域切换。根任务已接入按区域寻路/交互、地图地点索引、支线追踪、经历日志、馈赠与结局对白；新增 RpgPanels.tsx。规则代理已编写 17 项测试，但暂停时仍等待核心存档校验完成，未取得本版最终通过证据。

## 恢复时先做

1. 重新检查当前文件；不能把进行中的实现或旧报告当作 v0.2 已通过。特别核对 engine.ts 的 version2 loadGame 校验及旧档迁移、scene.ts 的室内切换、导出 API 与 UI 的一致性。
2. 确认区域实体严格过滤，跨区域清除寻路/按键；查 areaViewSnapshot 是否已实现再接入浏览器文本状态。
3. 运行目标 ESLint 与 rpg:test，修复后完成新的室内/双支线/分支回访/室内败退/旧档迁移浏览器验证。现有 verify-overworld-rpg.cjs 主要覆盖 v0.1 主流程，新 v0.2 专项尚未完成。
4. 对最终截图逐张目检，顺序 check/build。共享工作区有其他游戏的并行改动，不覆盖或回滚它们。

完整 v0.1 → v0.2 → v0.3 → v1.0 路线继续保留在 docs/overworld-rpg.md；等待用户明确恢复开发。
