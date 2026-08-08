# Autochess Character Sprite Style

This document defines the production style for dedicated autochess character art.
The sprites are read at roughly 48-64 px in combat, so silhouette and color blocks
take priority over illustration detail.

## Approved Anchors

- `public/images/autochess/portraits/nightin.png`: large visor, twin-tail silhouette,
  one oversized gameplay prop, broad mint/white/charcoal color blocks.
- `public/images/autochess/portraits/guangyi.png`: high ponytail silhouette, low action
  pose, broad ivory/black/cyan color blocks.

New full-body character sprites should use both anchors as the style reference.
Original liver/material art is an identity reference only.

## Shape Language

- Use a complete full-body silhouette with all hair, props, and feet visible.
- Keep the character below two heads tall. The head should occupy 68-72% of the
  total character height; compress the torso and limbs into short, chunky shapes.
- Default every new sprite to face screen-right. The face, torso, gaze, leading
  foot, and any aimed weapon or projectile should all read toward the right.
- Use compact limbs, chunky hands/feet, and one clear pose that reflects the unit's
  combat role.
- Prefer one oversized identity or ability prop. Remove secondary accessories that
  do not survive at 64 px.
- Use a thick near-black outer contour and thick internal lines. Avoid delicate
  strands, thin weapons, and isolated one-pixel details.

## Color And Detail

- Build the sprite from 5-7 major color regions with flat cel shading.
- Preserve the reference character's dominant hair color, eye color, outfit family,
  and one or two recognition anchors.
- Remove clothing text, logos, fine patterns, tiny jewelry, realistic fabric folds,
  and decorative particles.
- Do not add a circular frame, background scene, aura, cast shadow, or contact shadow.

## Output Contract

- Final asset: `512x512` RGBA PNG under
  `public/images/autochess/portraits/<unit-id>.png`.
- Keep transparent corners and even visual padding. The opaque subject should not
  touch the canvas edge.
- Validate a `64x64` preview before integration. The face, main hair shape, pose, and
  gameplay prop must remain distinguishable without zooming.
- Set the unit to `portraitStyle: "sprite"`; procedural bounce/sway provides walking
  motion, so no frame animation is required.

## Generation Prompt Core

Use the original character art as the identity reference and the approved anchors as
style references. Request a tiny autochess full-body game sprite facing screen-right,
a 68-72% head ratio, below-two-head-tall proportions, thick near-black outlines, flat
5-7-region cel colors, one oversized gameplay prop, complete feet/hair, and generous
padding. Explicitly forbid left-facing poses, text, logos, circular frames, scenery,
shadows, thin linework, realistic anatomy, and busy effects.
