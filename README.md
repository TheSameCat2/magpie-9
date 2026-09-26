# MAGPIE-9

3D conduit runner. Flap to climb, idle to fall, A/D to strafe.

```bash
cd ~/Projects/magpie-9
npm install
npm run dev
```

Open the printed local URL. Space / click flaps. A D (or arrows) strafe.
M mutes, B shows the body hitbox.

## Menu

The game opens on a menu: **NEW GAME**, **CHALLENGE**, **TUTORIAL**, **SCORES**, **HELP**, **CREDITS**.
Click / tap an entry, or use ↑ ↓ (W S) and Enter / Space. The line under the
list describes the highlighted entry. NEW GAME, CHALLENGE, and TUTORIAL drop
you into a held run — jump to begin. Esc (or a tap) backs out of Help, Credits,
and Scores; after a crash, a tap returns to the menu once a short grace has
passed, so the flap that ended the run cannot dismiss the card.

## Pause

PAUSE (top left, under the gate counter), P, or Esc holds a live run. Flaps
and taps do nothing while the pause menu is up; CONTINUE (or P / Esc again)
starts a three-second countdown, and the run goes live without a jump so the
first flap after a pause is always your own. QUIT leaves the run for the menu.
Flaps during the countdown are ignored too; P / Esc cancels it back to the pause
menu, as does backgrounding the tab or rotating to portrait. Held time never
counts toward a Challenge extract: the clock stops for the pause menu, the
resume countdown, the JUMP TO BEGIN wait, a backgrounded tab, and the rotate
overlay. Spare rewinds still cost the clock.

## Scores

A global top 10, arcade-style: no accounts. Crash with a run that beats the
tenth place and type three initials (`A–Z`, `0–9`). ENTER files them; SKIP or
Esc leaves the run off the board. Tutorial runs never go on the board. Your
personal best still lives in the browser (`BEST` in the HUD). The screen says
when a board is still loading, empty, or unreachable.

The board is stored in Upstash Redis and served by `/api/scores`. Locally:

```bash
vercel env pull .env.local
npm run dev:full
```

`npm run dev` is Vite only — the board API is missing unless you use `vercel dev`.

HELP (menu entry, the HELP button, or the H key on the menu / reboot screen)
opens the field manual: controls for your input method and what the orbs
do. Esc, H, CLOSE or a tap on the backdrop closes it. Flaps are ignored while
it is open.

## Tutorial

A slower practice run (fixed 9 u/s, wider spacing, no ramp, no sectors). There
is no gate counter or best score. It opens on a flight card — how gravity, flap,
and strafe work — then waits on jump to begin. Hazards arrive centred and in a
fixed order (bulkhead ×3, laser-bar ×2, pylon ×2, repeat) and every gate drops
an orb, rotating damper, spare life, and shunt, within half a unit of the
conduit's centre. The first damper, spare, and shunt you collect each pause the
run under an explainer card; continue, then jump to resume. MENU (bottom right)
or Esc leaves the tutorial at any time.

## Touch

Landscape only. Portrait shows a rotate overlay and pauses the run.

- Left half: drag a floating stick to strafe
- Right half: tap to flap, begin, or reset
- Menu / reboot: FULL enters fullscreen (Android / desktop; remembered across reloads until you exit). MUTE toggles audio. HELP opens the field manual.
- Portrait: ENTER FULLSCREEN on the rotate overlay does the same (and locks landscape on Android). Browsers without the Fullscreen API get an add-to-Home-Screen hint instead.
- Backgrounding the tab auto-pauses. Jump to resume once you are back in landscape.
- PAUSE (top left) holds the run; tap CONTINUE for a 3-2-1 countdown, then the run carries on with no automatic jump. QUIT returns to the menu. A stray flap will not resume it or skip the countdown.

Installed Android PWAs open fullscreen and locked to landscape. iPhone Safari has no element fullscreen; add to Home Screen for a chrome-less page. A PNG `apple-touch-icon` is a follow-up.

## Rendering

Bloom + a screen-space finishing pass (vignette, grain, chromatic kick on gate
pass, glitch on death). Quality starts at the top rung and steps down
automatically if frames run long. Pin it with a query param:

| Param       | Effect                                     |
| ----------- | ------------------------------------------ |
| `?q=2`      | full DPR (max 2), bloom                    |
| `?q=1`      | DPR 1.25, bloom                            |
| `?q=0`      | DPR 1, no bloom                            |
| `?god=1`    | invulnerable (for tuning visuals)          |
| `?debug=1`  | exposes `window.__magpie = { game, bird }` |
| `?rotate=1` | force the portrait rotate overlay (HUD QA) |

`prefers-reduced-motion` disables bloom, shake, FOV punch, camera roll and the
screen-space pulses.

## Working on it

```bash
npm test            # node:test, every *.test.js under src/ and api/
npm run build       # vite production build
npm run format      # prettier --write (format:check in CI)
```

Tests sit next to the code they cover. The game logic (`src/game`, `src/config`,
`src/lib`, `api/_lib`) has no DOM or Three.js dependency and is tested directly;
`src/game/game.test.js` drives the whole state machine with stubbed world and HUD.

See `PLAN.md` for rails, feel numbers, and non-goals, and `AGENTS.md` for the
module map and conventions.
