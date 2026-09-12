# MAGPIE-9

3D conduit runner. Flap to climb, idle to fall, A/D to strafe.

```bash
cd ~/Projects/magpie-9
npm install
npm run dev
```

Open the printed local URL. Space / click flaps. A D (or arrows) strafe.
M mutes, B shows the collider sphere.

## Menu

The game opens on a menu: **NEW GAME**, **TUTORIAL**, **HELP**, **CREDITS**.
Click / tap an entry, or use ↑ ↓ (W S) and Enter / Space. Esc (or a tap) backs
out of Help and Credits; after a crash, a tap returns to the menu.

HELP (menu entry, the HELP button, or the H key on the menu / reboot screen)
opens the field manual: controls for your input method and what the two orbs
do. Esc, H, CLOSE or a tap on the backdrop closes it. Flaps are ignored while
it is open.

## Tutorial

A slower practice run (fixed 9 u/s, wider spacing, no ramp, no sectors). There
is no gate counter or best score. Hazards arrive centred and in a fixed order
(bulkhead ×3, laser-bar ×2, pylon ×2, repeat) and every gate drops an orb,
alternating damper and spare life, within half a unit of the conduit's centre. The first
damper and the first spare you collect pause the run under an explainer card;
tap to continue. MENU (bottom right) or Esc leaves the tutorial at any time.

## Touch

Landscape only. Portrait shows a rotate overlay and pauses the run.

- Left half: drag a floating stick to strafe
- Right half: tap to flap, arm, or reset
- Menu / reboot: FULL enters fullscreen (Android / desktop; remembered across reloads until you exit). MUTE toggles audio. HELP opens the field manual.
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
