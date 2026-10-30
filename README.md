# MAGPIE-9

3D conduit runner. Flap to climb, idle to fall, A/D to strafe.

## Download for Windows

Get the installer from the latest
[GitHub Release](https://github.com/TheSameCat2/magpie-9/releases/latest).
The file is **MAGPIE-9-Setup** and the version, for example
`MAGPIE-9-Setup-1.2.3.exe`.

This build is unsigned. Windows does not show a publisher it trusts, so
Microsoft Defender SmartScreen stops the installer until you choose to
continue. That warning is expected.

1. If Edge says the file isn't commonly downloaded, open the download
   warning, choose **Keep**, then **Show more**, then **Keep anyway**. In
   Chrome, choose **Keep**.
2. Open the installer. Windows shows **Windows protected your PC**.
3. Click **More info**, then **Run anyway**.
4. Open **MAGPIE-9** from the Start menu or the desktop shortcut. The first
   launch can show the same prompt. Click **More info**, then **Run anyway**,
   again.

A work or school PC can hide **Run anyway**. If the message is from Smart
App Control, it has no **Run anyway**. Turning Smart App Control off
(Windows Security → App & browser control → Smart App Control) allows the
installer. Windows will not let you turn Smart App Control back on without
resetting the PC.

A newer release downloads in the background while you play. The run keeps
going. A bar at the bottom of the window reads **Update available —** with
**Restart now** and **Later**. Restart now quits and installs. Later leaves
the run alone and installs the next time you quit. The update is unsigned
too, so SmartScreen can ask again.

Push a tag `vX.Y.Z` (for example `v1.2.3`) to publish. The workflow stamps
that version, builds the installer, and publishes one GitHub Release for the
tag: `MAGPIE-9-Setup-X.Y.Z.exe`, its `.blockmap`, and `latest.yml`. That
release is the update channel. A tag with a hyphen, such as `v1.2.3-rc.1`,
is a prerelease and is not the channel. Re-run the workflow on the same tag
to replace the files on that same release.

```bash
cd ~/Projects/magpie-9
npm install
npm run dev
```

Open the printed local URL. Space / click flaps. A D (or arrows) strafe.
M mutes, B shows the body hitbox.

## Menu

The game opens on a menu: **NEW GAME**, **BENDS**, **CHALLENGE**, **TUTORIAL**,
**SCORES**, **HELP**, **CREDITS**, **SETTINGS**. Click / tap an entry, or use
↑ ↓ (W S) and Enter / Space. The line under the list describes the highlighted
entry. NEW GAME, BENDS, and TUTORIAL drop you into a held run — jump to begin.
Esc (or a tap) backs out of Help, Credits, Scores, and Settings; after a crash,
a tap returns to the menu once a short grace has passed, so the flap that ended
the run cannot dismiss the card.

**SETTINGS** sets master, music, and effects volume, and chooses graphics
quality: AUTO, LOW, MID, or HIGH. AUTO keeps the usual picture and drops a rung
when frames run long. Mute still silences everything without moving the master
slider. The browser keeps the choice (`magpie9.volume.master`,
`magpie9.volume.music`, `magpie9.volume.effects`, `magpie9.quality`).

## Bends

An endless run in a conduit that turns. Between some gates the conduit swings
left or right by up to 25°; your heading follows it, but inside the turn you
slip toward the outer wall and have to strafe against it. The slip grows with
speed and never outruns your strafe. Every bend has a straight run-in after the
gate before it and a longer run-out before the next gate, so no gate hides just
past a corner. Bends do not score; gates do. BENDS keeps its own board (the
BENDS tab on SCORES) and its own best (`magpie9.bends.best`).

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

A global top 10 per mode, arcade-style: no accounts. The tabs are ALL-TIME
(NEW GAME), BENDS, and TODAY (the daily challenge). Crash with a run that beats
the tenth place and type three initials (`A–Z`, `0–9`). ENTER files them; SKIP
or Esc leaves the run off the board. Tutorial runs never go on the board. Your
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
npm test            # node:test under src/, api/, desktop/src/, and desktop/scripts/
npm run build       # vite production build
npm run format      # prettier --write (format:check in CI)
```

Tests sit next to the code they cover. The rules (`src/config`, `src/lib`,
`api/_lib`, and the pure `src/game` modules such as `run`, `hold`, and
`board`) have no DOM or Three.js dependency and are tested directly;
`src/game/game.test.js` drives the whole state machine with stubbed world and
HUD. The suite also fails on an upward import, an import cycle, a broken
API/desktop boundary, or a HUD id missing from `index.html`. GitHub Actions
runs format check, tests, and the production build on every push and PR.

See `PLAN.md` for rails, feel numbers, and non-goals, and `AGENTS.md` for the
module map and conventions.

## Desktop

Electron shell in `desktop/`. It loads this build; it is not a second game.
Not a workspace — install it on its own so the Vercel deploy never sees Electron.

```bash
npm install --prefix desktop   # once
npm run desktop                # production build, then the shell
npm run desktop:smoke          # build, launch, check WebGL came up, quit
npm run desktop:dist:win       # unsigned Windows installer (NSIS)
```

Window defaults to 1280×800. The score API stays on Vercel. Point the shell
at it with `MAGPIE_API_ORIGIN=https://your-deployment.vercel.app` (http only
for `localhost` / `127.0.0.1`). Unset, the board answers offline and a run
still starts. `MAGPIE_DEV_SERVER=http://127.0.0.1:5173` loads `npm run dev`
instead of the build. `MAGPIE_DEBUG=1` opens DevTools.

Packaging for macOS (ad-hoc signed, this machine): `npm run build && npm run pack --prefix desktop`.
Output is `desktop/release/`. The ad-hoc signature is so macOS will launch it
after the fuse flip; it is not a Developer ID signature. Notarization and the
Steam depot are not part of the shell.

Packaging for Windows (unsigned, does not publish): `npm run desktop:dist:win`
after `npm install` and `npm install --prefix desktop`. That production-builds
the game, copies it into the shell, and runs the NSIS target. Output is
`desktop/release/MAGPIE-9-Setup-<version>.exe` plus `latest.yml` and a
`.blockmap`, using the version in `desktop/package.json`. Signing stays off.
Players and the tag that publishes are under
[Download for Windows](#download-for-windows). Pull requests that touch the
shell build the installer as an Actions artifact and do not publish a Release.
