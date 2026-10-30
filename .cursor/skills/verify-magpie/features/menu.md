# Main menu

The menu is the game's front door. The highlight moves with the arrow keys, the line under the list describes the highlighted entry, and choosing NEW GAME or BENDS drops the player into a held run. CHALLENGE cannot start on this launch. CREDITS and SETTINGS are separate screens with a way back.

## Sub-features

- `menu-keys` moves the highlight and the blurb with the arrow keys.
- `menu-new` starts a NEW GAME held at JUMP TO BEGIN.
- `menu-bends` starts BENDS held at JUMP TO BEGIN.
- `menu-challenge-offline` stays on the menu and toasts BOARD OFFLINE.
- `menu-credits` opens CREDITS and returns with Escape.
- `menu-return` gets back to the menu from a held run by going live, pausing, and choosing QUIT.

## How to get to it (user POV)

- The game opens on the menu. NEW GAME is highlighted.
- Press ArrowDown or ArrowUp to move the highlight. Press Enter or Space to choose it, or click the row.
- Choose NEW GAME, BENDS, CHALLENGE, or CREDITS.
- TUTORIAL is specified in `tutorial.md`. SCORES is specified in `scores.md`. HELP is specified in `help.md`. SETTINGS is specified in `settings.md`.

## Driving it with magpie-verify

Preconditions:

- `doctor` is healthy and `expect menu` passes.
- `expect menu-item --item new` passes.
- `expect storage-empty` passes.
- This Vite launch has no `/api/run`. CHALLENGE's observable result is the offline toast, not a course.

- **Move down.** Press ArrowDown. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key ArrowDown` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item bends`. The blurb reads AN ENDLESS RUN IN A CONDUIT THAT TURNS.
- **Move up.** Press ArrowUp. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key ArrowUp` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item new`.
- **Key proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path menu/01-highlight.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path menu/01-highlight.txt`.
- **NEW GAME.** Choose NEW GAME. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="new"]'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect jump-to-begin --mode run`.
- **Begin proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path menu/02-jump.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path menu/02-jump.txt`. The card reads JUMP TO BEGIN. Storage is still empty: `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect storage-empty`.
- **Go live.** The NEW GAME button still has focus, so Space would not flap. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`, then `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect live --mode run`.
- **Pause and quit.** Press P, then choose QUIT. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key p`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect pause-menu`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnQuit'`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.
- **BENDS.** Choose BENDS. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="bends"]'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect jump-to-begin --mode bends`.
- **BENDS proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path menu/03-bends.png`.
- **Leave BENDS.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect live --mode bends`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key p`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect pause-menu`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnQuit'`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.
- **CHALLENGE.** Choose CHALLENGE. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="challenge"]'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field toast --equals 'BOARD OFFLINE' --timeout 5000`.
- **Toast proof.** Immediately run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect toast --text 'BOARD OFFLINE'`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item challenge`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path menu/04-challenge-offline.png`. The menu is still up.
- **CREDITS.** Choose CREDITS. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="credits"]'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect credits`.
- **Credits proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path menu/05-credits.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path menu/05-credits.txt`. The screen names TheSameCat and says ESC TO RETURN.
- **Back.** Press Escape. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Escape`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item credits`.

## Gotchas

- There is no Back on JUMP TO BEGIN. P and Escape do nothing until the run is live. Go live, then pause, then QUIT.
- Space or Enter while NEW GAME is focused activates that button again and does not flap. Blur first.
- CHALLENGE on `npm run dev` toasts BOARD OFFLINE. If `/api/run` is actually up, the toast expect fails because a course started. Report that precondition; do not change the expect to JUMP TO BEGIN for this launch.
- The toast fades in about 1.2s. `expect toast` has to run in the next command after `wait` sees BOARD OFFLINE.
- ArrowDown from CREDITS is not a menu move while the credits screen is up. Escape returns first.
- Starting NEW GAME or BENDS does not write a best. `storage-empty` after JUMP TO BEGIN is required.
