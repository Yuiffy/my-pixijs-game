# Button Game

## Ownership

`/game/button` is a text-based gain/cost dilemma game inside the existing Next.js
site. It deliberately uses accessible React/DOM controls rather than Pixi or a
physics engine. Its entry lives in `/demos#games`.

Keep it in this repository for now: Next.js API routes and the existing Neon
connection already support persistent voting. A separate Vercel project does not
make percentages more accurate. Split deployment only when independent domains,
permissions, release schedules, or billing become a requirement. The isolated
content, UI, API and table names make a later extraction straightforward.

## Content

- `src/components/buttonGame/content.ts` owns themes, tags, perspectives and
  questions. The first edition has 32 VTuber questions and six everyday questions.
- A question is a benefit and an unavoidable cost, not two unrelated options.
- Two questions are explicitly labeled adaptations from the Sui/Mofu livestream
  on 2026-09-07: the retirement example around 01:43:27 and the fame/negative-essay
  example around 03:45:07. Times refer to the merged recording's subtitle timeline.
  These are edited scenarios, not verbatim quotes or certified speaker attribution.
- Other questions are original. Do not imply they were said or endorsed by either
  creator. No scraped third-party question bank is included.
- IDs are permanent. Increment `version` for substantive wording/condition changes
  so new answers cannot be pooled with votes on a different dilemma.
- New themes/tags must have actual questions; empty filter combinations are valid.
- Anonymous user submissions are not enabled. Any future submission pipeline needs
  moderation before questions become publicly playable.

## Vercel Setup

1. Use the existing Next.js Vercel deployment. Configure `DATABASE_URL` for Neon,
   as for the existing visits endpoint.
2. Run `scripts/sql/button-game.sql` once in that database's SQL console. The
   migration is a single atomic `DO` statement compatible with Vercel's Query
   panel. It is additive and repeatable; it does not touch visits or other games.
3. Set `BUTTON_GAME_VOTE_SECRET` to a stable random secret of at least 32 characters
   in the server environment. Generate it locally with
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Never prefix it with `NEXT_PUBLIC_` or commit it.
4. Redeploy, then test in two separate browser profiles: first answer gives one
   vote; the other profile's opposite answer yields 50/50. Repeating or refreshing
   in either profile must not increase the total.

Use separate Neon databases/branches for Preview and Production, and different
secrets, so preview playtests never modify live totals. Rotating the signing secret
resets anonymous identities and can permit repeat votes, so do not rotate casually.

No cloud deployment, database creation or production migration is performed merely
by building this page. The UI does not ship fake seed votes.

## Voting Contract

`POST /api/button-game` accepts JSON:

```json
{ "action": "status", "id": "vt-fame-and-essays", "version": 1 }
```

`action: "vote"` additionally requires `choice: "press"` or `"pass"` and the signed
cookie established by the status handshake. Every request must have the same
`Origin` as the endpoint. Responses use `private, no-store`; never cache this path
in a CDN. The API is deliberately POST-only to remain excluded from static exports.

- `global`: counts come from SQL; `choice` is the stored answer, or null. The UI
  reveals percentages only after the player answers.
- `local`: database configuration is absent; choice stays on the device and there
  are no community counts. Local answers are never automatically submitted later.
- Database or signing-configuration failures: explicit errors, no invented
  percentages or optimistic successful votes. An unavailable status read (server
  error, offline connection or timeout) leaves both choices playable in explicitly
  labeled local mode. These answers are not submitted automatically on recovery.
  Validation, identity and rate-limit errors are not downgraded to local mode.
  A failed vote still requires confirmation rather than pretending it succeeded.
  Retrying first reads the stored vote,
  handling the case where the response was lost after an insert committed.
- Uniqueness is enforced by `(question_id, question_version, voter_hash)` in
  PostgreSQL, not an in-memory counter. The first answer wins, including concurrent
  submissions with conflicting choices.
- Signed HttpOnly, SameSite cookies are scoped to the API, last 180 days, and are
  Secure over HTTPS. Raw addresses, nicknames and user agents are not stored.
- Rate limiting is shared through SQL: 120 requests/minute per Vercel ingress IP
  (keyed HMAC), or per anonymous identity outside Vercel. It is a small-site abuse
  brake, not bot-proof authentication. Shared-IP audiences may hit the limit.
- Counts represent anonymous browser choices, not verified unique people or a
  representative poll. Clearing cookies, using another browser, or deliberately
  creating identities can bypass the per-browser boundary. Higher-trust voting
  needs authentication or a challenge/WAF policy.
- Rate rows can be pruned periodically without affecting votes:
  `DELETE FROM button_game_rate_limits WHERE minute < EXTRACT(EPOCH FROM now()) / 60 - 1440;`

The optional ESA static export (`NEXT_PUBLIC_ESA_PAGES=1`) deliberately uses local
mode because static hosting cannot run the route. To offer live statistics on a
static mirror, first add a same-origin server proxy for this API and update the
client's static-mode policy. Do not expose database credentials in the browser or
point a credentialed cookie endpoint at an arbitrary cross-origin host.

## Verification

```text
pnpm button:test
pnpm exec eslint src/components/buttonGame src/lib/buttonGame src/app/game/button src/app/api/button-game
pnpm run check
pnpm run build
```

`button:test` executes the actual migration and SQL with in-process PostgreSQL
(PGlite), including duplicate/concurrent inserts, version isolation, request
validation, identity signing, rate limiting and the actual Next route.

With a local dev server (no `DATABASE_URL`) running, set `BUTTON_BASE_URL` and
`PLAYWRIGHT_MODULE` if Playwright is not resolvable locally, then run
`pnpm button:verify`. The browser suite uses installed Chrome and checks local
play, persisted history, filters, completion, keyboard/touch input, share links,
fullscreen, mobile layout, images, and unavailable storage. Its second phase
passes browser requests through the actual API route backed by isolated PGlite,
including two identities and a lost post-commit response. It never writes to Neon.
Screenshots and the report go in ignored `tmp/button-game-verify/`.

## Assets

`public/games/button/press.svg` is an original game-control illustration. The
source note reuses existing site portraits, `/images/livers/sui.png` and
`/images/livers/mofu.jpg`. No livestream frames, private media paths or external
question-bank assets are shipped. Button sound is a short synthesized tone,
disabled by default. Motion respects the reduced-motion preference.
