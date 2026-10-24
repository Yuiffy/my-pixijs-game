# 柳州地块、院落与建筑补全

## 2026-10-24 · 已下载建筑轮廓接入

在程序化补房之前，加入缓存的 Overture Maps Buildings 2026-10-21.0 轮廓。范围 WGS84 `[109.4090,24.3050,109.4190,24.3190]`，648 个候选，均无楼高与层数属性。上游记录 597 个来自 East Asian Buildings / CLSM，51 个来自 OSM；部分为影像识别屋顶轮廓，不能当作逐栋实测地面边线。官方说明：<https://docs.overturemaps.org/guides/buildings/>；归属：<https://docs.overturemaps.org/attribution/>，East Asian 数据 DOI：10.5281/zenodo.8174931。

`scripts/import-liuzhou-buildings.py` 复用现有局部投影并保留 GERS ID 和来源，坐标只舍入到 0.001 米，不修改轮廓形状，也不生成伪造的源高度。`world.ts` 优先保留原有 OSM 轮廓，再筛选下载候选：410 个采用，137 个边界/尺寸不合适、64 个廊道冲突、16 个重叠、21 个公共或玩法空间冲突。采用的楼体全部 `heightSource:"estimated"`；`real:true` 仅说明轮廓来自地图资料，不表示估算高度真实。几何进入统一碰撞、导航、NPC 避障和相机阻挡。新轮廓与既有轮廓合为一个渲染网格，基础向地下延伸三米以避免斜坡边缘悬空。

公开副本：`public/games/liuzhou/overture-buildings-core.geojson` 保留原下载文件，`public/games/liuzhou/building-footprints.json` 提供转换后的坐标及来源。游戏地图附下载入口与 ODbL 归属。原文件 SHA-256：`145664c466e1ba2bb93eaf74c8c036a51c044ffa2e21fc7e237765f1a4ff1ff9`。规则与真实物理测试见 `scripts/tests/liuzhou-downloaded-geography.test.mjs`。

2026-10-24。从 OpenStreetMap 官方 API 重新下载当前原点周围的原始地图：`https://api.openstreetmap.org/api/0.6/map?bbox=109.408,24.307,109.418,24.318`。这次保留原先导入中丢失的 `landuse`、`leisure`、`amenity`、`barrier`，而不把没有 `building` 标签的所有地块当成空地。原始下载留在 `tmp/liuzhou/urban-source.osm`。

`src/components/liuzhou/urban-landuse.json` 与可下载的 `/games/liuzhou/urban-landuse.json` 完全一致。`scripts/import-liuzhou-landuse.ps1` 可从缓存重建，加 `-Refresh` 可重新下载。两者保留原始 OSM way ID、名称、用地类型、完整边界，采用与主地图相同的原点 WGS84 `(109.41225, 24.31415)` 和米制局部投影。数据 © OpenStreetMap contributors，ODbL 1.0；许可见 `https://www.openstreetmap.org/copyright`。

| OSM way | 真实资料保留内容 | 场景用途 |
| --- | --- | --- |
| 836086516 | 金沙角，`landuse=residential` | 住宅用地边界、较高住宅体量、院落与树木 |
| 1044328370 | 龙城中学，`amenity=school` | 校园边界、低层楼体与围墙 |
| 205661086 / 205661087 | 公园路幼儿园 / 公园路小学，`amenity=school` | 学校用地与院墙，保留街路 |
| 205661089 | 柳州市红十字会医院，`amenity=hospital` | 医疗地块、院落边界 |
| 205661085 | 罗池停车场，`amenity=parking` | 保留为停车地面，不填成住宅 |
| 205515114 / 205516002 | 柳侯公园 / 驾鹤小桃源，`leisure=park` | 绿地与树丛，禁止泛用住宅填入 |
| 1044328366 / 1044328367 | 观瀑广场 / 金沙角广场，`place=square` | 公共铺装和绿化，保留开放步行区域 |
| 434067135 | 柳州文庙，`landuse=religious`、`barrier=wall` | 保留真实宗教地块，避免住宅填充 |
| 1306473029 | 小桃园广场，`landuse=residential` | 按 OSM 实际住宅标签处理，不能仅凭名称把它当成公共广场 |
| 1351248951 / 1351248954 | 驾鹤小学 / 驾鹤综合市场 | 学校和市场用地，保留南岸地块性质 |
| 1524324821 | 柳州市五星步行街，`landuse=retail` | 保留商圈及既有建筑，不用私人院落截断步行街 |

`urban.ts` 提供无副作用的 `createUrbanFabric` 工厂。优先使用这些真实地块边界，再在没有建筑轮廓的后排街区补充多层楼体和封闭院落。所有补充楼体与墙高都标记 `real:false`；它们是依据用地和周边道路方向的美术近似，不是逐栋实测建筑、真实产权线、真实小区入口或当地通行规则。金沙角住宅体量、学校楼体高度和普通院落形状也属于近似，不能拿来做现实导航。未用商业地图瓦片、街景照片或网上建筑模型。

新楼体、围墙与统一 `BUILDINGS` 共用几何，因此物理、步行导航、NPC避障、相机避墙都能得到相同实体边界。普通院落的四边墙高 2.5 米，围墙可见且阻挡进入。真实地块的围墙只放在不侵入道路和玩法通道的位置。`UrbanView` 实例化围墙、压顶、立柱和树木；其 `heightAt` 与主地图地形高度函数一致。住宅与学校等地块使用独立地面颜色，公园和广场保留公共绿地，不再按“没有已绘建筑”一律铺成裸地。

整个候选院落边界按两米采样，并检查中心与双向多边形包含关系；这样可以避免只检查楼体中心造成道路穿楼或小建筑被包进新院落。机动车道、步行道、桥梁轴线各留对应宽度和路缘余量。NPC完整巡游折线、固定交谈点、城楼、粉摊、放映和采样区域另留净空。桥梁周围的树冠也留出距离。工厂接受当前可玩边界，不依赖固定南岸范围。

规则验证：`node --test scripts/tests/liuzhou-urban.test.mjs`。覆盖 OSM 标签与公开数据一致性、院墙全周闭合、每条真实街路的可通行廊道、每条NPC步行路线和站点、公共绿地不填住宅、桥边树冠净空。浏览器观感和新地形的整体验证由本次柳州地图主任务完成。
