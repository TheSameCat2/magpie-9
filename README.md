# MAGPIE-9

3D conduit runner. Flap to climb, idle to fall, A/D to strafe.

```bash
cd ~/Projects/magpie-9
npm install
npm run dev
```

Open the printed local URL. Space / click flaps. A D (or arrows) strafe.
M mutes, B shows the collider sphere.

## Touch

Landscape only. Portrait shows a rotate overlay and pauses the run.

- Left half: drag a floating stick to strafe
- Right half: tap to flap, arm, or reset
- Title / reboot: FULL enters fullscreen (Android / desktop; remembered across reloads until you exit). MUTE toggles audio.
- Portrait: ENTER FULLSCREEN on the rotate overlay does the same (and locks landscape on Android). Browsers without the Fullscreen API get an add-to-Home-Screen hint instead.
- Backgrounding the tab auto-pauses. Tap to resume once you are back in landscape.

Installed Android PWAs open fullscreen and locked to landscape. iPhone Safari has no element fullscreen; add to Home Screen for a chrome-less page. A PNG `apple-touch-icon` is a follow-up.

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
| `?rotate=1` | force the portrait rotate overlay (HUD QA)           |

`prefers-reduced-motion` disables bloom, shake, FOV punch, camera roll and the
screen-space pulses.

See `PLAN.md` for rails, feel numbers, and non-goals.
