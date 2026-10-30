# Settings

SETTINGS is a menu screen for three volume channels and one graphics-quality control. Opening it leaves storage alone. Changing a channel or a quality choice writes that choice, and Escape returns to the menu with SETTINGS still highlighted.

## Sub-features

- `settings-open` opens the screen from the menu with master selected, every channel at 100, and quality on AUTO.
- `settings-volume` lowers master with the left arrow and writes `magpie9.volume.master`.
- `settings-quality` moves to the quality row, chooses LOW, and writes `magpie9.quality`.
- `settings-buttons` raises music from its plus button and chooses MID from its button.
- `settings-return` leaves with Escape or BACK and lands on the SETTINGS menu row.

## How to get to it (user POV)

- On the menu, choose SETTINGS.
- ↑ ↓ moves the row. ← → adjusts it. + and − step a volume. AUTO, LOW, MID, and HIGH pick quality.
- Esc, BACK, or a tap outside those buttons returns to the menu.

## Driving it with magpie-verify

Preconditions:

- `doctor` is healthy and `expect menu` passes.
- `expect menu-item --item new` passes.
- `expect storage-empty` passes.

- **Open.** Choose SETTINGS. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="settings"]'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect settings`.
- **Open proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path settings/01-open.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path settings/01-open.txt`. The title is SETTINGS, master reads 100, and the caption is DROPS A RUNG IF FRAMES RUN LONG. Storage is still empty: `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect storage-empty`.
- **Lower master.** Press ArrowLeft. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key ArrowLeft` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path settings/02-master.txt`. Master reads 90.
- **Master proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path settings/02-master.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs storage`. `magpie9.volume.master` is `0.9`. Music and effects keys are absent.
- **Quality.** Press ArrowDown three times, then ArrowRight. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key ArrowDown` three times, then `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key ArrowRight`, then `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path settings/03-quality.txt`. The row is quality, the choice is LOW, and the caption is NO BLOOM · FEWER SPARKS.
- **Quality proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path settings/03-quality.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs storage`. `magpie9.quality` is `0`.
- **Buttons.** Click raise music, then MID. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#settings [data-setting="music"] [data-settings-nudge="1"]'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#settings [data-quality="1"]'`, then `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path settings/04-buttons.txt`. Music reads 100 and quality is MID. The screen stays up.
- **Back.** Press Escape. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Escape`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item settings`.
- **Menu order.** Press ArrowDown. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key ArrowDown` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item new`. Press ArrowDown again and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item bends`.
- **Reopen.** Choose SETTINGS again. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="settings"]'`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path settings/05-reopen.txt`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path settings/05-reopen.png`. Master still reads 90 and quality is still MID. This is not a fresh screen, so do not run `expect settings`.
- **BACK button.** Click BACK. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#settings button.back'` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.

## Gotchas

- `expect settings` describes the screen as it first opens: master row, 100 on every channel, AUTO. After a change, use the snapshot. Do not expect settings again.
- Opening SETTINGS writes nothing. `storage-empty` has to pass before the first ArrowLeft.
- ArrowLeft and ArrowRight adjust the highlighted row. They do not move the menu while this screen is up.
- Enter while BACK is focused leaves the screen. Blur is unnecessary for ArrowLeft.
- A click on + or a quality choice stays on the screen. A click on the card padding returns to the menu.
- Music at 100 after the plus click is the ceiling. The row was still at 100, so that click selects the music row and does not write `magpie9.volume.music`.
- `magpie9.quality` is removed when the choice returns to AUTO. This recipe leaves it at MID (`1`).
