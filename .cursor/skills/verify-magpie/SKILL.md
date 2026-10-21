---
name: verify-magpie
description: "Drive MAGPIE-9's web HUD (Vite plus a Chrome DevTools Protocol harness) the way a player does, and prove menu, help, scores, pause, or tutorial behavior with screenshots and HUD snapshots. Use when a change to the running game needs evidence from the real page."
---

# Verify MAGPIE-9

MAGPIE-9's primary surface is the browser game: a WebGL canvas plus the HUD in `index.html`. This skill launches that page from a fresh Chrome profile and drives it through `magpie-verify`. The Electron shell and the score API are separate surfaces; this skill does not start them.

Drive the page a player sees. Do not open `?debug=1`, do not call `window.__magpie`, and do not set game state from a test helper. Buttons in this HUD listen for `pointerdown`. A DOM `click()` does not activate them.

## Launch

From the repo root, with dependencies already installed (`npm install`):

```bash
MAGPIE_VERIFY_EVIDENCE=/opt/cursor/artifacts/verify-magpie \
  node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs launch
```

Omit `MAGPIE_VERIFY_EVIDENCE` to write proof under `/tmp/magpie-verify-evidence/<run-id>/`. The helper:

1. Creates an empty run home (`/tmp/magpie-verify/<run-id>/`, or `MAGPIE_VERIFY_HOME`) and an empty Chrome profile inside it. That profile is the data directory. There is no database and no migration. `localStorage` starts empty, so `magpie9.best`, `magpie9.bends.best`, `magpie9.mute`, and `magpie9.fullscreen` are absent.
2. Starts Vite on a free `127.0.0.1` port (`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port <port> --strictPort`, `BROWSER=none`). This is `npm run dev` bound to loopback. It does not start `/api/scores` or `/api/run`.
3. Starts `google-chrome` headless on its own DevTools port, pointed at that empty profile, at 1280×800. SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`) is harness scaffolding so WebGL comes up on a machine with no GPU. `--no-sandbox` is required for Chrome in this kind of container. Background throttling is disabled so a headless page keeps simulating while no one is watching it.
4. Opens `http://127.0.0.1:<port>/` with no query string.

Ready means the page is usable, not merely that Vite returned HTML. The helper prints `ready url=...` only after the document title is `MAGPIE-9`, a canvas has a WebGL renderer string, the document is visible, input mode is `keys`, the menu highlight is `NEW GAME` with blurb `AN OPEN RUN · EVERY GATE COUNTS`, the gate count is `0`, best is `BEST 0`, help, pause, and the rotate overlay are hidden, and no `magpie9.*` storage keys exist. A software renderer string is acceptable. A missing canvas or context is not.

The helper refuses to launch into the default slot while another instance's pid is still alive. A second instance needs its own `MAGPIE_VERIFY_HOME`, `MAGPIE_VERIFY_EVIDENCE`, and (if you pin them) `MAGPIE_VERIFY_PORT` plus `MAGPIE_VERIFY_CDP_PORT`. Do not drive a Chrome this helper did not start.

Teardown is the Cleanup section. Launch writes `instance.json` into the evidence directory.

## Doctor

```bash
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs doctor
```

Read-only. It does not reload, click, or type. It checks that the recorded Vite pid is alive and owns the HTTP port, that the recorded Chrome pid is alive and using this run's profile, that the open page is this run's URL with title `MAGPIE-9`, that a canvas and WebGL context exist, that the document is visible, and that the rotate overlay is hidden. It reprints the git revision and package version captured at launch. Exit code is `0` only when all of that holds. The report is also written to `<evidence>/doctor.json`. Run it before a drive and again whenever the page looks stale.

## Drive

Every command below is run from the repo root and talks to the instance in `MAGPIE_VERIFY_HOME`, or otherwise `/tmp/magpie-verify/latest`.

```bash
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '<css>'
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#help' --region backdrop
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key <key>
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect <state>
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field <field> --equals <value> --timeout 8000
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --ms 800
```

`click` moves the mouse to the element and sends `mousePressed` / `mouseReleased`. It fails if the element is missing, hidden, or not the topmost hit. `--region backdrop` presses a point on `#help` that is outside `.help-card`.

`press --key` sends a keydown and keyup, then waits two animation frames so the game can consume the edge. Keys: `h w s a d m p r b Space Enter Escape ArrowUp ArrowDown ArrowLeft ArrowRight Backspace`.

`blur` drops focus. Enter and Space on a focused HUD button activate that button and never reach the game. After a click, blur before Space or Enter when the key is meant as a flap or a confirm.

Stable handles:

| Player control                                              | Handle                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| NEW GAME, BENDS, CHALLENGE, TUTORIAL, SCORES, HELP, CREDITS | `#menu button[data-item="new"]` and the same for `bends`, `challenge`, `tutorial`, `scores`, `help`, `credits` |
| Field-manual button                                         | `#btnHelp` (`aria-label` Help)                                                                                 |
| Close the manual                                            | `#btnHelpClose` (`aria-label` Close help)                                                                      |
| Manual surface                                              | `#help` (`role` dialog, heading `#helpTitle`)                                                                  |
| Pause / Continue / Quit                                     | `#pause`, `#btnContinue`, `#btnQuit`                                                                           |
| Leave tutorial                                              | `#exit` (`aria-label` Exit tutorial to menu)                                                                   |
| Score tabs                                                  | `#scoresTabs button[data-board="run"]`, `bends`, `challenge`                                                   |
| Back from credits or scores                                 | `#credits button.back`, `#scores button.back`                                                                  |
| Initials                                                    | `[aria-label="Letter 1 up"]` and the matching down / letter 2 / letter 3 labels, `#btnEnter`, `#btnSkip`       |
| Canvas flap                                                 | `canvas`                                                                                                       |

`expect` states used by the feature map: `menu`, `menu-item --item <id>`, `help-open`, `storage-empty`, `jump-to-begin --mode run|bends|tutorial`, `live --mode run|bends|tutorial`, `pause-menu`, `flight-card`, `dead`, `scores-offline --board run|bends|challenge`, `credits`, `toast --text <text>`. `dead` means the reboot card `REBOOT` / `RUN 0`. `scores-offline` means the status text `BOARD OFFLINE`.

Recipes are in `features/`. Start each one from the baseline menu unless that file says otherwise.

## Evidence

Write proof under the evidence directory printed by `launch` (`MAGPIE_VERIFY_EVIDENCE`, or `/tmp/magpie-verify-evidence/<run-id>/`). Paths passed to the helper are relative to that directory.

```bash
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path <feature>/<step>.png
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path <feature>/<step>.txt
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs storage
```

A proof shows the action and the resulting state. Take a screenshot and a snapshot before the action and after it. `snapshot` records the HUD a player can check: heading, blurb, score, which dialog is open, pause reason, score status, and `magpie9.*` keys. `storage` writes `storage.json`.

Check side effects, not only pixels. Opening the field manual must leave storage empty. A mute toggles `magpie9.mute`. A best is written only when a scored run beats it. The Vite-only launch has no score API: SCORES shows `BOARD OFFLINE`, and CHALLENGE toasts `BOARD OFFLINE` and stays on the menu. That offline result is the behavior of this launch. Do not mock the board. A populated board or a submitted score needs `npm run dev:full` with Upstash env, which this skill does not start; report that path as unverified.

The toast is visible only while `#toast` has class `show` (about 1.2s). Screenshot it in the command immediately after `wait` sees the text.

`actions.log`, `doctor.json`, and `instance.json` in the evidence directory are part of the proof. Cleanup must not delete them.

## Cleanup

```bash
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs cleanup
```

This SIGTERMs, then SIGKILLs, the Vite and Chrome process trees recorded for this instance. It does not kill by process name. It deletes the run home (profile, logs, `run.json`) and leaves the evidence directory in place. A second cleanup is a no-op. After every failed attempt, run cleanup before launching again so ports and profiles are not stranded. Then confirm the evidence files are still on disk.

## Helpers

The only helper is `scripts/magpie-verify.mjs` (executable). From the repo root:

```bash
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs launch
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs doctor
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnHelp'
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key h
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect help-open
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field prompt --equals 'RUN 0' --timeout 15000
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --ms 800
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path help/open.png
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path help/open.txt
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs storage
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs cleanup
```

`MAGPIE_VERIFY_CHROME` overrides the Chrome binary. `MAGPIE_VERIFY_ROOT` overrides the repo root.

## Other surfaces

- Electron (`npm run desktop`, `npm run desktop:smoke`) loads a production build under `magpie://app`. The smoke script checks WebGL and quits. It does not play. Do not point this skill at that window.
- `npm run dev:full` (`vercel dev`) is what serves the boards. Without it, offline copy is the honest result.

## Maintenance

When the HUD or the routes change, update this skill with `/maintain-verification-skill` so the feature map stays the verification source.
