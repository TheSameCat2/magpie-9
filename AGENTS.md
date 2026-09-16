# MAGPIE-9 — module map and conventions

Read this before changing code. `PLAN.md` holds the design rails and feel
numbers; this file says where things live and how they fit together.

## Layers

Dependencies point downward only. A module may import from its own layer or
any layer below it, never above.

```
main.js                bootstrap and the frame loop
game/                  state machine + rules             (imports everything below)
hud/                   DOM overlay                       (config, lib, platform)
world/  audio/         Three.js scene objects, WebAudio  (config, lib, render)
render/                renderer, materials, shaders, postfx, quality
platform/              browser edges: input devices, fullscreen, visibility
config/  lib/          numbers and pure helpers          (import nothing above)
api/                   Vercel functions; may import config/ and lib/ only
```

## Where things are

### `src/config/` — every tunable number

| File          | Holds                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| `theme.js`    | `THEME` palette. Mirrored as CSS variables in `styles/base.css`.          |
| `world.js`    | Conduit dimensions, bird hull size, `CAMERA`, `RECYCLE_Z`, fog density.   |
| `rules.js`    | Gameplay: speeds, spacing, sectors, orb odds, `difficulty()`, run floors. |
| `tutorial.js` | Tutorial-mode overrides for speed, gate order, and orb order.             |

Shared with the API: `rules.js` is imported by `api/scores.js` to reject
impossible times, so keep it free of browser globals.

### `src/lib/` — pure helpers, no DOM, no Three.js

`math.js` (`clamp`, disc/sphere sampling), `rng.js` (seeded Mulberry32 shared
with the server for daily courses), `time.js` (`utcDay`, `formatTime`),
`storage.js` (every `localStorage` key, with safe fallbacks).

### `src/platform/`

`input.js` flattens keyboard + pointer into per-frame edges (`flapEdge`,
`navEdge`, `strafeEdge`, …) plus continuous `strafe`; the game reads them in
`update()` and `main.js` calls `endFrame()`. `screen.js` wraps fullscreen,
orientation, visibility, and PWA detection behind one `onChange`.

### `src/render/`

`scene.js` builds renderer, camera, and lit scene. `uniforms.js` holds the
`UNIFORMS` object every shader material shares by reference (`uTime`,
`uScroll`, `uKick`); the game loop writes them once per frame. `textures.js`
draws procedural canvases; `materials.js` turns them into Three materials;
`shaders.js` is GLSL; `postfx.js` is bloom + the screen grade; `quality.js`
is the DPR/bloom ladder and the governor that steps down on slow frames.

### `src/world/`

Each file is a factory that adds pooled meshes to the scene and returns a
small API (`reset`, `scroll`, …). `collision.js` is pure and tested. `gates/`
is split into `layout.js` (pure hole/gap placement, tested), `geometry.js`
(shared buffer geometries), `slot.js` (per-slot mesh wiring), and `index.js`
(the pool: spawn, scroll, hit test, celebrate).

### `src/audio/`

`graph.js` owns the lazily created `AudioContext`, master gain, and the wet
bus; `oneshots.js` makes tones and noise bursts; `drone.js` is the engine
hum tied to scroll speed; `hum.js` is the proximity hazard hum. `index.js`
composes them into the game-facing API (`flap`, `gate`, `crash`, …).

### `src/hud/`

`index.js` composes one panel per file and shares a tiny state record
`{ scene, inputMode, gameMode, held }` that `chrome.js` reads in `refresh()`
to decide what chrome is visible. `copy.js` is pure text (menu items, pause
copy, end-of-run titles) and is tested. `dom.js` has the helpers (`byId`,
`onPress`, `retrigger`). Panels: `readouts` (score, best, lives, speed,
toast), `screens` (menu, end card, entry, credits, scores, lessons),
`overlays` (pause card, respawn, rotate), `help` (field manual modal),
`touch` (stick + tap ring).

### `src/game/`

| File            | Role                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| `index.js`      | `createGame`: scene state machine, in-run events, frame `update()`.                     |
| `run.js`        | Per-session numbers and scoring rules (`clearGate`, `engageShunt`, `spendLife`).        |
| `hold.js`       | Every way a run freezes: jump-to-begin, pause menu + countdown, lesson, rotate, hidden. |
| `spawner.js`    | Fills the horizon with gates and drops orbs per mode.                                   |
| `scoreboard.js` | Board cache, SCORES screen painting, initials entry, submit.                            |
| `camera.js`     | Follow/bank/shake/FOV rig.                                                              |
| `clock.js`      | Wall-clock run timer that excludes holds.                                               |
| `challenge.js`  | Deterministic daily course from a seed.                                                 |
| `board.js`      | Pure ranking + initials entry state machine.                                            |
| `api.js`        | fetch wrappers for `/api/run` and `/api/scores`.                                        |

Scene names: `menu | credits | scores | playing | respawn | dead | entry`.
Help is a modal, not a scene. Pause is a hold inside `playing`, not a scene.

### `src/styles/`

`main.css` imports the rest in order. `base.css` has the tokens, resets, and
the shared `#hud button` rule; add per-button styling in the file for that
area rather than repeating cursor/font/focus rules. `media.css` is last so its
breakpoints win.

### `api/`

`run.js` issues HMAC tokens; `scores.js` reads and writes boards. `_lib/`:
`http.js` (responses), `redis.js` (client + rate limits + nonce claim),
`token.js` (sign/verify), `board.js` (zset encoding, `writeScore`),
`initials.js` (normalise + blocklist).

## Conventions

- Factories, not classes: `createX(deps) → { methods, getters }`. Pass
  collaborators in; do not reach for globals except `UNIFORMS`.
- Numbers live in `config/`. If you type a literal that means something
  (a speed, a distance, a chance), name it there or as a module constant.
- Hot path: no per-frame allocation. Pools reuse `out` arrays (`passedGates`,
  `collectedOrbs`) and scratch objects (`burst`).
- Comments explain intent or a trap, never what the next line does.
- Tests: `node:test`, placed beside the source as `name.test.js`. Pure
  modules get direct tests; `game.test.js` drives `createGame` with stubs.
  Run `npm test` and `npm run build` before you call a change done.
- Formatting is Prettier (`npm run format`); config in `.prettierrc`.
- Renaming a `localStorage` key, an API field, or a scene name is a
  cross-layer change: grep for it, and update `README.md` if a player sees it.
