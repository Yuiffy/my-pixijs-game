# 柳州地形、桥梁层级与城市远景（2026-10-24）

本轮修复针对文惠桥与滨江东路错误平交、桥上树木穿插、街区留白、NPC 站在机动车道、远景缺少实际地标。场景仍是风格化游戏，资料精度与估算范围如下，不应称为测绘级复刻。

## 地形和垂直坐标

全场统一以绝对高程 85 米为本地 y=0 的坐标基准，一世界单位为一米。`terrainHeight` 同时供地形、道路、建筑、家具、人物、车辆、摄像机、导航和 Rapier 使用。物理地面使用覆盖可玩区域的 10 米采样三角网；视觉网格按距离使用 10/20/40/80/160 米 LOD。细分采样不等于源数据精度提高。

底图使用 Mapzen / AWS Terrain Tiles 的 Terrarium 数据，源精度约 30 米，范围为 x=-6600…10000、z=-10000…7600，保持真实水平尺度及高程，没有把山体作为随意摆放的椭球。四处重点山体增加 zoom=14、10 米采样局部网格，保留马鞍山、鱼峰山、鹅山、蟠龙山的实际地理位置和 DEM 轮廓。原始瓦片 URL 与 SHA-256 随 JSON 留存；源数据来自 NASA SRTM 等，详见上游归属说明。

SRTM 是表面高程，城市房顶、树冠及历史水面会污染街道高度。因此保留原始 DEM，另存 `terrain-ground.json` 作为可玩街区的保守地面估算；在边缘平滑回到 DEM，并保护实际山脚。它不是经过实测的裸土地形 DTM。水体使用 OSM 岸线多边形及岛屿孔洞，水位取代表性海拔 77.5 米，河床单独下切，**不是当天水位或水深数据**。

实际限制：局部 DEM 最大值约为马鞍山 253.4 米、鱼峰山 123.7 米、鹅山 262.6 米、蟠龙山 175.7 米。资料记载马鞍山主峰约 270 米、鱼峰山约 156.3 米，说明源数据仍明显低估狭小峰顶。没有为了对齐一个数字而凭空拔高整个山体。若要满足逐米还原，需要有授权的高精度裸地 DTM、等高线或摄影测量数据，以及统一高程基准的控制点。

重建工具：`scripts/import-liuzhou-terrain.py`、`scripts/reconstruct-liuzhou-ground.py`、`scripts/import-liuzhou-hill-detail.py`。原始/地面/局部高程 JSON 均在 `public/games/liuzhou/` 保留可分发副本及归属。

## 文惠桥与下穿道路

`bridges.ts` 根据已导入的两条 OSM 桥梁轴线生成桥面与引桥。北侧引桥参考长度 136.956 米，南侧 351.584 米。桥底保留地面的滨江东路，南岸地面道路也保持独立；投影相交不会形成桥面路口。树冠避让完整桥面和引桥走廊。

桥面高程依据当前地面估算和下穿净空重建，约海拔 97.95 米；**没有获得实际竣工桥面纵断面，6.5 米重建净空也不是实测桥下净空**。当前每幅通行面宽 10.4 米为游戏简化，亦非资料所载旧桥 18.5 米、新桥 16.35 米的完整工程横断面。主桥红拱、栏杆、路灯和桥墩为风格化表达。

桥面与斜坡使用同一顶点函数生成可见板面及实体碰撞；护栏有实体阻挡。导航使用上下两层图，只在引桥真实接地点换层，路线点及 worker 请求携带 y。步行和车辆可以沿坡上下，站在桥下不会瞬移上桥。高程版本 2 存档保留所处层级；旧版平面河中桥上存档迁移到桥面，章节、余额和已完成内容保留。

## 街区、人物和远景

恢复原始 OSM 的 20 处用地，区分住宅、校园、医院、停车场、商圈、公园与公共广场。没有建筑轮廓的街区按地块与路网补充多层楼和闭合院墙，新墙与建筑进入统一的物理、导航、避障和相机边界。具体楼体与院落仍是推断，不代表逐栋真实建筑或产权边界；详见 `liuzhou-urban.md`。

NPC 的出生点、聚会点、完整闭合巡游路线统一放在人行空间，预留连续通道；恢复旧存档时也验证机动车道和实体占用。米汀在罗池路人行侧，七海在南岸路侧，详见 `liuzhou-pedestrian-and-bridge-navigation.md`。

远景导入 18 座桥轴线（含当前可玩的文惠桥）及实际桥型分类：柳江、红光、文昌、壶东、壶西、广雅、双冲、三门江、河东、鹧鸪江、白沙、凤凰岭、官塘、静兰、阳和、洛维、文惠和柳州铁路桥。`Skyline.tsx` 用实例化模型表达远桥、实际道路和建筑体量；缺失建筑沿真实路网推断，避开河道、道路与山脚。桥塔、桥面高程、立面和缺失房屋均为简化模型。

全部远景按真实方位和距离布置，有正常地形与建筑遮挡，不能在同一个街角同时看到所有桥。远景位于可玩范围之外；近景不可探索院落用实体围墙和楼体封闭。远桥与街区合并为一个实例化绘制对象，避免为每个窗户增加独立渲染调用。

## 资料

- OSM 原始 API 及各请求范围写在 `skyline-map.json`、`urban-landuse.json`，© OpenStreetMap contributors，ODbL-1.0。原点 WGS84：109.41225, 24.31415，x 向东、z 向南。未使用商业地图瓦片或街景模型。
- AWS Terrain Tiles：<https://registry.opendata.aws/terrain-tiles/>；详细数据归属：<https://github.com/tilezen/joerd/blob/master/docs/attribution.md>。
- 广西新闻网，文惠桥改扩建参数（2013-02-20）：<https://gxxwfb.gxnews.com.cn/article.v2019.php?id=6997772>。
- 中国网，水南路下穿通道始于文惠桥底（2019-05-18）：<https://news.china.com.cn/live/2019-05/18/content_416715.htm>。
- 广雅桥，建设方双跨钢拱说明：<https://www.ztjttz.com/index/news/detail/id/904/class_id/61.html>。
- 广西新闻网，鹧鸪江单主缆悬索桥：<https://news.gxnews.com.cn/staticpages/20110916/newgx4e72a6a3-4141405.shtml>。
- 人民网，白沙桥塔与结构：<https://gx.people.com.cn/n2/2023/0117/c390645-40271268.html>。
- 人民网，凤凰岭风雨桥：<https://gx.people.com.cn/n2/2021/1231/c390645-35077259.html>。
- 中国网，马鞍山主峰海拔 270 米：<https://guangxi.china.com.cn/2022-07/14/content_42035895.html>。鱼峰山 156.3 米的公开景区资料：<https://www.vrqjcs.com/p/c081b9026a22424d>；此值仅作误差比对，没有替代 DEM 强制拉峰。

## 验证

- 全部 76 项柳州测试顺序执行通过，包含 71 项既有测试及新增 5 项地形/真实 Rapier 测试：北引桥→主桥→南引桥全程步行、双桥下方独立通行、护栏阻挡、汽车上坡与桥上刹停、新旧存档层级恢复、公开数据副本一致性。完整日志为 `tmp/liuzhou/terrain-rules-76.log`。
- `pnpm exec eslint src/components/liuzhou`、`pnpm run check` 通过；随后顺序执行 `NEXT_DIST_DIR=.next-liuzhou-terrain-build pnpm run build` 通过，保持 Next.js ESLint gate。仓库其他模块有既有 unused-vars 警告。
- `scripts/verify-liuzhou-geography.cjs` 使用安装的 Chrome，静音、禁用 TTS、模拟 Pointer Lock。通过正常存档加载检查点，以正常输入从北岸桥下走过双桥；其余图用于固定机位目视检查，未声称完成剧情。
- 六张全页图逐张打开检查，分别覆盖下穿前后、桥上向南的山体、向西的远桥和鹅山、人行侧 NPC 与封闭街区、南岸 NPC 与引桥。每张图同时检查 PNG 非纯色/透明/全黑、canvas 尺寸、DOM、`render_game_to_text()` 和 console/page errors；零错误。证据在 `.tmp/liuzhou-geography/report.json`，规则和构建日志在 `tmp/liuzhou/terrain-*.log`。
- 生产构建在 `http://127.0.0.1:4132/game/liuzhou` 启动，HTTP 200。另用安装的 Chrome 验证生产首屏和进入游戏，两张全页图均已打开检查，PNG/DOM/状态正常，零 console/page errors；证据在 `.tmp/liuzhou-terrain-production/report.json`。
