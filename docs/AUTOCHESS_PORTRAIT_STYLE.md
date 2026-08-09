# Autochess Character Sprite Style

This document defines the production style for dedicated autochess character art.
The sprites are read at roughly 42-64 px across the shop and combat views, so
silhouette and color blocks take priority over illustration detail.

## Approved Anchors

- `public/images/autochess/portraits/nightin.png`: large visor, twin-tail silhouette,
  one oversized gameplay prop, broad mint/white/charcoal color blocks.
- `public/images/autochess/portraits/guangyi.png`: high ponytail silhouette, low action
  pose, broad ivory/black/cyan color blocks.

New full-body character sprites should use both anchors as the style reference.
Original liver/material art is an identity reference only.

## Shape Language

- Use a complete full-body silhouette with all hair, props, and feet visible.
- Keep the character below two heads tall. The head should occupy 72-78% of the
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
  `public/images/autochess/portraits/<unit-id>.png`.
- Keep transparent corners and 4-6% visual padding. The complete opaque subject
  should occupy roughly 88-92% of the canvas height without touching an edge.
- Validate `42x42`, `56x56`, and `72x72` previews before integration. At 42 px,
  the face, main silhouette, pose, and single gameplay prop must remain
  distinguishable without zooming.
- Set the unit to `portraitStyle: "sprite"`; procedural bounce/sway provides walking
  motion, so no frame animation is required.

## Generation Prompt Core

Use the original character art as the identity reference and the approved anchors as
style references. Request a tiny autochess full-body game sprite facing screen-right,
a 72-82% head ratio, below-two-head-tall proportions, a 36-44 px near-black outer
contour, 24-32 px internal lines, 3-5 almost-flat color masses, one oversized gameplay
prop, complete feet/hair, 88-94% subject occupancy, and 3-6% padding. Explicitly
require readability at 42 px and forbid
left-facing poses, text, logos, circular frames, scenery, shadows, thin linework,
realistic anatomy, and busy effects.
