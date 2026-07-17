# Stream data current-tree cleanup record

This record covers removal of `public/data/streams` from the current Git tree only. It does not
rewrite historical commits, modify `main`, or authorize a production merge.

## Authorization and scope

- Cleanup authorized by the repository owner on 2026-07-17.
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

## Remaining gates

Before merging this cleanup to production, run a real incremental publication cycle on the actual
Windows sync host, manually verify the login-protected cleanup Preview, and remove or disconnect the
stale duplicate Vercel project check. Historical rewriting remains a separate operation that requires
another explicit approval, a coordinated force-push, and notification to users of old clones.

The source files remain recoverable from the five data repositories and from the unmodified
`codex/stream-data-sharding`/`main` history until historical cleanup is separately performed.
