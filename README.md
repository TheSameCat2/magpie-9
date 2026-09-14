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

The game opens on a menu: **NEW GAME**, **TUTORIAL**, **SCORES**, **HELP**, **CREDITS**.
Click / tap an entry, or use ↑ ↓ (W S) and Enter / Space. NEW GAME and TUTORIAL
drop you into a held run — jump to begin. Esc (or a tap) backs out of Help,
Credits, and Scores; after a crash, a tap returns to the menu.

## Pause

PAUSE (top left, under the gate counter), P, or Esc holds a live run. Flaps
and taps do nothing while the pause menu is up; CONTINUE (or P / Esc again)
resumes with a courtesy jump. Held time never counts toward a Challenge
extract: the clock stops for the pause menu, the JUMP TO BEGIN wait, a
backgrounded tab, and the rotate overlay. Spare rewinds still cost the clock.

## Scores

A global top 10, arcade-style: no accounts. Crash with a run that beats the
tenth place and type three initials (`A–Z`, `0–9`). Tutorial runs never go on
the board. Your personal best still lives in the browser (`BEST` in the HUD).

The board is stored in Upstash Redis and served by `/api/scores`. Locally:

```bash
vercel env pull .env.local
npm run dev:full
```

`npm run dev` is Vite only — the board API is missing unless you use `vercel dev`.

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
tap to continue, then jump to resume. MENU (bottom right) or Esc leaves the
tutorial at any time.

## Touch

Landscape only. Portrait shows a rotate overlay and pauses the run.

- Left half: drag a floating stick to strafe
- Right half: tap to flap, begin, or reset
- Menu / reboot: FULL enters fullscreen (Android / desktop; remembered across reloads until you exit). MUTE toggles audio. HELP opens the field manual.
- Portrait: ENTER FULLSCREEN on the rotate overlay does the same (and locks landscape on Android). Browsers without the Fullscreen API get an add-to-Home-Screen hint instead.
- Backgrounding the tab auto-pauses. Jump to resume once you are back in landscape.
- PAUSE (top left) holds the run; tap CONTINUE to carry on. A stray flap will not resume it.

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
