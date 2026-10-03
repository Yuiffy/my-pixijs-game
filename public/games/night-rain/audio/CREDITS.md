# 雨夜寻味 · 音乐与声音

下列三首音乐由作者以 CC0 1.0 发布，可用于本游戏并重新编码。原始授权页面于 2026-10-03 核对。

| 用途 | 曲名 / 作者 | 原始页面 |
| --- | --- | --- |
| 探索 | Cathedral in the forest (ambient loop) / congusbongus | https://opengameart.org/content/cathedral-in-the-forest-ambient-loop |
| 归灯庭与剧情 | First Light Particles / Yoiyami | https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track |
| 首领战 | Ghosts & Heroes — 2025 loop / Bobjt | https://opengameart.org/content/ghosts-heroes |

音乐转换为 112 kbps MP3，以 HTMLAudioElement 流式播放；不在拾取或语音时同步解码整首音乐。

动作音效由游戏的 Web Audio 振荡器与音量包络实时合成，无第三方音效采样。旁白使用 Microsoft Huihui Desktop 的离线 SAPI 输出为 WAV，再压缩为单声道 MP3；生成脚本只写文件，从不向扬声器输出声音。运行游戏不调用系统 speechSynthesis。

旁白文本与角色台词由本项目撰写。所有字幕保留；旁白文件加载失败时自动使用字幕。
