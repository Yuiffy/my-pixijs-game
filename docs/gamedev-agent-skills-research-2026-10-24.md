# 游戏开发 Agent Skills 调研 · 2026-10-24

## 结论

值得有选择地吸收。对“操作反馈薄、素材不统一、关卡缺乏节奏、原型长期没有收尾”的问题有直接帮助；对“核心决策不好玩、经营与战斗策略缺乏深度”的帮助主要在验证方法，不能保证设计结果。建议将它当作专项制作手册，与现有 Game Studio、项目规则和真人试玩配合使用。

本次是源码与文档调研，未安装技能、未修改游戏、未进行采用前后的玩家对照实验。以下改善预期都是基于内容的判断，不是已经测得的效果。

## 核查范围与来源

远程仓库 main 在调研时的 HEAD：`184b72be02884f782a0058f2eeae2ce4277453e4`。实际阅读通过 GitHub raw 的 main 获取；以下链接固定至本次观察到的 HEAD，便于后续复核。

主要远程来源：

- [README：技能目录、安装与定位](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/README.md)
- [prototype-fast：单问题原型与 keep/kill/refactor 标准](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/workflows/prototype-fast/SKILL.md)
- [game-feel：反馈层次、事件接口与强度分级](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/game-feel/SKILL.md)
- [level-design：灰盒、教学、挑战与张弛节奏](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/level-design/SKILL.md)
- [create-game-assets：美术方向、资产清单与实际尺寸验收](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/create-game-assets/SKILL.md)
- [art-direction：把视觉风格转为可观察的统一约束](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/disciplines/create-game-assets/references/art-direction.md)
- [game-jam：先做完整小循环、控制范围与预留收尾时间](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/skills/workflows/game-jam/SKILL.md)
- [router：按任务组合技能](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/router/SKILL.md)
- [engine-detection：多引擎项目的消歧规则](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/router/references/engine-detection.md)
- [VERSION-SUPPORT：现有项目保持固定版本](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/docs/VERSION-SUPPORT.md)
- [validate-skills.py：文档结构与仓库连接校验](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/184b72be02884f782a0058f2eeae2ce4277453e4/scripts/validate-skills.py)

本地对照：`progress.md`、`package.json`、`docs/pinglu-canal-redesign.md`、`docs/three-games.md`、`docs/wayfinder-design.md`、`docs/autochess-review-2026-09-06.md`；以及已安装 Game Studio 的总入口、web-game-foundations、game-playtest 文档。历史审查中的问题不能直接视为当前版本仍然存在。

## 它提供什么

当前 README 列出 76 个开发技能和一个 router，覆盖 12 种引擎，内容分为引擎实现、通用专项、游戏类型与制作流程。它既包含 Markdown 手册，也包含部分资产检查与预览脚本。它没有附带一套可直接替换我们游戏的完整内容，也不自带图像生成服务；资产技能会调用环境里已有的生成工具或使用其他合法资产。

对我们最有价值的是通用专项与制作方法，多数新引擎入门内容的优先级较低。

| 问题 | 最相关内容 | 具体收益与边界 |
| --- | --- | --- |
| 核心动作重复但无趣 | prototype-fast | 先写清一个待验证问题、保留与淘汰标准，观察新玩家是否理解并愿意继续。帮助发现需要重做的设计，不能替代设计判断。 |
| 能操作但反馈薄 | game-feel | 用事件连接声音、动画、粒子、停顿等，并按重要性分级。可以改善操作质感；不能给缺少取舍的玩法凭空增加深度。 |
| 关卡像同一内容换数值 | level-design | 先教学、再练习、再组合考验，安排紧张和休息。空间关卡最直接；经营游戏需转译为决策阶段与事件节奏。 |
| 美术像不同批次临时拼装 | create-game-assets | 先定代表性视觉目标，再按同一比例、色彩、光线与细节密度制作资产族，最终在游戏尺寸中验收。 |
| 内容越加越多但没有完成感 | game-jam 的部分方法 | 先走通开始、游玩、结束、重开的小循环，冻结范围并预留收尾。比赛截止时间与压缩工期不应照搬到正式制作。 |

game-feel 本身明确只为已有机制增加反馈；prototype-fast 明确产出是保留、淘汰或重做的决策，且不用于已验证功能的正式版本生产。因此不能把“装上原型技能，多快做几个东西”当作解决 demo 感的方式。

## 与我们现有流程的差异

现有 Game Studio 已要求定义玩家动作、核心循环、失败条件、进程和游玩时长，并提供引擎、UI、资产和浏览器验收路径。新库的增量主要是把一些专项展开为更细的制作步骤、代码配方和质量标准，并非从无到有补齐整个开发流程。

本地项目已有完整流程、存档、手机适配、规则测试、截图与构建验收。`docs/three-games.md` 记录了这些技术闭环；`docs/wayfinder-design.md` 又明确区分“能玩通”与“愿意持续玩”。因此继续增加技术检查本身，不能回答用户觉得不好玩的部分。

平陆运河的历史记录尤其有说明力：规则与浏览器验证已经通过后，试玩反馈仍指出“标段计数缺少直观操作和空间策略”，于是重做成直接改变地形的争线。这支持优先验证实际决策和操作体验，而不把按钮、系统与通过测试的数量当作趣味性指标。这里引用的是历史设计过程，并非判断当前版本仍有同一个问题。

自走棋最需要的经济、阵容多样性、羁绊平衡、AI 对局强度；经营游戏需要的市场反馈、竞争和收益结构，在该目录中没有对应的专门技能。通用 AI、卡牌和 RPG 手册能提供部分实现方法，不能代替针对游戏的设计与平衡实验。

## 接入注意点

1. 本仓库同时依赖 Phaser、PixiJS 和 Three.js，应按具体入口与实际 import 选择技能。远程 router 的正文使用优先级表，但其 engine-detection 引用文档补充了多 web 依赖消歧规则，接入时必须一起保留。
2. 本地 package.json 声明 Phaser `4.2.1`、PixiJS `^7.4.0`、Three.js `^0.180.0`。远程目录对应 Phaser 4.2、PixiJS 8.22、Three.js r186。涉及具体 API 时读取本地锁文件，尤其不能把 Pixi v8 的代码直接用于 v7。远程版本政策同样要求保留现有项目版本，而非强制升级。
3. 继续保留本地 AGENTS.md：Chrome 截图路径、黑图 sanity、静音与 Pointer Lock stub、顺序 check/build，以及自走棋最小化美术约束都仍然适用。
4. 现有自走棋已有实际尺寸、美术参照和完整提示词规则。新资产流程应补充跨状态与跨批次一致性，不能覆盖已定角色特征和 48/64px 验收标准。
5. validate-skills.py 主要验证元数据、路径、链接、目录、JSON 和插件连接。文档校验通过，不等于生成代码已在我们的游戏中验证，更不等于玩家觉得好玩。此次阅读范围内未看到能证明它提升真人趣味评价的对照实验。

## 建议的采用方式

先吸收 prototype-fast、game-feel、level-design、create-game-assets 四项；按需求补音频和游戏 UI。现有工程、测试和运行时技能继续复用。无需为覆盖更多引擎而一次全装，也无需更换游戏引擎。

对新想法，用短原型验证最不确定的体验；对现有游戏，保留成熟系统，用小范围实验验证某个体验问题，不因为原型手册推荐丢弃代码就重写整个项目。

先挑一款用户明确觉得像 demo 的游戏，打磨一段目标品质的完整体验，再决定是否扩量。动作游戏可取一关，经营与自走棋应取足以体现主要取舍的完整小局；不强制所有类型都压成同一时长。

建议流程：

1. 写明目标玩家、体验目标、玩家操作、取舍，以及这次需要证实的问题。
2. 记录现版中玩家卡住、厌倦或不理解的具体位置。
3. 一轮聚焦一个主要体验问题；分别观察规则变化与表现打磨的效果。
4. 把代表性内容做到计划中的正式视觉、音效、教学和结算品质，验证完整体验，而不只验第一屏。
5. 邀请少量未接触过游戏的真人试玩，不先讲解解法；观察理解、主动尝试、选择理由、无聊位置和自愿继续。少量反馈用于定位问题，不当作统计证明。
6. 技术验收与体验验收分别记录；明确尚未验证的项目，不因脚本能通关就宣布好玩。

对于没有竞争或重玩目标的探索、叙事游戏，应观察好奇、理解、情绪和完成体验，而非强行套用输赢、上瘾或重开指标。柳州当前“先做地图、不增加剧情任务”的范围也不应因引入技能而改变。
