# 岁岁过招首章素材

- `dojo.webp`：2026-09-06 使用内置 ImageGen 生成的原创道场场景，原始图保留在 `C:/Users/yuiffy/.codex/generated_images/01a0763f-1976-7943-8fed-af241743f043/exec-f1779db4-34fd-4d5a-ae3d-eef0d3d45d98.png`。WebP 仅进行格式转换。
- 生成提示：16:9 空旷的侧视道场，清爽绘本/水粉风，青绿瓦、朱红旗帜、浅冷灰石地、竹林与远山，地面下方 40% 为可读战斗空间，无人物、文字、UI、光球或模糊。
- 岁己 HUD 图：复用本站 `/images/autochess/portraits/sui.png`。角色参考项目已有 `/reference_images/岁己小红帽立绘.png` 的银发、红帽、红白服饰辨识点。
- 战斗角色：`FighterView.ts` 原创 Phaser 分层纸偶图形，使用可单独摆动的头、四肢、发尾、武器；各动作由规则状态驱动。饼师傅和看台饼干图形为本原型原创绘制，未截取直播画面。
- 音效：P0 基础 13 类 Web Audio 合成短音，不含直播原音或第三方音乐。默认静音，点击声音工具后才启用。

## P1 新增

- `bell-court.webp`：内置 ImageGen 生成，原图 `C:/Users/yuiffy/.codex/generated_images/01a0763f-1976-7943-8fed-af241743f043/exec-a468c635-74c7-46f7-a713-d946546f421c.png`。提示为明亮山间钟台、铜钟与淡蓝灰石地，横向固定镜头、绘本水粉、无人物与文字，保留下方空旷战斗空间。
- `final-court.webp`：内置 ImageGen 生成，原图 `C:/Users/yuiffy/.codex/generated_images/01a0763f-1976-7943-8fed-af241743f043/exec-9af96f69-0b8e-402a-a65a-58a5901dbbe0.png`。提示为黄昏终庭、朱红绶带、青瓦道场和收场钟，同样固定镜头、空场地和绘本材质。
- 两张背景仅用 FFmpeg 转换为 WebP，没有下载第三方商业素材。听钟人、赤绶馆主的分层身体、帽冠、面罩、长铃和披风由代码原创绘制。
- 新增招架、破架、反击、破架追击、体力不足、飞铃、返程命中和首章钟声，共 21 类合成声音，与 P0 弹反音效保持不同音色。
