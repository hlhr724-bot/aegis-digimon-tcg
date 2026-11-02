# Optional processing costs without payload targets

## Contract

Comprehensive Rules §15-7-1 defines printed `By X, Y` text as an optional
processing condition. Section 15-7-5 permits that condition to be performed
even when the subsequent effect content has no legal target.

## Correction

Generated IR preserves the printed `By ...` prefix in the cost's `raw` field.
The processing-condition seam now classifies that wording directly, while
retaining `allowCostWithoutTarget` as a compatibility escape hatch for manual
IR without printed cost text. Every target preflight delegates to this single
classification. This covers more than 1,000 compiled actions across the card
catalog instead of requiring per-card flags.

Loose-zone `Return` previously performed a separate candidate preflight that
ignored even the explicit flag, preventing cards such as BT12-073 from paying
their hand-trash condition when no eligible recovery card was in the trash.
It now delegates to the same seam; payment and the empty payload resolve in
printed order.

Fixed-count `deleteOwn` costs now use the same one-decision interaction as
hand-trash costs when the parent action is optional and aborts on refusal. The
engine snapshots the legal battle-area permanents, asks for zero or the full
required count, and treats zero picks as declining the processing condition.
This removes the redundant optional confirmation without weakening the cost:
the payload still runs only after the complete deletion succeeds.

The cost refusal and the payload target count remain separate. Comprehensive
Rules §1-3-6 requires at least 1 card whenever an effect chooses cards, so an
`up to N` permanent-target payload uses minimum 1 when candidates exist. Only
the preceding decline-capable cost selection uses minimum 0. Heat Viper thus
offers Pass while choosing the own Digimon, but not while choosing the opposing
Digimon after payment.

A Delete whose target is defined by the paid card (`bindResultAs` matched by
`relativeTo.selectionRef` or `sameNameAsSelection`) had its own preflight that
read only the explicit flag. With no opposing Digimon inside the bound, BT12-108,
BT13-092, BT13-109, and BT9-102 skipped their printed `By` condition without
asking. That preflight now delegates to the same seam.

## Behavioral proof

- `optionalActivationReceipt.test.ts` proves an opted-in Return pays its hand
  trash cost with no matching trash target, both through printed `By` wording
  and through the compatibility flag used by handwritten IR.
- `processingCondition.test.ts` walks the complete persisted catalog and proves
  every optional cost carrying printed `By` wording is classified by the seam.
- `BT12-073.test.ts` proves Impmon (X Antibody) may trash an Option with only an
  ineligible Digimon in trash at both printed timings, while retaining its
  separate refusal path.
- `BT2-109.test.ts` proves Heat Viper goes directly to a zero-or-one own-Digimon
  selection, exposes no preceding optional request, and leaves both fields
  unchanged when the player selects nothing. Its paired paid-cost case proves
  the subsequent up-to-two opposing target request has minimum 1 and rejects an
  empty response.
- `BT20-073.test.ts` and `trigger-ordering-source-departure.test.ts` prove the
  same interaction survives a derived `[On Play]` window: accepting the
  preceding `[On Deletion]` play publishes MetalPhantomon's decline-capable
  `deleteOwn` selection directly, and its later trigger ordering is unchanged.
