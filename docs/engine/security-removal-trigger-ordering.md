# Security-removal trigger ordering during effect attacks

## Contract

When an effect pays for an attack by removing a security card, the security-removal reactions and the attack declaration's `[When Attacking]` effects belong to the same pending activation group. The controller must receive one `orderTriggers` choice containing both families.

The security-removal watchers are captured when the card leaves security, but an effect attack must not flush them before declaring the attack. At the attack-timing drain, the engine converts those armed watchers into ordinary pending collected effects beside the deferred `[When Attacking]` effects.

Each converted watcher records the source card's permanent identity. If an earlier chosen effect digivolves over that source, changing it from the permanent's top card into a digivolution card, the existing pending-source revalidation removes the stale watcher before activation.

## Q7312 regression

Mistymon EX13-033 removes security to order an attack while inheriting DemiMeramon EX13-004. The ordering prompt exposes both cards. Choosing DemiMeramon first digivolves into Dynasmon EX13-037, so Mistymon's pending security-removal effect can no longer activate. Dynasmon's newly active watcher may still apply its own −12000 DP; Mistymon's stale −6000 DP does not stack with it.

Covered by `engine/attackSecurityRemovalTriggerOrdering.test.ts` and the focused EX13-033 Q7312 test.

## Separate removal occurrences

Every security-removal event receives a match-local occurrence identifier, including removals prepared during security checks. Distinct removals must remain distinct while an older activation is pending: a newly triggered reaction belongs to the newer activation tier under CR 15-4-5-2/3. Neither the enclosing window nor a physical card identifier alone identifies a removal event.

Multiple removals caused by one completed effect body still offer each printed once-per-turn watcher once. The shared turn-use ledger prevents a later occurrence from activating after that watcher succeeds; declining an optional occurrence leaves a genuinely later removal eligible.

`scenarios/security-removal-retriggers-before-pending-reactions.test.ts` verifies the actual −12000 DP application before opposing de-digivolution, one activation after both security stacks are removed from, and optional refusal followed by a later removal.

## Removal during play procedures

Security removed while preparing a play cost must not interrupt that procedure. Its reactions join the entering card's On Play group. The turn player resolves their effects first; if they control both the cost reaction and the On Play effect, they choose their order. Held cost-trigger capture therefore precedes ordinary deferred security processing, and security placements finalized during the main play continuation enter the same pending watcher pool.

The Apocalymon EX10-061 tests verify that an opposing Ouryumon reacts once after the Dark Masters enter play, while the turn player's Ouryumon can be ordered before Apocalymon's On Play.
