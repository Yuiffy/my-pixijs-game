# Demos Dates

Dates in `src/components/gameLibrary/catalog.ts` are curated calendar dates from published
repository history, not file modification times or deployment timestamps.
The initial dates are historical approximations: first playable publication
commits where available, or the first confirmed catalog entry. Do not interpret
the date a placeholder route was created as a launch date.

| Game | Release evidence | Latest update evidence |
| --- | --- | --- |
| Sui Fitness / 今天也要动 | 2026-10-03, first locally verified five-day survival campaign and catalog entry; deployment pending | 2026-10-03, same implementation |
| Beach Volley / 晴海双打 | 2026-10-02, first locally playable implementation and catalog entry; deployment pending | 2026-10-03, independent input holds, native keyboard activation and complete 2P touch actions; deployment pending |
| Golden Needle / 不许手抖 | 2026-10-02, first locally verified playable implementation and catalog entry; deployment pending | 2026-10-03, complete keyboard targeting and hold controls; deployment pending |
| Autochess | 2026-01-10, first confirmed demos entry (`841ebb3`); earlier route was a placeholder | `AUTOCHESS_RELEASE_DATE` in the game's version file |
| Night Rain | 2026-09-26 (`78037fb`) | 2026-09-26 (`9fde57e`) |
| One More | 2026-09-06 (`07a82f4`) | 2026-10-03, independent key/touch holds, keyboard combat buttons and native menu activation; deployment pending |
| Hush Live | 2026-09-22 (`377b186`) | 2026-09-26 (`8ff8fbb`) |
| RESET / 开蹬！ | 2026-09-26 (`78bde60`), first playable version included in this publication | 2026-10-03, damaged-save protection, previous-position recovery and retryable storage failures; deployment pending |
| Hype Harbor | 2026-09-26, initial playable release in this commit | 2026-10-03, owned preparation gestures and cancellation on focus/lifecycle changes; deployment pending |
| Streamer | 2026-09-12 (`845028c`) | 2026-09-12 (`845028c`) |
| Pre-stream | 2026-09-12 (`845028c`) | 2026-10-03, independent input holds, cancellation-safe scoops and landscape controls; deployment pending |
| Snack | 2026-09-11 (`2ac9261`) | 2026-10-03, focused keyboard controls, independent input holds and optional tap-to-toggle; deployment pending |
| Pinglu Canal / 平陆运河 | 2026-09-27, terrain engineering catalog release | 2026-10-03, validated save recovery, previous-state backup and unreadable-data preservation; deployment pending |
| AGI | 2026-09-11 (`2ac9261`) | 2026-10-03, quarterly income adjustments, itemized upkeep, refund risk and cash preview; deployment pending |
| Fab | 2026-09-11 (`2ac9261`) | 2026-10-03, public cash bounds, sales scenarios and reconciled quarterly ledgers; deployment pending |
| RPG | 2026-09-12 (`845028c`) | 2026-09-21 (`60ed332`) |
| Family Pressure | 2026-09-20 (`3f08d69`) | 2026-09-26 (`66d760d`) |
| Wuxia | 2025-11-29 (`8dfbe6c`, playable same day in `0094ec7`) | 2026-09-06 (`27f1e70`) |
| Button | 2026-09-08 (`d86429b`) | 2026-09-16 (`e1bcc74`) |
| Brick Excavation | 2026-09-26 (`fd171c0`) | 2026-10-03, automatic session/undo restoration and storage failure recovery; deployment pending |
| Flick Chess | 2026-09-26 (`fd171c0`) | 2026-10-03, pause/resume, lifecycle and reset protection; deployment pending |
| Jump One | 2025-11-27 (`11fc6d4`) | 2026-10-03, independent button keys, mixed input cancellation and pause/resume held-key protection; deployment pending |

Knight is hosted independently. `2026-07-18` (`fab90f7`) is only the date
it entered this site's catalog, so the UI labels it as site inclusion. Its
update date is unknown and must not be inferred from catalog changes.

When publishing a gameplay, content, or game UI change, update that game's
`updateDate` in the same release. Keep `releaseDate` stable. Catalog copy,
statistics, and layout changes do not count as game updates. If authoritative
release records become available, prefer them to these historical estimates.
