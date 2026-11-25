# Tutorial

Tutorial is a slow practice run. It opens on a flight card, then waits at JUMP TO BEGIN. The gate counter and best are hidden. MENU or Escape leaves for the main menu from the flight card, from JUMP TO BEGIN, and from a live run. A crash ends on a card titled TUTORIAL with the prompt SESSION ENDED. MENU is hidden there, and Space returns to the menu.

## Sub-features

- `tutorial-flight` shows the FLIGHT card as soon as tutorial starts.
- `tutorial-begin` dismisses the card into JUMP TO BEGIN, then a flap starts the run.
- `tutorial-exit` leaves from the MENU button.
- `tutorial-escape` leaves from Escape on the flight card, on JUMP TO BEGIN, and once the run is live.
- `tutorial-ended` shows TUTORIAL / SESSION ENDED after a crash. MENU is hidden. Space returns to the menu, and Escape does not.
- `tutorial-lessons` shows DAMPER, SPARE LIFE, and SHUNT the first time each orb is collected.

## How to get to it (user POV)

- Choose TUTORIAL in the main menu.
- Read the FLIGHT card and press Space.
- Press Space again at JUMP TO BEGIN.
- Choose MENU at the lower right, or press Escape, to leave the flight card, JUMP TO BEGIN, or a live run.
- After a crash, the card says SESSION ENDED and SPACE FOR MENU. Press Space to return. Escape stays on the card.
- Collect the centred orbs to see the later cards. Each card waits for Space, then the run waits for another jump.

## Driving it with magpie-verify

Preconditions:

- `doctor` is healthy and `expect menu` passes.
- The flight card, the begin hold, and both exits are provable without collecting an orb.
- The session-ended card is one flap off JUMP TO BEGIN and no further flap. The prompt to wait for is SESSION ENDED, not RUN 0.
- The orb cards require flying the fixed course until the first damper, spare, and shunt are collected. A drive that has not collected them cannot report those cards as passed.

- **Open.** Choose TUTORIAL. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="tutorial"]'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect flight-card`.
- **Flight proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path tutorial/01-flight.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path tutorial/01-flight.txt`. The card is titled FLIGHT, the hint is SPACE TO CONTINUE, the tag reads TUTORIAL, and the gate counter is not displayed.
- **Escape from the card.** Press Escape. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Escape` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.
- **Open again.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="tutorial"]'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect flight-card`.
- **MENU from the card.** Choose MENU. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#exit'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.
- **Open for the begin hold.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="tutorial"]'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect flight-card`.
- **Dismiss the card.** The TUTORIAL row still has focus, so Space would not reach the game. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`, then `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect jump-to-begin --mode tutorial`.
- **Begin proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path tutorial/02-jump.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path tutorial/02-jump.txt`.
- **Go live.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`, then `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect live --mode tutorial`.
- **Live proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path tutorial/03-live.png`. MENU is on screen and the gate counter is not.
- **Escape leaves.** Press Escape. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Escape` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.
- **Menu proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path tutorial/04-menu.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path tutorial/04-menu.txt`.
- **Escape from the begin hold.** Choose TUTORIAL, dismiss the flight card, and press Escape. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="tutorial"]'`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect flight-card`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect jump-to-begin --mode tutorial`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Escape`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.
- **Crash.** Choose TUTORIAL, dismiss the card, and flap once. Do not flap again. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="tutorial"]'`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect flight-card`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect jump-to-begin --mode tutorial`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect live --mode tutorial`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field prompt --equals 'SESSION ENDED' --timeout 20000 --snapshot tutorial/05-session-ended.txt`.
- **Crash proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path tutorial/05-session-ended.png`. The snapshot heading is TUTORIAL and the prompt is SESSION ENDED.
- **Escape stays.** Press Escape. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Escape`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field prompt --equals 'SESSION ENDED' --timeout 2000 --snapshot tutorial/06-escape-still-ended.txt`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field exitHidden --equals true --timeout 2000`. MENU is still hidden.
- **Space returns.** The card ignores a flap for 0.6s. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --ms 800`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs blur`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Space`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.

## Gotchas

- Space while the TUTORIAL menu row is focused re-activates that button and does not dismiss the card. Blur first.
- The flight card is not the pause menu. CONTINUE and QUIT are not on it. Space dismisses it. MENU (`#exit`) and Escape both leave for the main menu from the flight card, from JUMP TO BEGIN, and from a live run.
- MENU and Escape do not leave the session-ended card. That card hides MENU and says SPACE FOR MENU. Space before the 0.6s grace is ignored. `expect dead` does not match this card: that state is REBOOT / RUN 0 on a scored run.
- Escape in a tutorial never opens the pause menu. P still pauses a live tutorial run; this recipe does not use P.
- The gate counter and BEST are hidden with CSS while `mode` is tutorial. Their text nodes can still say `0`. Judge `scoreDisplay`, not the text alone.
- DAMPER, SPARE LIFE, and SHUNT are real cards, and the course does spawn those orbs near the centre. This recipe does not fly into them. A run that stops at the flight card must report those three cards as unverified. Do not open them through `?debug=1`.
- Tutorial runs never file a score. `storage-empty` should still pass if nothing else wrote a key.
