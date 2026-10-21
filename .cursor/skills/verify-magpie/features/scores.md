# Scores

SCORES is the top-10 board. On this launch the API is absent, so every tab says the board is offline. The player can still switch tabs and return to the menu.

## Sub-features

- `scores-open` opens SCORES from the menu on ALL-TIME.
- `scores-offline` shows BOARD OFFLINE for ALL-TIME, BENDS, and TODAY.
- `scores-tabs` switches boards from the tab buttons and from the arrow keys.
- `scores-back` returns to the menu with Escape or BACK.

## How to get to it (user POV)

- Choose SCORES in the main menu.
- On the board, choose ALL-TIME, BENDS, or TODAY, or press ArrowLeft and ArrowRight.
- Press Escape or choose BACK to return.

## Driving it with magpie-verify

Preconditions:

- `doctor` is healthy and `expect menu` passes.
- Vite was started by this skill, so `/api/scores` is not a board. The proved status is `BOARD OFFLINE`, not a list of runs.
- A populated top 10 is a different launch (`npm run dev:full` with Upstash). Do not stub it.

- **Open.** Choose SCORES. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="scores"]'`.
- **ALL-TIME offline.** The first paint can say LOADING. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field scoresStatus --equals 'BOARD OFFLINE' --timeout 5000` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect scores-offline --board run`.
- **ALL-TIME proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path scores/01-all-time.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path scores/01-all-time.txt`. The heading is TOP 10 and the status is BOARD OFFLINE.
- **BENDS tab.** Choose BENDS. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#scoresTabs button[data-board="bends"]'`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field scoresStatus --equals 'BOARD OFFLINE' --timeout 5000`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect scores-offline --board bends`.
- **TODAY from the keyboard.** Press ArrowRight. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key ArrowRight`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field scoresStatus --equals 'BOARD OFFLINE' --timeout 5000`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect scores-offline --board challenge`.
- **TODAY proof.** Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs screenshot --path scores/02-today.png` and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs snapshot --path scores/02-today.txt`.
- **Back to ALL-TIME.** Press ArrowLeft twice. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key ArrowLeft`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key ArrowLeft`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect scores-offline --board run`.
- **Return.** Press Escape. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs press --key Escape`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu-item --item scores`.
- **BACK button.** Open SCORES again and choose BACK. Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#menu button[data-item="scores"]'`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs wait --field scoresStatus --equals 'BOARD OFFLINE' --timeout 5000`, `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs click --selector '#scores button.back'`, and `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs expect menu`.

## Gotchas

- Do not snapshot the status before `wait`. The first paint is LOADING, and treating LOADING as success hides a board that never resolves.
- `NO ENTRIES YET` is the empty-board copy when the API responds. This launch does not produce it. If the status is `NO ENTRIES YET` or a list of initials, the API is up and this recipe's precondition failed.
- ArrowDown also changes tabs, because the scores screen treats vertical nav as a board step. Use ArrowLeft and ArrowRight, which are the keys the hint names.
- Escape on SCORES returns to the menu. It does not open the field manual.
- Initials entry is not on this screen. It appears after a scored crash that qualifies, which needs a live board this launch does not have.
