# 栞栞语音纠正与跑步动作（2026-10-05）

用户否定了小分胜利「耶耶耶」、整场胜利「哈哈哈，耶」和第二段击球短音。三者实际都来自 2026-09-10《小栞来咯！！》约 01:26:11–01:26:16 的同一段笑声。自动字幕把其中一块标为 `[栞栞 0.78]`，附近还有其他说话人及 UNKNOWN；单凭此标签无法确认声音是谁。此前记录中「实际核对／本人声音」的表述对这三段不成立，已撤回。没有认定原声音属于哪位其他说话人。

## 新声音及来源

采用粉丝维护的 [海獭按钮](https://button.shiori.dev/) / [forsakenrei/shiori-button](https://github.com/forsakenrei/shiori-button)，固定到 `761b50adca9dfa7d611c448d278a4df61f2b42ff`。项目 README 明确面向栞栞Shiori，并链接她的 Bilibili 官方账号；目录将所选单独按钮归属于栞栞。身份依据是上游归属，ASR 只辅助核对内容，不能认证声纹。

| 游戏用途 | 新台词 | 上游音频 | 连续截取范围 |
| --- | --- | --- | --- |
| 第二种小分胜利 | 我是天才！ | `public/audio/獭笑我是天才.mp3` | 1.18–2.95 秒 |
| 第一种整场胜利 | 哈哈哈哈，我是天才！ | 同上 | 0–2.95 秒 |
| 第二种触球短音 | 哈！ | `public/audio/语气词哈.mp3` | 0–0.50 秒 |

候选还包括「可以可以」「凿」「通关啦」等；部分短片识别与目录标题不一致，未采用。所选笑声台词的 ASR 保留「哈哈／我是天…」，短音独立识别为「哈」，不再从笑声里裁一小段充当发力声。最终解码文本保留在来源记录中，未把「天台／天才」近音误识别藏掉。

三个 URL 改用 `audio-v4`，避免浏览器缓存旧声。使用高通 70 Hz、低通 10.5 kHz、-18 LUFS 目标响度、-3 dBTP 上限及 8 ms 边缘淡入淡出，24 kHz 单声道／64 kbps MP3；去掉上游较大的 XMP 元数据，不改音高、语速或音色。原「呀」和其他既有语音保留。

小分胜利有声视频原本也嵌入「耶耶耶」，因此另行换轨到 `dubbed-v8/shiori-pointWin-button.mp4` 和 `lite-v8/shiori-pointWin-button.mp4`。标准版直接复制原图像流，轻量版 640 px／24 fps，均保留 faststart。此前这里写的「整场有声视频使用未被否定的好耶」不准确：它实际仍嵌入被否定的 `audio-v3/shiori-victory-1.mp3`，上次仅替换外部胜利池，漏换了整场视频；10 月 6 日按用户反馈纠正，见下文。旧三个 MP3 和旧视频作为历史资源保留。

## 整场胜利漏换修复（2026-10-06）

新回归在修复前明确失败于 `dubbed-v6/shiori-victory-recording.mp4`：该片的换轨记录仍指向被否定的九月多人笑声，运行时嵌入对白又会抑制外部胜利语音，所以仅换 MP3 池无法替换用户听到的视频音轨。

整场胜利两段外部录音均改用同一海獭按钮固定版本中的明确台词：`我是天才01.mp3` 的 1.0–2.7 秒「我是天才！」，及 `我是天才06.mp3` 的 0–1.18 秒「我都说我是天才了！」。排除前后笑声，保留原音高／语速。第二段最终 ASR 将末字「了」识别成「的」，原样记录；ASR 只用于核对内容，身份依据仍是上游粉丝目录的归属。先前外部含笑版本作为 retired 历史保留；原「好耶」仅有 0.66 的说话人标签，亦保守排除，不再宣称身份已确认。

音频清单 v5 选择新的 `audio-v5/shiori-victory-{1,2}.mp3`；媒体清单 v9 选择 `dubbed-v9/shiori-victory-button.mp4`／`lite-v9/shiori-victory-button.mp4`，嵌入第一句「我是天才！」。清晰版的图像流与原片哈希相同，轻量版为 640 px／24 fps，复制同一 AAC 音轨避免二次语音压缩，均 faststart。两版音轨实解码与新 MP3 的相关性均 0.995101，实际 ASR 为「我是天才」，没有旧笑声或欢呼。新 URL 避免复用旧资源缓存；原料、GPL v3 许可证与来源说明保存在 `audio-v5`。

新增回归检查所有可选栞栞嵌入对白的 `voiceSrc`，同时排除全部 rejected／retired 外部音源，覆盖此前遗漏的整场片。修复后 74 项晴海回归通过；浏览器与最终门禁记录见本轮 `progress.md`。

GPL v3 的来源说明、原许可证和两个未修改 MP3 原料都放在 `public/games/beach-volley/audio-v4/`。来源 URL、版本、完整 SHA256、截取范围、最终解码响度／峰值／ASR 以及旧项的 rejected 状态见 [录音记录](beach-volley-recording-delivery.json) 和 [换轨记录](beach-volley-dubbing-delivery.json)。没有把历史来源替换成新来源后冒充先前已验证。

## 三角色跑步

用内置 ImageGen 与 sprite-pipeline 从实际在用的 idle 帧制作整条四帧跑步条带，增加伸腿、提膝、回腿、摆臂与头发变化。前两次输出的步态重复较多，弃用；最终带步态参考图的完整输出才进入游戏。它是四帧插画动作，有姿态近似和镜像转向的限制，未宣称达到骨骼动画精度。

所有帧使用角色内共同比例、透明通道和 `[192, 380]` 地面锚点。以连通域分出不等距帧，清掉孤立噪点，固定面部相对身体中心的位置，保留头顶及脚尖边距。最终资源：

- `public/games/beach-volley/run-v1/sui-run.webp`
- `public/games/beach-volley/run-v1/shiori-run.webp`
- `public/games/beach-volley/run-v1/nagisa-run.webp`

三条带合计 271,876 bytes，启动随角色静态图加载；无需加载移动视频。每个角色的完整最终提示词、seed／原始输出哈希、拆分框、共同比例与锚点记录在 [动作素材与提示词](beach-volley-run-assets.json)。原始生成图片保留本机，游戏消费的 WebP 全部保存到项目内。

步态每移动 176 个世界像素走完一周期；依据实际地面位移推进，减速到极小速度后停止。墙边无实际位移就不循环，空中／挥拍／飞扑使用各自的姿态，必杀锁定时清掉跑步混合。按真实移动方向镜像，转向经过原来的加减速后才换朝向；短暂混合站姿与跑姿，另加最高 2.5 像素的起伏和不超过 0.07 弧度的身体倾斜。

暂停、演出冻结时步态距离和混合量都不更新，重新发球重置。减少动态效果仍保留必要腿部动作，关闭新增起伏与倾斜。只改变显示用状态；角色速度、跳跃、球路、接球范围和完整防守反应时间保持既有规则。

## 验收与复跑

运行 `pnpm beach:test`，专项包含实际移动距离、双边／全角色四帧、墙边冻结、起停／转向、空中／飞扑／暂停以及被否定来源无法从外配或嵌入视频回流。修改的 TS 文件运行 ESLint；CJS／MJS 不属于当前 TSConfig 的 ESLint 项目范围，使用 `node --check` 检查语法，保留完整项目及 Next 构建 lint 门禁。

```powershell
$env:BEACH_VOLLEY_URL = 'http://127.0.0.1:4028/game/beach-volley'
node scripts/verify-beach-motion.cjs
# 生产版使用公开按键和 advanceTime；没有游戏状态修改钩子。
$env:BEACH_MOTION_PRODUCTION = '1'
node scripts/verify-beach-motion.cjs
```

可用 `BEACH_MOTION_OUTPUT` 指定证据目录，`BEACH_MOTION_SUITE=voices|embedded` 聚焦语音／嵌入视频。安装版 Chrome 全程使用 `--mute-audio`、禁用 speech API 及 TTS stub；正常游戏音频设置不受测试改动。截图以 full-page 路径采集并做像素 sanity，再核对公开状态、DOM、画布尺寸和页面／控制台错误。最终门禁及生产验收结果记录在本轮 `progress.md`；本机证据目录为 `tmp/beach-voice-motion/`。手机覆盖 320／390px Chrome 触控模拟。
