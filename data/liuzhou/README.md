# 柳州原始资料档案

归档日期：2026-10-24。这里是项目内长期保存的来源资料，不再依赖用户的 Downloads 或容易清理的 tmp。完整文件清单、原始字节与归档字节的 SHA-256、来源 URL、恢复目标见 [manifest.json](manifest.json)。原件没有移动或删除。

当前清单包含 39 份资料，共 23,698,002 字节（约 22.6 MiB）。2026-10-24 已逐项校验归档及解压后原文的哈希；此前已在独立临时目录离线恢复全部 34 个可恢复缓存文件，两份天地图 ZIP 另与 Downloads 原件逐字节核对一致。其余五份仅作来源原件或说明保存，无需恢复为缓存。本次复核另补存下载目录的 `柳州市 (2).gif` 为 `restricted/imagery/liuzhou-download-2.gif`（11,440 字节），内容待核查，未作为建模依据；`柳州市.gif` 和 `柳州市 (1).gif` 与已归档官方导出字节一致，复用同一份原件。

## 目录与用途

| 目录 | 已保存资料 | 后续用途与限制 |
| --- | --- | --- |
| `open/osm/` | 十份 OSM 原始 XML，无损 gzip 压缩；另存核心区 GeoJSON 和申请范围矩形 | 城市道路、水系、桥轴、山体与公园边界、建筑、地下街及台阶线；部分范围不完整，缺标签不表示实地空地。申请矩形是检索范围，不是测量数据 |
| `open/terrain/` | 十二张已下载 Terrarium 原始 PNG 高程瓦片 | 原始高程重采样与扩区；上游约 30 米，含树冠/房顶偏差，不能恢复踏步标高 |
| `open/buildings/` | Overture 648 个候选轮廓原始 GeoJSON、下载时元数据 | 保留源 ID 和来源；没有楼高。当前游戏采用其中 410 个轮廓。元数据中的旧“未集成”状态保留原样，以主清单及项目文档为准 |
| `open/buildings/GABLE-README.md` | GABLE 项目说明文档 | 仅说明文档，没有下载 GABLE 建筑数据；不能把它当作已具备另一个数据集 |
| `restricted/tianditu/` | 用户下载的两个原始 ZIP、图层核查与裁剪参考、下载协议文本 | 1∶25 万柳州图幅；没有 DEM、建筑高度或三维模型。两份内层 ZIP 字节相同，外层原件分别保留 |
| `restricted/imagery/` | 官方导出的 GIF、两个拆帧、核查元数据、另一次待核查 GIF 下载 | 2024-11 帧可作布局参考；2025-10 帧是“连接超时”错误，保留用于识别失败数据；不是带坐标原始正射影像。另一次下载仅保存原件 |

`open/`、本说明、清单和恢复工具随项目版本控制保存。`restricted/` 在本机项目中实际保存，但因既有天地图下载协议限制，已单独排除于 Git，且不在 `public/`，不会随网页分发。**备份完整资料时须另行复制整个 `data/liuzhou/`，只备份 Git 仓库不会包含这些受限原包。** 受限原包没有推送或向第三方转交；没有保存账号、验证码、申请个人资料表或登录页面。下次继续城市制作可先读[经验与接续指南](../../docs/liuzhou-city-handoff.md)。

## 离线校验与恢复

在项目根目录执行：

```powershell
python scripts/archive-liuzhou-data.py --verify
python scripts/archive-liuzhou-data.py --restore-cache
```

校验同时检查压缩文件及解压后原始内容的字节数和 SHA-256。恢复命令按清单恢复到 `tmp/liuzhou/`；已有不同内容时拒绝覆盖，不联网，不执行任何下载内容。若只克隆了 Git，缺失受限文件会列为可选本机备份缺失，开放数据缺失或校验不符则报错。恢复后现有工具无需重新下载：

```powershell
python scripts/import-liuzhou-skyline.py
python scripts/import-liuzhou-terrain.py
python scripts/import-liuzhou-hill-detail.py
python scripts/reconstruct-liuzhou-ground.py
python scripts/import-liuzhou-buildings.py
python scripts/prepare-liuzhou-shoreline.py
python scripts/import-liuzhou-city.py
python scripts/prepare-liuzhou-underground.py
python scripts/prepare-liuzhou-station.py
python scripts/prepare-liuzhou-station-neighborhoods.py
python scripts/prepare-liuzhou-eshan.py
python scripts/prepare-liuzhou-square.py
python scripts/prepare-liuzhou-xihuan.py
python scripts/prepare-liuzhou-wuxing.py
python scripts/prepare-liuzhou-market.py
python scripts/prepare-liuzhou-guangya.py
python scripts/prepare-liuzhou-central-blocks.py
python scripts/prepare-liuzhou-riverside.py
```

这些重建步骤可分别运行；先地形/水系，再裸地估算、山体、轮廓与岸线。已有运行用派生 JSON 继续保存在 `src/components/liuzhou/`，可分发副本在 `public/games/liuzhou/`，没有把它们混作原始测量数据。

`import-liuzhou-city.py` 直接读取本目录的压缩 OSM 原件，离线生成扩区使用的道路、建筑、公园、铁路、地下街和台阶数据，无需先恢复缓存。扩区范围与当前制作状态见 [城市扩建说明](../../docs/liuzhou-city-expansion.md)。

`prepare-liuzhou-underground.py` 由上述城市数据离线生成地下空间、楼梯开口及地面裁切；需要 Python Shapely。横向轴线与入口位置来自 OSM，地下标高、宽度、店铺及踏步均是重建估算。八类通用橱窗与入口结构的估算范围见 [地下街依据](references/underground-street.md)。新增地点交叉核查笔记保存在 `references/`，例如 [东一巷定位](references/beizhan-location.md) 与 [老夜市街景参考](references/beizhan-streetscape.md)。

`prepare-liuzhou-station.py` 由城市源数据生成柳州站三部分平面、估算屋面、东广场铺装与六块源站台；需要 Shapely 2.1 或更新版本。站房分区保留原轮廓总面积，广场铺装裁掉车道。外观参考与测量缺口见 [柳州站重建依据](references/liuzhou-station.md)。

`prepare-liuzhou-station-neighborhoods.py` 沿六份归档住宅/商业用地边界补充站前周边街区，避让来源道路、建筑及东广场，共用边界仅建一套墙；需要 Shapely 2.1。楼栋、楼高、围墙、院落与名称牌均为估算，见 [车站周边依据](references/station-neighborhoods.md)。没有新增高程或三维数据。

`prepare-liuzhou-eshan.py` 沿源公园边界和十二条步道生成窄通道及地形开口，重建入口、环山路、登山通道和两处小型休憩棚；需要 Shapely 2.1、NumPy、SciPy。水平轴线来自 OSM，局部坡度修整、宽度和设施为估算，陡峭岩壁侧路尚未精细复原。见 [鹅山公园依据](references/eshan-park.md)。

`prepare-liuzhou-square.py` 直接从归档 `skyline-core.osm.gz` 恢复人民广场多边形关系9600586及喷泉孔洞205658310，裁除源道路与建筑；需要 Shapely 2.1。此前导入遗漏关系数据，现已纠正。源广场与外围估算前庭分开标注；绿化、家具、铺砖和停喷状态装置细节为估算，建筑保留源轮廓，311米地王大厦使用源高度标签。百家姓地雕与文化建筑的文字参考、尚未复原的部分见 [人民广场依据](references/people-square.md)。

`prepare-liuzhou-xihuan.py` 直接读取本目录 OSM 原件，保留西环路×鹅山路的道路轴线、斑马线/信号节点、公交站及校园/住宅边界，离线生成路口与沿街空间；需要 Shapely 2.1。车道宽度、围墙、候车亭及绿化为估算，来源节点和重建边界见 [西环路口依据](references/xihuan-eshan.md)。本步骤没有新增高程资料。

`prepare-liuzhou-wuxing.py` 由归档来源生成五星街、解放南路、中山中路的步行铺装和商业立面数据；需要 Shapely 2.1。保留23份源建筑完整轮廓及“柳州五星”雕塑节点，另有6份明确估算的低矮商铺。98段立面、49处家具及楼高、雕塑外形均为估算；重叠楼体只裁切绘制部分，完整源轮廓仍用于碰撞。来源及覆盖缺口见 [五星街依据](references/wuxing-street.md)。

`prepare-liuzhou-market.py` 由城市数据的东一巷完整轴线和柳建大院用地边界生成东段布局；需要 Shapely 2.1。没有源楼栋和支巷测绘，住宅、院内通路、围墙高度与家具均为估算，见 [夜市重建依据](references/beizhan-streetscape.md)。

`prepare-liuzhou-guangya.py` 保留广雅桥及两岸17份来源道路记录，按成对车行轴线生成整体桥面中心，并核对五处较低道路交叉；需要 Shapely 2.1 或更新版本。桥头新增步行铺装先裁掉附近来源车道，再三角化贴地，生成器检查实际输出面不覆盖车道。桥面标高、纵横坡、人行道宽度和设施为现有地形上的估算，见 [广雅桥依据](references/guangya-bridge.md)。本步骤没有新增高程或三维原件。

`prepare-liuzhou-riverside.py` 从已归档原文按节点ID恢复江滨公园21015546与柳堤游园21015274的完整多段关系，离线生成边界内的估算绿化；需要 Shapely 2.1。原始环、成员、节点、源面积和哈希均保留，估算住宅避让源公园；绿化裁掉河道、道路、台阶及建筑，贴实际地形而不修改DEM。来源步道和未取得的堤岸细节见 [河岸公园依据](references/riverside-parks.md)。

## 来源与空间基准

`prepare-liuzhou-central-blocks.py` 恢复四份跨旧核心边界的完整源建筑轮廓、十六份住宅way及住宅关系21296846和其内孔雅儒路小学205663282；需要 Shapely 2.1 或更新版本。当前十八份地块、87栋估算体、847段墙、18块名称牌；学校空间单列，保留较大的估算庭院。福柳新都、飞龙景苑与跃进路职工住宅合计28份已有源楼栋优先保留，不额外填满院落。补充楼体、围墙及高度均为估算，保留来源道路和楼梯开口。来源ID、离线复用和覆盖缺口见 [中心住宅街区依据](references/central-blocks.md)。

- OSM：© OpenStreetMap contributors，ODbL 1.0；原文件保留上游版权/许可及要素 ID，来源请求见清单。
- Overture Maps：2026-10-21.0，ODbL；包括 OSM 与 East Asian Buildings / CLSM（DOI `10.5281/zenodo.8174931`）。原 GeoJSON 保留各要素来源。
- Terrain Tiles：Mapzen / AWS，具体原始产品归属见 <https://github.com/tilezen/joerd/blob/master/docs/attribution.md>。原瓦片请求与哈希均保留。
- 天地图：用户已自行填表接受下载协议；原包许可不能按开放数据理解，协议和核查记录见本地受限目录及 `docs/liuzhou-data-application.md`。另行申请的三维数据尚未收到，不列为已归档。
- 游戏原点 WGS84 `(109.41225, 24.31415)`，x 向东、z 向南，一单位一米；绝对高程 85 米对应 y=0。天地图原始图幅为 CGCS2000 经纬度，不能未经坐标处理与 WGS84 资料直接拼接。

后续收到新资料时，保留原件、来源、日期、许可、坐标系/高程基准与 SHA-256，再生成独立派生数据。不要覆盖旧来源或用较新的下载日期冒充资料现势性。
