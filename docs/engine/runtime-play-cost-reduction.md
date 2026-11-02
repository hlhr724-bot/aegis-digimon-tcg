# Runtime play-cost reduction

## DigiXros material providers and ordinary play affordability

Legacy `PlaceUnder` replacements marked `asDigiXrosMaterial` on registered zone expanders are handled by the DigiXros picker. The replacement interpreter already skips those bodies. Their presence must not make an otherwise unaffordable ordinary play appear payable.

The interpreter and effect registration share `isDigiXrosPickerReplacement`. A cost-free effect containing only that skipped replacement exposes `canAttemptPlayCostReduction: () => false`. Mixed effects and effects with their own payment remain conservative. Actual material selection, Tamer suspension and DigiXros discounts retain their existing resolution path.

The GEPA diagnostic reproduced an ordinary BT5-112 play at memory 1 while BT10-087 was in play: its cost 15 exceeded the payable 11, but the inactive replacement caused affordability to remain unknown. The rejected play invalidated the MCTS rollout. The minimized regression in `bot/training/affordability.test.ts` checks the same boundary with BT10-087, BT10-088 and BT11-095, including synchronous rejection without state changes or decisions. Their card suites cover valid material use under Tamers; `digiXrosPreparation.test.ts` covers optional payment processing.

This correction does not relax rollout validity or certify a stronger learned policy. Existing campaign outcomes remain tied to their original engine fingerprint.

## Status

Bounded EX6-006 correction at baseline `b88aeb69f22995641622ab4388086ff771b23dc0`, 2026-09-13. Focused EX6-006, subtrigger and primitive controls pass **3 files / 211 tests**. The subsequent collection/mechanism/layout gate passes **271 files / 2893 tests**. Final shared/API/web typecheck and 86-file changed-TypeScript style checks pass. Structured review is closed with no accepted/actionable EX6 finding; final helper reports a rejected pre-existing cross-collection expansion rather than a zero-finding result. Delivery remains pending; this evidence does not certify every reducer consumer.

## Contract and implementation

The committed EX6-006 inherited text offers a three-memory reduction, or four with five different names in its digivolution cards, when an owner's Seven Great Demon Lords Digimon would be played. The mutually exclusive choice belongs to the attempted play, uses current source names and is once per turn. Refusal preserves the later eligible attempt.

`effects/interpreter/actions/replacement.ts` previously captured an amount during installation. It now offers optional acceptance first and evaluates/selects `amountChoices` at activation. Numeric success applies the selected reduction; reducers without choices retain boolean success. A declined subscription remains installed with its OPT budget unspent; only successful acceptance consumes it.

Installed subscriptions expose a pure current-choice projection. `GameEngine.fireBeforePayCost` also projects eligible Breeding resident effects before their first installation: Gate is a BeforePayCost inherited watcher, so continuous recomputation cannot arm it in advance. The interpreter supplies read-only metadata for cost-free amount-choice replacements. Projection checks the pending card's source filter, current choice conditions, inherited placement, trigger/activation guards and the actual replacement OPT ledger. Source-instance/effect identity avoids counting an installed reducer twice. Projection never resolves the effect, prompts, pays a cost or marks a budget.

## Reproducible proof

The existing public Gate suite covers legal Breeding copies, actual paid plays, four/five-name reductions, refusal/full cost, later acceptance, same-turn consumption and complete next-own-turn reset. Refusal then selected-four arithmetic is memory 3 minus (cost 7 minus reduction 4) = 0; a stale selected-three amount incorrectly leaves −1.

New shared registry proof activates the same subscription twice: refusal preserves installation and budget; later acceptance returns four, marks the budget and consumes the subscription. Scratch baseline: **30 passed / 1 failed**; corrected registry: **31/31 passed**.

The real cold affordability witness uses EX10-074 Beelzemon ACE, printed play cost seven. Five distinct names at memory −7 permit cost three. Real source removal leaves four names, whose cost four cannot fit the remaining three gauge; at memory −4 it can fit, and the actual paid play ends at −8. The native primitive models an effect-paid play during negative-memory processing. Each initial projection leaves pending decisions and recorded decisions empty. A non-SGDL seven-cost card receives no discount. After acceptance, a second SGDL candidate at memory −6 is unaffordable: its unspent three-memory discount would fit the remaining four gauge, so this boundary distinguishes actual OPT consumption.

Red scratch witnesses reproduce cold projection omission and same-subscription refusal (**39 passed / 2 failed**), the missing source filter (**9 passed / 1 failed**), and the omitted replacement-ledger guard (**9 passed / 1 failed**). Corrected focused command:

```sh
TEST_HEAP_MB=3072 pnpm --filter @aegis/api exec vitest run src/cards/EX6/EX6-006.test.ts src/engine/effects/subtriggers.test.ts src/engine/effects/primitives.test.ts --maxWorkers=1 --no-file-parallelism
```

Result: **3 files / 211 tests passed**. The following coordinator broad gate includes all EX6 suites, conformance/combat/effects/cards, passive reducers, replacement recomputation, BT14-090/BT25-096 compatibility and audit layout: **271 files / 2893 tests passed**, one worker / 3 GB heap. The previous BT14 ordered-payment investigation is separately closed in [activation-costs.md](activation-costs.md#ordered-loose-placement-host-checkpoint-2026-09-13).

## Bounded compatibility limitation

The final review proposes adding prospective projection for mode-less nested/fixed/scaled Breeding replacements in BT13-007, BT22-079/080 and BT23-073. Source comparison with `b88aeb69f` confirms their cold project-only omission already exists at base. These records do not enter the new cost-free amount-choice metadata path, so their actual runtime and existing projection behavior are preserved. This audit rejects the proposed expansion as outside the EX6 correction and does not certify those other consumers. No broad nested/paid/scaled projection claim is made.

### EX6 closing gate, 2026-09-13

The corrected EX6 collection and included shared controls pass **271 files / 2893 tests** with one worker and a 3 GB test heap. Shared/API/web typecheck and 86-file changed-TypeScript style checks pass. Atomic implementation commits are pushed in [PR #4773](https://github.com/vinicius3333/aegis-digimon-tcg/pull/4773); final delivery supersedes the earlier pending checkpoints. This bounded gate does not certify all other card collections.

## Printed replacement budget identity

Breeding affordability projection must read the same key as `runReplacement`:
`<source instance>/printed/<effect key>`. Omitting `printed` made an exhausted
Gate or King Drasil look available again after its subscription was consumed.
The prospective cold-registration path now checks the real replacement ledger.
The Gate affordability test and the Cool Boy/King Drasil scenario prove that
projection offers the first payable play and excludes a second play that would
require reusing the spent reduction.
