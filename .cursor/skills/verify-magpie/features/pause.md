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
- **CONTINUE.** Choose CONTINUE. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnContinue'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field pausedTitle --equals '3' --timeout 2000`.
- **Count proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path pause/02-countdown.png`. The title is 3 and the line under it is RESUMING.
- **Cancel the count.** Press P. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key p` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect pause-menu`.
- **Count out.** Choose CONTINUE again and wait until the card is gone. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnContinue'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field pausedHidden --equals true --timeout 5000`, then `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect live --mode run`.
- **Live proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path pause/03-live.png`. PAUSE is visible and the centre card is gone.
- **PAUSE button.** Choose PAUSE. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#pause'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect pause-menu`.
- **QUIT.** Choose QUIT. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnQuit'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.
- **Menu proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path pause/04-quit.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path pause/04-quit.txt`.

## Gotchas

- CONTINUE is focused when the pause menu opens. Space activates CONTINUE instead of proving a flap. Blur, then press W.
- The countdown is about 3 seconds of wall clock. Wait for `pausedHidden` to become true. Do not treat the digit 3 as the run being live.
- P during the countdown returns to the pause menu. A second flap does not skip the count.
- Escape on a NEW GAME run pauses. Escape in the tutorial leaves to the menu. Do not reuse this recipe there.
- QUIT is the only return to the menu from the pause card. Cleanup is not a substitute for proving QUIT if the recipe is in progress; if you abort, run cleanup only after you have saved the screenshots.
