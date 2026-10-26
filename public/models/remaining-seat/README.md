# 余席模型与参考图交付

本目录是资产接入约定。截至 2026-10-26，没有已生成、已验收或已集成的 Meshy GLB；README 和提示词不是模型文件。原型使用程序化场景时，不应宣称它使用了 Meshy 人物。

## 资产清单

| 计划文件 | 用途 | 交付限制 | 当前状态 |
| --- | --- | --- | --- |
| `young-adult.glb` | 镜中剪影、片尾或后续人物演出 | 1.70 米高；目标 15–25k 三角面；不依赖高精面部 | 待制作 |
| `dining-chair.glb` | 多余的空位 | 0.45 米座高；目标不超过 3k 三角面 | 原型可用几何体 |
| `cradle.glb` | 预先安排好的未来 | 约 0.9 × 0.5 × 0.65 米；目标不超过 5k 三角面 | 原型可用几何体 |
| `reference/young-adult-front.png` | 人物正面参考 | 单人全身、统一 A pose | 待制作 |
| `reference/young-adult-right.png` | 同一人物右侧参考 | 与正面完全一致的衣服、姿态、尺度 | 待制作 |
| `reference/young-adult-back.png` | 同一人物背面参考 | 与正面完全一致的衣服、姿态、尺度 | 待制作 |

以上文件名是未来约定，不代表文件已经存在。摇篮为空，不制作婴儿、不加入伤害或尸体意象。

## 人物设计锁定

27 岁东亚青年，中性呈现，正常身体比例，1.70 米。短黑发自然贴额，表情克制、清醒而疲惫；不夸大黑眼圈，不做恐怖化畸形。灰蓝色无品牌宽松衬衫，袖口略皱，左胸一个空口袋；炭灰直筒长裤；旧米白低帮鞋。没有领带、首饰、包、手持物、文字或悬挂证件。衣服左右不凭空交换细节。

人物是普通生活中的具体人，不是“被社会压迫”的图解。不要借用现有游戏角色、真人公众人物或任何真实用户面貌。正面设计确认后，侧面和背面应以正面作为参考继续生成或由艺术家画出，不独立随机设计三次。

## 三视图提示词

优先输出三张独立 PNG，建议 1536 × 1536 或更高；每张只有同一个完整人物，头顶及鞋底全部可见，人物高度一致。柔和中性光、纯浅灰背景、无地面强阴影、正交视感；三个视图都保持同一个自然 A pose，双臂离身体约 25 度、手掌放松、脚分开与肩同宽。

**正面**

```text
Original game character reference, one single East Asian young adult, age 27, gender-neutral presentation, natural realistic proportions, 170 cm height. Short natural black hair, restrained tired but attentive face. Loose muted blue-gray shirt with one empty left chest pocket and gently creased cuffs, charcoal straight trousers, worn off-white low-top shoes. No logos, no accessories, no held objects. Full body FRONT VIEW, orthographic character turnaround reference, neutral A-pose with arms about 25 degrees away from torso, relaxed hands, feet shoulder-width apart. Head and shoe soles fully visible, centered at consistent scale. Soft even neutral studio light, plain light gray background, no dramatic shadows, no text, no labels, no border, no extra people, no environment. Grounded understated realism, subtle material wear, not a monster or an existing game character.
```

**右侧**（必须附已确认的正面图作为参考）

```text
Create a strict RIGHT SIDE profile of exactly the same original character in the supplied front reference. Preserve identity, age, hair, silhouette, body proportions, shirt pocket placement, every garment color, cuffs, trousers, and shoes. Keep the identical neutral A-pose; rotate the whole character only, do not change posture. One single character, full body, true side orthographic view, head to shoe soles visible, same subject height and framing as the front image. Soft even neutral studio light and the same plain light gray background. No new accessories, no logos, no captions, no extra views, no environment, no perspective distortion.
```

**背面**（必须附已确认的正面图作为参考）

```text
Create a strict BACK VIEW of exactly the same original character in the supplied front reference. Preserve identity, short black haircut, silhouette, body proportions, muted blue-gray shirt, charcoal trousers and worn off-white shoes. Plain shirt back with only believable fabric seams; do not invent a back pocket, graphic, backpack or logo. Keep the identical neutral A-pose; rotate the whole character only. One single character, full body, rear orthographic view, head to shoe soles visible, same subject height and framing. Soft even neutral studio light and the same plain light gray background. No new accessories, no text, no border, no extra views, no environment, no perspective distortion.
```

检查三图：耳朵/头发轮廓、袖长、左胸口袋、裤缝、鞋型、身体比例和手臂角度一致。遮挡导致的缺失应重新补图，不通过提示“保持一致”就默认成功。衣服磨损不要在每个角度变换位置。

## Meshy 提交约定

根据 2026-10-26 的 [官方 Multi-Image API](https://docs.meshy.ai/en/api/multi-image-to-3d)，输入可为 1–4 张图片，每张 JPEG、PNG 或 WEBP，大小不超过 20 MB。首张使用正面。三张独立视图便于逐张验收；不要把三个人的拼图误当作同一个对象。

使用人物 A pose，输出 GLB，贴图上限 2K。具体模型版本、套餐与生成成本在提交时从 Meshy 当前界面/API 核实；本仓库不硬编码易失效的供应商模型名、价格或 API 密钥。生成后仍需整理手指、衣物厚度、遮挡面、UV、蒙皮和材质；“生成成功”不等于“可以入库”。

当前没有可调用的 Meshy 连接，未提交任务、未购买套餐、未消耗生成额度。插件目录未检索到 Meshy 不代表该服务不存在；也可从 [插件目录](https://chatgpt.com/plugins) 查询后续接入。连接可用后再按正式资产流程替换原型。

## WebGL 交付与验收

- 单个 GLB 严格小于 5 MB，纹理每边不超过 2048 像素。清除未使用纹理、材质、隐藏几何和重复对象。优先 1–2 套材质，避免依靠双面材质掩盖破面。
- 以米为单位，`Y` 向上，正面朝 `+Z`。人物脚底中心为原点 `(0, 0, 0)`，物件落地面中心为原点；应用缩放和旋转。导出后测量包围盒，不能只看文件名判断尺寸。
- 人物无武器、无内嵌摄影棚灯、相机或场景；模型内不保存账户信息和生成服务的临时下载地址。
- 第一版可接受静态人物。若后续增加动作，骨骼和 skin weights 需检查肩、肘、腕、髋、膝；idle 动作不超过轻微呼吸，避免夸张摆动影响恐怖气氛。
- 优化版保留原始导出以便回溯；压缩方案必须与项目加载器一致。运行时资源加载失败应保留可用的原型替身和交互。
- 在游戏灯光中检查正、侧、背及近景；检查穿模、悬空、法线、alpha、过亮 PBR、不可读剪影。用系统 Chrome 的整页截图检查，并与场景状态和控制台错误交叉验证。

## 来源与权利记录

正式加入文件时，同时增加 `<asset-name>.provenance.json`。至少记录：资产标识、来源类型（程序化 / 原创绘制 / AI 生成 / 已授权素材）、作者或工具、生成日期、服务任务标识、输入参考图相对路径、提示词文件、所适用许可、许可核实日期、修改者、原始文件与最终 GLB 的 SHA-256、最终尺寸、面数、材质和贴图数量、视觉验收日期。

只使用有权用于该游戏的参考图与模型；不要把“免费可下载”等同于可商用。来源字段不含 API 密钥、Cookie、私有账户详情或带签名的下载 URL。许可未核实时保留在本地制作区，不混入可发布资产。
