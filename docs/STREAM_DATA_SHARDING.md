# Stream data sharding

The web application stays in this repository. Generated stream data is stored in public
repositories under `VirtualBeing-Hub` and exposed through the existing
`/data/streams/...` URLs using Next.js rewrites.

## Local layout

Set `STREAM_REPOS_ROOT` to a directory containing these Git checkouts:

- `liver-streams-index`
- `liver-streams-2025`
- `liver-streams-2026-a`
- `liver-streams-2026-b`
- `liver-streams-2026-c`

If the variable is omitted, the default is the `VirtualBeing-Hub` directory next to this
repository. `STREAM_SYNC_STATE_DIR` optionally changes the transaction journal location;
the default is `logs/state`.

## Daily publication

`node scripts/sync-and-push.mjs` performs one publication. It validates clean checkouts,
copies new source files into their configured shard, pushes all changed asset repositories,
verifies their remote branch SHAs, and only then publishes `streams.json` in the index
repository. An interrupted transaction resumes from `logs/state/stream-sync-transaction.json`.

PM2 runs `scripts/sync-cron-runner.mjs` as a long-lived process and restarts it daily at
04:00 through `cron_restart`. Manual and scheduled runs share a cross-process lock.

## Adding a liver or year

Add the liver to `src/data/livers/liverConfigs.json`, then run:

```text
node scripts/assign-stream-shard.mjs --liver <id> --year <yyyy>
node scripts/assign-stream-shard.mjs --liver <id> --year <yyyy> --write
```

The first command is a dry run. The second persists the capacity-aware rendezvous
recommendation. Existing assignments are never recalculated automatically.

## Migration safety gate

Do not remove `public/data/streams`, change the production build command, or rewrite Git
history until all of the following are complete:

1. The frozen source commit, complete SHA-256 manifest, and partitioned snapshot exist
   outside this checkout. This migration intentionally preserves the latest data snapshot,
   not the main repository's old binary Git history.
2. The source manifest matches fresh clones of all five remote repositories.
3. Every index reference and anonymous GitHub Raw URL passes verification.
4. A Vercel Preview uses the remote rewrites successfully for a full sync cycle.
5. The migration report has zero failures and has been approved manually.
