---
title: Trigger ordering audit
updated: 2026-10-15
---

# Trigger ordering

## Derived trigger exhaustion (2026-10-15)

Issue: https://github.com/vinicius3333/aegis-digimon-tcg/issues/5600

The reported match `0ac032b7-a4f0-4d4c-a942-0cd3e5fb5b0b` (report 293,
server `416fc9bdbaeb8c9ebb3ccc9e0005d4b6234ff044`) replays all 40 inputs
without divergence on the development baseline. The committed replay stops at
Kakkinmon's end-turn suspension choice. The report's reference to EX11-062 is
inconsistent with the recording: the relevant security card is EX11-041 Oblivimon.

P-245 suspends EX13-062 Craniamon while the opponent has no Digimon. Craniamon's
reaction must finish without deleting anything before the older EX11-041
end-of-opponent-turn security effect plays Oblivimon. Previously, activation tiers
were assigned only to effects with a legal outcome. This allowed the unavailable
reaction to become newly activatable after Oblivimon entered the battle area.

Comprehensive rules 15-4-5-2 and 15-4-5-3 require derived triggers to resolve before
older pending effects, regardless of their controller. `effects/stack.ts` now
assigns tiers when effects become pending and retires exhausted higher tiers
before returning to older effects. Simultaneous effects can still enable one
another. Reentrant drains retain unavailable effects at an enclosing effect’s tier while
that effect is still processing, but retire exhausted newer derived tiers.

Proof lives in `effects/stack.test.ts` and
`scenarios/end-turn-suspension-before-security.test.ts`. Card definitions and
effect snapshots are unchanged. This is a resolver correction, not a full audit
of the cards' unrelated printed clauses.

The two derived-trigger conformance fakes now add their derived effect to
`collect()` only when its event occurs, rather than using `canActivate()` to
simulate a new trigger. Their expected ordering assertions are unchanged.
The Gallantmon replay's state-version and event-count expectations are refreshed
because exhausted-trigger narration now precedes the next pending decision;
its inputs and behavioral assertions are unchanged. A baseline/fixed event
comparison at the first affected decision produced identical event payloads
and ordering, with only the narration batch boundary changing.

Validation includes the exact replay, minimal live-turn scenarios with and
without a pre-existing opposing Digimon, resolver tests for both controllers,
reentrant attack drains, simultaneous enabling effects, and affected conformance
and card suites. Reverting only the resolver makes six new regression assertions
fail. Browser/manual UI checks were not performed for this engine-only change.

The broad suite also exposes 18 pre-existing failures, reproduced with the
unchanged `develop` resolver, in these scenario files:

- `alliance-after-evolution-turn-loop.test.ts`
- `alliance-after-evolution.test.ts`
- `apocalymon-security-kari.test.ts`
- `cool-boy-king-drasil-reduced-royal-knight-play.test.ts`
- `effect-attack-suspend-trigger-order.test.ts`
- `evolution-and-inherited-effects.test.ts`
- `evolution-and-removal-interactions.test.ts`
- `evolution-cost-and-protection.test.ts`
- `interrupting-dna-defers-when-digivolving.test.ts`
- `jesmon-scramble.test.ts`
- `opponent-derived-delay-before-pending-when-digivolving.test.ts`
- `ruin-mode-on-play.test.ts`
- `self-deletion-effect-continuation.test.ts`
- `turn-player-block-triggers-resolve-first-replay.test.ts`
- `would-leave-play-replacement-when-played-triggers.test.ts`

## Evolution watcher entry snapshot (2026-09-27)

`apps/api/src/engine/scenarios/bt20-bakemon-violet-retroactive.test.ts` reproduces the
BT20-068/BT23-087 Discord report through a public `digivolve` intent and the
`bt20-bakemon-violet-retroactive.fixture.ts` position. Bakemon plays Violet
Inboots during its own `[When Digivolving]` effect. Before the fix, the trailing
`whenOneOfYoursDigivolves` bus read the newly registered Violet watcher and
incorrectly suspended it and granted Bakemon Rush. The two assertions failed
with `expected false, received true` before the change.

Read-only production logs locate the reported sequence in one match on
2026-09-27: at 18:00:32Z `BT20-068` evolved (`perm-9`, event 466); its
`WhenDigivolving` effect played `BT23-087` (`perm-17`, event 474) at 18:00:37Z.
After Bakemon's effect resolved (event 477), the newly played Violet emitted
`whenOneOfYoursDigivolves` (event 483) and offered the suspension cost in
decision `dec-42`. The player declined, so these logs prove the retroactive
prompt, not a live Rush grant. At 18:01:05Z the already-present Violet
responded to a later evolution, a valid control. The arena mirrors the
relevant evolution → effect play → watcher sequence; it does not reconstruct
the rest of that match's board. The regression now asserts that the new
Violet emits no `effectTriggered` event for the earlier evolution.

The evolution window now resolves only watchers armed when that evolution
happened. A paired case starts with an established Violet: that copy still
suspends and grants Rush, while the copy Bakemon plays stays unsuspended. A
separate BT23-098 case drives an effect-caused Bakemon evolution after a prior
Ghost evolution; its newly played Violet also stays unsuspended. This is bounded
proof for those public routes, not a claim about every event family.

The watcher pool is refreshed immediately after the evolution changes the top
card and before the entry snapshot. Without that refresh, already-present
BT19-080 Takato and other continuous watchers missed legitimate evolutions.
The later `[When Digivolving]` timing window reuses this fresh state so it does
not add an extra asynchronous pass. Focused BT19-007/009 and EX13-007/010
timing cases pass alongside the Violet regression. BT13-019 playing BT10-085
Sistermon and BT13-054 playing BT13-100 Yoshino during their own evolution are
additional negative controls: those newly played watchers do not react to the
evolution that played them. EX8-024's own `[When Digivolving]` effect still
shares the ordering prompt with two pre-existing EX8-027 watchers.

A second card pair proves the same timing defect beyond Violet: BT19-009
Growlmon plays BT19-080 Takato Matsuki while evolving, and the newly played
Takato must not react to that Growlmon evolution. Temporarily disabling the
snapshot made the new test fail because Takato suspended; restoring it makes
the test green. An established Takato still suspends and grants Raid for the
evolution. The test uses public evolution intents and the actual printed
effects of both cards.

The follow-up screening covered the other `withPendingSubTriggers` call sites:
play and attack already opt into an entry/declaration snapshot; effect-caused
evolution was exercised by the BT23-098 case above. Among the committed
compiled IR entries, no `EndOfTurn` or `OnDraw` printed effect installs a
SubTrigger for its own event, and the three `StartOfYourMainPhase` entries that
install a SubTrigger install `endOfTurn` instead. Start-main grants from
BT23-056, BT25-054, and EX12-016 target an opponent's next main phase. This
does not rule out other timing defects; it found no second card pair in those
phase/draw windows that reproduces this exact retroactive-watcher pattern.

## Trigger matrix expansion (2026-09-23)

The requested completion target is the following behavioral matrix. A family is
complete only when its required cases are linked to reviewed source obligations,
executed by the local verifier, and supported by observable assertions. Existing
tests are reused after checking their assertions; a title or citation is not proof.

| Family                        | Required cases                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simultaneous effects          | Both turn seats; controller priority; each player's chosen order; native On Deletion with deletion watchers; When Attacking with opponent attack watchers                             |
| Rule-check triggers           | Rule-check deletion joins the timing's other triggers; controller order; nested rule checks settle without premature activation                                                       |
| Derived effects               | Current body finishes before new triggers; derived effects precede older pending effects, including non-turn-player derived effects; distinct occurrences remain distinct             |
| Pending source and target     | Source leaves or loses its effect; surviving-source control; inherited deletion exception; target candidates change after earlier effects; pending conditions revalidated             |
| Optional processing and costs | Accept and decline; payable and unpayable costs; no legal payload target; incomplete payment cannot execute payload; correct decision owner                                           |
| Prevention and immunity       | Prevented departure suppresses third-party deletion triggers; immediate replacement timing; immunity at resolution does not suppress unrelated legal processing                       |
| Once Per Turn                 | Same-turn use limit; ordinary digivolution preserves use; DNA and leave/reentry reset; actual turn change resets                                                                      |
| UI                            | Rendered trigger order reaches the server; optional cost accept/decline; non-owner cannot answer; reconnect preserves a pending decision; long/many trigger choices remain selectable |

Real-browser pixel geometry is a separate visual check; jsdom tests count only
as functional UI or structural evidence. No game-wide parity claim is made by
completing this matrix.

Status: finite bounded classes closed for the public providers listed below. This ledger does
not claim whole-collection or engine-wide completion; unlisted event families remain outside
this audit.

The first bounded conformance proof is
`apps/api/src/engine/conformance/trigger-ordering-source-departure.test.ts`.
It uses a legal equal-DP battle between two BT25-040 holders owned by opposing
controllers. The battle creates one simultaneous deletion event; after the real
turn loop reaches seat 0's Main Phase, seat 0 receives its `selectCards` processing
decision first, followed by seat 1. Both refusals preserve the exact deleted
instances in their owners' trash. This proves controller priority for this native
Ascension provider shape without claiming a shared cross-controller ordering prompt.

The second bounded case uses two physical EX7-072 Seventh Fascination cards in the
trash and a public digivolution into EX7-061 Lilithmon (X Antibody). Both real trash
triggers are offered in one `orderTriggers` decision with their distinct source
instance identities. After one selected source returns to the bottom of the deck,
the remaining pending source still resolves and also returns to the deck. This
proves one simultaneous controller choice and one source-departure transition for
this exact card shape.

The test cites comprehensive rules §§15-4-3, 15-4-4, 15-4-5 and 15-8-5. The historical
Ascension, trash-source, derived-trigger, and deletion cases below are finite evidence for
their named providers; they do not certify unlisted simultaneous pools, replacement ordering,
source movement between every zone, or every optional/refusal path.

The same file also retains a three-card public equal-DP battle fixture with valid
level-5 Cyborg payloads. It asserts `state.turnSeat === 0` and phase `Main` before
the attack, then observes the first optional deletion request as seat 0/source
BT19-065. This confirms the controller-priority path when both source effects are
actually activatable; it does not claim derived-trigger precedence.

The fourth case completes a public derived-trigger chain using BT19-065, BT20-073,
and BT19-020. The turn player's BT19-065 plays a valid BT20-073 from trash; after
its public optional delete-own cost is answered with an exact permanent, BT20-073's
On Play deletes the opposing BT19-020. While the opposing BT19-065 deletion effect
is still pending, the newly generated BT19-020 On Deletion request is offered first;
the test then observes the older BT19-065 request and declines both. This is bounded
proof of non-turn-player derived-trigger precedence with exact request source IDs.

The fifth case proves pending-source departure with a public card flow. In seat 0's
Main Phase, equal-DP BT19-065 Machinedramon cards delete each other; seat 0's
Machinedramon plays BT20-073 MetalPhantomon from trash, creating both BT25-077
Bacchusmon “when played by an effect” watchers. Seat 0's watcher is accepted first
and deletes the only remaining enemy Digimon, seat 1's Bacchusmon. The enemy watcher
is pending at that moment, but no seat 1 decision follows and the attack resolves to
completion. A paired control adds lower-DP BT1-009 Agumon; seat 0's watcher deletes
Agumon instead, and the enemy Bacchusmon watcher is offered to seat 1 and declined.
This establishes both eligibility and source identity before departure.

The sixth bounded case covers the deletion exception in comprehensive §§15-8-3-5 and
15-16-4-1. A public battle deletes a suspended BT20-078 Reapermon carrying face-up
BT20-073 MetalPhantomon; the inherited On Deletion trigger remains associated with
the original top card while the host leaves play and De-Digivolves a separate
opponent stack by exactly one, preserving every physical instance ID.

The seventh case exercises the same exception through a nested public timing window.
BT8-085 Yolei deletes an opposing BT19-065 carrying BT20-073 while a public attack is
still resolving. Seat 1 orders the two deletion effects by the exact BT20-073 source
key, and the inherited effect De-Digivolves the attacking BT25-077 stack; the former
top card is in trash and the buried physical card is the new top. The separate native
BT19-065 optional effect is then declined, so the result cannot be attributed to that
effect. This uses the §15-8-3-5 event snapshot and keeps the source-departure exception
scoped to the deleted stack source and its former top card.

The eighth and ninth cases cover copied effects whose source changes role before activation.
Both use a seeded, legal BT26-060 Chronomon: Destroy Mode over BT26-016 Chronomon: Holy
Mode and a public attack. In the negative case, Yolei is ordered first, its deletion
causes BT20-073 to De-Digivolve Chronomon so BT26-016 becomes the physical top card, and
the copied BT26-016 attack effect is absent while the native BT19-065 reaction is declined.
The paired control removes BT20-073; the same copied effect is then offered, accepted,
and deletes a 6,000-DP survivor. Both cases assert the old/new physical IDs, trigger
keys, trash, security, and completed attack.

The tenth bounded case covers two trigger families created by one deletion. EX13-028
Sukamon is deleted while EX13-031 KingSukamon is inherited under EX13-035 KingEtemon.
The engine snapshots KingSukamon's `onDeletionOf` watcher while Sukamon is still live,
then offers that watcher and Sukamon's native `[On Deletion]` in one `orderTriggers`
request. Selecting KingSukamon first produces effect-trigger events in that chosen order.
This proves the watcher no longer resolves eagerly before the deleted card's own effect. A
paired public BT2-109 Heat Viper case proves the same pool survives a deletion paid inside an
Option body: the watcher stays attached to the deferred deletion window until the Option finishes.

## Current source and ordering classes

| Class                                                                  | Current public consumer/provider                                                                 | Executable proof                                                                                                      | Status                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Same-timing optional effects owned by both controllers                 | BT25-040 Ascension                                                                               | First case above, with exact seat order and physical trash IDs                                                        | Proven for this native shape                 |
| Simultaneous pending sources that depart after order selection         | EX7-061 Lilithmon (X Antibody) with two EX7-072 Seventh Fascination cards                        | Second case above, with one `orderTriggers` request and both exact source IDs reaching deck                           | Proven for this trash-trigger shape          |
| Derived trigger while an older trigger remains pending                 | BT19-065, BT20-073, BT19-020                                                                     | Fourth case above, with exact source IDs and derived request precedence                                               | Proven for this chain                        |
| A pending source leaving or changing before that same source activates | BT25-077 Bacchusmon watcher created by effect-play, then deleted by the turn player's Bacchusmon | Fifth case deletes the enemy source before its pending watcher can activate; paired Agumon control proves eligibility | Proven for this public play/deletion shape   |
| Inherited On Deletion after the carrier leaves play                    | BT20-073 under a battle-deleted BT20-078 Reapermon                                               | Sixth case keeps the inherited trigger's original top-card identity and De-Digivolves a separate stacked target       | Proven for this public battle shape          |
| Nested inherited On Deletion after a public deletion window            | BT8-085 Yolei deletes BT19-065 carrying BT20-073 during an attack                                | Seventh case selects the exact BT20-073 trigger key, then checks old/new attacker top IDs and all trash zones         | Proven for this public nested shape          |
| Copied effect loses its source role before activation                  | BT26-060 over BT26-016; Yolei + BT20-073 De-Digivolve the Chronomon attacker                     | Eighth case orders Yolei, then BT20-073, and observes no BT26-016 optional attack effect after the source becomes top | Proven for this copied-source turnover shape |
| Copied effect remains eligible when source role is unchanged           | Same Chronomon stack without BT20-073                                                            | Ninth case accepts the copied BT26-016 effect and deletes the eligible 6,000-DP survivor                              | Proven by paired control                     |
| Native On Deletion and third-party deletion watcher                    | EX13-028 deleted beside EX13-035 carrying EX13-031, directly and as BT2-109's nested cost        | Tenth case receives one two-entry order request; paired public Option flow proves deferred pooling                    | Proven for direct and nested effect deletion |

The second class must not be described as a source leaving before its own activation:
the selected EX7-072 source departs after the public order decision and the remaining
source then resolves. The fourth class demonstrates pending/derived precedence, not
source identity mutation. The eighth/ninth pair closes the concrete copied-source role-change
path for the current Succession consumer. Other event families and source movement shapes
remain outside this finite audit.

## Future plan

- Extend this audit only when a new concrete provider or event family is admitted; retain
  exact source identities and controller decisions in each added request.
- Keep inherited On Deletion separate from ordinary pending source departure: §15-8-3-5
  anchors it to the original top card after deletion.

## Simultaneous-trigger obligation pilot (2026-09-23)

The `simultaneous-triggers` scope in `data/kb/rule-obligations.json` links
§§15-4-3-2, 15-4-3-4, 15-4-3-5-1 and 15-4-3-5-2 to exact named tests.
The initial scope has 15 obligation/scenario links to six distinct tests (five
engine cases and one UI case). Reusing one test for several obligations does not
count as additional executed tests or establish exhaustive rule coverage.

`interaction-trigger-timing.test.ts` now includes public equal-DP battles with
two pending effects per player, once with each seat as turn player. Each player
has EX13-028 and a legal ST3-10 stack inheriting EX13-031. The turn player chooses
the inherited watcher first; the opponent chooses native On Deletion first.
Both decline the offered BT11-036 play. Assertions cover the exact order prompt
contents, controller sequence, activation order, remaining field, and declined
cards in trash.

The initial regression failed because frozen battle deletion watchers resolved
separately before native On Deletion effects, producing interleaved controller
activations without the required shared order choice. `prepareFrozenSubTrigger`
now stages these watchers in the existing deletion reaction pool. Identity
deduplication follows §4-27-4 for the simultaneous battle event (§14-2-2).
Review also exposed the need to revalidate a surviving watcher's source before
activation. A paired development run removed that guard and reproduced an
incorrect EX13-031 activation after EX13-063 removed its host; restoring the
guard makes the public regression pass. Sources deleted in the original batch
retain their existing last-live context exception.
The original pilot excluded the rule-check pool. The expansion below now covers
§15-4-3-3 and its interaction with other timing triggers.

`apps/web/test/triggerOrder.scenario.test.tsx` renders the real GameScreen against
the real room over WebSockets. It confirms both Tai Kamiya and T.K. Takaishi
appear in the order dialog, selects Tai, confirms resolution, observes the
server's StartOfYourTurn effect event identifying BT1-085, and checks memory 3
and closure of the decision. Equal final memory alone would not distinguish
these cards, so the authoritative source event is essential evidence. This is
jsdom interaction evidence, not proof of real-browser layout or mobile geometry.

Reproduce the scoped engine and UI verification:

```bash
NODE_OPTIONS=--max-old-space-size=2048 node tools/kb/verify-rule-scenarios.mjs simultaneous-triggers
```

The runner executes exact named tests, rejects expected-failure runtime metadata,
and reports each layer independently. All child Node heaps are capped at 2048 MB,
with one worker per test process. Source changes retain scenario membership but
invalidate its proof. A structurally valid inventory alone is not an execution
result. This evidence was produced in the working tree based on
`3a6018df6aa60eea78c3e7d1f99493c60de93380`; no delivery commit is claimed.

The full API typecheck exceeded the required 2 GB heap cap. A temporary TypeScript
configuration including the changed engine module, its conformance test, and
their imported dependencies passed at the same cap; it does not replace the full
API typecheck. The full web typecheck passed. No whole-engine or whole-collection
parity claim follows from this pilot.

Historical pilot validation at the 2 GB cap (before the expansion):

- Scoped runner above: four obligations, 15 scenario links, six distinct linked
  tests; engine and UI verified, no scoped gaps or execution errors.
- `NODE_OPTIONS=--max-old-space-size=2048 node --test tools/kb/verify-rule-scenarios.test.mjs tools/kb/rule-obligations.test.mjs`:
  17 passed, including missing/skipped/expected-failure evidence and source-drift checks.
- `NODE_OPTIONS=--max-old-space-size=2048 TEST_MAX_WORKERS=1 TEST_HEAP_MB=2048 nice -n 15 pnpm --filter @aegis/api test:conformance`:
  83 files, 725 tests passed.
- `NODE_OPTIONS=--max-old-space-size=2048 TEST_MAX_WORKERS=1 TEST_HEAP_MB=2048 nice -n 15 pnpm --filter @aegis/api exec vitest run src/engine/conformance/interaction-trigger-timing.test.ts src/engine/combat/ src/engine/attackTriggerOrdering.test.ts src/engine/attackSecurityRemovalTriggerOrdering.test.ts src/engine/effects/primitives.test.ts src/engine/effects/derivedTriggerPrecedence.test.ts src/engine/ruleCheckPool.test.ts src/cards/EX13/ --pool=forks --maxWorkers=1 --no-file-parallelism`:
  101 files, 1,883 tests passed. These overlap with conformance; counts are not additive.
- `NODE_OPTIONS=--max-old-space-size=2048 node tools/kb/rule-obligations.mjs --check`:
  structurally valid; 10 proven classifications and 7,827 gaps globally. These are
  inventory classifications, not an engine parity percentage.

## Expanded matrix evidence

The seven scopes in `trigger-matrix` link 31 obligations to 72 reviewed scenario
links and 59 distinct tests, including 13 functional UI tests. The exact source
clauses, preconditions, decisions, results, paths, and full test names live in
`data/kb/rule-obligations.json`. Membership is explicit and survives source refresh;
removed or renumbered clauses require reconciliation instead of disappearing.

`interaction-rule-check-triggers.test.ts` adds nine public engine cases. Rule-check
movements are now collected before a timing window resolves; their deletion,
Ascension and watcher reactions join the existing pending group. Both seat orders,
play entry, the zero-DP start-turn example and derived rule checks are covered.
Native and inherited On Deletion lapse after Ascension moves the former host out
of trash. A surviving watcher removed by an earlier effect lapses before activation;
a paired surviving control activates. Each pending watcher rechecks live eligibility.
Checks remain deferred while an Option or effect body is still processing; the
existing BT24-041 regression exercises the Option boundary.

`interaction-pending-trigger-matrix.test.ts` adds ordinary-digivolution Once Per
Turn preservation, changed target candidates, two distinct sequential play events,
and a paid attack watcher selecting a Progress-immune target. The immune target
remains legal to select and stays in play; a second ordinary target proves the
choice is explicit. Existing reviewed tests supply derived priority, copied-source
loss, inherited deletion, optional costs, prevention and actual turn-reset cases.
The Q6030-named seam's third-party watcher assertion is linked to CR §15-8-5-2;
Q6030 alone is not a ruling for that assertion. Q2212 concerns an immediate
would-delete trigger before replacement, not ordinary On Deletion.

UI scenarios now verify the exact chosen authoritative effect, rejection of the
wrong player's response without advancing the pending decision, optional payment
and memory/hand outcomes, desktop and three mobile reconnect variants, and choosing
the seventh trigger at three viewports. Long-clause and footer assertions are
structural jsdom checks, not browser pixel or touch geometry measurements.

Reproduce all seven scopes locally:

```bash
NODE_OPTIONS=--max-old-space-size=2048 node tools/kb/verify-rule-scenarios.mjs trigger-matrix
```

All Node executions use a 2 GB heap cap. The inventory has 36 proven records and
7,801 explicit gaps globally. Completion means the declared trigger matrix has
reviewed, passing evidence; it does not mean 100% game parity or exhaustive coverage
of every card combination.

### Expanded verification results (2 GB heaps)

- Final `trigger-matrix` verifier passed: 31 obligations, 72 scenario links, 59
  distinct tests; engine and UI verified, zero scoped gaps or execution errors.
- Complete conformance suite: 85 files, 738 tests passed.
- Rule-check and adjacent regression suites: 11 files, 243 tests passed (overlap
  with conformance; totals are not additive).
- Inventory and executable-verifier unit tests: 20 passed.
- Full web typecheck passed. The temporary API configuration covering changed
  engine modules, new conformance files and their import graph passed. Full API
  typecheck remains unverified because it exhausted the required 2 GB cap.
- Formatting and lint passed on changed code; `git diff --check` passed.
- Sol reviewed rule-check staging, Option deferral, pending-source guards and
  positive controls; Luna implemented and checked the UI scenarios. Review issues
  were corrected before the final matrix execution.

### Quiet timing windows: route-regression follow-up

The subsequent route-matrix regression run exposed four BT19-007/009 test
timeouts introduced by unconditional rule-check staging awaits. Isolated HEAD
passed 23/23 tests; overlaying only the rule-check/timing changes reproduced the
four failures. The deletion outcome was unchanged, but it arrived after the
existing bounded microtask wait. `hasRuleProcessPending` now uses the read-only
rule predicate and deferred watcher queue to skip staging awaits on quiet boards.
Checks with actual work still join the same timing group. The original test wait
limits are unchanged; both BT19 files and the nine rule-check cases pass.
