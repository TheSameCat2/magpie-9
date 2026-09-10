# MAGPIE-9

3D conduit runner. Flap to climb, idle to fall, A/D to strafe.

```bash
cd ~/Projects/magpie-9
npm install
npm run dev
```

Open the printed local URL. Space / click flaps. A D (or arrows) strafe.
M mutes, B shows the collider sphere.

## Rendering

Bloom + a screen-space finishing pass (vignette, grain, chromatic kick on gate
pass, glitch on death). Quality starts at the top rung and steps down
automatically if frames run long. Pin it with a query param:

| Param       | Effect                                              |
|-------------|-----------------------------------------------------|
| `?q=2`      | full DPR (max 2), bloom                              |
| `?q=1`      | DPR 1.25, bloom                                      |
| `?q=0`      | DPR 1, no bloom                                      |
| `?god=1`    | invulnerable (for tuning visuals)                   |
| `?debug=1`  | exposes `window.__magpie = { game, bird }`           |

`prefers-reduced-motion` disables bloom, shake, FOV punch, camera roll and the
screen-space pulses.

See `PLAN.md` for rails, feel numbers, and non-goals.
