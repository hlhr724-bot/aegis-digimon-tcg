# Engine runtime inventory for search snapshots

`GameState` is insufficient to resume an engine. This inventory identifies the
runtime owners that must participate in a versioned snapshot contract. It is an
implementation inventory, not evidence that snapshot/restore already exists.

| Runtime owner                                                                 | State absent from GameState                                                                                                                                                                                         | Required representation                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/setup.ts`, `GameEngine.rngForSeat`                                    | Mulberry32 state or HMAC shuffle counter in closures, independent per-seat streams                                                                                                                                  | Tagged generator algorithm, unsigned state or seed/counter, and secure random-key reference; preserve exact output sequences and keep secrets server-side                                         |
| `effects/kernel.ts` `UseTracker`                                              | Counts keyed by instance and effect identity                                                                                                                                                                        | Ordered key/count entries, restored before recomputing effects; preserve counts for departed-card rules                                                                                           |
| `effects/modifiers.ts` `ModifierLedger`                                       | DP and player-DP modifiers, overrides, floors, piercing, evolution/play cost adjustments, callbacks and identity keys                                                                                               | Typed descriptors with duration, source identity, recipient, tier, ordering and captured values; resolve callbacks from registered IR descriptors                                                 |
| `effects/continuous.ts` `ContinuousEffectLedger`                              | Restrictions, attack targets, keyword/name/trait/color grants, policies, constraints, expiration recipients and dynamic predicates                                                                                  | Rebuild continuous-tier registrations from the restored board; separately restore persistent triggered entries, expired recipients and captured values; descriptors must replace dynamic closures |
| `effects/subtriggers.ts` `SubTriggerRegistry`                                 | Subscriptions, replacements, reducers, registration sequence, once-per-timing map and activating reducer keys                                                                                                       | Serializable registration descriptors with source/anchor identities, captured bindings, duration, stable ordering and usage keys; reconstruct execution functions against the new engine          |
| `security/securityDp.ts`, `deletionMaxDp.ts`, `dpDeleteBudget.ts`             | Triggered security-DP entries and owner/source maps                                                                                                                                                                 | Preserve triggered entries and their durations; rebuild continuous maps without duplicating triggered contributions                                                                               |
| `GameEngine` identity and setup fields                                        | Permanent, token-instance, timing-window and battle-scope sequences; staged decks, ready seats, setup flags and crossed-memory Rush attackers                                                                       | Explicit scalar/set/deck records; identity sequences must not restart after restore                                                                                                               |
| `GameEngine` resolution pools                                                 | Pending window/deletion/battle-won/entry watchers, nested timing effects, play-cost deletion and leave-replacement effects; deferred security, rule and timing windows                                              | Effect descriptor IDs, trigger payloads, captured contexts and stable queue order; reject snapshots with suspended JavaScript continuations until the resolver is a resumable state machine       |
| `GameEngine` cost preparation                                                 | Pending reducer placements, prepared DigiXros costs, self-reducer relocations and digivolve-cost watchers                                                                                                           | Keyed records of paid/declined clauses, committed resources and captured watchers; forbid partial cost-payment snapshots until continuation state is explicit                                     |
| `GameEngine` rule and scope guards                                            | Effect/option/security/attack/window nesting depths; consumed and announced watcher keys, rule trigger pool, reentry guards, decoy costs, just-linked identities, continuous DP seed state and declined attack Arts | Preserve persistent semantic sets/maps and reject nonquiescent depth/guard states; do not blindly clear guards in a resumed resolution                                                            |
| `decisions/index.ts`, `mulligan.ts`                                           | Request sequence, open request, validation closure, resolver promise and transport                                                                                                                                  | Preserve sequence; initially require no pending effect/mulligan decision. Later replace continuations with tagged resumable frames and recreate transport on the new engine                       |
| `combat/controller.ts`                                                        | Current attack, battle stack, block/counter/alliance/evade/barrier windows, attack sequence, end requests, deferred end-of-attack callbacks, activation count and attacked-this-turn set                            | Snapshot only outside active combat initially; retain attack sequence and attacked-this-turn history. Combat-window search needs explicit resumable combat frames                                 |
| `MainPhaseController.ts`, `BreedingPhaseController.ts`, `TurnStateMachine.ts` | Active seats, action-spent/ended-turn/running state and end-of-phase promise resolvers                                                                                                                              | Export explicit controller state and resume through a dedicated engine entry point; do not copy live promises or call the ordinary turn loop twice                                                |
| `GameEngine` caches and bound collaborators                                   | Card-source WeakMap, deferred source identities, card-state lookup, per-seat primitives, board projection, rule checks, memory/access/win owners and visibility hooks                                               | Recreate collaborators against the restored schema. Rebuild derivable caches; translate semantic WeakMap keys to stable IDs before serializing                                                    |
| `effects/ContinuousEffectScope.ts`                                            | Async-local continuous-tier scope                                                                                                                                                                                   | No active async scope at initial snapshot boundary; restore work establishes a fresh scope rather than copying async-local context                                                                |

## Initial safe boundary

The first snapshot API should accept only settled Main input: no active effect,
security check, payment, combat, pending decision, recompute, deferred trigger pool,
or accepted asynchronous Main verb. A settled Main continuation now has explicit turn-frame export/resume semantics
as described below. The eventual engine boundary must also validate controller
lifecycle and every engine guard; an unresolved controller promise is not itself
serialized. Preserve all IDs, turn usage and RNG
positions even at this restricted boundary.

`pendingEffectReaders`, deferred window readers, subscription handlers, captured
`EffectContext` objects and callback-bearing ledger entries cannot be handled by
JSON cloning. Recomputing only board statics also loses delayed effects created by
already-resolved cards. Descriptor registration therefore crosses interpreter,
ledger, reducer, replacement and resolver boundaries, beyond adding two methods to
`GameEngine`. Card modules should remain on `registerIrCard`; snapshot descriptors
belong in shared interpreter/runtime registration rather than per-card patches.

The fast path is wired into Expert and Master Main decisions. Before treating it as
fully validated, compare subsequent events and intent results against prefix replay
across random card/action states, including duration expiration, usage resets, source
departure, delayed effects and ID generation. Benchmark the same positions against
replay and continue optimization toward the 10× simulation-speed target. Block/counter
search requires resumable combat frames; a settled-Main clone cannot support those
windows.

## Serializable random streams

`engine/random/SeededRandom.ts` now owns the Mulberry32 word or keyed HMAC counter.
`makeRng` keeps its callable interface as an adapter around that explicit object.
Setup and scenario startup retain both streams on the server-side engine.
`snapshotEngineRandom` and `restoreEngineRandom` export and replace both streams
without changing synchronized `GameState` or client observations.

Random snapshots carry the algorithm and unsigned state, or the original seed,
counter and a SHA-256 key fingerprint. The random key is supplied separately from
the server's engine hooks and never serialized. Restoration rejects missing or
mismatched keys and invalid numeric states. These snapshots remain server-only;
the fingerprint and stream position are not a client protocol.

Regression tests compare long sequences against the former Mulberry32 formula and
the keyed HMAC format, round-trip snapshots through JSON, and restore both scenario
streams. This completes the RNG representation seam only. It does not serialize
queued effects, controller continuations, ledgers or combat windows, and therefore
does not constitute a working engine snapshot or satisfy the search benchmark.

## Effect-use counters

`UseTracker.snapshot()` returns detached key/count pairs and `restore()` atomically
replaces the current ledger after validating positive safe counts and unique keys.
The serialized keys retain the existing source/effect identity separator, watcher
prefixes and link-cost prefixes. Tests cover increment/decrement behavior, forgetting
a departed instance, turn reset, JSON round trips and rejection without partial
mutation. This represents the use-limit ledger only; callback-bearing continuous,
modifier and subtrigger ledgers still need runtime descriptors.

## Security DP grants

`SecurityDpLedger` can now export and restore its continuous and triggered numeric
grants, retaining each duration and seat. Restoration validates the whole input
before mutation and republishes both seat projections through the destination
ledger's existing callback. JSON round-trip tests preserve owner/opponent turn-end
expiration, permanent grants and independence from the source ledger. This avoids
copying projection callbacks between engines; it does not solve callback-bearing
conditional grants in the general modifier or continuous ledgers.

## Ledger graph serialization

`engine/snapshot/encodeRuntimeGraph.ts` and `decodeRuntimeGraph.ts` now encode the
runtime records as a versioned JSON graph. Shared objects, callback identities,
cycles, maps, sets, undefined values, sparse array holes and exceptional numeric
values retain their distinctions after a JSON round trip. Plain objects are
recreated without executing accessors or interpreting function source. Unsupported
prototypes, symbols and accessors are rejected.

`RuntimeCallbackRegistry` associates a callback with a named factory and its captured
payload. A destination registry must supply that factory, bound to its own runtime.
The graph serializes the factory name and payload rather than a JavaScript closure.
An undescribed callback or missing factory is a capture/restore error. The codec
therefore cannot silently strip a condition or retain a source engine by copying
its callback reference.

The following owners expose `snapshot({ callbacks, objects, references })` and
`restore({ snapshot, callbacks, objects, references })`:

- `ModifierLedger`: all seven entry families, duration ownership, nested battle
  membership, override activation order, continuous override activation reuse and
  cost identifier sequences. Destination continuous-ledger bindings remain local.
- `ContinuousEffectLedger`: all 33 entry families, duration ownership, battle
  membership, custom grant activation aliases, grant identifiers, departure marks
  and pending expired-immunity recipients. Destination lookup hooks remain local.
  Capture and restore reject active recursive predicate evaluation.
- `SubTriggerRegistry`: delayed subscriptions, replacements, registration sequence
  and once-per-timing history. Capture and restore reject active asynchronous
  resolution and interactive cost payment. Existing run, match, activation-context
  and replacement callbacks must have supported descriptors.

Regression tests prove nested-battle expiration, duration ownership across control
changes, intrinsic cost-clause deduplication, callback rebinding to a different
runtime, delayed one-shot consumption, timing-window deduplication, detached state
and rejection without partial ledger mutation.

These are representation and restoration seams. The card interpreter now registers
factories for the `DelayedEffect` matcher and body, including its armed result
bindings. A real-engine test restores those callbacks through JSON and runs them
with a different engine's context, preserving the armed bindings and changing only
the destination memory. Standard retained contexts and physical card sources now have object descriptors
as described below. Other callback producers, specialized sources and unresolved
continuations still require descriptors; production ledgers containing those
unsupported values fail capture until their producers are migrated. The ledgers now expose raw runtime state for a joint graph as described below;
independently encoded component snapshots still cannot establish cross-owner identity.
The engine snapshot now assembles the registered owners for a settled Main position,
and the live/offline MCTS runners restore that snapshot for each continuation.
Controller coverage is still incomplete across every runtime callback family. The
latest restoration-only benchmark clears 10× aggregate speedup; complete search
simulation speed remains unmeasured. Live search is wired for settled Main decisions,
while block/counter search still requires combat resume support.

## Retained contexts and card sources

`RuntimeObjectRegistry` adds named, two-stage allocation/hydration factories to the
JSON graph. Allocated objects enter the reference table before their payload is
hydrated, preserving aliases and recursive resource references. The destination
must register the object factory; custom classes without a descriptor still fail
capture. Restored objects remain registered for subsequent snapshots.

`createEngineRuntimeObjects` registers standard physical `CardSource` and
`EffectContext` objects. Sources retain physical card identity and owner seat, use
the destination catalog definition, and bind placement/turn queries to destination
state. Contexts retain their data fields and result bindings, while game access,
primitives, decision API and use tracking are rebuilt from the destination engine.
Those server collaborators are not traversed or copied into the JSON graph.

Tracking covers both `buildEffectContext` and the normal collection pipeline through
`EffectEnvironment`, `createEffectContext` and `createCardSource`. The interpreter's
callback registry is also propagated through that normal pipeline. Retained contexts
cloned for a later subtrigger window are tracked as new resources.

Tests round-trip an entire delayed subscription, including its activation context,
then fire it against a second engine. Only the destination draws; source placement,
turn checks, decision transport and use counters belong to the destination, while
captured data is detached from the original. Generic resource tests cover custom
prototypes, repeated references and mutual cycles.

This does not yet serialize an arbitrary production activation context. A context
with unresolved continuation callbacks still fails capture. Nonstandard decision
ports, gained-keyword source bindings and noncatalog source definitions are rejected
rather than silently replaced with standard semantics. Historical trigger payloads using the registered state classes now have schema
resources as described below; other runtime classes and callback families still
require explicit support.
The engine still lacks a complete settled-Main snapshot/resume API, and these tests
are not the required corpus-wide engine conformance or speed benchmark.

## Resolution plans and timing-window state

`ResolutionPlan` now exposes raw runtime state and JSON graph snapshot/restore.
Its order, optional answers, used keys, activation-identity key maps and original
source anchors for granted effects are retained. Activation identity maps are
now enumerable maps whose lifetime follows the owning timing window. The object
registry reconstructs plans and preserves shared map and activation references.
Tests cover optional answers, repeated activation identities, distinct occurrences,
grant anchors across evolution and aliasing across the graph boundary.

`TimingWindowState` owns the resolver's plan, retirement and departure latches,
activation tiers, permanent identities, arrival proofs, loop budgets, collected
entries and no-legal-outcome receipts. The existing resolver reads and updates that
explicit state instead of private mutable counters. New windows keep the original
initial rule sweep and pending-reader lifetime.

`resolveTiming` accepts an explicit completed-window resume state. This resumes the
existing drain operation with its original latches and budgets, skipping the initial
rule sweep and reader registration that belonged to the already-closed invocation.
Both an open resolver scope and active reentrant drains prevent capture/restore.
A window cannot resume under another timing. Raw state and resource hydration keep
shared references instead of copying entries into unrelated maps.

A JSON round-trip regression compares a restored completed window with its original
retained drain: a previously resolved effect that becomes collectable again remains
retired, a newly available effect resolves, counters and departure history agree,
and the closed pending reader is not re-registered. The test covers a window whose
final collected list is empty; it is not the whole-engine conformance corpus.

The retained drain now has a callback descriptor containing its timing, explicit
closed-window state and reconstructed resolution environment. The destination runs
`resolveTiming` with the completed-window resume contract. It does not register the
old pending reader again or repeat the opening rule sweep. An active window still
rejects capture; the descriptor does not serialize a suspended coroutine.

The normal resolution-time `makeContext` path in `buildResolutionEnv` now propagates
both runtime registries, in addition to the earlier collection-time path. A regression
runs the composition root and verifies that its actual resolving context and delayed
IR callbacks are registered. This closes a second context-construction path that
would otherwise fall back to undescribed callback closures.

## Canonical compiled-node identities

`RuntimeReferenceRegistry` represents immutable installed objects separately from
mutable graph resources. Reference factories return canonical destination objects,
so aliases and map keys match the objects used by reconstructed handlers. Recursive
reference payloads and missing factories reject restoration.

The interpreter registers compiled roots for each card: normalized catalog IR,
augmented module effects including synthesized keyword effects, and resolved static
effect definitions. A reference carries card ID, root key, own-property path and a
SHA-256 graph fingerprint. Resolved roots can be materialized lazily by the installed
module. Restoration verifies the installed root before resolving its path; equivalent
module re-registration yields the new canonical object, while changed IR rejects the
snapshot. Catalog, module and resolved roots preserve their distinct identities.

Context predecision maps and intrinsic cost-clause keys can therefore refer to the
same installed objects as destination callbacks. Tests re-register equivalent card
modules, restore action-keyed maps, execute a declined optional action without drawing
or opening a decision, and reject different action content. Registered IR is treated
as immutable between `registerIrCard` calls. These per-root checks do not replace the
whole-engine rules/code fingerprint required by the complete snapshot contract.

## Printed runtime effects

Standard `registerIrCard` modules track the source, timing, entry index and canonical
resolved definition of each produced runtime effect. The object factory reconstructs
its methods from the installed module and destination `CardSource`, then restores
captured nonfunction attributes. It checks both the installed definition identity and
the original method identities; a replaced handler requires a specialized descriptor.
No function from the source engine is copied into the destination.

Tests round-trip an effect through JSON, retain its overridden presentation text,
and resolve its Draw against the destination deck only. A reference registry is
required when restoring these resources; decoding a detached copy of their IR
definition is rejected. Sources with gained-effect bindings, synthetic watcher
wrappers and other specialized effects remain unsupported by this factory.

The combined resource and reference codecs represent nonempty closed-window
collections. Supported production drain environments now reconstruct as described
below. Active coroutines and snapshots outside settled Main remain incomplete. The
replay speed comparison exists, but its aggregate result is below target. Corpus-wide
conformance and live search are pending.

## Resolution environments and retained drains

Production framework environments and `resolutionDeps` retain descriptor metadata.
The dependency snapshot includes the original ordering seat, candidate reader,
outermost flag, extra pending entries, excluded nested entries, derived reaction
queue and announcement receipts. Shared graph identity preserves aliases between
those queues and collected records. Destination rule checks, pending engine pools,
controller prompts, recomputation and event hooks are rebuilt against its engine.
A replaced dependency or framework port rejects capture.

The resolution environment retains its event trigger and the exact grant snapshot
captured at window creation. Restoration supplies those grants explicitly instead
of taking a fresh snapshot from the destination's current continuous ledger.
`RuntimeCallbackRegistry` can describe an existing closure and can project a mutable
capture payload at snapshot time. It still never evaluates serialized function text.

Ordinary candidate readers now have tagged descriptors for the full live candidate
set, no candidates, named instances, phase-boundary source roles and a permanent's
opening instance set. A permanent reader binds to the destination permanent and
continues checking object identity while it is live. A reader whose source has
already departed now retains that historical permanent as a schema resource,
preserving its aliases if that same object is later reinserted. Phase readers retain each source's
opening location, so changing from top card to a stack card prevents a retroactive
boundary activation. Production instance/permanent firing and ordinary boundary
windows use these readers. Ordinary windows with transient historical candidates
now use the same descriptor and retain the captured card objects. Specialized
custom collectors still need descriptors.

Subtrigger and replacement installation now registers retained activation contexts,
including shallow copies made by the interpreter. Completed activation-presentation
callbacks have descriptors matching their terminal behavior: acceptance does nothing
further and the pending query returns false. An unaccepted presentation callback
continues to reject capture because its announcement continuation is not represented.

Tests restore delayed subscriptions created by the actual instance and permanent
timing paths, call their restored closed drains, and execute the delayed bodies
against the destination deck only. A live-candidate test introduces a different
source in the destination and proves its drain sees that source without changing
the original engine. Other tests preserve source-role restrictions, opening permanent
instances, ordering seat, local reaction-queue aliases and one-shot announcement
receipts. These are production-path regressions, not the full snapshot conformance
corpus. Engine/controller export and resume, unsupported runtime classes, remaining
callback families, the 10x benchmark target and live search are still incomplete.

## Synchronized and historical schema resources

The object registry can identify a registered exact prototype as well as explicitly
tracked objects. Subclasses do not inherit a descriptor automatically. The engine
registers all eleven current synchronized schema classes and `ArraySchema`:
`GameState`, `PlayerState`, `Permanent`, `CardInstance`, `SecurityCardView`,
`PendingDecision`, `CombatWindow`, `SeriesState` and the three evolution-route classes.

Each schema factory derives its field layout from Colyseus metadata and the class's
own declared data fields. This includes the server-only `attackRedirectTargets`
record, which `Schema.toJSON()` omits. A SHA-256 layout fingerprint covers field
names, ordering and types. Restoration rejects a different layout, unknown or
duplicate fields, missing annotated fields and incompatible field values before
assigning the fields. Undeclared properties, unsupported symbols and replaced
accessors reject capture. Reading registered fields does not execute an overridden
accessor. Absent server-only data fields stay absent rather than regaining their
constructor defaults.

Allocation creates fresh instances and change trees. The graph preserves shared
cards, historical permanents, arrays and references across schema owners without
copying Colyseus transport state, ref IDs or existing views. Collection child types
are retained and validated. The current engine classes use dense `ArraySchema`
collections; sparse or null slots reject capture or restore instead of silently
compacting. Additional collection classes and schema subclasses require explicit
factories if the state model begins using them.

Tests round-trip the entire synchronized state together with a historical permanent
and shared card references. They compare all server state through `toJSON`, retain
non-annotated server fields and verify independent mutation after restoration. A
fresh encoder and decoder produce the same filtered broadcast projection as the
original state, then apply subsequent memory, DP and zone-movement deltas. The
snapshot codec is server-only and does not make hidden schema fields public.

A production-path regression arms a delayed effect, removes its source permanent,
and snapshots its retained context and completed drain. The historical event subject
restores as a `Permanent`; the physical source is absent from the destination field,
and the delayed Draw changes only the destination deck. Candidate-reader tests also
preserve transient off-board cards and a departed permanent's object identity across
reinsertion. This represents schema-bearing runtime captures. It does not yet
provide a complete engine clone, controller resume, full corpus conformance or a
simulation-speed result.

## Settled Main turn continuations

`TurnStateMachine` now retains an explicit `TurnPhaseFrame` while a turn runs. It
records the seat and turn count, completed Active/Draw/Breeding procedures, whether
Main has already completed once, and the number of consumed end-turn windows.
`getRuntimeState()` exports a detached versioned frame only after Main entry settles,
with no decision pending, the match still live and memory below the applicable
turn-end threshold. The production hook also verifies that the Main controller is
still open and phase entry is no longer pending. Capturing the just-closed input
window before its promise unwinds is rejected.

`resume()` validates the frame against destination state and recreates the Main
wait through a dedicated production `resumeMainPhase` hook. It does not rerun
`beforeTurn`, turn-start duration resets, unsuspension, draw, breeding,
`OnStartMainPhase`, phase-change emission or the old entry finalizer. The destination
controller receives a new promise. Normal entry uses `mainEntryPending` while
start-of-main processing runs; the resume hook leaves that completed-entry flag
clear so intents can execute immediately.

Single-turn continuations finish the current turn and stop. Game-loop continuations
finish that turn, hand off to the opponent and keep running. The original end-window
count survives even when Main was reopened by a memory-restoring end-turn effect;
restoration does not replenish the 100-window postponement safety budget. Overlapping
runs, unsupported resume ports and frames with a different turn, phase or incomplete
phase history are rejected.

Regressions compare subsequent timing, duration and phase-event sequences between
the retained original turn and a JSON-restored frame. They cover ordinary Main,
postponed Main, an exhausted postponement budget, the next opponent turn and rejection
during entry or a pending decision. A production `GameEngine` test resumes a vanilla
position, accepts `endPhase` immediately and matches the original subsequent events
and synchronized state. The vanilla test deliberately needs no retained rule ledgers;
it is not evidence that arbitrary engine state can already be cloned.

This is the turn-machine continuation seam. The complete engine snapshot still
needs to assemble and restore its state, ledgers, IDs, queues, combat history,
request sequences and remaining callbacks before starting this continuation.
Breeding and in-progress combat continuations remain outside the initial settled
Main boundary. Corpus-wide conformance remains pending. Snapshot restoration now
drives offline MCTS continuations; the speed target and live search remain pending.

## Memory turn-end thresholds

`MemoryGauge.snapshot()` retains the two seat-specific turn-end threshold overrides.
The gauge value remains in `GameState`. Restoration validates the full input before
replacing the map, preserves the destination state and memory-gain policy callback,
and rejects an active staged threshold recomputation. Invalid seats, duplicate
entries, nonfinite values and thresholds below the default are rejected.

A continuation regression captures Main at memory -2 under an active threshold of 3. A fresh default gauge correctly refuses to resume that frame; restoring the
thresholds first permits Main to resume and produces the same turn-end events and
state as the original. The eventual engine restore must restore this owner before
validating and opening the Main continuation.

## Joint graphs and staged restoration

`RuntimeGraphDecoder` retains one graph's decoded object table across two restoration
stages. `decodeRootField({ key: "state" })` can decode the authoritative schema using
only the schema factories. The caller then constructs the destination `GameEngine`
from that exact `GameState`, binds its object, callback and compiled-reference ports
once, and decodes the full root. Cached schema objects are reused; a context's game
access, its historical trigger subject, candidate-reader bindings and any explicit
root aliases therefore refer to the same restored state objects.

The existing `decodeRuntimeGraph` helper delegates to a one-stage decoder and keeps
its interface. Rebinding ports while decoding, after callback/reference construction
or more than once is rejected. Any failed decode poisons the session, preventing a
later call from returning an allocated but incompletely hydrated resource. Missing
or duplicated root fields are errors rather than fallbacks to another shape.

`ModifierLedger`, `ContinuousEffectLedger` and `SubTriggerRegistry` now expose
`getRuntimeState()` and `restoreRuntimeState()` in addition to their component graph
wrappers. These state views retain entry references for immediate joint encoding;
they are server-only raw views, not detached application data. Restore validates the
state before adopting its collections. Scope maps and expired-recipient sets remain
the decoded objects, preserving aliases instead of clearing a collection that may
also be the restore input. Weak duration-owner and departure tables are rebuilt from
the captured entries so absent old marks do not leak into restored state.

Tests share one identity between an intrinsic play-cost clause, a custom effect
grant and a delayed callback capture, encode the three ledgers together and restore
their state. The restored identity remains shared, the delayed body changes only its
new capture and intrinsic cost deduplication still works. Other regressions restore
an owner's own raw state without losing nested battle membership or expired
recipients, and clear a departure mark that was not present in the captured state.

A production delayed-effect test jointly captures `GameState`, the subtrigger ledger
and a departed permanent. Restoration decodes state first and constructs the new
engine before restoring the delayed context. Its historical permanent's top card is
the exact card in the destination trash, and its retained drain uses destination
ports. The delayed Draw changes only that engine. This establishes the joint graph
seam; engine field assembly, a complete safe-boundary audit, rules/code fingerprint,
remaining callback families, corpus conformance and the search benchmark remain
pending.

## Closed request sequences and idle combat history

`DecisionManager` and `MulliganCoordinator` expose their request sequence through
raw runtime state. Export and restore reject any open or mirrored decision; promise
resolvers, timers and validators are not copied. A destination retains its own
transport and continues the `dec-N` and `mull-N` namespaces from the captured count.
Invalid sequence values are rejected before mutation.

`CombatController` exposes the attack declaration sequence and the set of permanents
that attacked this turn. Restoration adopts the decoded set, preserving graph
aliases while keeping source and destination histories independent. Capture and
restore reject active battle state, prompt windows, pending end-of-attack data and
cleanup that has not finished. Settlement depth also covers the asynchronous final
recompute after a direct battle has popped its battle stack. These methods represent
idle combat history; they do not serialize an active attack coroutine or an open
Block, Counter, Alliance, Evade or Barrier continuation.

Tests complete requests through the real managers and verify the next IDs use the
destination transport. Combat tests declare attacks through the controller, restore
its history, and continue with the next declaration sequence. Suspended attack
cleanup and direct-battle recomputation both reject capture and restore until their
promises settle.

## Deferred source residency

A collected deferred effect now carries `sourceIdentityAtDefer` as its own nullable
server-side field. The timing-window and attack-pooling producers record the same
physical source role that previously lived in an engine-owned WeakMap. The residency
reader consumes that captured field, so a retained collected record remains
self-contained after graph restoration. The field is not recomputed from the new
board while restoring.

A regression defers a printed effect through the real collection path, jointly
round-trips the state and pending record, and evolves its source in the destination.
The restored record becomes ineligible because the original top card is now a stack
card; the original world remains eligible. This closes one semantic weak-cache gap
in engine snapshots. The complete engine field assembly, remaining runtime
producers, code/rules fingerprint, conformance corpus and performance benchmark are
still pending.

## Settled Main engine API

`snapshotGameEngine` and `restoreGameEngine` now assemble the represented owners
in one graph, including schema state, core identity sequences, turn continuation,
RNG, use counters, idle combat history, closed decision/mulligan sequences, all
three effect ledgers, memory thresholds, security DP and deletion DP bonuses.
Restore constructs a fresh engine around the decoded state before binding runtime
factories. It restores memory thresholds before resuming Main and returns the
continuation completion promise. Existing projection dependency maps and sets keep
their destination container identities.

Capture rejects every currently identified pending engine queue, payment, rule
scope, recompute and accepted asynchronous Main verb. Owner guards additionally
reject active combat settlement and effect activation. An explicit own-field
inventory rejects new engine fields until they have been classified. This remains
a restricted server-side API: active decisions, combat windows and partial costs
have no resumable continuation contract.

The compatibility fingerprint covers the loaded API and shared source or compiled
artifacts, API package manifest, lockfile, Node version and current registered IR
programs. Artifact hashes are cached for the process lifetime, matching the
requirement to restart the API after changes; registered IR is included on each
call. Source and compiled deployments intentionally have distinct fingerprints.
Schema layouts and canonical IR references perform their existing additional
checks. Fingerprints are compatibility checks, not authentication, and snapshots
must stay inside the trusted server boundary.

Initial integration tests compare future end-turn events and state, RNG positions
and identity counters after JSON restoration, reject an incompatible fingerprint,
and reconstruct a delayed callback with its departed historical source against
only the destination engine. These tests do not establish arbitrary active-effect or
combat-window support or the 10× speed target. Unsupported callback families still
reject capture. Live search is wired for settled Main positions; broader runtime
coverage and production evidence remain outstanding.

## Primitive runtime owners

Primitive factories also retain semantic state outside the engine fields. Their
runtime context now owns delayed-memory description sequences, stack-strip event
sequences, temporary and per-play DigiXros zone expansions with quotas, and the
generic custom-grant store. Engine snapshots include this state in the joint graph;
restore retains destination map handles used by the primitive closures. Capture
rejects active primitive provenance/target stacks.

Delayed-memory subscriptions now use a registered callback descriptor containing
only the affected seat and amount. The destination factory binds its own memory
port and preserves the existing non-Tamer memory-gain policy. The installing
source may leave play before the delayed processing fires. A production attack
with a source deleted by security now has a JSON clone regression comparing its
subsequent end-turn events and final memory.

The four-game capture probe improved from 100 restored positions and 20 callback
refusals to 115 restored positions and five refusals. This is a capture/restore
screen, not corpus conformance or a strength measurement. The remaining observed
refusals come from ordinary filtered `SubTrigger` installs, including their
matcher, legal-outcome gate and body. Those callbacks still require descriptors
that preserve installation-time bindings and matched-event history.

## Filtered SubTrigger callbacks and primitive scopes

Ordinary `SubTrigger` installation now separates target selection from pure
subscription construction. Callback descriptors retain the canonical action,
installing context, event, source role and identity, selected anchor, expiry,
printed metadata and the matched-trigger history. Restoration builds the callback
without repeating target selection or installing another subscription.

The matched-trigger history keeps weak references during play and serializes the
still-live event objects into the joint graph. A restored matcher recognizes the
same decoded trigger object even after its live subject changes attributes. A new
event object must still pass the printed filter. The history preserves weak
ownership rather than keeping every prior event alive for the entire match.

Passive continuous contexts now name their no-prompt decision port explicitly.
Static, evolution-cost and security primitive wrappers also have runtime resource
descriptors. Their factories rebuild operations against the destination context,
retain explicit continuous flags and the static once-per-turn fallback key, and
reject replaced methods. Arbitrary custom decision and primitive ports remain
unsupported.

The four-game capture screen now restores all 120 observed positions with no
refusals. A filtered continuous-watcher regression additionally continues a real
play, answers the same decisions, suspends the same Tamer, trashes the same source
card, and compares all subsequent events and end-turn state between the original
and restored engine. Separate tests preserve matched-event identity and the three
primitive wrapper kinds. This closes the observed filtered-watcher gap; it does
not prove coverage of every producer, full replay-corpus conformance, active
combat continuations, or the search speed target.

## Recorded suffix conformance and restoration benchmark

`runReplay` can capture a settled Main root through `getSnapshot()` and resume the
same recorded input stream with `RunReplayOptions.snapshot`. The replay snapshot
retains the input cursor, emitted event count, batch and event sequences, and match
startup flag alongside the engine snapshot. Restoration preserves replay batch
stamping and state-version bookkeeping. It requires the same replay prefix and
rules; it is an internal continuation artifact, not an untrusted replay import.
Capture refuses divergent or activated replay runners and open batches, as well as
the engine's existing unsupported snapshot boundaries.

`replaySnapshot.test.ts` compares every remaining sequenced event, final event
count, applied input count and final state at early, middle and late Main positions
in two recorded room matches. This establishes suffix equivalence for those six
roots, not arbitrary card coverage or the complete fuzzer corpus.

`engine/fuzzer.test.ts` also runs snapshot continuation over 1,000 sequential
fuzzer seeds. Each case builds a random board and randomized hand, security, trash
and deck zones at a settled Main position, applies zero to two seeded plays, then
snapshots, restores, ends Main in both engines and compares every later event and
the final state. All 1,000 cases pass. This exercises generated state breadth at a
settled Main boundary; it does not snapshot mid-resolution, open combat windows or
every action sequence produced by the action fuzzer.

The existing `replayAccelerationBenchmark.ts` entry accepts
`{"mode":"snapshot-restoration","replayFile":"<ReplayRecord JSON>","repetitions":5,"rootLimit":8}`.
It distributes roots over the replay, proves complete suffix equivalence before
measuring each root, excludes one warm-up pair, and alternates prefix replay and
snapshot restoration. Snapshot capture and JSON transfer costs are reported
separately from the repeated root-restoration measurements. The report includes
per-root samples, aggregate speedup and an explicit 10× target result. This measures
restoration, not complete search simulation or production decision latency.

An initial local run on a recorded default-deck bot match at seed 20260914 restored
eight roots with equivalent suffixes. Five measured repetitions per path yielded
1.92× aggregate restoration speedup, with individual roots from 0.16× to 4.57×.
The 10× target was not met. Source fingerprint initialization affected the first
capture; steady-state restore still cost roughly 20–30 ms. These timings identify
further optimization work and do not certify live search performance.

A local CPU profile before the catalog-cache change attributed approximately 7.47 s
of 9.27 s across 100 repeated restorations to `getEngineCodeFingerprint`, including
approximately 2.21 s in hash updates. Registration now freezes a fresh normalized
IR copy and the code fingerprint caches a digest only for roots marked immutable by
that registration path. Mutable records inserted directly into the registry still
use full serialization on every check, so replacement and in-place mutation remain
detectable. The per-process source-code fingerprint remains stable under the
required API restart after source changes.

A broader local screen recorded four matches from the first four newest validated
fuzzer decks, with seeds 20261028–20261031 and four evenly distributed Main roots
per match. Xros Heart versus Blue Flare, Blue Flare versus WarGreymon X, and
Mastemon versus Xros Heart passed complete suffix comparison at all twelve
selected roots before cost-reducer callback support. Instrumentation identified
the captured `intoMatches` definition filter installed by the cost-reduction path
in `interpreter/actions/replacement.ts`; that family is now registered. A rerun
restored four roots in each of the four recorded matches and matched every suffix.
This was a stratified screen, not every root in all four matches. Timing samples
from the screen ran under local contention and are not production performance
evidence.

The replacement-cost callback family now records the installed IR action,
installation context, source permanent, filters, costs, cost choices, resident
turn timing and all five executable ports (`intoMatches`, `appliesTo`, `activate`,
`potentialAmount` and `amountForInto`). Restoration rebuilds those ports against
the destination runtime without installing a replacement, opening a prompt or
paying a cost. The destination-context behavior is covered by
`costReplacementSnapshot.test.ts`, including a printed ST10-04 Gatomon digivolution
discount and interactive suspension cost. That source card's printed traits,
colors, alternate evolution cost and effect are in the committed card catalog; its
existing colocated test confirms the reduction is two memory into the named traits.

For the WarGreymon X versus Mastemon match (seed 20261030), all 38 recorded
searchable Main positions restored and matched the complete remaining event stream,
input count and final state. The measured snapshot-to-prefix speed ratio was noisy
under concurrent local compiler and test load and did not establish the 10× target.
Other runtime callback families can still reject a snapshot; this result is one
match's full Main-position screen, not the fuzzer corpus.

After immutable-card digest caching, ten alternating measurements over the same
default-deck replay averaged 7.50× replay-to-restore speedup across eight stratified
Main roots. Median per-root speedups increased
from 0.73× at input 6 to 15.83× at input 38; the early position is cheaper to replay
than to restore. The profile's one-time source and shared artifact scan is now primed
when the API starts, after card registration, so it does not land on the first search
decision. Mutable registry overrides remain uncached and their changed content was
verified to change the engine fingerprint.

A follow-up 10-repetition restoration benchmark after caching the immutable catalog
digest measured 10.95× aggregate speedup across the same eight stratified roots, with
per-root speedups from 0.91× to 23.06×. It verifies complete replay suffix equivalence
for each measured root. It remains a restoration benchmark; it does not measure the
complete MCTS simulation path or production decision latency.
