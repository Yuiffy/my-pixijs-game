# 直播记录内容

首页直播回顾、主播记录页的列表和日历详情共用展示组件。
正文依次显示直播梗概、晚安回复、Highlight；空章节省略。
`generatedAt`、模型、生成尝试等 front matter 放在最后的“生成信息”折叠区。
旧 Markdown 仍可直接显示，梗概、回复和时间轴按语义分段，Markdown 内的代码块不被误拆。
历史拼接进去的漫画生成 JSON 也收进底部资料，后续同步不再把漫画脚本当直播正文。

## 结构化梗概与链接

`streams.json` 的可选 `recap` 字段只包含展示数据：`overview`、`songs`、
`games`、`watch`、`other`、梗概更新时间，以及有依据的 BV、分 P、链接和投稿标题。
不会公开本地路径、转录证据、计划签名或上传凭据。
仅展示有数据的分类。旧格式只有歌曲、游戏和话题时，从明确的“观看《作品》”描述补出同步视听。

岁己歌曲名链接到 `/liver/sui/songs?q=歌名`；未知歌名以直播时间查询。
有 `SONGS.json` 时优先用对应录播的活动记录和已有字幕校正，避免旧梗概猜错歌名。
空歌名再使用与歌单共用的已审核投稿名称解析，上传尚未完成也可显示名称，
但不提前显示 BV 链接；不会按梗概歌曲数组的位置强行匹配活动。
其他主播的歌曲仍展示文字，等对应歌切页面存在后再加入口。

`src/data/stream-recaps/sui.json` 保存当前已有的 43 场结构化梗概，
其中 14 场带 28 个游戏投稿链接，另有已完成的歌曲和同步视听投稿。
在远端索引还没有 `recap` 字段时使用已保存梗概；新远端数据自动替代旧梗概，
比保存版本更早的梗概不覆盖新内容。页面旧 Markdown 的晚安回复和 Highlight 仍正常加载。

歌曲和同步视听使用当前 `stream_activity_clips/录播/PLAN.json` 的上传清单。
游戏使用 `stream_game_clips/录播/PLAN.json` 及 `stream_game_submission` 元数据。
BV 必须来自清单所在目录 `upload_state.json` 的 `done[reviewIndex]`。
同时核对计划版本、源录播、活动边界与输出分 P；游戏还核对渲染版本及拆分活动的
`sourceWindow`。已排队但未完成的投稿不显示链接，分成多个稿件的游戏保留全部已完成链接。
迁移到其他盘符的历史录播按同一录播目录重新定位文件，不递归扫描临时或旧版本目录。

## 同步与验证

普通 `sync_streams.mjs` 在保存索引前扫描全部梗概和当前活动／游戏计划，
历史直播后补梗概或投稿也会更新，不受素材的增量刷新窗口限制。
`PLAN.summary.path` 指向的复核梗概优先于日期目录的旧 `LIVE_CONTENT.json`。
复核梗概可位于录播目录之外，但必须提供 PLAN.summary.sha256 且文件内容校验一致。
无校验值、内容不符或 JSON 损坏均拒绝覆盖索引；文件已清理时保留原有日期目录梗概回退。
重复数据取最新梗概，同一日期同一录播的计划取最新版本；无可读来源的已有记录保留。

- `pnpm streams:recaps`：只为现有岁己索引补梗概，不重新复制图片或字幕。
- `pnpm streams:recaps --liver shiori`：补指定主播索引。
- `pnpm streams:recaps --output tmp/stream-recaps/streams.json`：生成独立预览数据。
- `pnpm streams:recaps --snapshot`：更新随前端保存的梗概，不改外部索引仓库。
- `pnpm streams:recaps:test`：验证旧格式、分类、上传身份、拆分游戏、迁移路径和坏 JSON 保护。
- `pnpm exec next dev -p 3962` 后运行 `pnpm streams:recaps:verify`；可用 `RECAPS_URL` 指定已启动服务器。

浏览器使用静音系统 Chrome，读取真实本地索引、梗概、晚安回复、图片和上传结果。
检查列表、日历详情、移动端滚动、歌曲及 BV 链接、底部元信息、旧数据和加载失败。
截图做像素检查并保存到 `tmp/stream-recaps-qa`，用于验证后仍需逐张打开检查。
本地同步修改索引仓库；发布沿用现有 `streams:publish` 流程。
