# Field manual

The field manual explains flight, controls, orbs, and the daily challenge. It opens over the menu or the reboot card, and flaps do not start or dismiss a run while it is open.

## Sub-features

- `help-button` opens the manual from the HELP button.
- `help-key` opens and closes the manual with H.
- `help-menu` opens the manual from the HELP menu row.
- `help-dead` opens the manual from the reboot card.
- `help-flap-blocked` keeps the manual open when the player flaps.
- `help-close` closes it from CLOSE, Escape, H, or the dimmed backdrop.
- `help-storage` writes no `magpie9.*` keys.

## How to get to it (user POV)

- Choose the HELP button at the top right of the menu (`#btnHelp`).
- Choose HELP in the main menu (`#menu button[data-item="help"]`).
- Press H on the menu.
- Press H on the reboot card after a crash.
- Close with CLOSE (`#btnHelpClose`), Escape, H, or a press on the dimmed backdrop outside the card.

## Driving it with magpie-verify

Preconditions:

- `doctor` reports the launch url, revision, and a visible page.
- `expect menu` passes.
- `expect storage-empty` passes.
- No run has been started yet. The reboot-card entry is reached later in this recipe, after a crash.

- **Menu before.** Capture the closed menu. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path help/01-menu.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path help/01-menu.txt`. The shot shows MAGPIE-9 and NEW GAME. The snapshot has `helpHidden: true` and `storage: (empty)`.
- **HELP button.** Choose HELP. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnHelp'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect help-open`. The heading is FIELD MANUAL and the menu card is covered.
- **Highlight held.** The menu highlight stays on NEW GAME. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item new`.
- **Open proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path help/02-open.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path help/02-open.txt`. Both show FIELD MANUAL.
- **Flap ignored.** Press W. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key w`, then `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect help-open`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item new`. The manual stays open and the highlight does not move.
- **Flap proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path help/03-after-flap.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path help/03-after-flap.txt`.
- **CLOSE.** Choose CLOSE. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#btnHelpClose'`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item new`.
- **Closed proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path help/04-closed.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path help/04-closed.txt`.
- **H opens.** Press H. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key h` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect help-open`.
- **H proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path help/05-key.png`.
- **Escape closes.** Press Escape. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Escape`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item new`.
- **Menu row.** Choose HELP in the menu. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="help"]'`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect help-open`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item help`.
- **Menu-row proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path help/06-menu-row.png`.
- **Backdrop.** Press the dimmed area outside the card. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#help' --region backdrop`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item help`.
- **H toggles shut.** Press H twice. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key h`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect help-open`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key h`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.
- **Crash to the reboot card.** Choose NEW GAME, clear button focus, and flap once. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="new"]'`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect jump-to-begin --mode run`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`. The drone hits the conduit without another flap.
- **Reboot card.** Wait until the card reads RUN 0. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field prompt --equals 'RUN 0' --timeout 15000` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect dead`.
- **Reboot proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path help/07-reboot.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path help/07-reboot.txt`.
- **H on the reboot card.** Press H. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key h` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect help-open`.
- **Reboot manual proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path help/08-reboot-help.png`.
- **Leave the manual on the card.** Press Escape. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Escape` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect dead`.
- **Return to the menu.** The reboot card ignores a flap for 0.6s. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --ms 800`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.
- **Storage.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect storage-empty` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs storage`. `storage.json` is `{}`.
- **Restored menu.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path help/09-menu-restored.png`.

## Gotchas

- `#btnHelp` sits under the manual. Closing by clicking HELP again fails the hit test. Use CLOSE, Escape, H, or the backdrop.
- Space while CLOSE is focused activates CLOSE. It does not prove that a flap was ignored. Use W for that check.
- W on the bare menu moves the highlight. Use it as a flap only while the manual is open.
- M mutes even while the manual is open and writes `magpie9.mute`. This recipe must not press M.
- The backdrop press needs a viewport wider than the 780px card. Launch sets 1280×800. If no point lands on `#help` outside `.help-card`, the step fails.
- H does nothing on a live run. The reboot card is the crash entry, and only after the heading reads REBOOT.
- The first flap off JUMP TO BEGIN is enough to hit the floor before a gate when the player does not flap again. If the prompt is not `RUN 0`, the run cleared a gate or never went live; do not retarget the expect to the score you happened to get.
- A best of 0 does not write `magpie9.best`. Any `magpie9.*` key fails `storage-empty`.
