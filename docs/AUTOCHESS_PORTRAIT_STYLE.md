# Autochess Character Sprite Style

This document defines the production style for dedicated autochess character art.
The sprites are read at roughly 42-64 px across the shop and combat views, so
silhouette and color blocks take priority over illustration detail.

## In-game Character Styles

The settings panel exposes one global character-style choice. The same choice must
be used in the shop, formation, bench, battle, codex, enemy previews, and results so
that a unit never changes identity between surfaces.

- `minimal` / 极简 is the default and the production target for new artwork. Assets
  live under `public/images/autochess/portraits/minimal/`.
- `detail` / 细节 preserves the previous full-body dedicated sprite set. Its frozen
  snapshot lives under `public/images/autochess/portraits/detail/`.
- `classic` / 棋子 preserves the older mix of dedicated chess-piece art, liver art,
  and large-head material art. Dedicated historical assets live under
  `public/images/autochess/portraits/classic/`; liver and material paths are mapped
  centrally in `core/characterStyle.ts`.

The selection is persisted in `localStorage` under
`rift-line-character-style`. Missing or invalid values must resolve to `minimal`.
All portrait consumers must go through `resolveUnitPortrait()` rather than reading
`UNIT_DEFS[id].portrait` directly.

## Approved Anchors

- `public/images/autochess/portraits/clock-gunner.png`: oversized head, extremely
  simple humanoid geometry, thick contour, and separated black/lilac outfit blocks.
- `public/images/autochess/portraits/biscuit_sui.png`: identity reduced to one dominant
  body shape, four chunky limbs, and one oversized gameplay prop.
- `spark-mage.png`, `dawn_duelist.png`, and `grove_mender.png`: production examples
  for ranged caster, mobile melee, and heavy melee silhouettes at 42 px.

New full-body character sprites should use both anchors as the style reference.
Original liver/material art is an identity reference only.

## Shape Language

- Use a complete full-body silhouette with all hair, props, and feet visible.
- Keep the character below two heads tall. The head should occupy 80-83% of the
  total character height; compress the torso and limbs into short, chunky shapes.
- Default every new sprite to face screen-right. The face, torso, gaze, leading
  foot, and any aimed weapon or projectile should all read toward the right.
- Use compact limbs, chunky hands/feet, and one clear pose that reflects the unit's
  combat role.
- Prefer one oversized identity or ability prop. Remove secondary accessories that
  do not survive at 64 px.
- At 512 px, use a 36-44 px near-black outer contour and 24-32 px internal lines.
  The contour should remain 2-4 physical pixels thick at the 42 px target size.
  Avoid delicate strands, thin weapons, and isolated one-pixel details.

## Color And Detail

- Build the sprite from 3-5 major color regions with almost-flat fills. Avoid
  gradients, texture, specular highlights, and multi-step cel-shading bands.
- Preserve the reference character's dominant hair color, eye color, outfit family,
  and one or two recognition anchors.
- Separate adjacent dark outfit regions with visibly different value or hue and a
  light internal divider. Black outerwear, dark tights, and black shoes must not
  collapse into one silhouette at 42 px.
- Remove clothing text, logos, fine patterns, tiny jewelry, realistic fabric folds,
  and decorative particles.
- Do not add a circular frame, background scene, aura, cast shadow, or contact shadow.

## Stateful Equipment

- Do not bake an ability prop into the PNG when gameplay launches, removes, breaks,
  or transforms that prop. Keep one character sprite and render the prop as a
  separate game object using the same visual source in its resting and active states.
- Anchor resting equipment tightly to the character silhouette and animate it with
  the character's bounce and facing. Hide it while the matching active object exists,
  then restore it only after that object has completed its return or despawn.
- `clock_gunner` is the reference implementation: the character PNG contains no
  rabbit cannon, while two shared mechanical-rabbit visuals float above her head,
  launch during the skill, and reappear after returning.

## Output Contract

- Final asset: `512x512` RGBA PNG under
  `public/images/autochess/portraits/minimal/<unit-id>.png`. Keep the root portrait
  path only as the current detail source and compatibility reference.
- Keep transparent corners and 4-6% visual padding. The complete opaque subject's
  longest dimension should occupy roughly 90% of the canvas without touching an edge.
- Validate `42x42`, `56x56`, and `72x72` previews before integration. At 42 px,
  the face, main silhouette, pose, and single gameplay prop must remain
  distinguishable without zooming.
- Set the unit to `portraitStyle: "sprite"`; procedural bounce/sway provides walking
  motion, so no frame animation is required.

## Generation Prompt Core

Use the original character art as the identity reference and the approved anchors as
style references. Request a tiny autochess full-body game sprite facing screen-right,
an 80-83% head ratio, below-two-head-tall proportions, a 40-46 px near-black outer
contour, 24-32 px internal lines, 3-5 almost-flat color masses, one oversized gameplay
prop, complete feet/hair, 90% subject occupancy, and 4-6% padding. Explicitly
require readability at 42 px and forbid
left-facing poses, text, logos, circular frames, scenery, shadows, thin linework,
realistic anatomy, and busy effects.
