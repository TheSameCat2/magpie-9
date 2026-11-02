# Pause

Pause holds a live run. Flaps do nothing while the pause menu is up. CONTINUE counts down from 3 and the run goes live without an extra flap. QUIT returns to the menu.

## Sub-features

- `pause-open` opens the pause menu from P and from the PAUSE button.
- `pause-flap` ignores a flap while the menu is up.
- `pause-countdown` counts down after CONTINUE and ignores flaps during the count.
- `pause-cancel` returns to the pause menu when P is pressed during the countdown.
- `pause-quit` leaves the run for the menu.

## How to get to it (user POV)

- Start NEW GAME, flap to leave JUMP TO BEGIN, then press P or Escape, or choose PAUSE at the top left.
- Choose CONTINUE, or press P or Escape again, for the 3-2-1 count.
- Choose QUIT to return to the menu.

## Driving it with magpie-verify

Preconditions:

- `doctor` is healthy and `expect menu` passes.
- The run is a NEW GAME. Tutorial's Esc leaves the tutorial instead of pausing; that path is in `tutorial.md`.
- PAUSE is hidden during JUMP TO BEGIN. The run has to be live first.

- **Start.** Choose NEW GAME and flap. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="new"]'`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect jump-to-begin --mode run`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect live --mode run`.
- **P.** Press P. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key p` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect pause-menu`.
- **Pause proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path pause/01-menu.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path pause/01-menu.txt`. The card reads PAUSED, with CONTINUE and QUIT.
- **Flap ignored.** Blur, then press W. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key w`, then `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect pause-menu`.
- **CONTINUE.** Choose CONTINUE and catch the digit in that same command. The digit 3 lasts about a second, and the next command's DevTools connection misses it. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnContinue' --wait-field pausedTitle --wait-equals 3 --timeout 2000 --snapshot pause/02-countdown.txt --screenshot pause/02-countdown.png`. The snapshot has `pausedTitle: 3` and `pausedSub: RESUMING`. The PNG is the countdown card; the frame capture can outlast the digit, so the painted number may already be 2.
- **Cancel the count.** Press P before the count runs out. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key p` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect pause-menu`.
- **Count out.** Choose CONTINUE again and wait until the card is gone. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnContinue'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field pausedHidden --equals true --timeout 5000`.
- **PAUSE button.** Choose PAUSE in the next command, and take the live frame in that same command before the press. Another command first lets the drone hit the floor, which hides PAUSE. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#pause' --screenshot pause/03-live.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect pause-menu`. The shot shows PAUSE and no centre card.
- **QUIT.** Choose QUIT. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnQuit'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.
- **Menu proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path pause/04-quit.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path pause/04-quit.txt`.

## Gotchas

- CONTINUE is focused when the pause menu opens. Space activates CONTINUE instead of proving a flap. Blur, then press W.
- The countdown is about 3 seconds of wall clock. Digit 3 is gone by the time a following command connects, and the frame capture itself can land on 2. Trust `pausedTitle` in the snapshot taken when the field matches. Do not treat the digit 3 as the run being live.
- After the countdown the drone falls. The next command after `pausedHidden` becomes true has to be the PAUSE click, with the live screenshot on that click. A separate screenshot command lets it crash, and PAUSE is hidden on the reboot card.
- P during the countdown returns to the pause menu. A second flap does not skip the count.
- Escape on a NEW GAME run pauses. Escape in the tutorial leaves to the menu. Do not reuse this recipe there.
- QUIT is the only return to the menu from the pause card. Cleanup is not a substitute for proving QUIT if the recipe is in progress; if you abort, run cleanup only after you have saved the screenshots.
