# MAGPIE-9 — implementation plan

3D Flappy homage: mechanical magpie in a cyberpunk service conduit.
Do not ship the name “Flappy Bird,” pipes, or the original bird sprite.

## Rails (do not leave)

1. Vanilla Three.js. No React/Vue. No Cannon/Rapier/Ammo. Sphere vs box/plane only.
2. Bird is fixed in Z relative to the camera. The world scrolls toward the camera.
3. One play loop: Menu → Playing → (Respawn → Playing) → Dead → Menu. Help and Credits are static screens off the menu. Tutorial is the same loop with `mode = 'tutorial'` rules (see `src/tutorial.js`). Pause is optional.
4. Procedural geometry only in v1. No GLTF, no texture CDNs. CanvasTexture / data-URI if needed.
5. No story, shop, or multiplayer. Two orbs: gold damper and green spare-life (`+`, one per 10-gate sector). A spare life rewinds to just inside the last passed gate and waits for a tap.
6. Gameplay before bloom. Silhouette, fog, lights first.
7. Original art: conduit / magpie drone.
8. Keyboard and touch are first-class. Mouse click flaps. Touch: left-half stick, right-half flap.
9. 60 fps budget. Pool meshes. No per-frame allocs in the hot path.

## Stack

```
~/Projects/magpie-9/
  package.json          # three pinned, vite
  index.html
  src/
    main.js             # renderer, resize, rAF
    theme.js            # palette, fog, materials
    input.js            # keys + zoned pointers; analog stick; edge flap
    bird.js             # mesh, flap impulse, strafe, bank/pitch
    tunnel.js           # pooled hexagonal segments + scroll
    obstacles.js        # pooled hazard types + spawn
    powerups.js         # pooled damper + life orbs
    collision.js        # sphere vs tunnel + descriptors + orbs
    game.js             # state machine, score, difficulty, restart
    hud.js              # DOM overlay
    audio.js            # optional WebAudio beeps
```

Pin exact `three` version. `WebGLRenderer`, `SRGBColorSpace`, `ACESFilmicToneMapping`, pixel ratio capped at 2.

## Coordinates (source of truth)

| Axis | Meaning |
|------|---------|
| +X   | right (D / →) |
| +Y   | up (flap) |
| +Z   | toward camera |

- Bird rest: `(0, 0, 0)`
- Camera: `(0, 0.6, 9)` looking at `(0, 0.15, 0)`, lerp to bird X/Y
- World objects spawn at negative Z, increase Z each frame
- Recycle when `z > camera.z + 2`
- Tunnel inner apothem **R = 4.2**
- Bird faces **−Z** (into the tunnel)

## Feel

**Vertical:** gravity `−28` u/s²; flap sets `vy = +9.5` (impulse, not hold-to-hover); `vy` clamp `[−16, +11]`. Edge trigger only.

**Horizontal:** accel `55`, max `|vx| = 7`, damping `~10/s` on release. Clamp to playable hex. Bank `z-rot ∝ −vx`, pitch `x-rot ∝ vy`.

**Forward:** base scroll `12` u/s; after each gate `speed *= 1.03`, cap `22`. Bird does not move in Z.

**Fail:** sphere vs tunnel wall or obstacle. With lives > 1, consume one spare, rewind the world to just inside the last passed gate (never forward), recenter the bird, and wait for a tap. Last life: freeze scroll, tumble, “REBOOT”, Space/click returns to title (consume that edge so it does not also arm).

**Score:** +1 when obstacle Z passes the bird (once). Best: `localStorage['magpie9.best']`.

**Start:** MENU, gravity off. NEW GAME (or TUTORIAL) arms PLAYING.

**Tutorial:** fixed speed 9 (dampers trim 0.5 each, floor 7), spacing 34, offset 0, hazards in a fixed order, an orb after every gate alternating damper / life, no gate counter, no best, no sectors. First pickup of each orb type pauses under an explainer card until tapped.

## Tunnel

Hexagonal conduit, 6 plates + emissive rib. Segment length `10`, pool **8**. FogExp2. Recycle by subtracting pool length; optional detail roll on recycle.

## Obstacles (v1: three types)

| Id | What | Hole |
|----|------|------|
| `bulkhead` | Hex plate, rectangular hatch offset in X/Y | 2.4 × 2.0 |
| `laser-bar` | Horizontal energy slab, open band | band height 2.2, random Y |
| `pylon` | Left **or** right blocked | forces strafe |

First gate `z = −40`. Spacing `28` shrinking toward `20`, never below `18`. Mostly bulkhead; laser-bar after score 3; pylon after score 5. Hatch offset grows with score, hole stays inside ~70% of R.

Store collider descriptors (not `Box3` of a meshed hole).

## Bird

Low-poly magpie drone: hull, head, beak, two wing planes, eye point-lights. Graphite + white belly + magenta leading edge. Collider sphere `r = 0.42`. `KeyB` toggles wireframe sphere.

## Theme

void `#07080c` · metal `#161a22` · metal-hi `#2a3140` · sodium `#e8a030` · gold `#ffd166` · mag `#ff2a6d` · ice `#3de0ff` · ink `#dce8f0`

Type: condensed techno sans, two weights max. Not Inter.

HUD: DOM overlay. Score top-left, best top-right, center prompts. No glass cards.

Bloom optional: UnrealBloomPass threshold ≥ 0.8, strength ≤ 0.4. Drop if it costs frames. Honor `prefers-reduced-motion` for bloom/shake only.

## Input

Space / click / tap / W / ↑ = flap (edge). A/← left. D/→ right. R or Space on dead = restart. M mute. B collider debug.

Touch (coarse pointer, landscape): left-half drag is a floating analog stick (`strafe` in [-1, 1]); right-half tap flaps. Portrait on a phone shows a rotate overlay and pauses play. Fullscreen is opt-in. Visibility hidden auto-pauses.

## Powerups

Two orb types, pool of 6, recycle at `z > 14`. Both sit midway to the next gate at a random X/Y in a disc of radius 2.2.

- **Damper** (gold chevron): 50% chance per spawned gate that is not the sector's life slot (`ORB_CHANCE = 0.5`). Pickup is permanent for the run: subtract half of `stageDelta(score)` from scroll speed, floored at base 12.
- **Spare life** (green `+`): exactly one per 10-gate sector, at a random gate in that sector. Pickup adds one life. A hit with lives > 1 consumes a spare, rewinds to just inside the last passed gate, and waits for tap-to-resume.

## Difficulty

One function `difficulty(score) → { speed, spacing, offset }`. Do not scatter tuning. `stageDelta(score)` is the speed added by that gate.

## Implementation order

1. Vite scaffold, black scene, resize, rAF
2. Hex tunnel pool + scroll + fog + camera
3. Bird + flap/gravity/strafe — empty tunnel
4. Wall collision + death/restart
5. bulkhead spawn, score-on-pass, collision
6. **Playable loop gate.** Tune until 5 is possible and 20 takes attention
7. laser-bar + pylon
8. Theme pass: materials, HUD, crash juice
9. Bloom if fps allows; audio if time
10. Verify: no console errors, restart, best persists, reduced-motion

## Acceptance

- First flap starts the run
- Idle falls, tap rises, A/D moves, walls and gates kill
- At least two visually distinct hazards in a real run
- Score once per gate; best survives refresh
- Pools recycle; no leak on a 2-minute title idle
- Lit hexagonal conduit, not a default Three.js demo
- ~60 fps at 1920×1080 on this machine

## Non-goals (v2+)

Rotating fan OBB, branching tunnels, shader rain, soundtrack, WebXR, mid-run palette districts.

## Risks

- Strafe without pylons is fake difficulty
- Bloom hides unfair collision — keep `B` debug until deaths feel fair
- Hold-to-flap makes it not Flappy — edge-trigger in `input.js`
- Z-fight: inset ribs
- EffectComposer must resize
