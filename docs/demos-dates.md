# Demos Dates

Dates in `src/app/demos/page.tsx` are curated calendar dates from published
repository history, not file modification times or deployment timestamps.
The initial dates are historical approximations: first playable publication
commits where available, or the first confirmed catalog entry. Do not interpret
the date a placeholder route was created as a launch date.

| Game | Release evidence | Latest update evidence |
| --- | --- | --- |
| Autochess | 2026-01-10, first confirmed demos entry (`841ebb3`); earlier route was a placeholder | `AUTOCHESS_RELEASE_DATE` in the game's version file |
| Night Rain | 2026-09-26 (`78037fb`) | 2026-09-26 (`9fde57e`) |
| One More | 2026-09-06 (`07a82f4`) | 2026-09-07 (`1b06272`) |
| Hush Live | 2026-09-22 (`377b186`) | 2026-09-26 (`8ff8fbb`) |
| Streamer | 2026-09-12 (`845028c`) | 2026-09-12 (`845028c`) |
| Pre-stream | 2026-09-12 (`845028c`) | 2026-09-26 (`1a36e2c`) |
| Snack | 2026-09-11 (`2ac9261`) | 2026-09-12 (`23cbc3d`) |
| AGI | 2026-09-11 (`2ac9261`) | 2026-09-15 (`d3ee1ae`) |
| Fab | 2026-09-11 (`2ac9261`) | 2026-09-11 (`2ac9261`) |
| RPG | 2026-09-12 (`845028c`) | 2026-09-21 (`60ed332`) |
| Family Pressure | 2026-09-20 (`3f08d69`) | 2026-09-26 (`66d760d`) |
| Wuxia | 2025-11-29 (`8dfbe6c`, playable same day in `0094ec7`) | 2026-09-06 (`27f1e70`) |
| Button | 2026-09-08 (`d86429b`) | 2026-09-16 (`e1bcc74`) |
| Brick Excavation | 2026-09-26 (`fd171c0`) | 2026-09-26 (`1547503`) |
| Flick Chess | 2026-09-26 (`fd171c0`) | 2026-09-26 (`7d20705`) |
| Jump One | 2025-11-27 (`11fc6d4`) | 2026-07-21 (`7e6208e`) |

Knight is hosted independently. `2026-07-18` (`fab90f7`) is only the date
it entered this site's catalog, so the UI labels it as site inclusion. Its
update date is unknown and must not be inferred from catalog changes.

When publishing a gameplay, content, or game UI change, update that game's
`updateDate` in the same release. Keep `releaseDate` stable. Catalog copy,
statistics, and layout changes do not count as game updates. If authoritative
release records become available, prefer them to these historical estimates.
