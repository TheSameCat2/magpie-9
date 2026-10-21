# MAGPIE-9 verification map

This directory is the maintained source for verifying the player-facing behavior of MAGPIE-9. Read the index before driving the game, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs launch` from the repo root.
- The instance uses a new Chrome profile, so `localStorage` has no `magpie9.*` keys.
- Vite is serving the game with no score API. SCORES and CHALLENGE show `BOARD OFFLINE`.
- The viewport is 1280×800 and input mode is `keys`.
- Run `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs doctor` and require a healthy report for this url, revision, and profile.
- Never drive a Chrome or Vite process that this launch did not start.

## Driving conventions

- Start every recipe from the baseline menu unless its preconditions say otherwise.
- Prefer the selectors in `SKILL.md` over coordinates.
- Treat every command as literal. Keep quoted selectors, keys, and expected strings unchanged.
- Run every browser action through `node .cursor/skills/verify-magpie/scripts/magpie-verify.mjs`.
- Blur focus before Space or Enter when that key must reach the game. A focused HUD button swallows both.
- Restore the menu before the next feature. Do not delete the evidence directory during cleanup.

## Proof and skip reporting

- Capture the player action and the resulting state, not only the final screen.
- UI proof is a PNG screenshot plus a HUD snapshot for the step that shows the result.
- Mutation proof includes `storage` when the step should write or avoid `magpie9.*` keys.
- Record the feature file and the entry point in `actions.log`.
- Report an unreachable path with the command that failed and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the player-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every player entry point.
3. `Driving it with magpie-verify` starts with `Preconditions:` and uses labeled bullets that pair each player action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only player paths, stable handles, required state, commands, and observable proof.

## Features

- [Main menu](./menu.md) covers keyboard movement, NEW GAME, BENDS, CHALLENGE, and CREDITS.
- [Field manual](./help.md) covers the HELP button, the menu row, the H key, the reboot card, and every way to close the manual.
- [Scores](./scores.md) covers the SCORES screen and its three boards on this Vite-only launch.
- [Pause](./pause.md) covers the pause menu, ignored flaps, the resume countdown, and QUIT.
- [Tutorial](./tutorial.md) covers the flight card, jump to begin, and leaving back to the menu.
