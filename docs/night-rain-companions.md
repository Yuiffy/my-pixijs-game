# 雨夜旅伴造型

2026-09-26：按用户反馈重做饼干岁和獭獭栞，保留原来的宝宝模式、存档选择与带路规则。

## 形象依据

- 饼干岁：仓库 `public/images/materials/biscuit/饼干岁2.png`。圆形烘烤饼干、巧克力色不规则斑块、小金皇冠、细手脚与圆点眼睛；去掉旧版猫耳和领巾。用有厚度的圆润饼身、柔和腮红与小嘴表现亲近感。
- 獭獭栞：栞栞原立绘中怀抱的小海獭（[参考图](https://storage.moegirl.org.cn/moegirl/commons/2/27/栞栞立绘上半.png)，通过必应图片查看）。奶咖色身体、奶白圆脸、小圆耳、短爪、前额深色毛簇、粉色贝壳；去掉旧版紫色身体和绿色菱形饰物。未下载、复制或打包网络图片；模型为按参考重新制作的程序化几何。

## 呈现

`CompanionModels.tsx` 负责两套几何和局部动作，`CompanionView.tsx` 负责现有世界位置、朝向和可见性。材质和几何在初始化时建立，逐帧只更新变换。眨眼、晃脚、摆爪和说话小嘴使用游戏时间，暂停时停下；饼干岁在带路／等候时抬手。减小上下起伏，用平滑转向代替瞬间转头。移除翅膀和光环，仅留少量暖色微光。

## 验证

- `pnpm exec eslint src/components/nightRain/CompanionModels.tsx src/components/nightRain/CompanionView.tsx`
- 顺序执行 `pnpm run check`、`pnpm run build`，保留 Next 内置 ESLint 和类型检查。
- `NIGHT_RAIN_BASE_URL=http://127.0.0.1:3871 node scripts/verify-night-rain-companions.cjs`：后台静音系统 Chrome、虚拟 Pointer Lock，普通输入跟随精灵到中庭雨灯，切换两模型、刷新保留选择、宝宝模式关闭／重新开启、390px布局。读取状态、DOM、canvas尺寸与错误日志，并逐张检查截图。
- 临时造型棚只用于检查同一组件的正面与45度侧面，没有加入生产路由。
