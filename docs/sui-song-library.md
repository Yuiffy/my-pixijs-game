# 岁己唱歌统计与歌切

页面：`/liver/sui/songs`。主播目录、岁己直播记录页均有入口。

支持歌名／直播标题／日期／BV 搜索、北京时间日期范围、完整／片段演唱、
上传状态和核验状态筛选，以及最近演唱、记录次数、歌曲名排序、分页。
相同歌名归组，展开后逐次展示北京时间、录播内起止点、时长和 B 站分 P 链接。
筛选写入 URL，复制地址或刷新可恢复。未知歌名按单次记录展示。

## 数据与统计口径

`scripts/sync-songs.mjs` 读取岁己配置目录下各日期的
`stream_activity_clips/<recording>/SONGS.json`，不扫描临时或旧版本目录。
sessionId 相同的副本按文件修改时间取最新，公开目录只输出展示字段，
不输出本地路径、转录、审核备注或上传凭据。

仅完整检查（coverage complete 且 planned/rendered）中 verificationStatus keep、
没有 media_verification_unconfirmed/source_transcript_timing_unreliable 的记录算已确认。
未知歌名可以计入已确认演唱，但不计入已确认歌曲。未完成检查和候选记录仍可查看。
上传通过不等于歌名、唱歌行为和边界核验通过。

上传链接从当前 PLAN 指向的 UPLOAD_MANIFEST 和同目录 upload_state.done 解析。
使用 manifest.reviewIndex 定位 BV，核对计划签名、源录播和活动起止点，
再按实际 output.parts 定位 P；不把记录中的 part 数字直接当已上传分 P，
不匹配历史修订、同步视听或仅排队的投稿。

## 同步

- `pnpm songs:sync`：仅生成索引仓库 `public/data/streams/sui/songs.json`。
- `pnpm songs:sync --snapshot`：更新本仓库 `src/data/songs/sui.json`，供首屏和网络失败回退。
- `pnpm songs:sync --output <path>`：写入指定目录，适合本地验证。
- 已集成到现有 `sync_streams.mjs` 岁己同步末尾，随 `streams:publish` 的现有索引发布事务更新。
  每次扫描所有唱歌记录，包含历史录播的补核验和补上传，不受直播增量窗口限制。
  数据无变化时保留时间戳，坏 JSON 或非法时间区间使同步失败且不覆盖原目录。

页面首屏使用随版本保存的数据，再直接读取已配置 GitHub 索引仓库的最新 songs.json，
兼容 Next 与 ESA 静态导出。网络失败／超时／格式错误明确标注回退，可手动重试。
本地运行同步并不发布；索引需由现有 streams:publish 流程推送后才会远程刷新。
统计显示数据更新时间与检查覆盖场次，不宣称覆盖全部历史直播。

## 验证

`pnpm songs:test` 检查统计边界、去重、历史上传分 P 和坏数据保护。
启动 `pnpm exec next dev -p 3957` 后运行 `pnpm songs:verify`。
浏览器验证使用静音系统 Chrome，包含真实快照、隔离测试数据、多次演唱、跨日时区、
搜索／筛选／排序／分页、URL 恢复、错误回退、刷新、空结果和移动端溢出检查。
截图位于 `tmp/songs-qa`，带 fixture 的截图仅为测试数据，不进入生产目录。

## 有依据的歌名校正

`src/data/songs/title-corrections.json` 保存人工对照字幕确认的歌名及字幕时间、原话。
同步时仅补空歌名，且 sessionId、activityId、起止秒数必须全部匹配；活动重新切分后需重新核对。
上游已有歌名优先，校正不会改变演唱类型、核验状态、边界或投稿映射。
若仍为空，梗概与歌单共用当前投稿元数据中的已审核歌名：要求审核通过、可上传，
自动审核还须通过标题检查；核对 sessionId、计划签名、源录播、活动 ID 和起止点，
显式分 P 歌名须与已有 titleEvidence 一致。不从带日期的投稿标题猜歌名。
歌名不依赖上传完成；BV 链接仍只从 upload_state.done 取得。
证据不进入公开歌单。2026-10-01《泡泡》仍待边界核验；10-02 两首使用本地后续核验结果。
页面拒绝比当前已保存歌单更旧的远端数据，避免缓存或索引同步延迟造成回退。
