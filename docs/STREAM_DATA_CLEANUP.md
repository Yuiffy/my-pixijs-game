# Stream data current-tree cleanup record

This record covers removal of `public/data/streams` from the current Git tree and the subsequent
authorized history rewrite. It records the recovery points required before replacing remote refs.

## Authorization and scope

- Cleanup authorized by the repository owner on 2026-07-17.
- Production merge and `git-filter-repo` history rewriting were explicitly authorized later on the
  same date.
- Cleanup branch: `codex/remove-stream-data`.
- Base commit: `aec40b52c5165502e05449524baeae1d401c57c0`.
- Removed from the current tree: 15,384 files, 13,727,370,031 bytes.
- `/public/data/streams/` is ignored so the generated data cannot be recommitted accidentally.
- The Vercel build now runs the normal `pnpm run build`; the former deploy-time pruning script was
  removed.

## Pre-cleanup verification

Immediately before deletion, all five remote repositories were public, used `main`, rejected force
push and default-branch deletion, and matched these accepted commits:

| Repository | Commit |
|---|---|
| `VirtualBeing-Hub/liver-streams-index` | `f1c94f1f4739bac6304e0918cadc37c350162495` |
| `VirtualBeing-Hub/liver-streams-2025` | `dc5995e59243033d92836f736c86cb501f741da7` |
| `VirtualBeing-Hub/liver-streams-2026-a` | `21d3089bce029bc0e343fdd1a95952ab656b7c1e` |
| `VirtualBeing-Hub/liver-streams-2026-b` | `d6e1fc531337025a6fe70670cd75caf94a064922` |
| `VirtualBeing-Hub/liver-streams-2026-c` | `a68e1647ce427dccdcd29ec1d78e981938baeb5b` |

A fresh-clone verification recalculated SHA-256 for all 15,384 files and 13,727,370,031 bytes with
zero failures. `git fsck --full --strict` passed in all five clones. All 15,036 index references also
resolved against the shard checkouts with zero failures.

## Post-freeze delta recovery

Merging the sharding branch exposed a later `master` sync commit that was not part of the frozen
snapshot. Cleanup stopped until all 133 changed paths (107,222,089 bytes, including 14 updated index
files) were migrated. Assets were pushed and remotely confirmed before the index was published.

| Repository | Post-delta commit |
|---|---|
| `VirtualBeing-Hub/liver-streams-index` | `40bcede5bda0add150c5ad540ae54bee588a034b` |
| `VirtualBeing-Hub/liver-streams-2025` | `dc5995e59243033d92836f736c86cb501f741da7` |
| `VirtualBeing-Hub/liver-streams-2026-a` | `7bd6ad9d64f869b3146b2d1ecd60266f0c32b742` |
| `VirtualBeing-Hub/liver-streams-2026-b` | `1f4b53dd56516978d828d9b4725295f54797611c` |
| `VirtualBeing-Hub/liver-streams-2026-c` | `ec3a1fa2347212e7788f612f6eb770d65b20e2b7` |

The resulting repositories contain 15,503 stream files and 13,832,432,094 bytes. All 133 delta Raw
URLs succeeded; 102 content checks matched SHA-256, with three transient retries and zero failures.
The updated indexes contain 3,356 streams and 15,155 references with zero missing targets.

## Post-cleanup validation

- `npm run streams:test`: 5/5 passed.
- `npm run streams:verify`: 3,337 streams and 15,036 references, with zero failures.
- `npm run lint` and `npm run build`: passed (existing lint warnings remain).
- The built production server returned HTTP 200 for `/`, `/liver`, and all 19 configured
  `/liver/{id}` pages with `public/data/streams` absent from the worktree.
- The production server's rewrites returned the accepted byte length and SHA-256 for both
  `/data/streams/azi/streams.json` and
  `/data/streams/azi/2026_06_01_21_43_33/highlights.md`.
- The active Vercel project produced a Ready protected Preview for this branch. A second stale
  Vercel project integration still reports a failed commit status and its deployment URL returns
  404 in the Vercel dashboard; this is an integration configuration issue, not the active build.

## Operational follow-up

The actual Windows collection host still needs to pull the merged scripts and start the documented
PM2 runner. That machine-only operation was not simulated on this workstation. Before rewriting
remote history, preserve a complete pre-filter mirror; after rewriting, old clones must be replaced
rather than merged back into the new history.
