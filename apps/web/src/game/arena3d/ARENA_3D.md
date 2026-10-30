# 3D arena experiment

This experiment makes the match board look 3D and keeps every interaction working. The board stays DOM. A Three.js scene renders behind it, and CSS 3D transforms tilt the field.

## Layers

| Layer    | Owner                                       | What it does                                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene    | `ArenaScene.tsx` (lazy)                     | Picks one environment (floor and props), then adds the shared sigils, pulses, camera, and frame driver. See [Environments](#environments).                                                                                                                                                                     |
| Pulses   | `useArenaPulses.ts` → `ArenaPulseLayer.tsx` | Turns match cues into 3D effects: summon pillars, an evolve helix, delete implosion with shards, attack shockwaves, impact shake, security hits, and the turn sweep.                                                                                                                                           |
| Camera   | `ArenaCameraRig.tsx`                        | Slow sway, pointer parallax, a lean toward the active side, and shake on impact.                                                                                                                                                                                                                               |
| DOM tilt | `arena3d.css`                               | Tilts the whole `.game-field` as one table plane (`perspective` on the board, `rotateX` on the field) and the viewer's eggs and raising pad on the same hinge. Adds 3D keyframes for summon, landing slam, knockback, wobble, effect channeling, candidate bobbing, hand tilt, draw flip, and the turn banner. |

## Environments

The player picks the scene behind the board. `ArenaEnvironment.ts` lists the options, and `ArenaScene.tsx` maps each value to its scene component. All options are abstract: gradients, lines, and a few low-poly shapes.

| Value    | Scene component              | Look                                                                                    |
| -------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `prism`  | `ArenaPrismEnvironment.tsx`  | Soft two-color gradient floor with 24 floating octahedrons, cubes, and rings (3 draws). |
| `grid`   | `ArenaGridEnvironment.tsx`   | The classic hex grid, crystal spires, motes, and the battlefield art plane.             |
| `halo`   | `ArenaHaloFloor.tsx`         | Flat floor with concentric dashed rings and spokes. Shader only, no props.              |
| `aurora` | `ArenaAuroraEnvironment.tsx` | Drifting duotone gradient floor with three large translucent shapes.                    |

Each environment sets its own background, fog, and lights, and has a light and a dark palette chosen from `colors.isLight`. Only `grid` shows the battlefield art.

### Ripples and the turn sweep

Every floor renders through `ArenaShaderFloor.tsx`. It owns the shader material and the shared uniforms: time, ripple slots, sweep, active side, and side colors. A floor shader starts with `ARENA_FLOOR_PRELUDE_GLSL` and calls `getArenaRipple(point)`. The call returns the ripple light in `rgb` and the wave strength in `a`, so each floor decides how a ripple looks on it. A new floor gets pulse feedback without touching `ArenaPulseLayer`.

Floor shaders other than `grid` write colors in sRGB and convert them with `toLinear`. They skip tone mapping, so pastel colors stay clean.

### Choosing an environment

- Storage: `arenaEnvironmentPreference.ts` keeps the choice in `localStorage` under `aegis.arena-environment` and exposes `useChoice` through `useSyncExternalStore`. The default is `grid`.
- Random: the `random` choice resolves per match in `resolveArenaEnvironment.ts`, hashed from the room id, so a reconnect keeps the same scene.
- Wiring: `useArenaBoardLook` (`game/arenaLook.ts`) resolves the environment, and `BoardStage` passes it to `ArenaBackdrop` and then `ArenaScene`.
- UI: `ArenaEnvironmentSettings.tsx` renders the picker in the match settings dialog (`ArenaLookDialog.tsx`). The Settings screen does not show it yet, because the 3D scene only exists during a match.

### Cost

Measured with a rAF counter in Chromium using software WebGL (SwiftShader), 1572×940, which exposes shader cost. Without WebGL the page holds 60 fps.

| Environment | fps  |
| ----------- | ---- |
| `grid`      | 14.6 |
| `prism`     | 14.5 |
| `halo`      | 14.2 |
| `aurora`    | 13.8 |

With hardware WebGL every environment holds the 60 fps vsync cap.

## How the pulses find their place

A pulse that belongs to a permanent carries the screen center of that permanent's element. The pulse layer casts a ray from the camera through that point onto the floor plane. The effect lands under the card on screen, even though the DOM tilt and the 3D camera do not share one projection.

## Colors

The board palette can hold `var()` references and modern color syntax. `resolveCssColor` reads the computed custom property and paints it on a 1×1 canvas to get a hex value that Three.js accepts. `useArenaSideColors` refreshes when the palette or the document theme changes. Light mode uses normal blending and turns bloom off, because bloom on a bright surface washes out the whole scene.

## One table plane

The field tilts as a single element. Tilting the battle zones and each pile column separately made each of them the containing block of its absolutely positioned children, so the battle rows resolved their offsets against the zones instead of the field. The viewer's deck and trash also sat below the hinge, so they came toward the camera and grew larger than every other pile.

The viewer's eggs and raising pad live in the player dock, outside the field. The dock keeps `transform-style: preserve-3d`, so the board perspective reaches the pad. The pad rotates around the field's bottom edge, which puts it on the same plane as the field.

Pile layers step straight down under the top card, so a stack reads as thickness on the table. The breeding dim extends past the field, because a tilted full-field overlay would cover only a trapezoid.

## Fallbacks

- No WebGL (including jsdom in unit tests): `ArenaBackdrop` renders nothing and runs no color or pulse hooks.
- Scene crash: `ClientErrorBoundary` with a `null` fallback keeps the match running. The board background turns transparent only while a canvas exists (`:has(> .arena-3d-scene canvas)`).
- Reduced motion: camera motion, shake, motes, and the CSS keyframes stop. The static tilt and the pulse glow stay.

## Known risks

- `isolation: isolate` on `.game-board` creates a stacking context. `redesignArena.css` records that this once buried landscape phone sheets under the sidebar strip. Check landscape phones before shipping.
- The tilt changes `getBoundingClientRect` results. Flights, arrows, and clash ghosts follow the projected boxes, so they stay close but not pixel exact.
- The scene renders every frame during a match. Measure GPU cost on low-end devices before shipping.
- The 3D keyframes replace `battle-card-enter` on the battle row. Pacing tests that measure that animation may need an update.
