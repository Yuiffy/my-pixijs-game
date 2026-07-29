# Autochess module split

## Goals

- Keep deterministic simulation state outside Phaser.
- Keep `AutoChessEngine` as the public command facade.
- Make authored content, run progression, battle simulation, renderer state, and
  DOM UI independently maintainable.
- Preserve the current public import paths during migration.
- Replace source-text and private-method test coupling with behavior-level test
  helpers before removing compatibility shims.

## Implemented layout

```text
src/components/autoChessGame/
  core/
    gameData.ts                 # compatibility barrel
    data/
      types.ts
      traits.ts
      units.ts
      talents.ts
      waves.ts
      shop.ts
    gameEngine.ts               # compatibility barrel
    engine/
      AutoChessEngine.ts        # public facade and orchestration
      state.ts
      random.ts
      runRules.ts
      roster.ts
      progression.ts
      textState.ts
      projectiles.ts
      combatSetup.ts
      combatResolution.ts
      abilities/
        AbilitySystem.ts
  phaser/
    RiftLineScene.ts            # scene lifecycle coordinator
    battle/
      FighterView.ts
      ProjectileView.ts
      EffectView.ts
      SummonView.ts
  hud/
    shared.tsx
    BattleTraits.tsx
    EnemyFormationOverlay.tsx
    Shop.tsx
    MobileSheets.tsx
```

The Wuxia game follows the same ownership rule:

```text
src/components/wuxia/
  game/
    useWuxiaGame.ts
    world.ts
    turn.ts
    applySnippetResult.ts
  logic/
    world.ts
    sect.ts
    companions.ts
    battleChoices.ts
```

The unused Canvas renderer was removed rather than retained as an untested
fallback. Phaser is the only runtime renderer.

## Result

| Previous owner       | Before |                After | Extracted responsibility                                                    |
| -------------------- | -----: | -------------------: | --------------------------------------------------------------------------- |
| `gameEngine.ts`      |  6,226 | compatibility barrel | public import stability                                                     |
| `AutoChessEngine.ts` |  6,226 |          about 3,100 | data, state, roster, progression, setup, resolution, abilities, projectiles |
| `gameData.ts`        |  1,909 | compatibility barrel | authored data grouped by domain                                             |
| `RiftLineScene.ts`   |  3,424 |          about 2,000 | fighter, projectile, effect, and summon renderers; dead UI removed          |
| `RiftHud.tsx`        |    843 |            about 230 | phase routing and composition                                               |
| `WuxiaGame.tsx`      |    653 |            about 140 | presentation only                                                           |
| `useWuxiaGame.ts`    |    563 |            about 190 | React state and timer orchestration                                         |

Line counts are a diagnostic, not a target. The remaining large files retain
responsibilities that currently share substantial state:

- `AutoChessEngine.ts` keeps movement, targeting, ability motion, and battle
  tick ordering together. Splitting those now would require a broad callback
  host that exposes most engine internals, which moves coupling rather than
  removing it. Extract them when movement state is first represented by an
  explicit `BattleContext`.
- `AbilitySystem.ts` keeps the unit handler switch isolated behind a typed host.
  Split it into registries only when two or more handlers share a reusable
  mechanism or when unit abilities gain focused behavior tests independent of
  engine source text.
- `RiftLineScene.ts` keeps preparation input, result scrolling, and tooltips
  because all three currently coordinate scene layers and Phaser pointers.
  Extract a controller when those interactions move behind explicit
  `SceneInputState` and `OverlayHost` contracts.

## Dependency rules

1. `core/data` cannot import React, Phaser, canvas, or DOM modules.
2. `core/battle` may import data, geometry, and state types only.
3. `AutoChessEngine` owns RNG and `GameState`; systems receive explicit context.
4. Phaser reads engine state and dispatches `GameAction`; it never owns rules.
5. DOM HUD reads engine state and dispatches the same `GameAction`.
6. Renderer modules may be disposable without changing simulation state.
7. Compatibility barrels must not contain new gameplay logic.

## Migration order

1. Split authored data and retain `gameData.ts` as a barrel.
2. Extract random/state, roster/progression, battle creation, and text state.
3. Isolate the ability switch behind a typed host.
4. Extract projectiles, battle setup, and damage/resolution systems.
5. Split Phaser entity rendering; remove unreachable legacy views.
6. Split HUD components and CSS by domain.
7. Remove the unreferenced Canvas fallback and its source-only tests.
8. Split Wuxia simulation from React and divide generic utilities by domain.

## Verification gates

Every migration stage must pass:

- `pnpm exec tsc --noEmit --incremental false`
- `pnpm autochess:test`
- focused ESLint for touched source files
- `git diff --check`

The final state must also pass:

- `pnpm build`
- repository-local system Chrome verification via `verify-autochess.cjs`
- screenshot validity checks, text-state cross-check, DOM/canvas dimensions, and
  console/page error inspection
