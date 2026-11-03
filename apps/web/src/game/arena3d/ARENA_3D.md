# 3D match arena

The 3D arena is an optional board style. It draws the field, the piles, and the battle effects in a WebGL scene. The DOM board stays in place as an invisible interaction layer, so rules, input, and tests do not change.

The classic 2D board is the default. The 3D arena is experimental.

## Turn it on

| Where           | How                                                                             |
| --------------- | ------------------------------------------------------------------------------- |
| In a match      | Open the arena look dialog (`ArenaLookDialog.tsx`) and pick the 3D board style. |
| Settings screen | `screens/Settings.tsx` renders the same `BoardStyleSettings` control.           |
| Dev arena       | Open `/dev/arena?scenario=crowded&board=arena3d`.                               |

- `boardStylePreference.ts` stores the choice in `localStorage` under `aegis.board-style`. The default is `classic`.
- The dev URL calls `setStyle`, so the choice persists after you leave the page.
- `BoardStyleSettings` owns the whole board look section. With the 3D style chosen and WebGL working, it shows the environment and quality pickers. Otherwise it shows the classic board look (`design/ArenaLookSettings.tsx`: preview, battle lanes, and battlefield), because the 3D arena uses neither lanes nor battlefield art. It shows a note when WebGL is missing.
- The environment picker shows a still preview of each environment. `environmentPreview/ArenaEnvironmentPreviewRenderer.tsx` is lazy-loaded and renders the real scenes from `arenaEnvironmentScenes.ts`, one at a time, in a hidden 384×216 canvas at Medium quality. It saves each frame as a WebP image in `arenaEnvironmentPreviewStore.ts`, keyed by the side colors, so a theme change renders new previews. The canvas closes when all previews exist. Until then, or if WebGL fails, each tile shows its color swatch.
- `GameScreen.tsx` calls `useBoardStyle`. `resolveBoardStyle` returns `classic` when the preference is not 3D or WebGL is missing. Portrait screens use the 3D arena too; see [Responsive layout](#responsive-layout).

## Architecture

`BoardStage.tsx` sets `data-board-style` on `.game-board` and branches on it.

| Layer        | Files                                                                                | Job                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Board style  | `boardStyle/`                                                                        | Enum, stored preference, resolution rules, settings UI.                                                      |
| Field proxy  | `field/Arena3dField.tsx`, `field/Arena3dPositionedRow.tsx`, `field/arena3dField.css` | Measures the field, computes the camera frame, and places the DOM cards and piles where the 3D cards appear. |
| Shared store | `field/createArenaFieldStore.ts`                                                     | Holds the camera frame, row slots, and zone slots. The DOM field writes it; the canvas reads it.             |
| Board layer  | `field/Arena3dLayer.tsx`                                                             | Builds pulses, side colors, card data, and quality. Lazy-loads the scene inside an error boundary.           |
| Scene        | `field/Arena3dScene.tsx`                                                             | The `<Canvas>`: environment, card meshes, zone meshes, motions, pulses, camera, quality governor, bloom.     |
| Sync         | `field/ArenaLayoutSync.tsx`                                                          | Each frame, eases meshes toward their slots. Re-reads the DOM one frame after a DOM mutation.                |
| Meshes       | `meshes/`                                                                            | Card material, glow, shadow, permanent and zone meshes, highlight rims.                                      |
| Effects      | `effects/`, `useArenaPulses.ts`, `ArenaPulseLayer.tsx`                               | Card motions, floor pulses, camera impulses, post effects.                                                   |
| Card cues    | `cues/`                                                                              | Reads per-card cue state from the DOM proxies, hides the 2D decorations, and draws GL equivalents.           |
| Breeding     | `breeding/`                                                                          | Dims the board in GL during the breeding step and keeps the viewer's eggs and raising card lit.              |
| Quality      | `quality/`                                                                           | Tier metadata, device probe, automatic downgrades, context loss.                                             |
| Textures     | `design/webglCard/`                                                                  | Card size, face material, foil shader, texture cache. Shared with pack opening.                              |

In 3D mode `BoardStage`:

- renders `Arena3dLayer` as the first child of the board;
- wraps the pile columns, opponent row, memory band, and viewer row in `Arena3dField` instead of `BattleZones`;
- skips `FieldClashGhosts`, which stay classic-only;
- does not dock the viewer piles in the player dock;
- renders the viewer's eggs and raising area (`breedingDock`) inside `Arena3dField` on every layout, and passes no breeding dock to `PlayerDock`. The classic board keeps the dock in the player dock in landscape and in the field in portrait.

## Why the DOM proxies stay

`ViewerBattleRow` and `OpponentBattleRow` read `Arena3dFieldContext`. Inside it they render `Arena3dPositionedRow` and pass their own `PermanentView` `renderCard`. Each card sits in an absolute slot that matches the projected 3D card. `arena3dField.css` hides the card art, sources, links, and pile faces.

This keeps all existing behavior in one place:

- Clicks, drag, keyboard focus, `aria` labels, and `data-drop` targets.
- Context menus and effect focus.
- Pacing clocks and DOM animations. Mesh visibility and opacity copy the proxy's inline `visibility` and `opacity`.
- Highlight rims. `readArenaProxyRim` reads selected, threatened, attackable, candidate, offered, and effect classes from the proxy.
- Card cues. `readArenaProxyCue` reads effect, status, shake, landing, and summoning state from the proxy. See [Card cues in 3D](#card-cues-in-3d).
- Tests, which keep querying the DOM.

The canvas uses `pointer-events: none` and `aria-hidden`.

## World layout and camera

- `arenaWorldLayout.ts` holds the sizes every layout shares. `ArenaLayoutVariant.ts` holds the three world layouts (wide, short, tall). See [Responsive layout](#responsive-layout) for how one is chosen. The table lists the shared numbers and the wide layout (world units, viewer at +z).

| Constant        | Value                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------- |
| World bounds    | 16.8 x 9.7 (`halfWidth` 8.4, `halfDepth` 4.85)                                                      |
| Digimon lane    | depth 1.62                                                                                          |
| Support lane    | depth 3.62                                                                                          |
| Field cards     | one width for every card type: 1.2; 5 columns, 1.74 apart; overflow half width 6.1                  |
| Overflow gap    | 0.24                                                                                                |
| Pile card width | 1.12; a raising card is 1.2, the field card width                                                   |
| Security tiles  | tile width 0.8, step up to 0.3, stack depth up to 1.9                                               |
| Memory track    | 21 coins, spacing 0.54, radius 0.22, marker scale 1.3, at z = 0                                     |
| Viewer slots    | security (-7.75, 1.9), deck (7.75, 1.9), trash (7.75, 3.75), eggs (-7.75, 4), raising (-6.4, 4)     |
| Opponent slots  | deck (-7.75, -1.9), trash (-7.75, -3.75), security (7.75, -1.9), eggs (7.75, -4), raising (6.4, -4) |

- Each side's eggs and raising slots are point-symmetric: the viewer's sit at the bottom left, under the viewer's security stack, and the opponent's at the top right, above theirs. This follows the classic board, where the viewer's breeding area is at the bottom left near the security stack. In portrait they sit in the pile rows.
- The egg deck comes before the raising slot in reading order, as in the classic breeding dock (`BreedingDock.tsx`: eggs, then raising). On the wide and tall layouts the viewer's egg deck is on the outer side, left of the raising slot. On the short layout the two are stacked between the security stack and the first field column, so the egg deck is on top and the raising slot below it. The opponent's slots mirror the viewer's through the centre. `ArenaLayoutVariant.test.ts` checks the order on every layout. The first version had the raising slot on the outer side, which reversed the classic order.
- The egg pile sits 0.37 units below the security stack on the wide layout. The security stacks moved from z = ±2 to ±1.9, and the breeding slots from ±3.85 to ±4, so the security count badge clears the raising card's source badge on a 1024 x 768 screen. The world depth grew from 9.3 to 9.7 units to keep the raising card inside the fit rectangle; cards are about 4% smaller on height-bound screens.
- Digimon, Tamers, and Options use the same card size. Each side has two rows of 5 columns, a Digimon row and a support row, on the same x positions (`getArenaColumnX`).
- `computeArenaRowSlots` takes the lanes of the current layout and puts up to 5 cards on the columns, centered: the viewer starts at column `floor((5 - n) / 2)` and the opponent at the mirrored column, so the two sides are point-symmetric. Each slot records its `column`.
- A row falls back to a packed layout when it has more than 5 cards, or when sources, links, or suspended cards would overlap the next column. The packed layout keeps one card size for the whole row, reserves room for sources and links, and shrinks the row to fit the overflow half width. Packed slots have no `column`.
- Only the 3 evolution sources nearest the top card are drawn (`ARENA_VISIBLE_SOURCE_LIMIT`). The DOM source badge still shows the full count.
- `computeArenaCameraFrame` uses a 30° FOV and the pitch of the layout (62° wide and short, 66° tall). It binary-searches the camera distance until the world bounds fit the field rectangle, and recenters on the field each step.
- `Arena3dField` subtracts the opponent hand and opponent bar overlay from the top of the field before it fits the camera. `computeArenaFieldInsetTop` counts only visible overlays that start in the upper half of the field and caps the inset at 30% of the field height, so a tall overlay cannot collapse the fit rectangle. It re-measures with a `ResizeObserver`.
- `Arena3dField` measures in `useEffect`, not `useLayoutEffect`. In a real match the board and the field mount in the same commit, and React runs the child's layout effects before it attaches the parent's `ref`, so `board.current` is still `null`. The measurement then never ran, no frame was published, and the scene fell back to its default close-up camera with every DOM proxy hidden. Passive effects run after all refs are attached.
- `Arena3dField` sets `data-arena-layout` on `.arena-3d-field` and publishes CSS variables: `--arena-3d-<side>-<zone>-x/y` for every slot, `--arena-3d-<side>-<zone>-scale` for piles, `--arena-3d-<side>-security-w/h` for the security box, and `--arena-3d-band-x/y` and `--arena-3d-memory-width` for the memory band.
- Piles keep their classic DOM size and are scaled with the CSS `scale` property, so the count badge and the hit box shrink with the pile. The security box is sized directly to the tile stack. Inside the field, `--arena-pile-width` follows `--arena-field-pile-width`, the width `Arena3dField` divides by. The portrait CSS used to size piles to its own 44 px, so every portrait pile came out 22% larger than its GL card.
- A raising slot is scaled by `raisingWidth`, the width its DOM box really has, to the field card width. It used to be scaled by the pile width, so the raising card came out about 40% larger than a field card and touched the security stack on a 1024 x 768 screen.
- `Arena3dPositionedRow` squashes each card slot vertically with `scaleY` to the projected card depth, so the DOM hit box matches the foreshortened GL card. `measureArenaCardRect` projects the slot at `CARD_FLOOR_HEIGHT`, the height of the GL card, not the floor. Projecting at the floor put every DOM proxy about 1.5 px below its card.
- A suspended slot is the landscape footprint: 1.4 card widths wide and one card width deep. `arena3dField.css` makes the suspended `PermanentView` the same landscape box and shifts the rotated `CardMini` (and the hidden source slivers) by 0.2 widths so the turned face fills the box. The hit box, the keyword pills, the badges, and the summoning stars then follow the landscape card. Before this, the slot stayed portrait: the hit box missed the card's ends, and the keyword pills floated 0.2 widths above it.
- In 3D, the "By type" hand sort sits to the right of the hand tray on desktop, so it no longer covers the support lane.
- `ArenaLayoutSync` makes pile, security, and opponent raising meshes follow their DOM elements, projected onto the floor. Permanents ease toward their row slots. Reduced motion snaps them.
- `ArenaLayoutSync` never reads layout in the frame right after a DOM mutation (`shouldDeferArenaDomRead`). It reads the proxies one frame later, at most one frame late, and keeps the scene busy for 50 ms so that frame comes at once. It measures zone and canvas rectangles only when the camera frame or the board changes, when the canvas size changes, after a scroll or resize, or after a mutation that touches a zone element or the overlay's own styles (`isLayoutTarget`). The overlay's shake `translate` is ignored; its CSS variables are not. Zones have no CSS transitions, so their rectangles cannot change between those events.
- The DOM proxy follows its GL card. Each frame, `ArenaPermanentMesh` calls `followArenaProxy`, which projects the slot centre and the rendered top-card centre with the frame camera and writes the difference to the slot's CSS `translate`. The chips and the hit box therefore stay on the card while it eases to a new slot, lunges in an attack, or lifts for a cue. The slot's own `left` and `top` still jump to the target, so layout and tests see the final position.
- `SecurityShieldPile` wraps the shield in `.game-security-shield-wrap` while it shows an attack label or a security DP label, for example while the viewer aims an attack. Classic desktop CSS makes that wrapper `position: absolute` with a transform, so it becomes the shield's containing block. The 3D CSS therefore places the wrapper at the security slot and makes the shield inside it `position: relative`. Without that rule the shield's slot coordinates resolve against the zero-size wrapper, the shield lands off-screen, and the GL stack follows it out of view.
- `readArenaZoneRim` reads the security shield's `--selected`, `--armed`, and `--glow` classes into `field.zones`. `ArenaZoneMesh` recolors the tile frames and draws one glow around the whole stack.
- `Arena3dCameraRig` keeps the frame camera fixed. It adds only a brief impact shake (0.6 s), which moves the camera position and its target together, so the shake is a pure screen translation.
- The DOM overlay shakes with the camera. The rig projects the frame target with the live camera and passes the pixel offset to `store.shiftOverlay`, which writes it to the `.arena-3d-field` CSS `translate`. `ArenaLayoutSync` offsets the canvas rectangle by the same amount before it projects zone elements, and `Arena3dField` subtracts it before it measures, so a shake never feeds back into the zone meshes or the camera frame.
- The rig used to lean 0.2 units toward the active side and punch forward on impact. The lean is persistent, so the GL board slid about 23 px on every turn change (−9.4 px to +13.4 px at 1600 × 900) while the DOM chips stayed put. A forward punch is a zoom, which a CSS translate cannot follow. Both were removed; the floor and the active-side aura already show whose turn it is.

## Responsive layout

`Arena3dField` picks one world layout from `ArenaLayoutVariant` each time it measures the field (`selectArenaLayoutVariant`). The layout travels in the camera frame (`frame.layout`), so the DOM rows, the slot tiles, the aura, the memory track, and the zone meshes all read the same one.

| Layout | Chosen when                                                         | Typical screens                                 | Shape                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tall   | `portraitArena` (`(max-width: 1023px) and (orientation: portrait)`) | 390 x 844, 360 x 740, 768 x 1024                | Columns 1.5 apart, overflow half width 3.6. Lanes at 1.55 and 3.39. Both pile rows sit behind the support lanes at z = ±5.28: eggs, raising, security, deck, trash, point-symmetric. Pitch 66°. Classic 2D memory gauge. |
| Short  | not portrait, and the fit rectangle is 2.75 times wider than tall   | 844 x 390, 740 x 360, 1280 x 720                | Bounds 19.9 x 8.8. Lanes at 1.32 and 3.26. Piles closer to the center line. Each side's eggs (z = ±1.38) and raising slot (z = ±3.2) sit between its security stack and the first column (x = ±5.3).                     |
| Wide   | everything else                                                     | 1024 x 768, 1180 x 820, 1440 x 900, 1920 x 1080 | The desktop layout.                                                                                                                                                                                                      |

- The fit rectangle is the field minus the opponent overlay inset. The camera always fits the layout's bounds into it, so the binding axis decides the card size: width in tall, height in short.
- Short exists because a wide field is height-bound: compressing the lanes makes the cards about 9% larger on landscape phones and on 1280 x 720, where the dock leaves a 3.5 : 1 field.
- The tall center gap holds the classic 2D memory gauge: phase tag, bar, five-step labels, current-value bubble, and the 48 px end-turn orb. The lanes were at 1.22 and 3.06 (piles at ±4.95), sized for the half-scale 3D track. With the 2D gauge, the gap between the rows' chips and badges was only 25 to 30 px, so the labels and the bubble covered the viewer's source badges and the phase tag touched the opponent's row. The lanes moved out by 0.33 units, which gives 46 px on 360 x 740 and 59 px on 412 x 915. Phones up to about 760 px tall are height-bound in this layout, so their cards shrank: 360 x 740 from 48 to 44 px wide, 375 x 667 from 41 to 38 px, 360 x 640 from 41 to 40 px. Taller phones keep their card size. Below 760 px of viewport height, the bubble is also scaled to 0.8 so it clears the badges on 375 x 667. The tall gauge hides the 10 / 5 / 0 / 5 / 10 step labels and keeps only the number in the current-value bubble; players read the loose labels between the card rows as stray numbers.
- Tall replaces the classic portrait pile strips. The CSS hides the strip frames (`.game-field::before` and `::after`) when the field holds the 3D overlay.
- Every layout places the viewer's eggs and raising slots at their projected points. `Arena3dLayer` passes both raising permanents; `Arena3dScene` mounts a breeding mesh for each layout slot. The viewer's raising card is a GL card like the opponent's: face-up top card, up to 3 evolution sources, the side-colored frame and aura, and the DOM badges on its proxy. An empty raising slot shows the same DOM placeholder as the opponent's.
- The short layout grew from 8.4 to 8.8 units deep. On a 740 x 360 phone, the card at the viewer's near left corner (now the raising slot) is the largest on screen through perspective, and at 8.4 units it reached into the hand strip.
- The short layout first put the viewer's eggs and raising slot outside the security stack (x = -9.3), next to the left bound. On 844 x 390 and 740 x 360 the breeding pad and its halo touched the left edge of the canvas and met the hand cards. The slots moved to x = -5.3, between the security stack and the first column; the opponent's slots moved with them to stay point-symmetric.
- On the desktop breakpoint (`(min-width: 1024px) and (min-height: 760px)`), the hand tray gets an 18 rem left padding in 3D, equal to its right padding. The classic breeding dock used to take that space, so without it the hand slid left under the breeding slots.
- The breeding step dims the board in the GL scene and leaves the viewer's eggs and raising card lit. See [Breeding focus](#breeding-focus).
- The breeding hint is a panel placed from the projected slot variables (`--arena-3d-you-raising-*`, where `-w` is the projected card width):

| Layout | Hint placement                                                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tall   | Full width, above the raising slot.                                                                                                                   |
| Wide   | Above the raising slot, left-aligned with it, at most 2.4 raising widths wide. That space lies between the security stack and the first field column. |
| Short  | Right of the raising slot, bottom-aligned with it, at most 26 rem wide, in the small text size. It covers the near edge of the dimmed support row.    |

- The field effects anchor is clamped to the canvas, so the indicator stays on screen when the grid reaches the screen edge.
- Every card type keeps one size and each side keeps 5 + 5 columns in every layout.
- Card proxies are at least 38 px wide on 375 x 667 and 40 px on 360 x 640. Piles keep the classic 44 px minimum slot box, so their touch target is larger than the drawn pile.
- Proxies, badges, and cue overlays follow the GL cards through the same projection at every size and DPR. A rotation re-measures the field (`ResizeObserver` and `resize`), picks the new layout, and republishes the frame.
- Touch: the canvas has `pointer-events: none`, and field proxies set `touch-action: none`. In Chrome touch emulation, a touch drag from the hand reaches the 3D row drop target and plays the card, and a hit test at the centre of every proxy and pile finds the proxy, never the canvas. Touch attack and digivolve were not verified end to end.

## Breeding focus

During the breeding step the board dims and the viewer's egg deck and raising card stay lit. The GL scene dims the board; CSS filters dim the DOM that sits above the canvas.

### In the GL scene

`breeding/ArenaBreedingFocus.tsx` draws one transparent plane over the whole floor (160 x 160 units at y = 0.05). `BoardStage` passes `guards.breedingActionsOpen` as `breedingFocus` through `Arena3dLayer` to `Arena3dScene`.

- The plane uses `renderOrder` 20 and no depth test, so it draws after the floor, the aura, the cards, the cues, and the pulses, and darkens all of them.
- `buildArenaBreedingFocusMaterial` lights one rounded rectangle that bounds both slots, like a pad on the floor. The dim edge is crisp (0.05 units), so it reads as a frame and not as a blurred cut-out.
- The frame has a thin rim and a soft outer halo in the player's accent color (`colors.playerAccent`). A highlight travels around the rim. An inset outline marks the raising slot, so an empty slot still shows where the egg lands. The plane has no depth test, so the outline would paint over a raising card; `readArenaRaisingSocket` sets `uSocket` to 0 while the viewer's raising slot holds a card, and the outline is hidden. In the 3D scene, the DOM outlines on the hatchable egg pile and the raising box are hidden, except for `:focus-visible`.
- While the focus is on, the plane keeps `activity.pacedUntil` ahead, so the highlight moves at the paced frame rate. Reduced motion freezes the highlight.
- `computeArenaBreedingSpotlight` takes the slot centres from the current layout (`ArenaLayoutVariant`) and pads each card by 0.1 units. The lit area covers the egg pile and the raising card on every layout and stays clear of the security stack (`computeArenaBreedingSpotlight.test.ts`). On the short layout the test also keeps the pad and its 0.25-unit halo at least 1 unit inside the left bound, inside the near bound, and off the field columns, the memory track, and the security stack.
- The dim color is the classic `.game-breeding-mode` color (`#040912`) at 55%. On High, bloom renders the scene into a linear half-float target, so blending happens in linear light and 55% looks lighter. The plane then uses `1 - 0.45^2.2` (about 83%) instead. Sampled floor pixels match the classic dim to within a few levels on High and on the tiers without bloom.
- `stepArenaBreedingFocus` fades the dim in and out over 180 ms, the classic `--t-dialog-in`, and caps a frame gap at 1/30 s so an idle scene still shows the fade. While it fades, the plane keeps `activity.busyUntil` ahead, so the scene renders every frame. Reduced motion switches it at once.
- The plane is hidden while the dim is 0, so outside the breeding step it costs no draw call. During the step it adds 1 draw call. Its program is compiled at mount with the rest of the scene, so the first breeding step compiles nothing; it brings the board to 25 programs, the budget limit.

### In the DOM

`.game-breeding-mode` still renders inside `Arena3dField`. Under the canvas guard, `arena3dField.css` hides it with `display: none`. It stays in the DOM because the classic desktop rules lift the memory band with `:has(.game-breeding-mode)`, and the dim comes back as a plain DOM layer when the canvas is missing.

While it is present, these elements get `filter: brightness(0.38)`, the same factor as the GL dim:

| Element                                                    | Why                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `.game-opponent-bar`                                       | Opponent hand and top bar buttons.                                   |
| `.game-player-dock`                                        | Hand, player plate, hand sort, and the dock panel on phones.         |
| `.arena-3d-slot`                                           | Field card proxies: DP, level, and badges.                           |
| `.game-security-pile`                                      | Security count badge. Needs `!important` over the 3D `filter: none`. |
| `.game-utility-slot`, except the viewer's eggs and raising | Deck, trash, and the opponent's breeding piles.                      |
| `.game-field-effects`                                      | Field effect chips.                                                  |

- The viewer's eggs and raising proxies, the breeding hint, and the memory band (END BREEDING and the phase rail) keep full brightness and stay clickable. The classic board lifts the same memory band above its dim.
- A filter dims only the element's own pixels, so there is no seam where the DOM meets the canvas. A DOM layer over the hand would have dimmed the canvas a second time under it.
- The filters fade with the same 180 ms transition and switch at once under reduced motion.
- The first version cut the DOM layer open with a CSS mask: two plain rectangles with 12 px padding. It also dimmed the GL board through the DOM, so the cut showed as a hard 2D rectangle over the 3D floor.

The classic board is unchanged: it keeps the DOM `.game-breeding-mode` layer.

## Memory track

`memory/ArenaMemoryTrack.tsx` draws the memory gauge on the floor along z = 0 in three draw calls. The group is scaled on x and z by the layout's `memoryScale` (0.5 in the tall layout); the three vertex shaders apply `modelMatrix` for this.

| Mesh   | Material                         | Job                                                                                                                                                                      |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rail   | `buildArenaMemoryRailMaterial`   | Dark pill under the coins, with a border tinted toward each side.                                                                                                        |
| Coins  | `buildArenaMemoryCoinMaterial`   | One instanced quad per value from +10 to -10. A signed distance field draws the disc, bevel, and rim. Digits come from one canvas atlas (`createArenaMemoryDigitAtlas`). |
| Marker | `buildArenaMemoryMarkerMaterial` | Dashed ring, halo, and change ripple around the current value.                                                                                                           |

- The sign convention matches `MemoryGauge`: positive values belong to the viewer and sit on the left (`getArenaMemoryCoinX` returns `-value * spacing`). Viewer coins use the player color, opponent coins the opponent color, and zero is light.
- The marker position eases toward the new value, so the highlight slides across the coins it passes. Its color crossfades to the new side. A change also pushes a floor ripple and keeps the frame driver busy for 1.6 s.
- The memory prediction (`readouts.memoryPrediction`) shows as a pulsing ring on the predicted coin.
- `BoardStage` passes `memory` and `memoryPrediction` to `Arena3dLayer`, which passes them to the scene.
- The DOM `MemoryBand` stays in place as a proxy. Its track spans exactly the GL coins, with no padding or gaps, so each DOM coin sits over its GL coin. Under the canvas guard, the CSS hides the DOM coins, arc, and prediction marker. Without a canvas, the 2D gauge shows again.
- The phase rail sits left of the track and END TURN right of it, at every breakpoint. On phones in the tall layout END TURN is a 44 px round button; on short screens in the short layout it is a smaller pill. The phase pill inside the gauge is hidden in 3D because the rail replaces it.

## Card rendering and textures

- `buildArenaCardMaterial` draws rounded corners with a signed distance field and a thin frame (2.4% of the card width) with a dark hairline inside it. `ArenaPermanentMesh` tints the frame with the owner's side color. It skips tone mapping, so the card art keeps the colors of the printed card. A highlight recolors the frame with the rim color and pulses slowly (about 0.4 Hz).
- `buildArenaCardGlowMaterial` draws a crisp rounded outline just outside the card plus a soft halo. It uses normal blending in light mode, so the outline stays visible on a light floor. In light mode (`uLight`), it also deepens the color and makes the ambient halo 2.2 times stronger, so the aura still shows on a light floor. `uOutline` switches the outline off for the ambient aura and widens the halo.
- Ambient aura: every field card, pile, and security stack shows a faint halo in its side color. `applyArenaCardGlow` chooses between the highlight and the aura, so a highlight (selected, attackable, candidate, effect source) always replaces the aura with its outline and full strength.
- The ambient aura moves. `buildArenaCardGlowMaterial` drives it with fbm noise sampled along the direction from the card centre, so wisps drift outward and swirl slowly around the card with no seam. The wisps also stretch the halo reach, and a fine value-noise grain gives it texture. Each card takes a seed from its world position, so neighbours do not move in step. Highlights (`uOutline`) skip the noise. Reduced motion freezes it (`uFlow`).
- `getArenaAuraTarget` returns 0.1 at rest and 0.18 for the active side's cards, with a slow breath (about 10 s, 15% deep). Each mesh eases toward the target, so a turn change fades the aura across in about a second. Piles and security use 60% of that strength. Reduced motion removes the breath.
- Textures without art show a flat dark card with a soft vertical gradient.
- Sigils lie flat at y = 0.012, under the slot tiles (0.022) and the cards (0.04), so they never draw across a card.

### DOM overlays in 3D

`field/arena3dCardOverlay.css`, imported by `Arena3dPositionedRow`, styles the proxies under the `:has(> .arena-3d-scene canvas)` guard only. The classic board keeps its look.

| Overlay                                                              | In 3D                                                                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Field reference (`#0-field-3`)                                       | Visually hidden. It stays in the accessibility tree and in the aria label.                                             |
| Play cost, dual chip, card name, footer gradient                     | Hidden. The printed card shows them.                                                                                   |
| DP chip, level chip                                                  | Dark glass chips, kept readable.                                                                                       |
| Badges (sources, copies, ACE, blocker, fate, keywords, restrictions) | Kept. They and the chips are counter-scaled by `--arena-3d-squash`, so the slot squash does not flatten their text.    |
| Selection lift (`translateY(-6px)`)                                  | Removed, so chips stay on the GL card.                                                                                 |
| Suspended DP chip and level chip                                     | Counter-rotated by −90° so the text stays upright, and pinned to the bottom-right and top-right of the landscape card. |
| Suspended ACE, source, and copies badges                             | Reset to their upright offsets, because the proxy box is already landscape.                                            |
| Suspend rotation transition on the main `CardMini`                   | Removed with a canvas. The GL card eases its own yaw, and the chips no longer spin sideways during the turn.           |
| Drag-intent outline on rows and permanents                           | Removed. The GL slot tiles and rims show it.                                                                           |
| Empty-row label                                                      | Hidden. Empty slot tiles show the board.                                                                               |

`CardMini` exposes `data-card-info`, `data-card-level`, `data-card-dp`, `data-card-name`, and `data-card-footer` for these selectors.

## Card cues in 3D

The match presentation decorates field cards with DOM cues: effect focus, activation light, status pulses, claws, particles, and outlines. Over a WebGL card these read as flat 2D stickers. The 3D arena handles every per-card cue the same way, in two halves.

### 1. One CSS layer hides the DOM decoration

`cues/arena3dCueOverlay.css`, imported by `Arena3dLayer`, applies only under `.game-board[data-board-style="arena3d"]:has(> .arena-3d-scene canvas)`. The classic board and the no-WebGL fallback keep their look.

The rules never use `display: none` and never remove an animation. They set `opacity: 0`, `filter: none`, `translate: none`, or `scale: none` with `!important`, which wins over animated values while the animation keeps running. The presentation queue waits on these named animations (`paintedAnimationClock.ts`, `combatImpactClock.ts`, `fieldShatter.ts`, and others). With `display: none`, `getAnimations()` would return nothing and the queue would stop waiting, which would shorten narration.

### 2. The scene draws GL equivalents from the same state

One frame after each DOM mutation, `ArenaLayoutSync` reads a typed `ArenaCardCue` from each proxy (`readArenaProxyCue`) and stores it with a timeline of rising edges (`advanceArenaCardCueState`) on the tracked permanent. It also reads the effect focus source (`.game-effect-focus[data-source-permanent-id]`) into `field.focus`, eased by `easeArenaFocus`, and matches targeting spotlight rings to proxies and the security stack (`findArenaSpotlightCenters`, `isArenaElementOffered`).

| DOM cue                                              | Source of state                                              | 3D result                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EffectFocus` shade, outline, and activation light   | `.game-effect-focus[data-source-permanent-id]`               | Hidden. `ArenaCardCueLayer` dims the floor around the source with one spotlight plane; other cards get a lower `uShade`. The hand dims too.                                                                                                                                                     |
| `game-permanent--effect-source` glow                 | Class on the proxy                                           | Hidden. Card lifts 0.2 units, flashes once (`uFlash`, 0.42 s), and gets the violet rim, a card-shaped floor glow with a light running along its edge, and a soft light prism.                                                                                                                   |
| `game-permanent--effect-linked` halo                 | Class on the proxy                                           | Hidden. Lower lift (0.1), dimmer glow and prism, linked rim, for as long as the clause shows.                                                                                                                                                                                                   |
| Freeze, buff, debuff pulses                          | `game-permanent-freeze`, `-buff`, `-debuff`                  | Hidden. Card frame takes the tint colour for 0.7 s and a tint outline grows from the card edge on the floor.                                                                                                                                                                                    |
| DP pulse particles and the emphasized red box        | `.game-dp-pulse`, `--debuff`, `--debuffFatal`                | Hidden, as a buff or debuff tint. The changed figure stays as a dark glass chip.                                                                                                                                                                                                                |
| `game-permanent--threatened` outline                 | Class on the proxy                                           | Hidden. The threatened rim already shows on the GL card.                                                                                                                                                                                                                                        |
| `game-permanent--candidate` outline                  | Class on the proxy                                           | Hidden. Candidate and attackable rims show on the GL card.                                                                                                                                                                                                                                      |
| `TargetingSpotlight` rings                           | Ring centres inside a proxy or the security stack            | Hidden. The offered rim (`ArenaRim.OFFERED`) shows on the card or the security stack.                                                                                                                                                                                                           |
| Shake and combat impact jitter                       | `game-permanent-shake`, art translate                        | Hidden. The GL card jitters for 0.3 s, decaying. Combat impacts also get the existing knockback.                                                                                                                                                                                                |
| Landing bounce, `CardBurst` particle light, sparkles | `.game-card-landing`, `.battle-burst`, `.game-card-sparkles` | Hidden. The card materializes: the art builds upward from digital cells behind a cyan scan line (0.42 s), a light sweeps across the face (0.26 s), light swirls in onto the card outline (0.6 s), and the card settles from 0.34 units.                                                         |
| Summoning ring stars                                 | `.game-summoning-ring`                                       | Kept. The gold stars orbit an ellipse across the top edge of the card (`top: -8%`, 30% of the proxy height), so the slot squash flattens the orbit like the GL card. A "z" chip at the top-left corner was tried first; it covered the printed play cost and players read it as a stray letter. |
| `ClawSlash`                                          | `.game-claw`                                                 | Hidden. The existing impact burst and knockback carry the hit.                                                                                                                                                                                                                                  |
| Field deletion shatter (`BoardBurstLayer`)           | `deleteBursts`                                               | Hidden. `ArenaCardDepartures` lifts a GL copy of the departed card at its slot, brightens it, then turns and shrinks it away in 0.5 s. `useArenaPulses` also emits a `DELETE` pulse there for the ring and shards.                                                                              |
| Trash activation pile outline                        | `.game-pile--effect-source`                                  | Outline hidden.                                                                                                                                                                                                                                                                                 |

`applyArenaCardCue` adds the lift, flash, and jitter to the card's motion sample and returns the shade and tint for `ArenaPermanentMesh`. `collectArenaCueDecals` turns cue states into floor decals and prisms. Every decal follows the card's rounded-rectangle outline through a signed distance in `buildArenaCueDecalMaterial`; none is a plain circle. `buildArenaCardMaterial` has a `uMaterialize` uniform: 0 to 1 builds the card, 1 to 1.6 sweeps light across it, and 1.6 is the resting card. `ArenaCardDepartures` starts each departure on its first rendered frame, so a canvas remount (for example a quality downgrade) cannot skip it. `ArenaCardCueLayer` draws the decals in three draw calls: one instanced decal mesh (up to 48), one instanced prism mesh (up to 12), and one spotlight plane. `resolveArenaCuePace` sets the frame rate the layer asks for (`ArenaCuePace`):

| Pace       | When                                                                                                                 | Frame rate                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Transition | A cue rises, flashes, tints, shakes, or lands (`ARENA_CUE_TIMING` windows), or the effect focus fades                | the tier's frame rate (`activity.busyUntil`)       |
| Settled    | A channel cue (source or linked) is lit and nothing changes; its edge light and light column still move with `uTime` | the tier's frame rate (`activity.pacedUntil`)      |
| Idle       | No lit cue, or reduced motion once the focus has settled                                                             | the tier's frame rate; 10 fps under reduced motion |

The paces only matter under reduced motion, where a still scene drops to 10 fps. With motion on, the scene always renders at the tier's steady frame rate (see [Steady cadence](#steady-cadence)), so a cue starting or settling never changes the cadence.

Text the player reads stays visible: DP and level chips, the DP change figure, keyword, restriction, fate, blocker, source, and copy badges.

Calm rules: lifts are 0.1 to 0.2 units, the flash peaks at 0.3, the spotlight dims to about 50% (26% in light mode), and the column is soft and slow. Under reduced motion there is no lift, flash, jitter, dust, or ring rotation; the spotlight and tints are steady.

### Left in 2D

- Centre-screen showcases, the security clash, flights, draw presentations, and hand focus. They are not on a field card.
- The hatch burst on the viewer's raising slot, which stays DOM. The circular hatch vignette behind the egg is hidden in 3D. The breeding transfer flight clones the raising proxy, so it starts from the projected slot on every layout.
- The De-Digivolve strip peel and the trash activation card, which show which card moved.

## Slot tiles and field effects

`slots/ArenaSlotTiles.tsx` draws every slot on the floor in one instanced mesh (one draw call, up to 64 tiles).

- `computeArenaSlotTiles` returns 5 tiles per Digimon row and 5 per support row while the cards sit on columns. A packed row gets one tile per card, plus spare tiles up to 5 when they fit. All tiles in a row have the same size.
- `ArenaSlotTileKind` marks a tile as empty, occupied, or security. Occupied tiles are a little brighter. Each security stack sits on one plate sized to the full security depth.
- Tiles mix the side color with cyan. They use additive blending in dark mode and normal blending in light mode.
- Drop target: `ArenaLayoutSync` reads `data-drag-intent="play"` from each row proxy into `field.playDropSides`. That side's empty tiles fade to mint within about 0.1 s and breathe gently while the drag lasts.
- Active side: its tiles are slightly brighter.
- Field effects: `BoardStage` passes `readFieldEffects(...)` for each player to `Arena3dLayer`. `summarizeArenaFieldEffects` reduces them to a tone (`ArenaFieldEffectTone`: none, helpful, or harmful), one mark per effect, and a signature for memoization. An effect is harmful when `isHarmfulFieldEffect` says so: a restriction, or a DP change below 0. The DOM `FieldEffectsIndicator` uses the same rule for its warning chip. A side with any harmful effect is harmful; otherwise any effect makes it helpful. That side's tiles take the tone color (`ArenaFieldEffectTone.color`). The tint fades in over about 1 s and pulses slowly (period about 6 s). The last tone stays while the tint fades out.
- Field effect aura: see [Field effect aura](#field-effect-aura).
- The DOM `FieldEffectsIndicator` stays the source of details. In 3D, `Arena3dPositionedRow` renders a `data-field-effects-anchor` element beside the slot grid (right of the viewer's Digimon row, left of the opponent's), and the indicator measures that anchor instead of the whole row. Without the anchor, as on the classic board, it measures the row as before.
- Reduced motion freezes the pulses.
- `ArenaPermanentMesh` stacks the top card, evolution sources, and linked cards, with a glow and a shadow plane. `ArenaZoneMesh` stacks layers for piles and security.
- `createCardTextureCache` is a reference-counted cache. It evicts idle textures, oldest first, when the byte total passes the tier budget.
- `loadCardBitmapTexture` fetches the image and downscales it with `createImageBitmap` to the tier width. It falls back to a 2D canvas when `createImageBitmap` fails.
- `useCardTexture` retains and releases textures for a mesh. It keys its loaded texture by the cache too. When a tier change replaces the cache, the old cache closes its bitmaps; returning the old texture then made WebGL upload a detached `ImageBitmap` (`texSubImage2D: The source data has been detached`, `glTexStorage2D: One or more image dimensions are not positive`).

## Effects and motions

- `useArenaPulses` turns match cues into pulses: summon, evolve, delete, attack, impact, security, draw, trash, and turn. It anchors each pulse at the center of the DOM proxy or pile. `ArenaPulseLayer` projects the point onto the floor with the frame camera and drives ripples, camera impulses, and energy.
- `ArenaMotionDirector` maps pulses to card motions from `ArenaCardMotionKind`:

| Pulse  | Motion                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| Attack | Attacker lunges toward the target. The target is knocked back. Without a target, the lunge is capped at 2.6 units. |
| Impact | Knockback away from the owner.                                                                                     |
| Evolve | Evolve: lift, scale, flash.                                                                                        |
| Summon | Short settle from 0.34 units while the card materializes. The summon pulse has no ring, pillar, or ripple.         |
| Delete | Tilt and sink.                                                                                                     |
| Turn   | Staggered hop for the active side's cards.                                                                         |
| Finale | Slow-motion lunge into the loser's security stack (`FINALE_LUNGE`); the loser's cards recoil at the impact.        |

- `createArenaCardMotionRegistry` samples keyframes with smoothstep easing and reports when motions are busy.
- `ArenaFrameDriver` renders every frame itself at one steady frame rate per tier (60 or 30 fps). Effects do not change the rate. See [Steady cadence](#steady-cadence). Pulses, cue transitions, the memory marker, and `ArenaLayoutSync` still mark the scene busy (`activity.busyUntil`) and settled cues mark it paced (`activity.pacedUntil`); the driver reads these marks only under reduced motion, to wake a still scene.
- `ArenaPostEffects` adds bloom and a vignette on High only.
- Security renders as a stack of landscape tiles in `ArenaZoneMesh`. The step between tiles shrinks so the stack never exceeds the security depth.
- Impact and delete shards use `shardCount` from the quality tier. Each effect draws its shards as one instanced mesh.
- Pulse meshes share the geometries in `effects/arenaPulseGeometry.ts` and scale them, so an effect allocates no geometry. Each effect creates only the materials it draws.
- `ArenaPulseLayer` keeps one hidden mesh per effect shader (`PulseShaderKeepers`), so three.js never releases those programs between effects. `ArenaShaderWarmup` compiles the whole scene, hidden meshes included, two frames after mount with `compileAsync`. See [Burst effects](#burst-effects).

### Calm motion

Effects aim for clean, readable impacts, not fireworks:

- Card motions in `ArenaCardMotionKind.ts` use small lifts (0.16 to 0.75 units, 0.34 for the arrival settle) and scales of 1.1 at most. Evolve lifts and scales the card with a gentle flash, without spinning. The turn hop lifts 0.16 units.
- The lunge reaches 62% of the way to its target, or 1.8 units without one. Knockback travels 0.55 units.
- `ArenaPulseKind.ts` pillars, rings, durations, and camera shake are about half of the first version. The impact burst is 3.6 units wide and lasts 0.55 s. The camera keeps only the shake; there is no punch or side lean.
- Floor ripples last 1.6 s, travel slower, and are dimmer. The turn sweep is dimmer and barely moves the floor.

### Match finale

The blow that wins a match on security plays a short finale before the result screen. The match layer detects it and drives both boards; see [the match finale in ANIMATIONS.md](../ANIMATIONS.md#match-finale). In 3D, `BoardStage` passes `cues.finale` and its tone to `Arena3dLayer`, and `useArenaPulses` emits one `FINALE` pulse: from the attacker's proxy to the loser's security stack, on the winner's side, in the tone color (victory gold, defeat red-violet, spectator slate).

| Time (`FINALE_IMPACT_AT_MS` = 520 ms) | 3D                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 to 520 ms                           | `ArenaMotionDirector` plays `FINALE_LUNGE` (1.25 s): the attacker winds back and rises for 0.2 s, creeps forward in slow motion, then strikes 74% of the way to the security stack at 520 ms with a 1.14 scale and a short flash.                                                                                |
| 520 ms                                | `ArenaPulseLayer` (`startFinale`): a burst 2.2 times the impact burst, three times the tier's shards, a 3.6-unit pillar, a 6.4-unit shockwave ring, a security-sized echo ring 140 ms later, three floor ripples (1.5, 1, 0.6) and a 0.26 camera shake. The loser's cards recoil 0.7 units away from the impact. |
| 520 ms to about 2.6 s                 | `ArenaActiveSideAura` surges on the winner's side: the region and its swells brighten, the shimmer triples (`uSurge`), and a double crest line rolls in from the baseline at 8 units per second (`uSurgeStart`), then decays.                                                                                    |

- The DOM finale layer (`overlay/match/MatchFinaleLayer.tsx`) adds the flash, the chromatic rings, and the vignette on top of the canvas. It also scales `.game-board > .arena-3d-scene` and `.game-field` together about the security stack (up to 1.095, `battle-finale-punch`), so the GL board and the DOM proxies zoom as one image. A camera move would have left the DOM chips behind (see [World layout and camera](#world-layout-and-camera)). The DOM burst and shockwave are hidden in 3D; the GL burst, ring, and ripples replace them.
- No new shader program: the finale reuses the ring, pillar, burst, and shard materials with new parameters (`burstScale`, `shardScale`, `calm` on the active effect), and the aura gains two uniforms in its existing program. The program count stays at 25.
- Reduced motion: no lunge, recoil, shake, burst, shards, pillar, or surge crest. The finale is one soft ring and ripple at the security stack and a calm aura brightening (45%).

## Environments

`ArenaEnvironment.ts` lists `hologram`, `prism`, `grid`, `halo`, and `aurora`. Hologram is the default. `arenaEnvironmentPreference.ts` stores the choice under `aegis.arena-environment`, including a random option. `ArenaHologramFloor` is mostly static: no flowing bands, breathing wave, rotating ring, or moving ticks. On Medium and High a small vertex wave follows ripples only.

### Field effect aura

`fieldEffects/ArenaFieldEffectAura.tsx` shows each side's field effects on the floor, whoever's turn it is. It is separate from the active-side aura: that aura shows only on the active side, so it cannot carry a lasting effect.

- Layout: one transparent plane per side at y = 0.008 with `renderOrder` -4. It draws above the active-side aura (-5) and below the slot tiles. Each plane covers that side's slot grid (`measureArenaSlotGrid`, which the active-side aura also uses) plus 1.6 units. The frame is the grid plus 0.18 units, with a 0.4-unit corner radius. The layer fades out toward the center line and toward the canvas edges (the layout's `aura.screenFadeX`).
- One program (`buildFieldEffectAuraMaterial`) serves both sides. Each plane is hidden while its weight is below 0.001 and no arrival is running, so a field with no effects costs no fragments.
- Colors come from `ArenaFieldEffectTone`:

| Tone    | Dark mode | Light mode | Dark-mode blending |
| ------- | --------- | ---------- | ------------------ |
| Helpful | `#ffc94d` | `#c98000`  | Additive           |
| Harmful | `#ff3352` | `#a3102a`  | Normal             |

- Helpful (a warm glow that gives off energy): a thin gold rim around the grid with a soft halo and a faint fill. Two bright highlights circle the rim in opposite positions, about one turn every 9 s. Soft ripples roll outward from the inside toward the rim.
- Harmful (a dark, pressing look): a red rim that beats like a heart, two beats every 2.4 s. The inside darkens with drifting fbm smoke (a sine pattern on Low, where `floorEnergy` is off). Ripples roll inward. In dark mode, harmful uses normal blending with a dark crimson fill (22% of the tone color), so it darkens the floor and does not read as one more pink glow on the default palette.
- Arrival: when a side gains an effect, `findArenaFieldEffectArrival` compares the marks as multisets, so a second copy of the same effect also counts. A harmful arrival wins over a helpful one. The arrival lasts 1.3 s (`arenaFieldEffectAuraTiming`): the strength rises in 0.08 s, then decays with a squared curve (`getArenaFieldEffectArrivalStrength`). A ring travels for 0.9 s with a cubic ease-out (`getArenaFieldEffectArrivalProgress`). A helpful ring grows from the grid center out past the rim. A harmful ring closes in from outside the rim toward the center. The rim and the fill also flash. The arrival uses its own color, so a helpful arrival on a harmful field still flashes gold.
- The first set of effects after mount gets no arrival. It only fades in, so a reconnect does not replay effects that already exist.
- Fades: the weight rises at rate 5 and falls at rate 2.4 (`stepArenaFieldEffectWeight`), so an ending effect fades out in about 1 s.
- Reduced motion: no arrival, and the highlights, heartbeat, ripples, and smoke drift stop. What remains is a still tint: the rim, the halo, and the fill.
- Cost: one more shader program (24 to 25 at mount). `ArenaShaderWarmup` draws the hidden planes once, so the first field effect compiles nothing. Also up to two planes only while effects are active. The rim, ripple, and heartbeat use a few `exp` and `sin` calls. The smoke is a 3-octave fbm on harmful sides only, on Medium and High. No per-frame allocations beyond the small parameter objects the aura already uses.
- Verified with a Playwright script in `.local/field-effects/` that patches the served `Arena3dLayer` to inject effects into the crowded demo, at 1440 x 900 and Pixel 7, in dark and light mode, and with reduced motion on Low.

### Active-side aura

The active side's field glows with a soft energy wave, like the turn wash in Digimon Alysion. `ArenaActiveSideAura` draws it as its own layer, so it works on every environment. `Arena3dScene` mounts it once, after the environment scene.

- The layer is two transparent half planes, one per side, at y = 0.004 with `renderOrder` -5. Each plane covers that side of the layout's world bounds plus 0.5 units (`frame.layout.bounds`), so it shrinks to about 9 x 6.75 units in the tall layout. It draws after the floor (`ArenaShaderFloor`: no depth write, `renderOrder` -10) and before the sigils (y = 0.012), the slot tiles (y = 0.022, `renderOrder` 1), the card shadows (`renderOrder` -1), and the cards. It writes no depth.
- The region is centered on that side's 2 x 5 slot grid, derived from the layout's lanes through the `uHalfSize` and `uCenterDepth` uniforms (grid plus 1.5 units on x and 0.55 units on z, corner radius 2.4). Outside it the strength falls off as a gaussian over about 2 units, and its outer edge sways slowly.
- Three fades keep every edge soft. Each one uses `smoothstep`, so the strength reaches zero with a flat slope and never shows a line:
  - toward the center line over 2 units, so the other side stays calm;
  - toward the plane edge (bounds plus 0.5) over 1.4 units, with rounded corners;
  - toward the canvas edge over the outer 12% (x) and 10% (y) of clip space.
- Why the bounds fade: the camera fits the layout's bounds into the field rectangle, so the binding axis ends exactly at the field edge. Before, the region and its tail were sized only from the grid, with a fixed 22 x 7.5 plane and an arena-radius fade. In the tall layout the grid plus margin (±5.1 units) is wider than the visible floor (±3.95), so the aura met the screen sides and the opponent header bar at nearly full strength, which read as straight cuts. In the short and wide layouts the tail ran past the floor rim and the top of the canvas. Fading to the bounds and to the canvas edges fixes both at every size.
- `buildActiveSideAuraMaterial.ts` owns the shader. Both sides share one program (the same source), so the aura adds no program.
- A "shore" factor lowers the strength to 72% near the center line, so the glow is strongest at the player's baseline.
- Motion is a wave that rolls in from the player's baseline toward the center line, in one shader pass. `inward` is the distance from the baseline (`uBounds.y - depth`):
  - a warp field bends every layer: one slow sine across the board plus, on Medium and High (`floorEnergy`), one large value-noise cell; Low uses a second sine instead of the noise;
  - three swell layers (about 4.7, 2.7, and 9 units long) roll inward at different speeds. Each is a cubed sine, so it has a narrow crest and a wide trough. They add 0 to 0.68 to the strength;
  - a caustic shimmer: two crossing sines whose zero lines form thin bright ridges. The swells displace its coordinates, so the ridges bend like refraction. It is strongest on the swell crests;
  - soft scanlines every 0.3 units drift inward at 0.25 lines per second. They fade out when a line gets closer than about 2 pixels (`fwidth`), so they never alias or shimmer on small screens;
  - a crest line (gaussian, width 0.2) rolls in every 5.2 s at 1.6 units per second, with a 0.8-unit glow and a short wake, and fades out before the center line. At the 10 fps idle rate it moves less than its own width per frame, so it does not step;
  - the shimmer and scanlines run only where the strength is above 0.03, which skips the faint tail.
- Crest highlights mix toward the side's accent color (`playerAccent` or `opponentAccent`), lifted 18% toward white in dark mode and 50% in light mode, so a crest reads as a sheen and not a dark smear on the light floor. Light mode also draws highlights at 70% strength.
- Each layout carries `aura` tuning: strength, center fade, bounds fade, and the horizontal screen fade. Wide and short use 1, 2, 1.4, and 0.12. The tall phone layout uses 1.5, 0.9, 0.7, and 0.05: its board is so narrow that the default fades covered most of it and the wave was barely visible.
- The tall phone layout uses a wash instead (`aura.wash`, `uWash`). Broad bands, noise, and scanlines read as pink smudges on a 384 px board. The wash has two parts. A soft glow pool sits over the player's field rows (a gaussian around the slot grid), plus a faint rise toward the baseline. Small sparks drift from the baseline toward the center line: a 0.7-unit cell grid with about 60% of cells lit, a random offset per cell, a fade in and out, and a twinkle. Earlier versions with ribbons, chevrons, a sweeping light band, and expanding ripples were rejected in review. The sweep and the finale surge still apply. Dark mode adds the sparks in the accent color lifted toward white. Light mode draws them in the side color mixed with the accent, with alpha up to 0.92, so they stay crisp on the light floor. Reduced motion keeps only the glow pool.
- The tall phone layout does not mount `ArenaMemoryTrack`. It shows the classic 2D memory gauge instead (phase tag, segmented bar, current-value bubble, and end-turn orb). The 3D track keeps coin 0 at the board center, so on a 384 px phone the phase pill and the orb beside it capped it at about 250 px, and a fixed scale overflowed where the camera fits closer. The arena gauge overrides in `arena3dField.css` are scoped to `:not([data-arena-layout="tall"])`. The tall band only keeps its position on the center line, inset 0.5 rem from each edge. A turn tag beside a shifted 3D track and an end-turn control in the player bar were both tried first and rejected in review.
- The base strength is 0.3. The average strength stays close to the earlier tint, so the aura is no stronger, only more structured.
- The side color is muted before use: it moves 35% (dark) or 40% (light) toward its own grey, then 20% (dark) or 12% (light) toward the floor tone (`colors.surface`).
- Dark mode adds the muted color at 0.24 strength with additive blending, so it reads as a calm glow. Light mode uses normal blending with alpha up to 0.5. On screen it reads as a soft tint, not a solid patch. `colors.isLight` picks the mode.
- Turn change is a sweep. When a side's target changes, `uActive` flips and `uSweepStart` records the time. A front then runs from the baseline toward the center line at 6.5 units per second, with a 1.8-unit soft edge and a thin bright line on it. On the new active side the region fills in behind the front; on the old side it drains away ahead of it, toward the center. The first crest line follows the sweep.
- Each side also has a weight: it rises fast (rate 6) and falls slowly (rate 1.2). A side's half plane is hidden once its weight drops below 0.001, or 2.2 s after it turned inactive, when the sweep has cleared it. A side's glow is already zero on the other half (center-line fade), so the split changes no pixels and skips about half of the aura's fragments at rest.
- Every tier draws the wave. Low skips only the noise warp. Reduced motion freezes the swells, shimmer, and scanlines, hides the crest line, and makes the sweep instant.
- The floors no longer draw the region. `ArenaHologramFloor` keeps only its base look. The other floors keep their own small active-side accents.
- The sigils turn very slowly. The hologram environment shows only a sparse, slow set of 40 motes, and only on High; other environments still use the tier mote count.

## Quality tiers

The quality choice is stored under `aegis.arena-3d-quality`. The default is `auto`.

| Tier   | Max DPR | Antialias | Frame rate | Texture width | Texture budget | Floor wave | Floor energy | Bloom | Motes | Shards |
| ------ | ------- | --------- | ---------- | ------------- | -------------- | ---------- | ------------ | ----- | ----- | ------ |
| Low    | 1       | No        | 30         | 384 px        | 48 MB          | No         | No           | No    | 0     | 3      |
| Medium | 1.5     | Yes       | 60         | 512 px        | 96 MB          | Yes        | Yes          | No    | 140   | 5      |
| High   | 2       | Yes       | 60         | 768 px        | 160 MB         | Yes        | Yes          | Yes   | 260   | 8      |

These are the desktop budgets. Phones and tablets use the touch budgets below. "Frame rate" is the steady target for idle and animated frames alike; see [Steady cadence](#steady-cadence).

### Touch budgets

`getArena3dDeviceClass` sorts the device into `Arena3dDeviceClass`: desktop, tablet, or phone. A device whose primary pointer is coarse and whose short screen side is under 600 CSS px is a phone, even when `(any-pointer: fine)` matches: Samsung phones with S Pen support report a fine pointer, so they used to get desktop budgets and render at DPR 2 on a 2.8 screen. A larger coarse-pointer device is a tablet when it has no fine pointer at all. A touch laptop or an iPad with a trackpad counts as a desktop.

`resolveArena3dQuality` swaps every tier for its entry in `ARENA_3D_TOUCH_QUALITY` on a phone or tablet, for both `auto` and a tier the player picked. The entries are module constants, so the memoized scene keeps the same `quality` object between renders.

| Tier   | Max DPR | Antialias | Frame rate | Texture width | Texture budget | Floor segments | Floor wave | Bloom | Shards |
| ------ | ------- | --------- | ---------- | ------------- | -------------- | -------------- | ---------- | ----- | ------ |
| Low    | 1.5     | No        | 30         | 384 px        | 32 MB          | 1 (2 tris)     | No         | No    | 3      |
| Medium | 2       | No        | 60         | 512 px        | 64 MB          | 64 (8,192)     | Yes        | No    | 4      |
| High   | 3       | Yes       | 60         | 768 px        | 112 MB         | 96 (18,432)    | Yes        | Yes   | 6      |

- Touch High is never probed; only a player who picks it gets it. It renders at native density (up to DPR 3) and 60 fps. At DPR 2 on a DPR 2.6 to 3 phone the canvas was upscaled, which blurred the cards, and 30 fps made attack and delete motion step visibly. The governor still halves to 30 when the device misses frames.
- Desktop Low renders at DPR 1. On a DPR 3 phone that is a third of the native resolution, so touch Low uses 1.5 instead. Fill cost is still about a quarter of native.
- Touch Medium has no MSAA. At DPR 2 the edges are already fine, the card and floor shaders antialias their own edges, and MSAA costs bandwidth on tile-based mobile GPUs. Low and Medium then share the same antialias setting, so an automatic downgrade from Medium to Low keeps the canvas and its GL context.
- The desktop High floor is 160 x 160 segments (51,200 triangles) over a 90 x 90 plane, for a 0.12-unit vertex wave. Touch tiers use 64 or 96 segments.
- iOS Safari kills a tab at a few hundred MB in total. The touch budgets stay below that with room for the page. The crowded board holds 25 textures: about 25 MB at 384 px and 45 MB at 512 px, so neither tier evicts a held texture.
- `createCardTextureCache` swaps the decoded `ImageBitmap` for a `{ width, height }` placeholder and closes it as soon as WebGL has uploaded it (`texture.onUpdate`). The GPU copy stays, and the CPU copy (about 1.5 MB per card at 512 px) goes. This is safe because each cache belongs to one renderer and a lost context falls back to the classic board. A restored context could not re-upload these textures.

### Automatic tier

- `readArena3dDeviceSignals` reads the renderer name, max texture size, CPU cores, device memory, pointer type, fine pointer availability, and the short screen side from one probe context per page. It caches the result and releases the probe context with `WEBGL_lose_context`. `isWebGlAvailable` uses the same cached probe.
- `Arena3dLayer` probes before it mounts the canvas, so the canvas and the texture cache start on the final tier. Before, the canvas mounted on Medium, then remounted on the probed tier: two GL contexts, two shader compiles, and two texture loads per match.
- `probeArena3dQuality` picks Low for software renderers and textures under 4096 px on every device. Then:

| Device class  | Low                                                                                                                | Medium                                                  | High      |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------- |
| Desktop       | 4 GB or less memory, or 4 or fewer cores                                                                           | Coarse primary pointer or an integrated GPU             | Otherwise |
| Phone, tablet | Entry GPU (PowerVR, VideoCore, Mali-4xx, Mali-T, Mali-G0x to G5x, Adreno 2xx to 5xx), under 6 GB, or under 6 cores | Apple GPU, or a newer GPU with 6 GB and 6 cores or more | Never     |

- Apple GPUs skip the memory and core checks, because Safari reports no `deviceMemory` and a capped core count. Before this, every iPhone and iPad probed as Low through the core check.
- Chrome rounds `deviceMemory` to a power of two and caps it at 8, so an Android phone needs to report 8 to reach Medium.
- `ArenaQualityGovernor` judges the cadence, not the median frame gap. `ArenaFrameDriver` counts rendered frames and late frames (a frame that came one or more vsyncs after its slot). After 2.5 s the governor takes windows of 120 rendered frames and calls `judgeArenaFrameCadence`. When more than 10% of a window is late:
  1. above 30 fps, it halves the frame rate (`activity.frameRateCap`): 60 becomes a steady 30;
  2. at 30 fps on `auto`, it asks for a tier downgrade, then judges again on the new tier;
  3. at 30 fps on Low, it halves to a steady 15. A tier the player picked above Low stays at 30: 15 fps made attacks and deletes stutter.
- The cap never goes back up while the canvas lives, so the rate cannot oscillate. A tier the player picks is never downgraded, but its frame rate can still halve: the player chose the look, not the frame rate.
- The old governor asked for a downgrade when the median gap of busy frames was over 24 ms. A device that held 45 fps (alternating 16 and 33 ms gaps at 60 fps) passed that test and stuttered forever. The late-frame share catches it.
- A display capped at 30 Hz (iOS Low Power Mode, Android battery saver) gives 33 ms rAF gaps. The driver renders every rAF there, no frame is late, and the tier stays.
- Changing antialias remounts the canvas.

## Fallbacks

| Case                            | Result                                                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No WebGL                        | `resolveBoardStyle` returns classic. `Arena3dLayer` also renders nothing.                                                                                                                                             |
| Portrait layout                 | 3D arena on the tall layout. See [Responsive layout](#responsive-layout).                                                                                                                                             |
| WebGL context lost              | The governor catches `webglcontextlost`. The layer removes the scene and the classic board shows for the rest of the match. iOS Safari can lose the context when the tab goes to the background or memory runs short. |
| Scene error or failed lazy load | `ClientErrorBoundary` renders nothing.                                                                                                                                                                                |
| Canvas missing                  | CSS hides 2D art only under `.game-board:has(> .arena-3d-scene canvas)`. Without a canvas, the proxies show their normal 2D art.                                                                                      |
| Reduced motion                  | No card motions, no camera shake. Meshes snap to slots. The floor wave freezes and the card aura stops breathing.                                                                                                     |

## Tests

- `boardStyle/resolveBoardStyle.test.ts`
- `quality/resolveArena3dQuality.test.ts`
- `quality/judgeArenaFrameCadence.test.ts`
- `createArenaFramePacer.test.ts`
- `quality/probeArena3dQuality.test.ts`
- `quality/getArena3dDeviceClass.test.ts`
- `field/computeArenaCameraFrame.test.ts`
- `field/ArenaLayoutVariant.test.ts`
- `field/arena3dBreedingFocus.test.ts`
- `breeding/computeArenaBreedingSpotlight.test.ts`
- `breeding/stepArenaBreedingFocus.test.ts`
- `field/computeArenaRowSlots.test.ts`
- `field/selectArenaLayoutVariant.test.ts`
- `slots/computeArenaSlotTiles.test.ts`
- `slots/summarizeArenaFieldEffects.test.ts`
- `slots/measureArenaSlotGrid.test.ts`
- `fieldEffects/findArenaFieldEffectArrival.test.ts`
- `fieldEffects/arenaFieldEffectAuraTiming.test.ts`
- `effects/createArenaCardMotionRegistry.test.ts`
- `cues/advanceArenaCardCueState.test.ts`
- `cues/readArenaProxyCue.test.ts`
- `cues/applyArenaCardCue.test.ts`
- `cues/collectArenaCueDecals.test.ts`
- `cues/easeArenaFocus.test.ts`
- `cues/resolveArenaCuePace.test.ts`
- `field/shouldDeferArenaDomRead.test.ts`
- `field/skipUnchangedPixelRatio.test.ts`
- `field/createArenaDomWatch.test.ts`

No E2E test selects the 3D style. Playwright runs on the classic board by default.

## Performance

### How to profile

Start `pnpm dev`, then run the harness from the repository root. It drives headless Chromium through Playwright and the Chrome DevTools Protocol and prints one JSON report.

```sh
node tools/diagnostics/measure-arena-3d-performance.mjs --scenario crowded --gl metal --output .local/perf/crowded-metal.json
```

| Option                | Values                                                                                                                                                                          | Default                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `--scenario`          | `crowded`, `classic`, `bot`, `viewer`, `mount`, `mobile`, `effects`, `decision`, `landing`, `rotate`, `cadence`                                                                 | `crowded`               |
| `--board`             | `arena3d`, `classic`: board style for `decision`, so the classic board can serve as a control                                                                                   | `arena3d`               |
| `--gl`                | `swiftshader`, `metal`                                                                                                                                                          | `swiftshader`           |
| `--quality`           | `auto`, `low`, `medium`, `high`                                                                                                                                                 | `auto`                  |
| `--reduced`           | flag: emulate reduced motion                                                                                                                                                    | off                     |
| `--seconds`           | idle window in seconds                                                                                                                                                          | `6`                     |
| `--turns`             | bot match windows of 15 s                                                                                                                                                       | `6`                     |
| `--cycles`            | classic and 3D switches in `mount`                                                                                                                                              | `8`                     |
| `--base`              | web origin                                                                                                                                                                      | `http://localhost:5173` |
| `--cdp`               | attach to a running Chrome instead of launching one, for example a phone through `adb forward tcp:9222 localabstract:chrome_devtools_remote`; `--device` and `--gl` are ignored | off                     |
| `--device`            | `desktop`, `phone-landscape`, `phone-landscape-mouse`, `phone-portrait`, `tablet-landscape`                                                                                     | `desktop`               |
| `--throttle`          | CPU slowdown through `Emulation.setCPUThrottlingRate`                                                                                                                           | `1`                     |
| `--gpu-name`          | renderer name the probe reads                                                                                                                                                   | real renderer           |
| `--cores`, `--memory` | `hardwareConcurrency` and `deviceMemory` the probe reads                                                                                                                        | real values             |
| `--effect`            | `all` or a list of `delete`, `wipe`, `impact`, `attack`, `security`, `security-chain`, `evolve`, `arrival`, `arrival-burst`, `finale`                                           | `all`                   |
| `--repeat`            | effect cycles in the leak check of `effects`                                                                                                                                    | `20`                    |
| `--capture`           | folder for `effects` frame captures at fixed clock offsets                                                                                                                      | off                     |
| `--seed`              | seeds `Math.random` so captures repeat                                                                                                                                          | off                     |
| `--trace`             | flag: trace long tasks (over 40 ms) in each `cadence` window and list their top events                                                                                          | off                     |

- `mobile` opens the crowded board on `--device`, records the resolved tier every second for 16 s (pixel ratio, drawing buffer, antialias, floor segments, card texture width, renderers created), then measures idle, draw calls, triangles, and texture memory, forces a render on every frame for 4 s, and resizes the viewport 31 times to count `WebGLRenderer.setSize` calls. Phone presets use `isMobile` and `hasTouch`, so `(pointer: coarse)` matches. `phone-landscape-mouse` is the same screen without touch, which resolves desktop budgets. `--gpu-name`, `--cores`, and `--memory` let SwiftShader stand in for a phone in the probe; `--gpu-name "Adreno (TM) 740" --cores 8 --memory 8` probes Medium.
- `effects` opens the crowded board in 3D and plays burst effects without the presentation queue. It finds the scene's `ArenaPulseLayer`, `ArenaMotionDirector`, and `ArenaCardDepartures` fibers and sets their `pulses` and `deleteBursts` props through the React DevTools `overrideProps` hook of the R3F reconciler. Pulses use the centres of the real DOM proxies, as `useArenaPulses` does. Arrivals add a `.game-card-landing` child to the proxy. This needs the development build. The demo preview tools remount `GameScreen`, so they cannot measure an effect alone.
- Each effect runs on a fresh page: a cold run (first use), a warm run, a draw call and coverage sample 250 ms into a third run, then `--repeat` cycles. Scene script time per rendered frame comes from R3F `addEffect` and `addAfterEffect`, which bracket every `useFrame` callback and the render. GC pauses come from a `v8.gc` trace. `renderer.info.memory`, the program count, and the heap after a forced GC are read before the effect and after the cycles. `wipe` deletes 6 cards at once, and `security-chain` plays 4 attacks on security 1.1 s apart, each followed by a security hit.
- `--capture` freezes the R3F clock, triggers each effect, and saves a screenshot at fixed clock offsets (0.12, 0.3, 0.55, and 0.9 s). With `--seed`, two builds render the same frames, apart from random shard directions and the frame-counted burst spin.
- `decision` opens the crowded board, measures idle, then opens the "Select cards from hand and trash" demo decision, which lights one card with `game-permanent--effect-linked`. It measures 3 rounds with the arena running and, as a control, paused through `cardZoomPresence`: rendered fps, rAF fps, task, script, and style time per second, and scene script per rendered frame. Use `--seconds` for the window and `--board classic` for the classic control.
- `landing` adds a `.game-card-landing` child to one proxy without a pulse, 4 rounds with the arena running and paused, and traces style and layout time inside and outside animation frames. The R3F scene script per frame comes from the same `addEffect` bracket as `effects`.
- `rotate` opens the board at 390 x 844 and rotates it 6 times 700 ms apart (each rotation settles), then 12 times 60 ms apart. It counts `WebGLRenderer.setSize` calls (also those `setPixelRatio` makes), the drawing buffer sizes, and render target resizes, then compares every proxy and pile rectangle, the drawing buffer, and the camera with a fresh page at the same size.
- `cadence` opens the crowded board like `effects`, records the vsync time (`document.timeline.currentTime`) and the scene work of every rendered frame, and measures idle, then two passes of play, digivolve, attack, security, delete, wipe, finale, turn change (a turn pulse plus `activeSide` flipped on every scene component), and the breeding focus (`ArenaBreedingFocus.active`). Each window reports rendered fps, interval p50/p95/p99/max, intervals counted in vsyncs, intervals over 1.5 times the typical one, the slowest frame, long tasks, and programs compiled. Overriding a prop on `ArenaSceneContents` does not stick: its parent re-renders and restores it, so the toggles target the leaf components.
- `crowded` opens `/dev/arena?scenario=crowded`. `classic` is the same board on the classic style, as a control. `bot` starts Practice vs AI, keeps the hand, and advances turns. `viewer` opens the full-screen card zoom. `mount` switches the board style back and forth.
- The default headless shell renders with SwiftShader, so the probe picks Low. `--gl metal` passes `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`; on macOS this gives hardware Metal in headless mode (an Apple M4 probes as High). The new headless mode (`channel: "chromium"`) also works with these flags.
- The report has rAF intervals (median, p95, p99), long tasks, script, task, layout, and style time per second, rendered arena frames per second, a CPU profile by file (inclusive milliseconds per rendered frame), forced layouts from a trace, React renders per component, draw calls, triangles, programs, texture memory, transparent screen coverage, and console errors.
- The init script sets `window.__THREE_DEVTOOLS__` to catch every `WebGLRenderer` and `Scene`, and installs a `__REACT_DEVTOOLS_GLOBAL_HOOK__` that counts commits. Draw calls are summed over one frame with `info.autoReset` off, so post-processing passes are included. Transparent coverage is a bounding-box estimate, not a true overdraw count.
- The demo's preview tools re-key `GameScreen` (`ArenaDemo`), so every preview remounts the whole match screen, the canvas, and its GL context. Their long tasks (300 to 600 ms) appear on the classic board too. Use them for mount cost only. A bot match keeps one renderer for the whole match.
- Run on an idle machine. Other heavy processes shift the absolute numbers, especially under SwiftShader. Compare two builds with interleaved runs (A, B, A, B) and medians.

### Steady cadence

Goal: one steady frame rate per tier, aligned to vsync, that animations never change.

How it works:

- The `<Canvas>` uses `frameloop="never"`. `ArenaFrameDriver` runs its own `requestAnimationFrame` loop and calls R3F `advance(seconds)` on the frames it renders, so it decides every frame. With `demand`, any React prop change on a three object called `invalidate()` and rendered one off-cadence frame, often exactly when a card arrived or an effect started.
- `createArenaFramePacer` estimates the vsync interval as the median of the last 15 rAF gaps and renders every Nth vsync, N = `round(1000 / frameRate / vsync)`, never 0. It counts elapsed vsyncs since the last render with rounding, so ±2 ms of rAF jitter cannot produce the uneven 2-and-3-vsync gaps that the old `now - last >= 1000 / rate - 4` test produced (29.3 ms on a 120 Hz screen is 3.5 vsyncs). After a dropped vsync it renders on the next tick and keeps the stride from there; that frame counts as late.
- 60 fps targets render every second vsync on 120 Hz, so a fast display never burns 120 fps. N rounds to the nearest stride: 144 Hz gives 72 fps, 90 Hz gives 45 fps, 75 Hz gives 75 fps. A strict ceiling (48 fps on 144 Hz, 37.5 on 75 Hz) was judged worse.
- The rAF timestamp is the clock: `clock.autoStart` is off and `advance` sets `clock.elapsedTime` to seconds since the driver started. R3F's `never` mode calls `clock.getDelta()` first, which would otherwise add a wall-clock difference in mixed units. Motion is sampled at the vsync time, not at whatever moment the render started.
- `invalidate` on the R3F store is replaced by a flag. With motion on it changes nothing, because every Nth vsync renders anyway.
- Reduced motion: the floor, aura, and sigils stand still, so a still scene renders at 10 fps (an exact divisor of 30 and 60) and returns to the full rate on the next vsync when `busyUntil`, `pacedUntil`, or an invalidation marks a change. The switch is invisible because the still frames are identical.
- With motion on there is no idle drop: the floor, aura wave (a crest every 5.2 s), sigils, and settled cues always move, and the old 20 fps idle made them step visibly.
- Card zoom and hidden tabs pause rendering as before. After a pause the first rAF renders immediately.
- `ArenaShaderWarmup` compiles the scene with `compileAsync` on the first frame, then draws the scene once with every hidden object forced visible and unculled, into the same target the real frame uses (the canvas, or a half-float target when bloom is on), inside a `useFrame` so the real render overwrites it before it is shown. Compiling links programs, but ANGLE on Metal builds the pipeline state on the first draw, and three.js reads `getProgramInfoLog` on first use. Drawing into both targets doubled the programs (25 to 46), because a render target uses no tone mapping and a linear output color space; it now draws only into the one the frame uses.

Results. Apple M4, Metal, development build, crowded board, cadence scenario. Desktop is 1440 x 900, High. Phone is the 844 x 390 preset at DPR 3, touch Medium, 4x CPU throttle. Headless Chromium runs rAF at 60 Hz. The machine was loaded by two other agents (load average 8 to 30), so single long tasks vary between runs. "Before" turn change and breeding focus come from a second run with the old driver restored, because the first harness version toggled a prop that did not stick.

| Window, first use | Desktop before: fps, intervals in vsyncs | Desktop after | Phone before                    | Phone after                            |
| ----------------- | ---------------------------------------- | ------------- | ------------------------------- | -------------------------------------- |
| Idle              | 20, all 3                                | 60, all 1     | 15, all 4                       | 30, all 2                              |
| Play              | 53, 127 x1 + 8 x3 (60 then 20)           | 60, all 1     | 54, 132 x1 + 5 x4               | 29.4, 75 x2 + 1 x5 (75 ms long task)   |
| Digivolve         | 59.6, 1 x2                               | 60, all 1     | 58.9, worst frame 43.8 ms, 1 x4 | 30, worst frame 8.3 to 12.1 ms         |
| Attack            | 59.6, 1 x2                               | 60, all 1     | 59.2, worst frame 23.1 ms       | 30 (one run 1 x4)                      |
| Security          | 58.4, 2 x3                               | 60, all 1     | 58.4, 1 x3 + 1 x4               | 30                                     |
| Delete, wipe      | 59.6, 1 x2                               | 60, all 1     | 59.2, 1 x3                      | 30, all 2                              |
| Finale            | 60                                       | 60, all 1     | 39.6, one 833 ms gap            | 28.6 to 30, one 81 to 131 ms long task |
| Turn change       | 60 (busy for the whole 2.6 s), then 20   | 60, all 1     | 60, then 15                     | 30                                     |
| Breeding focus    | 32: 60 while fading, then 30             | 60, all 1     | 23: 60 while fading, then 20    | 30, all 2                              |

- Before, every effect switched the rate: 20 to 60 and back on desktop (20 to 120 on a 120 Hz screen), 15 to 60 to 20 on a phone. After, intervals are one stride on desktop in every window of two runs except one 50 ms blip in a second-pass delete. The effects scenario's cold digivolve frame fell from 168 ms to 8 ms on the phone preset, and the cold 1.6 to 1.8 s rAF stalls (GPU process building Metal pipelines on first draw) did not recur.
- No window compiled a program. Desktop High: 25 programs, 123 draw calls, 51,511 triangles, as before.
- `effects` and `crowded` sample draw calls with one synchronous `advance` when the canvas uses `frameloop="never"`. At 60 fps the old rAF-based sample summed two frames.

Cost of the higher idle rate, same build, the cap set from the page (`activity.frameRateCap`), main-thread task time, 2 to 3 rounds:

| Device                           | Steady rate                  | Old idle rate           |
| -------------------------------- | ---------------------------- | ----------------------- |
| Desktop High, Metal              | 60 fps: 46 to 66 ms/s        | 20 fps: 21 to 41 ms/s   |
| Phone touch Medium, Metal, 4x    | 30 fps: 91 to 117 ms/s       | 15 fps: 63 to 65 ms/s   |
| Phone touch Low, SwiftShader, 6x | 30 fps: 994 ms/s (saturated) | 10 fps: 312 to 326 ms/s |

- About 25 ms/s more on desktop and 30 to 50 ms/s more on the throttled phone. GPU time is not visible from headless Chromium; on a phone it is the larger cost and needs a real device.
- SwiftShader cannot hold 30 fps on the phone preset. The governor then halves to 15 (Low cannot drop). SwiftShader rasterizes on the main thread, so this overstates a phone with a GPU.

Remaining hitches (phone preset, 4x throttle; desktop showed none):

- Play: 56 to 101 ms long task when `.game-card-landing` is added: 30 ms of style recalculation (`UpdateLayoutTree`) plus React. DOM, outside the scene.
- Finale: 81 to 131 ms long task at the trigger: 63 ms of style recalculation for the DOM finale layer (`MatchFinaleLayer`) plus 33 ms of React. DOM, outside the scene.
- Turn change: about 50 ms of React work when `activeSide` changes every scene component.
- Delete: one 68 to 70 ms major GC in one run; the scene does not allocate per frame, so the source is elsewhere in the page.
- Card textures still upload on first draw. `renderer.initTexture` on a 512 px card costs 1 to 2 ms on the phone preset (Metal), so uploading ahead was not added; recheck on a real phone.

### Results

Apple M4, Metal, 1440 x 900 at DPR 1, development build, High tier unless noted. SwiftShader runs probe as Low.

| Measure                                                    | Before            | After             | Method                       |
| ---------------------------------------------------------- | ----------------- | ----------------- | ---------------------------- |
| `ArenaLayoutSync` per rendered frame, idle                 | 0.21 ms           | 0.10 ms           | interleaved A/B, median of 3 |
| `ArenaLayoutSync` per rendered frame, hand-card drag       | 0.22 ms           | 0.11 ms           | interleaved A/B, median of 3 |
| `ArenaLayoutSync` per rendered frame, open decision        | 0.43 ms           | 0.31 ms           | interleaved A/B, median of 3 |
| All arena frame script (R3F loop) per rendered frame, idle | 0.68 ms           | 0.53 ms           | interleaved A/B, median of 3 |
| Arena frames per second, decision open, reduced motion     | 60                | 20                | interleaved A/B, 2 pairs     |
| Main-thread task time, same, reduced motion                | 56 ms/s           | 22 ms/s           | interleaved A/B, 2 pairs     |
| Main-thread task time, same, reduced motion, SwiftShader   | 1,015 ms/s        | 400 to 850 ms/s   | interleaved A/B, 2 pairs     |
| Arena frames per second behind the open card zoom          | 20                | 0                 | `viewer` scenario            |
| Script time with the card zoom open                        | 32 ms/s           | 8 ms/s            | `viewer` scenario            |
| Idle main-thread task time, Low tier, SwiftShader          | 495 ms/s (15 fps) | 310 ms/s (10 fps) | interleaved A/B, median of 3 |
| GL contexts alive after 8 classic and 3D switches          | 1 (current board) | 1 (current board) | `mount` scenario             |

Unchanged, for reference (crowded board, High): 120 draw calls (123 since the viewer's breeding area moved into the 3D world on the wide and short layouts), about 51,500 triangles (the 160 x 160 floor is 51,200 of them), 15 programs, 25 card textures, 101 MB of card texture memory, idle 20 rendered fps, no forced layout, no long task at idle, and no React render at idle. The classic board idles at 1 ms/s of script; the 3D board at about 17 ms/s.

### Findings

- `ArenaLayoutSync` was the largest 3D-specific script cost per frame: about 80 `querySelector` calls, `closest`, and inline style reads per frame for cues, rims, focus, drop targets, and spotlight hits. `createArenaDomWatch` now records watched mutations (classes, `data-*`, inline style, children, and spotlight ring geometry) and ignores the inline `translate` the arena writes to its own slots and overlay. The sync re-reads proxies only after a mutation or a store change. Zone rectangles and the canvas rectangle were still read every rendered frame; see [Fixes after the evaluation](#fixes-after-the-evaluation) for how they are read now.
- `ArenaCardCueLayer` kept the scene at 60 fps for as long as any cue decal existed. A lit effect source during a long decision under reduced motion rendered 60 identical frames per second; under SwiftShader that saturated the main thread. Under reduced motion it now holds the frame driver only while a cue rises or the focus fades.
- The arena kept rendering behind the full-screen card zoom, whose backdrop blurs it, so the browser also re-blurred the backdrop. `cardZoomPresence` counts open zooms and `ArenaFrameDriver` skips its invalidations while one is open. The 3D viewer itself renders every frame while its idle sway runs; with reduced motion it renders on demand.
- Low now idles at 10 fps instead of 15. Ambient motion on Low (sigil spin, aura breath, rim pulse) updates less smoothly; Medium and High keep 20 fps.
- Teardown releases the GL context and textures. In development, React Refresh keeps every unmounted R3F root in `helpersByRoot`, so old `WebGLRenderer` objects stay in the heap (about 0.7 MB per mount cycle). Production builds have no React Refresh.
- Transparent coverage on the crowded board is about 2.9 screens: floor 1.0, active-side aura 0.56, 24 card glows 0.45, sigils 0.36, 19 shadows 0.26, slot tiles 0.18. The glows and shadows are 43 of the 120 draw calls. Instancing them would save draw calls, not fragments; the M4 shows no GPU bound, so they stay separate until a phone profile shows a need.
- Lowering the High texture width from 768 to 512 would cut card texture memory by 55% (101 MB to about 45 MB) but changes 6% of the board's pixels by more than 8 levels at DPR 2 (PSNR 34.5 dB), so High keeps 768.
- Bundle: the match screen chunk has no static `three` import. `three-vendor` (1,014 kB, 272 kB gzip), `Arena3dScene` (103 kB, 31 kB gzip), `createArenaFieldFrame` (2 kB), and `CardViewer3d` (4 kB) load on demand.
- During a hand-card drag, `BoardStage` and every `PermanentView` re-render about 15 times per second on both board styles. The canvas, `ArenaSceneContents`, and the meshes do not re-render.

### Mobile results

844 x 390 phone landscape at DPR 3 and 1180 x 820 tablet at DPR 2, emulated in headless Chromium. Crowded board. The machine was loaded by other work, so SwiftShader numbers vary by about 2x between runs.

| Run                                                       | Tier                                | Drawing buffer   | Draw calls | Triangles | Card textures | Idle fps | Forced-render fps |
| --------------------------------------------------------- | ----------------------------------- | ---------------- | ---------- | --------- | ------------- | -------- | ----------------- |
| Desktop, Metal (reference, unchanged)                     | High                                | 1440 x 848       | 120        | 51,505    | 100.7 MB      | 20       | 58                |
| Phone without touch, Metal (desktop budgets)              | High                                | 1688 x 692       | 120        | 51,505    | 100.7 MB      | 19       | 58                |
| Phone, Metal, auto                                        | Medium (touch)                      | 1688 x 692       | 102        | 8,480     | 44.9 MB       | 15       | 58                |
| Tablet, Metal, auto                                       | Medium (touch)                      | 2360 x 1536      | 102        | 8,480     | 44.9 MB       | 15       | 58                |
| Phone, Metal, auto, 6x CPU throttle                       | Medium (touch)                      | 1688 x 692       | 102        | 8,480     | 44.9 MB       | 15       | 58                |
| Phone, SwiftShader, auto, before                          | Low (desktop)                       | 844 x 346        | 102        | 290       | 25.3 MB       | 10       | n/a               |
| Phone, SwiftShader, auto, after                           | Low (touch)                         | 1266 x 519       | 102        | 290       | 25.3 MB       | 10       | n/a               |
| Phone, SwiftShader, `--quality medium`, desktop budgets   | Medium                              | 1266 x 519, MSAA | 102        | 18,720    | 44.9 MB       | 12 to 14 | 14 to 24          |
| Phone, SwiftShader, `--quality medium`, touch budgets     | Medium                              | 1688 x 692       | 102        | 8,480     | 44.9 MB       | 14 to 15 | 14 to 18          |
| Phone, SwiftShader, spoofed Adreno 740, 4x or 6x throttle | Medium, then Low after 4.4 to 6.5 s | 1266 x 519       | 102        | 290       | 25.3 MB       | 10       | 35 to 37          |

- The Metal phone and tablet keep 58 fps under forced rendering even with 6x CPU throttling, and the governor keeps Medium. Main-thread task time at idle: 27 ms/s, or 98 ms/s with 6x throttling.
- The glows and shadows are still separate draw calls (102 on touch tiers, 120 on desktop High). With 6x CPU throttling, the whole arena frame costs about 3 ms of script per rendered frame, so instancing them would save well under 1 ms. They stay separate, because one instanced transparent mesh sorts as a single object and would change how glows overlap cards.
- Resize storm: 31 viewport changes caused 40 to 60 `WebGLRenderer.setSize` calls through six drawing buffer sizes, on every tier. R3F measures the canvas with no resize debounce. Each call reallocates the drawing buffer, and on High also the bloom render targets. The `<Canvas>` in `field/Arena3dScene.tsx` now passes `resize={{ debounce: { scroll: 50, resize: 150 } }}`. The [evaluation](#evaluation) measured 0 reallocations for the same storm.
- Hidden tab: `ArenaFrameDriver` renders only from `requestAnimationFrame`, which browsers pause in a hidden tab, so a hidden arena renders nothing. Headless Chromium keeps every page visible, so this was not measured.

### Burst effects

`effects` scenario, crowded board, interleaved A/B (A, B, A, B), median of 2 runs per build. Desktop is Apple M4, Metal, High, 1440 x 900. Medium and Low are the 844 x 390 phone preset at DPR 3 with touch budgets on SwiftShader, at 4x and 6x CPU throttling. The machine was loaded by other work, and SwiftShader medians moved by up to 1 ms between runs of the same build.

"Worst frame" is the slowest rendered frame of R3F scene script (every `useFrame` callback plus the render) while the effect plays the second time. "First use" is the same measure on a fresh page. Draw calls are one High frame 250 ms into the effect, with the bloom passes.

| Effect                               | Worst frame, desktop | Worst frame, Medium | Worst frame, Low | First use, Low | Draw calls, desktop |
| ------------------------------------ | -------------------- | ------------------- | ---------------- | -------------- | ------------------- |
| Delete (1 card)                      | 3.3 → 1.3 ms         | 6.3 → 4.6 ms        | 11.4 → 5.6 ms    | 17.4 → 16.1 ms | 260 → 246           |
| Board wipe (6 cards)                 | 4.5 → 1.8 ms         | 9.2 → 5.2 ms        | 18.6 → 8.1 ms    | 17.8 → 14.3 ms | 360 → 276           |
| Impact (burst, shards, knockback)    | 9.1 → 1.9 ms         | 15.4 → 5.5 ms       | 21.6 → 10.9 ms   | 25.1 → 15.4 ms | 262 → 248           |
| Attack (trail, lunge, arrival burst) | 3.5 → 1.6 ms         | 10.2 → 6.0 ms       | 17.5 → 10.4 ms   | 22.2 → 22.4 ms | 268 → 254           |
| Security check (attack, then hit)    | 7.2 → 1.1 ms         | 12.0 → 5.1 ms       | 15.2 → 8.0 ms    | 20.4 → 24.5 ms | 268 → 254           |
| 4 security checks in a row           | 21.7 → 2.3 ms        | 10.2 → 7.1 ms       | 12.2 → 12.1 ms   | 23.1 → 19.0 ms | 266 → 252           |
| Digivolve                            | 7.3 → 1.7 ms         | 8.6 → 4.3 ms        | 24.8 → 6.5 ms    | 28.6 → 16.1 ms | 250 → 250           |
| Arrival (1 card)                     | 4.8 → 3.4 ms         | 12.4 → 16.5 ms      | 24.3 → 27.0 ms   | 29.4 → 29.2 ms | 242 → 242           |
| Arrival (5 cards)                    | 7.8 → 5.5 ms         | 13.6 → 16.4 ms      | 24.5 → 16.0 ms   | 24.2 → 24.6 ms | 242 → 242           |

- Median frame script did not change beyond noise: about 0.6 ms on desktop, 1.5 to 2.5 ms on Medium, and 2.5 to 4 ms on Low, before and after.
- GC: 1 to 9 minor collections per effect window, 2 to 27 ms in total, with no major collection, before and after. The pulse code no longer allocates per frame, but the remaining collections come from elsewhere in the page.
- Leaks: after 20 cycles of every effect, `renderer.info.memory` and the program count are unchanged from the count after the first cycle (desktop: 13 to 15 geometries, 42 textures, 24 programs). The heap after a forced GC grows by 1.2 to 2.2 MB over 20 cycles on both builds. That growth is the same before and after; the `started` key sets in `ArenaPulseLayer`, `ArenaMotionDirector`, and `useArenaPulses` grow by one short string per pulse, and the development build retains more.
- Coverage at the peak stays at 2.6 to 3.2 screens. A board wipe adds six 3.7-unit rings (0.21 screens) to the 2.9 screens of the idle board.

Findings:

- Programs were released between effects. Each effect created its own materials and disposed them at the end, so three.js released the program whenever the last effect of a kind finished. The next effect compiled it again. On desktop the program count fell back to 15 after every effect. On the first run on a machine with an empty Metal shader cache, the first board wipe stalled one frame for 635 ms in `getProgramInfoLog`. Later runs hit the system Metal cache, so the harness cannot reproduce that stall. `PulseShaderKeepers` now holds one hidden mesh per effect shader, so the 6 pulse programs stay resident. `ArenaShaderWarmup` compiles them and the 3 hidden cue programs (decal, column, spotlight) two frames after mount with `compileAsync`. With bloom it compiles against a 1 x 1 half-float target, because three.js keys programs on the output color space and tone mapping of the current target. The program count is now 24 from mount on, and no effect compiles a program.
- Each shard was its own mesh with its own `TetrahedronGeometry`: 8 meshes, 8 geometries, and 8 draw calls per delete or impact on High. Each pulse also built its ring, pillar, torus, burst, and beam geometry, plus 4 materials whether it drew them or not. Shards are now one `InstancedMesh` per effect, every pulse mesh scales a shared geometry from `effects/arenaPulseGeometry.ts`, and an effect creates only the materials it draws. A board wipe went from 360 to 276 draw calls. The worst frame of a repeated pulse effect fell by 50% to 90%.
- `createArenaCardMotionRegistry` allocated an array per moving card and a keyframe object per motion on every frame. It now compacts the motion list in place and interpolates into one reused keyframe.
- Arrivals are unchanged by design: the materialize shader is uniform-driven and its decals were already instanced. Their worst frame comes from `ArenaLayoutSync` re-reading every proxy (`getBoundingClientRect`) after the `.game-card-landing` mutation, 0.5 to 0.9 ms per rendered frame on Medium. This is the DOM read path from [Findings](#findings), not the effect.
- No tier cap was added. With instancing, a 6-card wipe on Low costs about 8 ms in its worst frame and 3 ms in the median, so the existing `shardCount` per tier is enough.
- Frame captures at fixed clock offsets match before and after. Evolve and arrival are identical to within 0.005% of pixels. Effects with shards differ in 0.1% to 0.8% of pixels, because the shards fly in random directions; their number, size, color, and spread match. The burst ray spin still advances 0.02 per rendered frame, so it depends on the frame rate, as before.
- The `effects` scenario cannot measure GPU time. SwiftShader runs fragments on the CPU, and Metal hides GPU time from the main thread. Real phones still need a profile, especially for the floor ripple loop (8 slots) during a board wipe.

#### Match finale

The `finale` effect emits one `FINALE` pulse to `ArenaPulseLayer`, `ArenaMotionDirector`, and `ArenaActiveSideAura` and mounts a copy of the DOM finale layer, so the zoom punch and the CSS layers run too. Measured on 2026-11-01 with 3 to 5 repeat cycles, one run per configuration, on a loaded machine; the other effects ran in the same runs as controls.

| Effect         | Worst warm frame, desktop High (Metal) | Touch Medium, 4x (SwiftShader) | Touch Low, 6x (SwiftShader) | First use, desktop / Medium / Low | Draw calls at peak, desktop |
| -------------- | -------------------------------------- | ------------------------------ | --------------------------- | --------------------------------- | --------------------------- |
| Finale         | 1.6 ms                                 | 3.1 ms                         | 8.1 ms                      | 5.0 / 12.5 / 17.7 ms              | 258                         |
| Security check | 1.1 ms                                 | 3.7 ms                         | 12.0 ms                     | 14.2 / 15.1 / 19.8 ms             | 260                         |
| Impact         | 0.7 ms                                 | 6.1 ms                         | 9.6 ms                      | 4.0 / 9.4 / 19.6 ms               | 254                         |

- No effect compiled a program; the count stayed at 25 on desktop and 20 on touch Medium and Low before and after the repeats.
- Peak transparent coverage is 3.2 screens, against 2.6 to 2.8 for the other bursts, because of the 15-unit shockwave ring.
- Median frame script did not change: 0.6 ms on desktop, 1.8 ms on Medium, 3.7 ms on Low.

### Budgets

| Budget                                       | Target on an Apple M4  | Reason                                                                                          |
| -------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `ArenaLayoutSync` per rendered frame at idle | 0.2 ms or less         | A mid-range phone is about 4 to 6 times slower.                                                 |
| Arena frame script while busy                | 2 ms or less           | Leaves room for React work in a 16.7 ms frame.                                                  |
| Idle arena frames                            | tier idle fps          | 10 on Low, 20 on Medium and High; 0 behind a zoom.                                              |
| Draw calls on the crowded board              | 150 or fewer           | Currently 123; 124 during the breeding step.                                                    |
| Programs                                     | 25 or fewer            | Currently 25: 15 board, 6 pulse, 3 cue programs, and the breeding focus, all compiled at mount. |
| Card texture memory                          | within the tier budget | 48, 96, and 160 MB; 32, 64, and 112 MB on touch.                                                |
| GL contexts after leaving 3D                 | 0 from the arena       | Checked by the `mount` scenario.                                                                |
| Long tasks from the 3D layer at idle         | none                   | Checked by the `crowded` and `bot` scenarios.                                                   |

### Evaluation

Independent evaluation on 2026-11-01, after the steady-state, touch tier, responsive, aura, breeding mask, and burst effect changes.

Setup:

- Apple M4 (10 cores), development build, headless Chromium through the harness and extra scenarios (idle, hand-card drag, and an open "Select cards from hand and trash" decision on the crowded board).
- Touch Low: SwiftShader, 6x CPU throttle, `--quality low`, spoofed Mali-G52. Touch Medium: SwiftShader, 4x CPU throttle, `--quality medium`, spoofed Adreno 740. Desktop High: Metal. Phone presets run at DPR 3, the tablet at DPR 2.
- Two interleaved rounds per configuration; the tables show medians. The machine was loaded (load average about 7). Headless SwiftShader rasterizes on the main thread, so its task time includes fragment shading and overstates a real phone's CPU cost.

Steady state:

| Device and tier             | Layout | Drawing buffer | Idle fps | Idle task ms/s | Scene script per frame, idle | Drag task ms/s | Decision: arena fps, task ms/s | Draw calls | Triangles | Programs | Texture MB |
| --------------------------- | ------ | -------------- | -------- | -------------- | ---------------------------- | -------------- | ------------------------------ | ---------- | --------- | -------- | ---------- |
| Phone portrait, touch Low   | tall   | 585 x 1182     | 10       | 223            | 2.1 ms                       | 821            | 41, 999                        | 105        | 294       | 19       | 25.3       |
| Phone landscape, touch Low  | short  | 1266 x 519     | 10       | 177            | 2.0 ms                       | 787            | 50, 991                        | 102        | 290       | 19       | 25.3       |
| Tablet, touch Low           | wide   | 1770 x 1152    | 10       | 431            | 1.9 ms                       | 928            | 19, 1006                       | 102        | 290       | 19       | 25.3       |
| Desktop 1440 x 900, Low, 4x | wide   | 1440 x 848     | 10       | 251            | 1.3 ms                       | 804            | 32, 1001                       | 102        | 290       | 19       | 25.3       |
| Phone portrait, touch Med.  | tall   | 780 x 1576     | 15       | 460            | 1.3 ms                       | 872            | 21, 1002                       | 105        | 8,484     | 19       | 44.9       |
| Phone landscape, touch Med. | short  | 1688 x 692     | 15       | 366            | 1.1 ms                       | 800            | 37, 999                        | 102        | 8,480     | 19       | 44.9       |
| Tablet, touch Medium        | wide   | 2360 x 1536    | 12.4     | 1,011          | 1.7 ms                       | 1,000          | 11, 1014                       | 102        | 8,480     | 19       | 44.9       |
| Phone portrait, Metal, Med. | tall   | 780 x 1576     | 15       | 34             | 0.7 ms                       | 267            | 60, 95                         | 105        | 8,484     | 19       | 44.9       |
| Desktop, Metal, High        | wide   | 1440 x 848     | 20       | 41             | 0.9 ms                       | 281            | 60, 89                         | 120        | 51,505    | 24       | 100.7      |

- `ArenaLayoutSync` costs 0.13 ms per rendered frame at idle on the M4 (High). No idle long task, except the Medium tablet on SwiftShader, which is fill-bound at 3.6 megapixels (74 long tasks in 6 s). That is an emulation limit; on a real tablet the governor would drop to Low.
- Classic control: the classic board idles at 1 ms/s of script and 20 ms/s of task time on desktop Metal, creates no WebGL renderer, and its drag costs 270 to 330 ms/s. No regression from the earlier baseline. On the same devices the 3D drag costs 120 to 270 ms/s more than classic.
- Open decision (fixed since, see [Fixes after the evaluation](#fixes-after-the-evaluation)): a lit effect cue (`game-permanent--effect-linked`) made `ArenaCardCueLayer` hold the frame driver for as long as the decision stayed open, so the arena rendered at full rate instead of the idle rate. With the arena paused through `cardZoomPresence`, the same decision costs 14 to 74 ms/s, the same as classic (10 to 44 ms/s). With the arena running it saturates the emulated phone (about 1,000 ms/s) and doubles task time on the M4 (56 to 100 ms/s).
- Card zoom: 0 arena frames behind the zoom on a Metal phone; the viewer context is released on close.

Active-side aura, A/B in the same page (animated, the bands and crest replaced by a flat `envelope * 0.65` tint, and the aura hidden), 3 interleaved rounds. GPU time is one forced frame bracketed by 1-pixel `readPixels` fences:

| Run                           | Animated | Static tint | Aura hidden |
| ----------------------------- | -------- | ----------- | ----------- |
| Phone portrait, touch Low     | 16.9 ms  | 16.2 ms     | 15.1 ms     |
| Phone landscape, touch Low    | 12.6 ms  | 12.8 ms     | 11.2 ms     |
| Phone portrait, touch Medium  | 26.8 ms  | 26.3 ms     | 24.8 ms     |
| Phone portrait, Metal, Medium | 2.4 ms   | 2.3 ms      | 2.3 ms      |

- The wave costs about 0.5 ms of fragment time per frame over a static tint on SwiftShader (3% to 4% of the frame) and the whole aura 1.5 to 2 ms. Its `useFrame` costs under 0.01 ms of script.
- It does not touch `activity.busyUntil`, so the scene still idles at 10 fps on Low and 15 fps on touch Medium. Animating it on Low adds about 5 ms/s of fragment work at the idle rate.

Burst effects, phone landscape, worst warm frame of scene script (the second play), 20 repeat cycles:

| Effect         | Touch Medium, 4x | Touch Low, 6x |
| -------------- | ---------------- | ------------- |
| Delete         | 4.0 ms           | 9.7 ms        |
| Board wipe     | 5.8 ms           | 5.4 ms        |
| Impact         | 3.8 ms           | 10.6 ms       |
| Attack         | 3.6 ms           | 7.5 ms        |
| Security check | 3.7 ms           | 8.1 ms        |
| 4 checks       | 6.8 ms           | 5.1 ms        |
| Digivolve      | 7.1 ms           | 3.8 ms        |
| Arrival        | 19.7 ms          | 15.5 ms       |
| Arrival, 5     | 24.2 ms          | 16.0 ms       |

- No effect compiled a program. `renderer.info.memory` and the program count were unchanged after 20 cycles of every effect; the heap after a forced GC grew 1.3 to 2.1 MB per 20 cycles, as before.
- Arrival (fixed since, see [Fixes after the evaluation](#fixes-after-the-evaluation)): three more interleaved Medium runs gave 20.9, 47.9, and 33.8 ms for the worst arrival frame and 8.3 to 14.6 ms for delete. The earlier 12.4 to 16.5 ms change is inside that spread, so it is noise. Arrival is still the worst effect on every run. A trace shows the cause: adding `.game-card-landing` forces one style recalculation of the board (about 8.5 ms at 4x). With the arena paused, the browser pays the same recalculation outside the frame. With the arena running, `getBoundingClientRect` in `ArenaLayoutSync` pulls it into the arena frame. The sync moves the cost; it adds only 4 to 8 ms of extra style work per arrival.
- Peak draw calls on SwiftShader read about twice the per-frame count (204 to 228) because two renders land in the sample window; per frame they stay at 102 to 114.

Responsive layout, phone portrait, touch Medium (SwiftShader and Metal):

| Storm                                  | `setSize` calls | Drawing buffers        | Render target resizes | Long tasks                                |
| -------------------------------------- | --------------- | ---------------------- | --------------------- | ----------------------------------------- |
| 13 rotations, 60 ms apart              | 0               | none                   | 0                     | 12 (100 to 140 ms Metal, up to 550 ms 4x) |
| 7 rotations, 700 ms apart              | 12              | 780 x 1576, 1688 x 692 | 0 (126 on High bloom) | 6 (about 100 ms Metal)                    |
| 31 address-bar height changes, no wait | 0               | none                   | 0                     | none                                      |

- Each settled rotation called `setSize` twice, so the drawing buffer was reallocated twice (fixed since, see [Fixes after the evaluation](#fixes-after-the-evaluation)). On High the bloom composer resizes 21 render targets per rotation; that is one composer resize, not a duplicate.
- After the storms, the layout (tall, short), the drawing buffer, the camera, and all 26 or 27 proxy and pile rectangles match a fresh page at the same size to 0 px.

Memory:

- Bot match on a Metal phone, touch Medium, 6 turns: one renderer, 19 programs throughout, card textures 5.7 to 9.5 MB, heap 75 to 90 MB with no upward trend. The bot run stops at a "Deleted" notice the harness cannot dismiss.
- 10 classic and 3D switches, phone and desktop: one live GL context at every step. The dev-only `WebGLRenderer` retention (about 0.6 MB per cycle) is unchanged.

Console: no error, NaN, or WebGL warning in any run. Every SwiftShader mount logs the three.js warning `KHR_parallel_shader_compile extension not supported`, and every run logs the R3F `THREE.Clock` deprecation warning.

Verdict:

| Budget                                       | Result                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArenaLayoutSync` per rendered frame at idle | Pass: 0.13 ms on the M4.                                                                                                                                             |
| Arena frame script while busy                | Pass: 0.9 ms median with a decision open on the M4; 2 to 4 ms median for effects at 4x to 6x throttle.                                                               |
| Idle arena frames                            | Pass at idle (10, 15, 20; 0 behind a zoom). During a decision with a lit cue: Fail at evaluation (full frame rate); Pass after the fix (paced rate: 10, 20, 30 fps). |
| Draw calls on the crowded board              | Pass: 102 to 105 on touch tiers, 120 on desktop High.                                                                                                                |
| Programs                                     | Pass: 19 on touch tiers, 24 on desktop High.                                                                                                                         |
| Card texture memory                          | Pass: 25.3 MB (Low, 32 MB budget), 44.9 MB (Medium, 64 MB), 100.7 MB (High, 160 MB).                                                                                 |
| GL contexts after leaving 3D                 | Pass: one live context after 10 switches.                                                                                                                            |
| Long tasks from the 3D layer at idle         | Pass, except the emulated Medium tablet, which is fill-bound on SwiftShader.                                                                                         |

### Breeding area in the 3D world

Crowded board, Apple M4, Metal, 1440 x 900, High, after the viewer's eggs and raising area moved into the wide and short layouts: 123 draw calls (was 120), 24 programs, 51,511 triangles, 25 card textures, 100.7 MB of card texture memory, 20 idle rendered fps, no forced layout at idle, and no console error. The 3 new draw calls are the viewer's egg pile and raising card meshes.

### Fixes after the evaluation

Three fixes on 2026-11-01. Measured with the harness scenarios `decision`, `effects`, and `rotate`, interleaved A/B (before, after, before, after), medians. Touch Low is the phone portrait preset on SwiftShader with 6x CPU throttle and `--quality low`; touch Medium is phone landscape on SwiftShader with 4x throttle and `--quality medium`; desktop is the Apple M4 on Metal, High. The machine was lightly loaded (load average about 2).

| Measure                                            | Device and tier | Before               | After             | Runs             |
| -------------------------------------------------- | --------------- | -------------------- | ----------------- | ---------------- |
| Decision open: arena fps, main-thread task         | Touch Low       | 46.6 fps, 1,001 ms/s | 10 fps, 241 ms/s  | 2 x 3 rounds     |
| Decision open: arena fps, main-thread task         | Touch Medium    | 40.1 fps, 1,003 ms/s | 20 fps, 485 ms/s  | 2 x 3 rounds     |
| Decision open: arena fps, main-thread task         | Desktop High    | 59.9 fps, 110 ms/s   | 29.9 fps, 94 ms/s | 2 x 3 rounds     |
| Decision open, arena paused (control)              | all             | 13 to 57 ms/s        | 13 to 63 ms/s     | same runs        |
| Arrival, worst warm frame of scene script          | Touch Medium    | 10.4 ms              | 2.5 ms            | 3 pairs          |
| Arrival of 5 cards, worst warm frame               | Touch Medium    | 11.9 ms              | 2.7 ms            | 3 pairs          |
| `WebGLRenderer.setSize` calls per settled rotation | Medium and High | 2                    | 1                 | 6 rotations each |

- Decision: `resolveArenaCuePace` holds full rate only while a cue changes. A settled lit cue now runs at the tier's paced rate. Touch Low still costs 241 ms/s with the arena running, against 25 ms/s paused; that is the 10 fps idle cost of SwiftShader (about 205 ms/s at idle on the same runs), not the cue. Under reduced motion the decision idles at 20 fps on desktop, as before.
- Arrival: the worst frame was `getBoundingClientRect` in `ArenaLayoutSync` forcing the style recalculation that `.game-card-landing` causes. Deferring the read by one frame fixed one card but not five: the delayed read still forced style while the landing animations ran, because zones were measured every frame. Zones are now measured only after a layout-relevant change (see [World layout and camera](#world-layout-and-camera)). The total style work is the same; it moves out of the arena frame into the browser's own rendering step. Median frame script did not change (1.1 to 1.5 ms).
- Rotation: R3F's resize handler calls `gl.setPixelRatio(dpr)` before `gl.setSize(width, height)`. three.js `setPixelRatio` always calls `setSize` with the old size, which reassigns the canvas width and height and so reallocates the drawing buffer even when nothing changed. `skipUnchangedPixelRatio`, installed from the `<Canvas>` `onCreated`, skips a pixel ratio equal to the current one. A real DPR change (zoom, another display, a quality downgrade) still applies. Bloom render target resizes stay at 21 per rotation, which is the single composer resize.
- Alignment: after 6 settled and 12 fast rotations, every proxy and pile rectangle, the drawing buffer, and the camera match a fresh page to 0 px on Metal Medium and High and SwiftShader Medium. Screenshots at 390 x 844 and 1440 x 900 show the GL piles under their DOM count badges after arrival, during a hand-card drag, and after rotating to landscape and back.
- Trade-off: a settled cue's edge light and light column move at 30 fps on desktop, 20 fps on touch Medium and High, and 10 fps on Low, instead of 60. They are slow, clock-driven animations, so they step slightly but keep their speed. The DOM proxies' cue state and drop targets reach the scene one frame later than before.

## Known risks and limits

- The DOM hit box is a squashed rectangle. Perspective still makes the far edge of a GL card slightly narrower than the box.
- The viewer's hand stays DOM.
- The touch tiers were tuned with emulation, SwiftShader, and an Apple M4. No real phone has been profiled yet: GPU time, thermal throttling, iOS memory limits, and context loss on background are unmeasured.
- The camera does not orbit or follow the pointer. It moves only for the impact shake, and the DOM overlay moves with it.
- The CSS relies on `!important` overrides of the classic pile and memory band styles. Changes to those class names can break the 3D placement silently.
- On a 1024 x 768 screen, END TURN touches the bottom edge of the opponent's security stack.
- During the 200 ms breeding transfer, the flight clones the transparent raising proxy, so the GL card is hidden at its new slot and no card is drawn in flight. Only the chips travel. This is the same on every layout and for the opponent.
- The canvas resize is debounced (150 ms). During a resize or rotation the GL frame can lag the DOM proxies for up to 150 ms. `ArenaLayoutSync` re-measures zones when the canvas size changes, so the piles realign once the canvas has resized.
- `ArenaLayoutSync` re-reads proxy cues, rims, and spotlight hits only one frame after a watched DOM mutation (`createArenaDomWatch`). A cue that changes without a class, attribute, child, or inline style change (for example a pure CSS animation) is not seen. Zone rectangles are read only after a layout-relevant change; a future CSS transition or animation that moves a pile without a DOM mutation would leave its GL mesh behind until the next such change. See [Fixes after the evaluation](#fixes-after-the-evaluation).
- Card cues depend on the DOM class names listed in [Card cues in 3D](#card-cues-in-3d). Renaming a cue class silently drops its GL equivalent.
