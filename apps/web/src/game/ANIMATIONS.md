# Game animation structure

Animation comparisons preserve Aegis's existing layout and visual design: colours,
typography, components, slot geometry and resting card sizes. The gameplay reference
guides movement, timing and effects. Validate motion relative to each renderer's own
card and destination bounds; every animation must settle back into the Aegis layout.

The 2026-10-05 closeout uses representative evolution/play/raising/attack/choice
and simultaneous-effect comparisons. The user excluded the remaining 28 keyword
validations and exhaustive reference-frame review. Historical keyword checkpoints
below retain their evidence, but those excluded validations are no longer pending
acceptance work.

The integrated outcome has ten accepted real-server
native formats and two retained Fast sampling-quality rejections, with targeted
causal proof after the DP correction. Phase prerequisites exclude nonvisual audio
receipts. Paced DP consumes unseen immutable revision snapshots so coalesced gain
and expiry renders still paint each gated change in order. Raising evolution
retains its physical revision through the native 1150 ms light; generic field
light tails remain nonblocking. Central audio uses its painted target and neutral
source until a physical source is identified; source metadata never comes from
future stack membership.

Start with `animationCatalog.ts`. It exhaustively assigns every server event to its
presentation families and to the board snapshot policy. `presentBatch.ts` consumes that
policy; the effects lab consumes the same catalog, reports observed recipes, and links the
other harnesses. An event listed in the catalog is a coverage contract, not evidence that
its animation has run.

The coordinator is `useMatchCues.ts`. It passes accepted public events and state snapshots
to `match/present/presentBatch.ts`; recipes remain beside that coordinator in
`match/present`, `match/steps`, `match/flights.ts`, and `match/watchers`. They enqueue work
through `animationQueue.ts`. Each track serializes its own work; gates order related
tracks. `match/tracks.ts` chooses which steps hold the board. Rules and legality always
read the live server state, while the field renders the snapshot the presentation reached.
In paced matches, visible hand membership, both hand counts and deck counts follow that
same revision. `handEntries.ts` merges live legality onto the shown cards; an effect's
future draw remains hidden until its clause releases the result, and becomes selectable
when the presentation catches up. `handHorizon.test.tsx` checks the actual hand and HUD.
The paced field also keeps DP, keywords, granted abilities and attack modifiers on that
revision. Refreshing them from future live state would reveal an outcome while its pulse
still waits; the screen test covers the printed DP even when no result event is emitted.

`timings.ts` owns concrete motion durations and the CSS custom properties. `pacing.ts`
owns source, announcement, result and settle beats, speed scaling, read floors and bounded
chain acceleration. Keep motion in those tables. Keep new event contracts in the catalog.
`game/style` and the piece components render the vocabulary; moving every renderer into
one directory would obscure the relation between a card and its state.

Accepted field effects get a 720 ms source focus at Normal speed before their clause appears.
Minor effects and later effects in a chain keep that orientation time: chain acceleration
shortens the clause and settle beats. The viewer's Effect speed still scales the source focus.
The focus then becomes the steady light linked to the visible clause. Announcement consumers
share the owner's safety ceiling, including a Security reveal before its source can focus.
Its source-local flare uses soft unequal rays around a white/coloured bloom for
360 ms at Normal, scaled by the existing Effect speed. The measured face aperture
keeps its printed art readable, and the light's SVG origin remains centred throughout
expansion. It replaces the two outlined rings and staggered flying points; source
hold, sound, colours and clause ownership retain their existing paths. Reduced motion
removes both the decorative flare and its clock. `pnpm motion:probe:field-light`
checks natural Arena activation and retained reduced-motion component rendering.
The focus mask is a direct child of the complete board, covering the hand, raising
area and bottom counters with the breeding shade. Its aperture remains relative
to the transformed source face; the overlay passes pointer input through and
notices and decisions stay above it. The probe checks this coverage at four widths.
While focus is active, the hand dock contains its fan's stacking order, and the
body-level enlarged hover face receives the same noninteractive shade. Both
release when focus ends; hovering and card selection retain their controls.

Trash activation paints the accepted physical source over its pile rather than moving
whatever card currently happens to be on top. The activation key restarts the overlay;
the instance ID selects alternate art. The actual top card, pile dimensions and count
stay in place, with the counter above the overlay. The source moves inward while growing
1→1.4 over 250 ms, grows to 2 over another 250 ms, holds for 250 ms, then shrinks to 1.4
in 80 ms. Each tween uses OutQuad. The displacement comes from the authored 100×140
face: viewer −1.9 widths/−95⁄140 heights, opponent +1.9 widths/+30⁄140 heights.
A linked clause preserves the keyed card and its complete CSS clock, then releases it
when that clause leaves. Reading waits through the actual painted 750 ms preparation;
standalone activation waits through painted 830 ms completion. Cancellation, skipping
and reduced motion drain both waits. An occurrence captures the viewer's Effect speed
once for its queue and CSS clocks. A revisited linked source uses the settled pose without
replaying its enlargement. The portrait source temporarily passes above neighbouring piles.
`pnpm motion:capture:trash` checks the physical source, curves, handoff, speed and geometry;
field-light rendering and camera projection still need comparison.

Hand activation keeps the physical source's slot in the fan while a decorative copy
leaves the clipped scroller. It uses the existing face dimensions, art and fan angle;
the original face is hidden only after the copy has a measured plane. Scale grows
1→1.3 with OutQuad over 250 ms, while a local −42% height pivot adjustment completes
in 120 ms inside that scale. The enlarged pose holds for another 250 ms and stays
through clause reading, without an automatic return tween. Viewport correction keeps
the focused face visible at the edge; the resting hand, order, counts and dock remain
unchanged. Hover/selection transitions, scrolling and resizing update the plane without
restarting its clock. A returning linked occurrence starts settled.
During the painted 500 ms preparation, pointer enter/exit cannot change the hand's
hover pose. The end of the scale-and-hold clock unlocks future hover events; an event
discarded during preparation is not replayed automatically. Keyboard/decision semantics
and the resting card layout continue through their existing paths.

Both queue and CSS use the occurrence's captured Effect speed. Reading waits through
painted 500 ms preparation (275 ms at Fast), even with a shorter configured hold.
Cancellation, skip and drain release the wait. Reduced motion uses a steady original
source cue when the renderer receives an occurrence, and omits the decorative portal.
`pnpm motion:capture:hands` verifies ten Arena fixtures at 320/768/1024/1440 px;
`pnpm motion:probe:hands` checks reduced-motion component rendering, settled resumption,
hover tracking and a live speed change. These prove Aegis's authored choreography and
physical-source lifecycle; reference camera and layout-engine pivot parity remain unproven.
The motion harness also provides a measured selection-hover interval with two pose guides.
`pnpm motion:measure:hands` correlates independent artwork patches in source frames
2071/2099, checks the guides/export and phone containment. That interval supports the
fixed-anchor local lift, while remaining a different action from effect activation.

Pointer hover uses the measured 1.2 scale and local −42% height pivot, with an
immediate return on exit. Its decoded face escapes the hand clip while the physical
slot retains size, selection, accessibility and pointer capture. Board-specific
corner controls retain their measured styles in the portal. The original face
uses visibility rather than an opacity transition, so release never fades it in.
Removing a physical copy clears its hover; reinserting it requires a fresh entry.
Touch and reduced motion keep the resting face. Effect preparation retains its
500 ms interaction lock and never stacks a second hover enlargement on its source.
`pnpm motion:capture:hand-hover` checks natural geometry, release, selection, touch,
reduced motion and native drag/capture at phone and desktop widths.

New hand faces enter over 80 ms with OutBack, starting half their own height below
the resting slot. The independent CSS translate leaves the fan transform intact;
entry keeps full opacity and resting card dimensions. Artwork must decode before
this short clock starts. A pending face keeps its physical slot reserved but hidden;
CardFull's text fallback also releases it. URL/node replacement and removed arrivals
cannot release a different face. An already populated mount stays still, rerenders
keep the same entry clock, and reduced motion shows the steady face immediately.
`pnpm motion:capture:hand-arrivals` checks natural visible entry at four widths,
separate exact-clock overshoot/loading probes, and source-marker guards/exports.
The draw-viewer clip marks 40 consecutive primary frames; these observed beats do
not establish a measured projected curve.
The hand-hover harness also marks its pointer-driven return at frames 2105/2107.
`pnpm motion:measure:hands` compares artwork in focused/resting positions through
seven frames, exports their media times and rejects uniform/non-finite patches.
The selection remains marked while the hover moves to another card; the mixed
recorded frame limits timing claims and does not define an effect-activation return.

Actual draws use the temporary deck face. Searches and returns use only the physical
80 ms hand entry: an already revealed card must not replay the draw effect. Server
`cardsMoved.handAddition` distinguishes `draw`, `transfer` and internal `staging`.
Searches, security additions and detached tops retain the recipient seat. General
returns emit contiguous owner/origin groups in requested order; revealed cards still
leave the deck, so both hand and deck counters remain held through their matching
showcase. Non-deck additions do not restore a card to the deck. Identity and alternate
art remain explicit only for public moves. A silent bridge before an immediate play,
Option use or digivolution creates no hand hold or draw scene.

Transfers share the serial presentation track, release their physical slot after the
causal/reveal gates and wait for its actual decoded entry clock before releasing the
next card. Both seats enter from half a card height below their resting positions,
using the same 80 ms OutBack. Opponent primary frames 4237/4242 support this direction
and approximate amplitude: the clipped back moves from y4 to about y−17 at 42 px
height, with ±2 px edge uncertainty. They do not establish a continuous projected
curve or its exact start clock. Existing slots and initial mounts stay still; slots
expose only opaque indices. Skipping, cancellation and reduced motion release the wait.
`pnpm motion:capture:hand-transfers` measures natural entries for private/revealed
additions, both seats, phone/desktop, reduced motion and late decoded viewer art.
`pnpm motion:measure:opponent-entry` independently recalculates the below-hand RGB
difference in 11 primary frames, checks guarded guides/export at 320/1440 px, and
observes two natural opaque draw entries. The harness includes the 20-frame opponent
clip, approximate moving/resting bounds and a graph of that image difference.

Deck draws now present a temporary face beside the actual deck pile: 60 ms OutQuad
movement/scale/rotation, a 90 ms viewer hold (50 ms opponent), then 70 ms narrowing
and 70 ms upward exit. The face becomes a white streak 35 ms into the narrowing.
Viewer light starts at the end of the first movement; opaque opponent draws use a
card back without that light. Decoding or a text fallback starts the painted clock.
`DrawLight.tsx` uses two directional beam fans instead of the generic arrival star:
the long fan reaches into the field, while the vertical fan crosses its source.
The rays last 100 ms after the 60 ms delay, with a separate 190 ms blue glow.
Their approximate envelope follows the measured primary field region; geometry,
particle alpha and material projection still require comparison. SVG gradients and
blur scale with the temporary face, using the existing draw palette.
Each physical hand card, hand count and deck count advances at the painted 210 ms
viewer / 170 ms opponent handoff, during the final 80 ms of the presentation.
`DrawPresentationView.tsx`, `drawPresentationModel.ts` and
`match/drawPresentationClock.ts` own this temporary face and its handoff.
An incoming raw deck-to-hand event reserves its card before `batchClosed` arrives;
the batch's measured flight then takes over the hold before paint. This prevents
a digivolution's bonus draw from flashing in the hand between its patch and its
presentation, even when playing the evolution leaves the hand count unchanged.
Opaque opponent draws wait for the newer patch before holding public counts.
When a schema patch arrives before its raw event, new hand identities and a deck
decrease are compared with the frozen closed revision, including partial patches
that still carry its version. Only current staging events bypass that reservation;
an earlier reveal of the same physical card cannot bypass a later draw.
Entry distances use the upright face's authored 0.45 scale: 60/(100×0.45)
is 1⅓ face widths; the viewer's 40/(140×0.45) is 40/63 face heights.
Translation remains in parent coordinates before rotation/scale, so those distances
are not multiplied by the changing face scale. The approximate held centre is
0.4 face widths inward from the actual pile, and 0.06 heights below it for the
viewer. The opponent keeps its zero vertical entry and held offset: its primary
temporary face uses a shared right-side presentation plane, whereas Aegis presents
beside each seat's actual pile. That layout adaptation is not a reconstructed source
camera. The harness supplies source-bound face/deck guides and a conditional
comparison of two intermediate artwork poses; it does not establish a complete
projected curve. `pnpm motion:measure:draw-path` reproduces that comparison.

One draw-presentation track serializes temporary faces after their owning steps
pass their cause, phase, arrival and reveal gates. Repeated printed IDs select the
nearest preceding reveal occurrence, including known alternate art. The reveal's
reading ceiling starts when its own row begins. A held physical card remains hidden
even if a newer revision lowers its hand count; metadata comes from its batch's
snapshot. Cancellation, skip and drain remove both overlays and held arrivals.
The older 340/520 ms flights remain as a fallback for unclassified legacy movements.
`pnpm motion:capture:draws` checks natural single/double draws and reduced motion
for both seats, hand/deck conservation, exact curves and artwork/streak boundaries.
Separately sought poses expose the visible shapes at 320/1440 px. This establishes
the authored sequence in Aegis; projected paths, camera and light parity remain open.
`pnpm motion:measure:draw-light` recalculates eight primary-frame regional luminance
samples and checks the harness chart, source identity and timestamped export.

Decisions keep previously accepted toasts in the recent scrollable stack and pause their
reading clocks until the answer. New effects enter the stack after acceptance; a new clause
asking for field targets waits for that selection to be confirmed. A clause that already
has a draw, cost, or other result stays available before its later target choices. Matching uses the
physical source and resolving effect key, so another copy's question does not remove an
earlier toast. Returning a clause preserves its occurrence ID. Desktop decision rails and
side dialogs reserve a separate lane for the stack; the mobile band counts all retained
effects and keeps their remaining reading time when opened during a long decision.
Tall pointer layouts reserve space for two complete notices above an open decision.

Deck shuffle uses three pairs of 30 ms vertical strokes at Normal, alternating the
existing layers by 30/140 of a face height with quadratic deceleration. Temporary
backs use the same sleeve, while the original counter and physical pile stay still.
Each accepted occurrence remounts its moving faces; an older cleanup cannot retire
its replacement. The queue retains the actual painted CSS finish before restoring
the resting pile. Reduced motion keeps the existing sleeves/counts without clones.
`pnpm motion:probe:shuffle` verifies both seats, decks/eggs, Normal/Fast, replacement
and reduced motion. Arena Tools exposes these controlled shuffle events.

The effects lab always uses the match's stacked timing. It ignores obsolete saved tuning;
its speed controls scale playback or Effect speed without switching the pacing style.
Recent toast columns retain up to six moments and scroll within their bounded height.
The edge buttons reveal notices above or below; arriving effects follow the newest only
while the viewer stays at the bottom. Toasts retain full opacity throughout the chain. Resolution progress strips and counters are omitted.
At Normal, stacked effects keep the 720 ms source focus, announce for 200 ms before results,
and rest for 100 ms afterwards. This brings a common field effect's lead-in near the reference's
0.9 s while leaving card travel, particles, Security scenes and toast lifetimes intact.

| Family                                   | Recipes and visible surfaces                                                                  | Evidence harness                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Opening, turn and phase                  | `flights.ts`, `usePhaseBanners.ts`, shields, phase ribbon, turn banner                        | New live match; `/dev/effects-lab` traces; queue/phase tests                                                 |
| Play and landing                         | `arrivals.ts`, `zoneChangeStep.ts`, `cardReveal.ts`, `ZoneShowcase`, `PermanentView`          | Accepted play → `zone-showcase` → `confirmed-play-landing`; `playArrival.test.ts`; effects-lab browser tests |
| Digivolution, hatch, promote             | `arrivals.ts`, `showcases.ts`, breeding slot, field burst                                     | Live effects lab; `/dev/arena?mode=visual` evolution/respawn playback; `showcases.test.ts`                   |
| Effect source and clause                 | `narrationStream.ts`, `effectSequence.ts`, `effectSources.ts`, `EffectFocus`, narration stack | Own/opponent/production chains in effects lab; accepted/declined effect browser checks                       |
| Optional, target, cost and order choices | `useDecisionBarrier.ts`, decision/combat overlays, source focus, target/fate badges           | Effects lab, `/dev/card-effects/EX3-074`, `/dev/mobile`; decision contract tests                             |
| Attack and field battle                  | `securityAttacker.ts`, `combatImpact.ts`, arrows, claws, clash ghosts                         | `/dev/battle`; visual keywords Blocker, Raid, Piercing, Retaliation, Ice Clad; combat tests                  |
| Security check and effect dock           | `securityRevealScene.ts`, `securityClose.ts`, `SecurityClashView`                             | `/dev/battle?scenario=security-chain`; effects-lab security/production Execute; security ordering tests      |
| Recovery and security destruction        | `securityGrowth.ts`, `securityDestructions.ts`, flight, shield and count                      | Visual Recovery; effects-lab security removed; security destruction tests                                    |
| Deletion, Option trash and return        | `deletionBursts.ts`, `deckReturns.ts`, shatter and return flight                              | Visual Delay/Execute/Partition; real Execute chains; deletion and held-board tests                           |
| Stack strip, source movement and link    | `stackStripPeels.ts`, `flights.ts`, linked cards and source badges                            | Visual De-Digivolve, Digi-Burst, Save, Material Save, Link, Detach; zone scene/peel tests                    |
| Reveals and zone movement                | `revealShowcases.ts`, side panels, public face flights                                        | Card effect fixtures; production Titan cascade; reveal and hand presentation tests                           |
| Memory                                   | `memoryHold.ts`, `MemoryGauge`, sweep, arc and prediction                                     | Effects lab; visual Training/Digisorption; `/dev/board` specimens                                            |
| DP and restrictions                      | `useDpPulses.ts`, `useRestrictionPulses.ts`, `CardMini`, persistent badges                    | Effects lab; visual Alliance/Reboot; DP, restriction and permanent tests                                     |
| Refusal and result                       | `useMatchCues.ts`, hand shake, rejection notice, `GameOverOverlay`                            | Rejected intent/live match end; `pnpm motion:probe:result`; rejection/result tests                           |
| Shuffle                                  | `deckRiffles.ts`, `deckRiffleStep.ts`, `deckRiffleClock.ts`, deck layers                      | Engine `deckShuffled`; `pnpm motion:probe:shuffle`; Arena shuffle tools; queue and pile tests                |
| Local selection and inspection           | `Hand`, `PermanentView`, spotlight, inspector, card zoom, drag ghost                          | `/dev/board`, `/dev/mobile`, visual arena; keyboard and responsive browser checks                            |

Implementation coverage and visual parity are separate. The table above inventories
existing recipes. Authored motion and browser captures have informed the draw/hand
entry, public reveal/landing, hatch, breeding transfer, hand/trash/field focus, attack
arrow/claw/tremor, security reveal/dock/disposal and shuffle changes. Their recorded
camera projection, materials and particles are not all reproduced or measured.
Opening deal/phase banners, memory/DP/restriction feedback, field returns/deletion branches,
source/link movements and decision transitions still need a complete comparison of
their existing recipes with the corresponding authored routes and video intervals.
An implemented keyword replay proves its rendering path, not every visual branch
that keyword can trigger.

Field deletions and central card destruction now share the 41 irregular front polygons
extracted from the authored fracture mesh. Every piece
starts together, keeps its printed scale/opacity and accelerates twentyfold after
100 ms, ending at250 ms. The physical CardMini is captured before departure, including
the current decoded or fallback artwork, responsive rim and suspension angle. Its
whole subtree scales together; ref detachment supplies a fresh snapshot even when the
live board drops the card before the cue starts. Board-owned snapshots are bounded and
cleaned on unmount. The card-coloured light uses the existing Aegis arrival renderer on
a separate non-blocking track. Six extracted emitters now replace the uniform rays,
with a1150 ms continuous-rate light owner; projection and procedural materials remain
adaptations. Painted clocks protect the shard and light cleanup at accelerated rates.
The birth surface now uses the caller's4/1/4 scale without enlarging particle sizes
or speeds. Stretched beams follow visible velocity rather than independent screen
spin; the authored camera basis retains height/depth, and the two mesh layers use
their ten-unit XZ-plane bounds. Pixel-unit calibration, mesh perspective warping,
runtime camera changes and material/shader equality remain unverified.
`pnpm motion:probe:field-shatter` checks natural departures at320/768/1024/1440 px,
Normal/Fast, reduced-motion departure and retained rendering. The reproducible mesh
generator is `tools/diagnostics/prepare-card-fracture.mjs --input <BreakBlock.fbx> --check`.
Projected radial distances, 3D physics and a consecutive deletion-video interval are
still unverified. Source/link removals and returns retain their separate recipes.

Central destruction uses the same 100/150 ms fragment clock and fills its caller's
actual CardFull box, including the 78px phone size and fallback artwork. The former
pre-crack/jitter and six spinning/staggered wedges are removed. An effect-trashed
security card fractures after its readable hold; a losing attacker remains printed
through the350 ms battle impact/settle before fracturing. Checked cards retain their
separate140 ms disposal. The stage stays opaque through the attacker fragments,
and CSS finish guards retain them even when lab queue waits run at2x/4x. Pausing,
cancellation, skip and drain preserve cleanup. The first printed colour drives the
six-emitter Aegis light. Its separate screen layer shares the fracture's birth clock
and remains for1150 ms without holding the board or a decision. Concurrent scenes
retain their own lights. Clear, skip, drain, reduced motion and the match-view scope
remove them; a source removed before its departure never emits. Projection and
procedural materials remain adaptations. `pnpm motion:probe:security-light` checks
12 natural Arena scenes and21 supplementary real-component/queue lifecycles.
`pnpm motion:probe:central-shatter` covers12 natural Arena cases,16 separately sought
both-seat decoded/fallback geometries and six real-renderer/queue playback cases.
`--changed` reruns the losing-attacker flows and playback after lifetime changes.
The primary-video review adds f39370–39398 (29 unique frames of shield/reveal),
raising consecutive-frame coverage to681/40,622; these do not establish destruction
video parity. Projected physics/camera and the full-family comparison remain open.

The match result is revealed immediately at its resting size, with its reason and
actions ready on the first frame. Its former 520 ms fade/zoom/blur has been removed:
the authored result activation is direct and its scene/prefabs have no entrance
animation. The Aegis result layout, palette and text remain in use. The first action
receives focus immediately. `pnpm motion:probe:result` checks all three outcomes,
normal/reduced motion and 320/768/1024/1440 px. The supplied video ends without a
match-result transition, so this is code/scene and runtime evidence, not video parity.

The arena keyword player and card fixtures send scripted events through the real match
renderer; they validate visual recipes without proving rules. `/dev/effects-lab`, the
battle lab, API scenario tests, and `test/pacing` execute the real engine. Use both forms:
the trace cannot prove visual geometry, and a scripted scene cannot prove legality.

For a normal play, accepted `cardPlayed` publishes the public face. Both seats reveal
the card through a 100 ms white turn, 160 ms face reveal, 160 ms recognition hold and
140 ms narrow upward exit, preserving Aegis card styling, captions and board layout.
The field stays hidden through those 560 ms, then appears on its local burst. Independent
arrival/reveal steps acquire `CardReveal` only after their causal gates open, so one reveal
cannot overwrite another or hold its own clause behind it. Options dock after the reveal;
digivolution draws wait for the actual destination burst peak, including across batches.
`On Play` and `When Digivolving` wait for the physical arrival and its field burst before focus/clause.
An arrival with a known later revision is a consequence of that clause, so it never blocks
the clause itself; `arrivalOrdering.test.ts` exercises an On Play that evolves its own source.
Hidden cards stay hidden until the accepted public event. Reduced motion and history
collapse the reveal, release destination holds, and retain the readable information.

An accepted hatch appears directly in its breeding slot. The egg stays opaque and
settles over 100 ms with the piecewise quadratic OutBounce curve, while the existing
white/blue Aegis light continues independently for1150 ms. The extracted local
depth is projected around our board centre, beginning at approximately1.033 scale
with a small off-axis displacement. Scale is reciprocal in depth, rather than a
linear enlargement; the slot and final card geometry remain fixed. DigiEgg cards
keep a quiet default entrance, so removing the burst cannot restart the ordinary
320 ms field fade. Reduced motion shows the egg at rest immediately. The hatch
fixture is `/dev/arena?mode=visual&scenario=hatch`; `pnpm motion:capture:hatches`
checks both seats, slot geometry, settled identity and the real CSS interpolation.

Physical plays, evolutions and hatch paint four landing groups: rounded stars,
short beams, sparks and a soft core. The extracted capacities total190, with
simulationSpeed2.5 compressing emission, motion, spin and lifetime into400 ms.
They share the existing1150 ms colour-light canvas/clock, retain Aegis palettes
and finish without extending the200 ms consequence handoff. Fracture and
centre-stage showcase retain their separate recipes. The generic landing dust is
removed. A confirmed field/evolution drop uses the100 ms OutBounce envelope,
including previously separated copies; cleanup keeps the face at rest without
replaying its ordinary entrance. A registered depth property owns the same paused
CSS clock as the100 ms drop. The nominal source lens is mapped to Aegis's own board
principal point; native per-row offsets, corner perspective and particle pixel-unit
calibration remain separate fidelity work.

Desktop narration renders at most two actual text toasts on the left and two card
panels on the right. A rejection takes one left slot; a record carrying two card
panels counts twice. Other records retain their original reading clocks and
dismissal ownership. The columns stay at one top anchor with fixed viewport-bounded
heights, independent of decision visibility. Long contents scroll internally and
decision controls remain above both columns. Accepted effect clauses enter fully
opaque with a100 ms OutQuad translation; other notices and card panels retain their
own entrance clocks. The portrait accordion retains its existing presentation.
`pnpm motion:probe:notice-lanes` checks stable geometry, counts, rejection and
decision-control hit testing at768x520,1024x760 and1440x900, plus reduced motion.

A raised stack moves from its measured breeding position to its actual battle slot
over 200 ms with OutCubic deceleration. The card and sources travel together;
the real destination stays hidden until the moving stack reaches it. This transfer
does not play the new-card burst, dust, bounce or entrance fade. A snapshot taken
before the source is removed preserves the current responsive artwork and badges.
The final frame remains through React's handoff; reduced motion reveals the resting
card directly. Playback rate, pause and single-step use the queue run's clock.
`pnpm motion:probe:breeding` samples natural Arena transfers at 320/768/1024/1440 px
for both seats and speed settings, including source identity and final geometry.
Tools exposes each seat's transfer in `/dev/arena?mode=visual`.
`pnpm motion:probe:breeding-playback` exercises the production hooks/queue with a
synthetic face for single-step, pause/resume, cancellation, skip and final handoff.

An accepted attack's target arrow waits for the actual CardMini suspension rotation
to finish. A source without a rotation needs no delay. The existing Aegis chevrons
and colours extend toward the destination twice: 85 ms advance and 70 ms hold per
cycle, then a 70 ms settle. The shaft and travelling tip share the same clock.
The completed arrow follows measured card/security edges; Blocker and Raid redirects
keep the original key and do not replay the sweeps. Reduced motion draws it fully.
Declaration identity comes from the stream's batch/sequence, shared with the clash
scene; fabricated raw events and their batch copies share a local occurrence identity.
The incremental tracker retains an open attack after its declaration leaves the
100-event log. A closing field scene carries the actual painted declaration age;
endpoint updates keep the same component clock and a remount restores that age.
Only the remaining part of the 380 ms declaration precedes impact. A declaration
that has not painted uses the full beat, then checks the actual shaft clock.
`pnpm motion:capture:arrows` records the real Arena renderer on desktop and phone,
including the physical destination change when a Blocker intercepts.

Combat claws keep the existing Aegis paths and colours. The complete shape travels
from outside the card's top-left corner in 250 ms with cubic acceleration, then
holds its final frame until the impact owner removes it. All three paths share
one clock; security claws wait for their scene's outcome. Card clipping and
reduced-motion hiding remain in place. `pnpm motion:capture:impacts` records field
and security impacts through the Arena on desktop and phone, checks the diagonal
trajectory and measures the completed hold using page time: a finished CSS clock
clamps at its duration. The attacker stays in its slot throughout the target arrow
and impact; player dragging is a separate interaction. The field scene uses the
remaining arrow time plus 250 ms of impact and 100 ms of settle, with a 730 ms
fallback for an unpainted declaration. It has no automatic position impulse.
The impact owner checks the painted CSS clock through the final settle before
releasing its completion gate; caused clauses, arrivals and shards wait for it.
Bare battle impacts with no known defender follow the same 350 ms boundary.
Local CSS ages and carried-clock advance respect playback speed and pause.
Retained losers suppress a fresh entrance scale. The field claw mask stays at its
impact anchor while a planar grouped-row FLIP moves its parent, using an inverse
animation with the same timeline origin, easing and rate. Pending origins and
replacement flights rebind without restarting the claw's independent clock.
`pnpm motion:capture:impacts --no-video` checks live rendering without generating
a new recording and verifies that field wrappers receive no automatic attack
translation. It recognizes the separate grouped-row FLIP by its actual target,
keyframes and 420 ms layout clock; legitimate slot reorganization can use either axis.
Separate production-component probes at 320/1440 px check carried-arrow remounts,
unchanged clocks when endpoints move, local ages at 0.5×/2× and speed changes,
and a fixed mask through a pending/replaced parent layout flight. These controlled
probes are distinct from normal Arena playback and primary video measurements.

The losing artwork trembles independently of the claw. Its 250 ms tremor uses
seven progressively longer intervals with quadratic deceleration and declining
strength, followed by the existing 100 ms settle. Field cards and security
attacker representations normalize strength against the source's .9 field scale;
revealed security cards use its .6 scale. A reproducible planar direction sequence
keeps captures comparable; it does not reproduce a particular random source path.
Live permanents, removal ghosts and central security art share that curve.
The ghost leaves its own overflow visible while the claw retains its clipping.
`motion:capture:impacts` additionally checks attacker loss and dock-to-battle
restoration. Its separate production-component probes seek CSS clocks deliberately
to verify ghost geometry and reduced motion at 320, 768, 1024 and 1440 px;
these probes are not normal-speed playback recordings.

Security reveals grow from the owning side in 233 ms, following the sampled
Hermite scale and lateral arc while a white face clears into the printed art.
The existing Aegis rays appear behind the card for 170 ms after it settles;
recognition/preparation totals 470 ms before the verdict. A card that docks for a
security effect instead moves after the 170 ms light in one 120 ms transfer,
measured from its painted reveal to the existing Aegis dock. The previous art hides
while the destination carries the card, then the old scene clears. The dock frame
and caption appear on arrival; resting dimensions and layout remain unchanged.
`pnpm motion:capture:transfers` checks continuity, the quadratic trajectory, full
opacity, completed handoff and reduced motion at six viewport sizes. Distinct scene
keys prevent the departing reveal from leaving orphaned DOM beside its dock.
Resolved checks share this path, including older payloads without a reveal event:
their source clause reads before the played card arrives, then its On Play appears.
`pnpm motion:capture:transfers --resolved` verifies that order and indexes separate
desktop/phone recordings. Cancellation during transfer, reading or closure releases
the owned scene and board; an already released battle hold cannot be restored by
a late shield break.
Execution slots close directly after their owned clauses and results, without the
former 300 ms hold and 220 ms fade. Options still wait for their own decision and
for routed-batch arrivals, reveals, draws, recovery, returns to the deck and cards
placed under a Digimon.
Later narration remains outside that wait so it can depend on the slot's settlement.
Event-driven flights retain their originating batch. A clause waits for earlier
batch draws rather than its own same-batch draw, which needs that clause first.
A pending server check
can hold longer for its actual result. Outcome transforms use forwards fill and
the loser alone takes the artwork tremor, so the entry is not overridden before it
starts. Phone layouts retain the curve/clock with a narrower arc to keep the
card visible. Resting positions, sizes, captions and typography are preserved.
`pnpm motion:capture:security` records both owner scenes and marked effect/trashed
CSS variant probes; reduced motion displays the readable cards without motion
or a white cover.

Checked cards now narrow/elongate for 70 ms, then rise for 70 ms, each with quadratic
deceleration. The printed face clears 35 ms into disposal. A battle finishes its
250 ms claw and 100 ms settle first; a no-battle check leaves after recognition.
The queue retains the actual painted CSS finish, including React commit latency.
A card returning from its dock stays revealed instead of replaying the white
entrance underneath the claw. Effect-driven destruction retains its shards.
`pnpm motion:capture:security:exits` records both seats and the dock-to-battle path
on desktop/phone and checks reduced motion at four additional widths.

`screen/model/visibleBoard.ts` is the probe and harness projection of the rendered field,
piles and readouts. It applies `presentedSeats` plus arrival visibility, rotation, shield,
hand and memory holds and copies public values for each frame. Keep raw snapshot revisions
as diagnostics; they are insufficient evidence that an effect's result appeared. A revealed
Security card may already exist in the selected snapshot while its actual field slot stays
hidden. Judge each result against the projected card, zone, rotation, DP or gauge it changed.

Run `pnpm --filter @aegis/web exec vitest run src/game/animationCatalog.test.ts
src/game/playArrival.test.ts` for the event contract, reveal ownership and arrival handoffs. Run
`pnpm --filter @aegis/web pacing:measure` for the speed/style/real-scenario matrix and
`pnpm --filter @aegis/web test:browser effects-lab-pacing.spec.ts` for live rendering,
cause-before-result, accepted/declined effects, mobile geometry, and queue recovery.

Source and stripped-top removal now renders an upright black silhouette with a rim
from the removed card's first printed colour. The authored 170 ms lift, 85 ms
lateral return, 170 ms hold and 170 ms fade total 595 ms; the first lateral leg
runs for 85 ms alongside the lift. Sources across hosts share one serial track,
and the final painted fade precedes the next source or decision. Host entrance
identity survives source loss/top promotion and restarts only for an accepted
arrival. `pnpm motion:probe:stack-strips` verifies 20 natural owner/opponent
scenarios at 320/768/1024/1440 px (including Fast endpoints), plus four natural
and retained reduced-motion checks. Projected camera/material parity remains open.

Decision sheets now have a sibling backdrop independent of the sheet's scrolling
and entrance translation. The shade covers the complete arena, including hand and
raising areas. View board removes the shade until Return to decision; desktop
side rails retain their clear field. `node tools/diagnostics/probe-decision-backdrop.mjs`
checks production decision/ordering components over Arena and live Effects Lab boards.

While the board is in view, the Return to decision bar opens on the left edge, level
with the View board button that was pressed. The grip handle moves it by pointer or
arrow keys. The moved position is saved in `localStorage`
(`aegis.decisionReturn.position`) and reused, clamped to the viewport, every time the
bar opens. Home clears the saved position. Phones keep the full-width strip below the
opponent bar.

Field return-to-deck now moves the whole upright physical stack for 250 ms with
OutQuad easing, keeps its responsive size constant, then hides field chrome and
fades the printed face for 160 ms. It targets the owner's actual Aegis pile.
`TIMINGS.deckReturn` owns the total 410 ms clock; a painted completion gate keeps
later removals from overlapping the final fade. Discard/skip paths release that gate.
`pnpm motion:probe:deck-returns` checks 14 natural owner/opponent, Normal/Fast and
suspended deep-stack scenarios. `node tools/diagnostics/probe-deck-return-poses.mjs`
adds four retained 50% scaled decoded/fallback stacks and four natural reduced-motion
cases. Source camera/materials, count/attachment cleanup and all leave branches
still need a complete comparison.

A card that an effect plays after paying with a deck return waits for that return. The
return is the latest removal link, from an earlier batch, still flying or landed less
than `TIMINGS.deckReturnLanding` (120 ms) ago. The play reveal starts once the stack has
landed and that beat has passed. Only deck returns mark their link for this wait. Hand
returns, deletions, older or finished links, skipped or discarded returns, and returns
without geometry add no wait. The beat's start is the wall-clock landing time, so time
the arrival spends queued after the landing counts toward it. A return and a play in the
same server batch are not ordered by this beat. `deckReturnPlayPacing.test.ts` replays
Asuna Shiroki's start-of-turn chain (return to the deck bottom, then play from trash) at
the real hook, for both presentation pacings and both beat styles, and checks that a
return to hand does not hold the play. The `arena-bt24-asuna-return-play` live arena
scenario reproduces it against the real server. Measured painted clocks, before and
after this change:

| Viewport, speed | Flight    | Play reveal starts                      | Overlap frames |
| --------------- | --------- | --------------------------------------- | -------------- |
| 320 px, Normal  | 485 → 457 | at flight start → +118 ms after landing | 28 → 0         |
| 1440 px, Normal | 492 → 503 | at flight start → +135 ms after landing | 29 → 0         |
| 1440 px, Fast   | → 509     | → +128 ms after landing                 | → 0            |

Fast scales clause beats only, so motion clocks match Normal. Reduced motion hides the
flight. The new card settles on the field 49 ms after Asuna leaves it, and the queue
does not wait.

Field return-to-hand now uses the whole departing physical stack: a 250 ms OutQuad
approach to the owner's actual hand dock, keeping each face/source/link orientation.
The viewer's stack grows to 1.1 times its field size; the opponent's shrinks to 0.25.
It disappears without fading, then waits 100 ms before the existing 80 ms hand-entry
beat. Multiple hosts return serially; all returned cards enter after the last host.
Public whole-field receipts distinguish this from private recovery, staging and
surviving-host top detachments. Cancellation/discard releases holds and entry gates.
`pnpm motion:probe:hand-returns` checks 22 natural responsive owner/opponent, batch,
Fast, suspended-deep-stack and reduced-motion cases. `node tools/diagnostics/probe-hand-return-poses.mjs`
checks 16 retained decoded/fallback, scaled and mid-entrance poses, including every
source/link face. Camera/material parity, the prior returned-card showcase, attachment
cleanup cadence and the complete primary-video comparison remain open.

## Real keyword and grouped-card pacing

`design/cardMotion.ts` owns the shared 200 ms smoothstep artwork turn. Organized
lane movement retains its separate 420 ms clock. When physical cards rejoin a
group, an inert artwork copy returns to the group's actual centre, preserving
the interrupted translation and artwork angle. A subsequent shared-width update
retargets that same copy from its current eased position, preserving its native
clock and completion deadline. Resting board geometry stays unchanged; reduced
motion removes the flight and turn.

Effects Lab includes real-server layouts for Piercing, Jamming, Retaliation,
Alliance/Barrier/Blocker/Evade/Armor Purge accept/decline, Reboot, and `effects-lab-field-grouping`.
Blocker uses the real opponent turn and direct block decision. Reboot suspends
two printed holders and a non-holder through three public attacks, then checks
the opponent's Unsuspend phase: only the holders turn, staggered by 60 ms.
The grouping layout uses two printed Izzy Izumi
cards and native activation/selection decisions to split and reunite the group.
The keyword layouts seed printed cards and resolve through public engine
intents; they do not grant keywords or fabricate events/results.

Evade uses Groundramon attacking Security Death Claw, which can delete the
still-active Syakomon but cannot target the level-five attacker. Acceptance turns
Syakomon; refusal deletes it. Armor Purge uses a legal Monodramon/Flamedramon
stack attacking suspended Phoenixmon. The impact finishes before the protection
choice. Acceptance peels Flamedramon while retaining the previous top and source
on the field, then exposes suspended Monodramon with its retained attack DP bonus.
Refusal removes both cards. The movement receipt precedes asynchronous continuous
reactions; the presentation holds the snapshot containing the actual departing top,
including progressive holds when several removals share one patch.

Run `pnpm --filter @aegis/web exec playwright test e2e/effects-lab-pacing.spec.ts
--grep 'real (keyword|group) pacing' --reporter=json` to capture the six
basic Normal/Fast keyword cases, sixteen Alliance/Barrier decision cases,
eight Blocker decision cases, four Reboot phase cases, sixteen Evade/Armor Purge
decision cases and six responsive/reduced-motion group cases (56 cases total). Pass
the saved JSON report to `node tools/diagnostics/summarize-keyword-pacing.mjs`.
The observer records real event batches, decisions, queue steps, native
animations, arrow target changes, phase ribbons, board changes, painted stack
peels and sampled DOM artwork identities/poses. Hidden reduced-motion peels are
excluded using actual bounds and SVG opacity. DOM poses and native animation observations share the requestAnimationFrame
clock; callback completion time is retained separately. Its batch timestamp is a
browser presentation hook observation, not a server/network timestamp. Coverage
is ten of 46 keywords after the Digi-Burst cost checkpoint below; native clip candidates and remaining scenarios require
review. Source report statuses retain failed cases even when they have no full
capture, so keyword coverage alone does not mean the entire matrix passed.

The server's `battleCompared` receipt names attack-battle deletion candidates
before optional protection. Their claw/settle completes before Barrier's
question, including when the card survives. Final deletion/combat receipts do
not repeat that blow. Unconditional immunity still removes the candidate, and
effect-driven battles cannot consume a declared attack's comparison. The
summary separates queue waits, sampled painted beats and decision windows;
none of these spans is presented as a server execution measurement. A live DP
change may replace its previous decoration on the same card; the harness requires
the replacement to start at cancellation and complete, while retaining both trace
records. Attack, impact and other causal tracks retain strict cancellation checks.

Digi-Burst now has two real-server layouts: WarGrowlmon pays Cupimon and Salamon
to reduce Phoenixmon from 12,000 to 8,000 DP or delete Dracomon at zero DP.
The public movement receipt carries both fields' resolved DP before the cost.
Only those figures are held while the two sources peel; each consecutive cost
keeps its own receipt. DP pulses wait for source-removal steps belonging to their
revision, including a receipt processed after an early patch, without waiting
for a future cost. Paused cancellation releases the pending badge suppression.
Eight native Normal/Fast, 320px and reduced-motion captures passed with no
expired gates or truncated records. The surviving target's painted DP pulse
followed the second source's last painted frame by 116.7–150 ms in those captures.
These are observations, not authored timings. Evidence is retained under
`.local/keyword-pacing/digi-burst-cost`. De-Digivolve layouts and server outcomes
are registered, but intermediate-top DP presentation remains unresolved and is
not included in verified keyword coverage.

## Pending original audio pass

Queued after the real-server keyword pacing and grouped-card motion work. The
goal is richer feedback with an original Aegis sound palette and original background
music. Use the reference only to understand when audio helps the action read;
do not reuse recordings, samples, melodies or authored sound recipes.

- Cover every effect with a defined cue or a deliberate shared family; map all
  keyword scenarios and generic results so uncommon actions retain feedback.
- Distinguish end of turn from the next turn's start announcement.
- Scale the digivolution motif by the destination level and level change:
  level 3 to 4 stays simple, while larger evolutions develop the same motif.
- Give On Play a readable cue whose weight follows the printed play cost, with
  an Assembly variation that still belongs to the same sound family.
- Include hand discard, source removal, De-Digivolve, effect activation/resolution,
  attacks, impacts, security changes and grouped-card interactions.
- Add original background music with its own enable/volume setting alongside
  effects volume. Keep action cues clear over it and respect saved mute settings.
- Trigger audio at the corresponding visible presentation beat; replay, skips,
  repeated batches and interrupted cues must not duplicate or leave audio running.
- Limit concurrent voices and mix simultaneous effects so long chains remain
  readable. Validate sound timing with the same real-server scenarios, including
  Normal/Fast playback, decisions, cancellation and reduced motion.

This is queued scope, not completed audio coverage. The current short synthesized
feedback in `design/sound.ts` remains the starting implementation.

## Mobile narration

Phones that collapse notices (`collapseNotices`) use the folded band from the main branch: one row naming the newest moment and counting the rest, which opens the full column. The compact-toast and floating-row redesigns of 2026-10-05 were canceled and removed.

## Real attack and grouping checkpoint, 2026-10-05

Rush, Raid acceptance/refusal and inherited/accumulated Security Attack now have
real conserved-deck fixtures, public server actions and native browser captures.
The security count waits for the keyed 150ms lead-in plus 233ms reveal; each
physical check finishes its 140ms disposal before the next. Raid re-aims the
existing arrow at the chosen duplicate and preserves the other cards; its
neighboring 420ms relayout is checked through native completion.

Departing face/upright/hand copies share one frozen style tree and retain
independent orientations. The recorder distinguishes actual active native
motion from a pending start, CSS delay or filled final pose while preserving
raw gaps and the 50ms sampling/global-p95 limits. Unknown clocks remain
conservative. The 26 attack/group combinations have passed across retained
runs; the expanded run's four rejected captures remain alongside their four
passing calibrated follow-ups. This is not a single green full-matrix claim.

Latest native keyword coverage is **16/46**, including the earlier completed
stack and deck passes. Thirty keywords, complete reference-frame review and
the original audio pass above remain pending.

## Evolution and end-turn attack checkpoint, 2026-10-05

Blitz acceptance/refusal uses BT5-086's real digivolution, ordered printed effects
and public attack declaration. Vortex acceptance/refusal uses a freshly played
EX7-034, its actual end-turn permission and the second physical suspended target;
ordinary attacks remain illegal. The conserved-deck fixtures passed 35 engine tests.

The keyed arrival now completes its actual painted exit before field handoff.
Security scenes retain the original declaration when the server already closed
the attack, and preserve its native sweep clock across disposal and effect-selection
interruptions. The browser checks the native arrow age on subsequent security
checks; temporary effect beams cannot replace the retained attack occurrence.

All 16 new Normal/Fast, 320px and reduced-motion combinations have passing coverage
across retained runs. The initial responsive run passed 14/18 including two prior
multi-check cases; its four rejected cases remain preserved. Targeted follow-ups
fixed driver readiness, terminal-count observation and a portaled hand hover covering
mobile decision controls. This is not a single green full-matrix claim. Latest native
keyword coverage is **18/46**, with 28 pending. Focused presentation validation passed
294 tests, including eight real hook/arrow remount regressions.

## Next: phase and autonomous-opponent pacing

Requested next: measure Unsuspend, Draw, Breeding, Main, End and turn handoff with
real server scenarios, especially consecutive bot plays, evolutions and attacks.
Separate browser batch receipt, decision reading, queue waiting and native motion;
batch receipt is not server execution time. One retained Normal capture received
the opponent hatch at 7,615ms and first painted its Draw ribbon at 17,925ms after
the capture began. Its automatic Main pass followed the hatch in the server log.
The server currently coalesces narration deadlines for sequential clients while
the client serializes phase ribbons. Investigate that mismatch and the phase order
of hatch/draw cues before changing durations. Repeat Normal/Fast, mobile and reduced
motion, preserve the existing layout, and commit each verified correction.

Complete reference-frame review and the original effect/background-audio pass above
remain open. No new audio or complete phase-pacing claim is made by this checkpoint.

## Phase and autonomous-opponent sequencing checkpoint, 2026-10-05

Phase and turn narration now extends the bot's serialized deadline even when the
client owns effect-chain pacing. Effect-chain deadlines coalesced at this checkpoint; the
2026-10-06 correction below replaces that behavior. Both modes
have a regression requiring the complete opening phase budget before breeding;
all 47 BotPlayer tests passed. No thinking ranges or authored durations changed.

The 2026-10-06 correction serializes accepted effect budgets instead of coalescing
them and grants `digivolved` the same arrival budget as `cardPlayed`. The bot waits
through the queued chain and every trashed security card before choosing its next Main action. Reflex answers
inside a resolving effect or security check retain their existing clock so they
can release the engine continuation. Headless injected delays remain unchanged.

Turn and phase panels finish their actual keyed native animations before unmount
and release. A raw attack publication waits for pending phase presentation; an
already presented clash retains its own arrow. Production build, TypeScript,
226 phase/draw/painted-clock tests and eight hook/arrow regressions passed.

A conserved real-server board follows autonomous hatch, three distinct ordinary
attackers, three security checks, automatic Main pass and the next turn. Normal,
Fast, 320px and reduced-motion cases have passing coverage across retained runs.
The six-case follow-up passed 5/6, including Blitz/Vortex regressions; desktop
Normal was rejected for an active phase sampling gap. Three plain Normal rejected
captures remain alongside a later passing plain capture and separate diagnostics.
No single green full-matrix or statistical smoothness claim is made. The 50ms
sampling limit remains unchanged; reduced motion verifies terminal behavior.

In the latest passing Normal observation, Main left at 9,692ms after capture start;
attacks first appeared at 10,458, 12,458 and 14,591ms. The preceding security checks
left at 11,958 and 13,875ms. All opponent turn/phase clocks reached 1000/1000 or
1100/1100ms. Receipt timestamps are separate from visible action timing.

Evidence is under `.local/phase-pacing/`; the pacing summarizer now includes phase
panels, native endpoints and hatch observations. Bot play, digivolution, raising
movement and trained-policy phase coverage still need dedicated captures. Native
keyword coverage remains 18/46; full reference review and original audio remain open.

## Effect battle checkpoint, 2026-10-05

Room RQT-ggviX: EX13-076 Imperialdramon: Paladin Mode's [When Digivolving] strips
BeelStarmon's three sources and has Imperialdramon battle it. No attack is declared.
The server sent only the battle deletion, so the loser shattered as an effect deletion
with no arrow, claw or shake.

The engine now sends `battleCompared` for every permanent battle. An effect battle
carries `effectBattle` (attacker seat, public card and art IDs) and never stands for
the open attack, even against the same pair. The client stages its scene under the
`clash:<key>` arrow the renderer already draws, and the blow waits for that painted
arrow. A comparison with no deletion candidate still meets with no card struck.
Blows on the impact track queue instead of replacing each other.

The server publishes the comparison one batch before the deletion. Each loser's
landed gate is kept until its battle deletion takes it, so the burst and the
deletion's notices wait for contact. That wait counts queue time, so a pause holds it.

`/dev/effects-lab?scenario=effects-lab-paladin-battle` reproduces the room on a real
server. Measured with a throwaway per-frame probe on private servers, Normal speed:

| Run          | Arrow   | Defender struck (claw/shake clock) | Shatter |
| ------------ | ------- | ---------------------------------- | ------- |
| Before, 1440 | none    | none                               | 4682 ms |
| Before, 320  | none    | none                               | 4033 ms |
| After, 1440  | 3069 ms | 3469–3843 ms (250/250 ms)          | 3921 ms |
| After, 320   | 3753 ms | 4152–4535 ms (250/250 ms)          | 4639 ms |

The arrow's extend and tip clocks finish (310 ms) before the first struck frame. The
attacker stays visible and the defender stays mounted until the shatter. Fast speed
keeps the same order at both widths. Reduced motion skips the decoration and removes
the defender with no errors. An 8 s pause after the arrow paints holds both the strike
and the shatter until Resume.

Limitations: the returned sources show only the defender's relayout (about 240 ms),
which ends before the arrow; a dedicated return animation belongs to the deck-return
work. The clash ghost can show for one frame before the arrow. Logs from before this
change have no comparison receipt, so replaying them still shows no clash.

## Result and turn handoff hold, 2026-10-06 (#5065)

The live state flips `gameOver` with the winning blow. `match/queue/useResultHold.ts`
keeps the result splash back, and the narration, attack banner and security scenes on
screen, until finite queue steps drain, the `gameOver` batch is presented and the last
clause has had `clauseReadableMs`. A 4 s stall clock and the `budgetCeilingMs` ceiling
fast-forward the queue and show the result. Reconnects, late spectators and drain mode
never hold. Legality, the match timer and intents keep reading the live state.

Phase and turn ribbons now wait for the batch of every streamed event before them, not
only card arrivals. An end-of-turn effect that moves no card no longer lets "Your turn"
play before its clause. `resultHold.test.tsx` and `turnHandoffHold.test.tsx` cover both;
`/dev/arena?scenario=arena-issue-5065-lethal-attack-order` and
`/dev/arena?scenario=arena-issue-5065-opponent-turn-end` reproduce them on a real server.

## Effect targets, status pulses and phone prompts, 2026-10-14

The API now emits `effectTargetsSelected` from every core targeting verb, not only
from deletion: restrictions, attack-target locks, suspend and unsuspend, DP changes,
keyword grants and returns to hand or deck. `verbs/emitEffectTargetsSelected.ts` owns
the emission. It skips the resolving source itself, continuous auras and anything
outside an effect resolution, and it emits each target once per resolution frame, so a
clause that grants two keywords to one Digimon draws one amber arrow. The client needs
no change: `presentBatch.ts` already turns the event into the tracking arrow and the
target glow. Replay records that predate the event were re-baselined on their
`stateVersion` and `engineEvents` counters only.

The summoning-sickness ring now hangs from the lane's badge strip
(`--field-lane-top`) instead of a percentage of the card, so its top star stays inside
the lane's clip on phones and on tall desktop cards. The server projects
`summoningSick` only for permanents whose effective kinds include Digimon, so a Tamer
or Option played this turn wears no ring and reads no "can't attack yet" label.

`useRestrictionPulses.ts` now reads `readStatusFlags.ts` and raises a generic
`buff` or `debuff` pulse beside the attack and block jolt. A buff is a granted
keyword, an immunity, a protection or Security Attack gained; a debuff is any other
restriction or Security Attack lost. The card lifts in a warm glow or sinks in a cold
red one for `statusPulse` (600 ms), on the same track and causing-clause gate as the
jolt, and sounds the DP pulse's buff or debuff cue. Reduced motion drops the motion.

Phone activation prompts keep their bottom dock. The source-clear placement only caps
the sheet to the room under the source card when that room holds eight clause lines
(`MINIMUM_PROMPT_SPACE_PX`); otherwise the usual full sheet shows. The board decision
rail carries the same move handle as the activation dialog (`PromptMoveHandle.tsx`),
out of the Tab cycle, and a dragged sheet keeps the viewport gutters.
