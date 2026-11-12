---
name: verify-magpie
description: "Drive MAGPIE-9's HUD (Vite, https://magpie.nradavies.com, or the Electron shell) the way a player does, and prove menu, help, scores, settings, pause, or tutorial behavior with screenshots and HUD snapshots. Use when a change to the running game needs evidence from the real page."
---

# Verify MAGPIE-9

MAGPIE-9's primary surface is the browser game: a WebGL canvas plus the HUD in `index.html`. This skill launches that page and drives it through `magpie-verify`. `launch` with no flags starts Vite and does not start the score API. `launch --surface production` opens `https://magpie.nradavies.com`. `launch --surface desktop` and `launch --surface packaged` start the Electron shell. Drive the instance this helper started.

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

Ready means the page is usable, not merely that Vite returned HTML. The helper prints `ready surface=... url=...` only after the document title is `MAGPIE-9`, a canvas has a WebGL renderer string, the document is visible, input mode is `keys`, the menu highlight is `NEW GAME` with blurb `AN OPEN RUN · EVERY GATE COUNTS`, the gate count is `0`, best is `BEST 0`, help, pause, settings, and the rotate overlay are hidden, and no `magpie9.*` storage keys exist. A software renderer string is acceptable. A missing canvas or context is not.

`launch` defaults to `--surface vite`, which is the list above. The other surfaces use the same ready checks and the same click, press, and expect commands. Cleanup the previous instance first, or give the new one its own `MAGPIE_VERIFY_HOME` and `MAGPIE_VERIFY_EVIDENCE`. One default slot cannot hold two live instances.

- `production` starts Chrome only and opens `https://magpie.nradavies.com/`. It does not start Vite. SCORES reaches the live board: initials and scores, or `NO ENTRIES YET` when that tab's board is empty. It must not settle on `BOARD OFFLINE` while the site is up.
- `desktop` starts unpackaged `electron .` from `desktop/`. Install Electron once with `npm install --prefix desktop`, and build the game with `npm run build` so `dist/index.html` exists. The helper copies that build into `desktop/renderer`. It removes `MAGPIE_API_ORIGIN`, `MAGPIE_DEV_SERVER`, and `MAGPIE_DEBUG` from the child so a value in the parent shell cannot point the proxy somewhere else. `window.magpieDesktop.apiOrigin` is empty and SCORES shows `BOARD OFFLINE`. That offline result is correct for this surface.
- `packaged` starts `desktop/release/linux-unpacked/magpie-9`, or the binary in `MAGPIE_VERIFY_PACKAGED`. Build it with `npm run build && npm run dist --prefix desktop`. The deb target can fail after `linux-unpacked/` already exists; the unpacked directory is the binary this surface launches. The same three variables are removed. `apiOrigin` is then `https://magpie.nradavies.com`, and SCORES matches the production board. `electron .` is not this surface. A missing binary fails launch with that build command. Do not record that failure as `BOARD OFFLINE`.

SwiftShader flags on Chrome and on the shell are harness scaffolding so WebGL comes up on a machine with no GPU. `--no-sandbox` is required for Chrome and Electron in this kind of container.

The helper refuses to launch into the default slot while another instance's pid is still alive. A second instance needs its own `MAGPIE_VERIFY_HOME`, `MAGPIE_VERIFY_EVIDENCE`, and (if you pin them) `MAGPIE_VERIFY_PORT` plus `MAGPIE_VERIFY_CDP_PORT`. Do not drive a Chrome this helper did not start.

Teardown is the Cleanup section. Launch writes `instance.json` into the evidence directory.

## Doctor

```bash
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs doctor
```

Read-only. It does not reload, click, or type. On `vite` it checks that the recorded Vite pid is alive and owns the HTTP port, and that Chrome is using this run's profile. On `production` there is no Vite pid; Chrome and the production URL are the check. On `desktop` and `packaged` it checks the Electron pid and that it is using this run's data directory. Every surface also checks that the open page is this run's URL with title `MAGPIE-9`, that a canvas and WebGL context exist, that the document is visible, and that the rotate overlay is hidden. It reprints the git revision and package version captured at launch. Exit code is `0` only when all of that holds. The report is also written to `<evidence>/doctor.json`. Run it before a drive and again whenever the page looks stale.

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

`click` scrolls the target into view, then moves the mouse to its centre and sends `mousePressed` / `mouseReleased`. CLOSE sits at the bottom of the field manual, below an 800px window, so the scroll is the player's scroll. It fails if the element is missing, hidden, or not the topmost hit. `--region backdrop` does not scroll; it presses a point on `#help` that is outside `.help-card`.

A state that is only true for about a second after the press, such as the resume digit 3, has to be observed before this command exits. Each command opens its own DevTools connection, and that handshake is long enough to miss the digit. `--wait-field` and `--wait-equals` poll the same probe fields as `wait` on the connection that sent the click. The first sample is taken before yielding a frame, so a value the press handler paints is not skipped when that frame is slow. `--timeout` defaults to 2000. `--snapshot` writes the probe that matched, then `--screenshot` captures the frame. The frame read can take the rest of that second, so the PNG may already show the next digit; the snapshot is the digit proof. `wait` accepts the same `--snapshot` and `--screenshot` and writes them on the poll that matched. A click that is not waiting writes `--snapshot` and `--screenshot` before the press, on that same connection. A live run falls during the gap between commands. Click `#pause` in the command right after the run goes live, while the drone is still high, and put the live screenshot on that click. After the resume countdown the drone falls from where it was held, so the next command has to be `press --key p` with no screenshot. A frame capture there spends that fall, the drone hits the floor, and `#pause` is hidden. `--screenshot` on the countdown click has the same cost: the frame is read after the digit matches and before the command returns, so the following P misses the count. Leave the screenshot off that click.

`press --key` sends a keydown and keyup, then waits two animation frames so the game can consume the edge. Keys: `h w s a d m p r b Space Enter Escape ArrowUp ArrowDown ArrowLeft ArrowRight Backspace`.

`blur` drops focus. Enter and Space on a focused HUD button activate that button and never reach the game. After a click, blur before Space or Enter when the key is meant as a flap or a confirm.

Stable handles:

| Player control                                                        | Handle                                                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| NEW GAME, BENDS, CHALLENGE, TUTORIAL, SCORES, HELP, CREDITS, SETTINGS | `#menu button[data-item="new"]` and the same for `bends`, `challenge`, `tutorial`, `scores`, `help`, `credits`, `settings` |
| Field-manual button                                                   | `#btnHelp` (`aria-label` Help)                                                                                             |
| Close the manual                                                      | `#btnHelpClose` (`aria-label` Close help)                                                                                  |
| Manual surface                                                        | `#help` (`role` dialog, heading `#helpTitle`)                                                                              |
| Pause / Continue / Quit                                               | `#pause`, `#btnContinue`, `#btnQuit`                                                                                       |
| Leave tutorial                                                        | `#exit` (`aria-label` Exit tutorial to menu)                                                                               |
| Score tabs                                                            | `#scoresTabs button[data-board="run"]`, `bends`, `challenge`                                                               |
| Back from credits, scores, or settings                                | `#credits button.back`, `#scores button.back`, `#settings button.back`                                                     |
| Settings volume nudge                                                 | `#settings [data-setting="master"] [data-settings-nudge="-1"]` and `1`; same for `music` and `effects`                     |
| Settings quality                                                      | `#settings [data-quality="auto"]`, `0` (LOW), `1` (MID), `2` (HIGH)                                                        |
| Initials                                                              | `[aria-label="Letter 1 up"]` and the matching down / letter 2 / letter 3 labels, `#btnEnter`, `#btnSkip`                   |
| Canvas flap                                                           | `canvas`                                                                                                                   |

`expect` states used by the feature map: `menu`, `menu-item --item <id>`, `help-open`, `storage-empty`, `jump-to-begin --mode run|bends|tutorial`, `live --mode run|bends|tutorial`, `pause-menu`, `flight-card`, `dead`, `scores-offline --board run|bends|challenge`, `scores-online --board run|bends|challenge`, `desktop-offline`, `desktop-online`, `credits`, `settings`, `toast --text <text>`. `dead` means the reboot card `REBOOT` / `RUN 0`. `scores-offline` means the status text `BOARD OFFLINE`. `scores-online` means the board resolved: status `NO ENTRIES YET`, or a list of initials with the status line hidden. `LOADING` and `BOARD OFFLINE` fail it. `desktop-offline` means the unpackaged shell (`magpie://app`, empty `apiOrigin`). `desktop-online` means the packaged shell whose `apiOrigin` is `https://magpie.nradavies.com`. `settings` means the fresh Settings screen: master row, every channel at 100, quality AUTO. The probe field `scoresReach` is `online` for a resolved board, `offline` for `BOARD OFFLINE`, and `loading` while the first paint still says `LOADING`.

Recipes are in `features/`. Start each one from the baseline menu unless that file says otherwise.

## Evidence

Write proof under the evidence directory printed by `launch` (`MAGPIE_VERIFY_EVIDENCE`, or `/tmp/magpie-verify-evidence/<run-id>/`). Paths passed to the helper are relative to that directory.

```bash
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path <feature>/<step>.png
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path <feature>/<step>.txt
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs storage
```

A proof shows the action and the resulting state. Take a screenshot and a snapshot before the action and after it. `snapshot` records the HUD a player can check: heading, blurb, score, which dialog is open, pause reason, score status, and `magpie9.*` keys. `storage` writes `storage.json`.

Check side effects, not only pixels. Opening the field manual must leave storage empty. A mute toggles `magpie9.mute`. A best is written only when a scored run beats it. The default Vite launch has no score API: SCORES shows `BOARD OFFLINE`, and CHALLENGE toasts `BOARD OFFLINE` and stays on the menu. That offline result is the behavior of that launch. Do not mock the board. A populated board served by Vite needs `npm run dev:full` with Upstash env, which this skill does not start; report that path as unverified. The production site and a packaged shell with the origin unset are the live board. Prove those with `scores-online`. An unpackaged shell with the origin unset stays on `scores-offline`.

The toast is visible only while `#toast` has class `show` (about 1.2s). When `show` drops, the text is cleared, so a later `expect toast` fails. Catch it with `--wait-field toast` on the click that raises it, and `--snapshot` on that same command. The snapshot's `toast` is the message and `toastClass` includes `show`. The PNG is taken after the snapshot and can miss the toast.

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
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs launch --surface production
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs doctor
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnHelp'
node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnContinue' --wait-field pausedTitle --wait-equals 3 --timeout 2000 --snapshot pause/02-countdown.txt
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

`MAGPIE_VERIFY_CHROME` overrides the Chrome binary. On macOS that binary is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. `MAGPIE_VERIFY_ROOT` overrides the repo root. Port ownership uses `/proc` on Linux and `lsof` elsewhere.

## Other surfaces

- `npm run dev:full` (`vercel dev`) is the local board. This skill does not start it. On the default Vite launch, offline copy is the honest result.
- Production at `https://magpie.nradavies.com` is the live board. `launch --surface production` drives it.
- Unpackaged `npm run desktop` with `MAGPIE_API_ORIGIN` unset answers `BOARD OFFLINE` from the shell, with no outbound score request. `launch --surface desktop` drives that case. `npm run desktop:smoke` checks WebGL and quits. It does not open SCORES.
- A packaged build proxies `/api` to `https://magpie.nradavies.com` when `MAGPIE_API_ORIGIN` is unset. SCORES must not show `BOARD OFFLINE` while the network and the board are up. An explicit origin still wins; the packaged recipe leaves the variable unset. `launch --surface packaged` drives the Linux unpacked binary. A packaged, non-portable NSIS install can show an update bar after a newer GitHub Release has downloaded: `#magpie-update`, label `Update available —`, buttons Restart now and Later (`desktop/src/preload.cjs`, `desktop/src/updates.js`). `shouldCheckForUpdates` is false for an unpackaged `electron .` and for the Vite page, so the bar is not on those launches. Do not publish a release to force it.

## Maintenance

When the HUD or the routes change, update this skill with `/maintain-verification-skill` so the feature map stays the verification source.
