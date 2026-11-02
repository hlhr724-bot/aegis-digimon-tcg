---
title: "<Use Req.> and the breeding area"
updated: 2026-10-15
---

# `<Use Req.>` and the breeding area

## Ruling

The keyword `<Use Req.>` (CR 16-42, introduced with ST-23/ST-24) is satisfied by a
matching Digimon or Tamer in the **battle area or the breeding area**. This differs
from the older, free-text color-requirement waivers printed before the keyword
existed (e.g. EX7-074's LIBERATOR clause, and the BT23 CS Option cards that
`<Use Req.>` was introduced to condense), which are **not** satisfied by a card in
breeding.

CR 4-3-1 additionally treats a Digi-Egg card on the field as a Digimon. Therefore,
a matching Digi-Egg in the breeding area satisfies a Digimon-based `<Use Req.>`.
Issue #4870 exposed that the live-kind matcher recognized only printed Digimon
cards (and DP-bearing battle-area Digi-Eggs), excluding ordinary Digi-Eggs in
breeding. The matcher recognizes face-up Digi-Eggs on the field as Digimon independently
of their current DP. Reaching 0 DP does not remove that classification or make
continuous reductions stop applying. Rule processing handles deletion at 0 DP
and removes invalid no-DP remnants separately.

## Why the two templates differ

- CR 16-42-3 defines `<Use Req.>` as waiving the color requirement for "specific
  Digimon and/or Tamers **on the field**". CR 3-4-6 defines "the field" as the union
  of the battle area and the breeding area — the same "on your field" wording CR
  4-22-2 uses for the base color-requirement check, which official rulings (e.g. the
  Q&A for LM-033 through LM-038) confirm reads from the breeding area.
- The free-text pre-keyword template ("while you have a Digimon with the [X] trait,
  you may ignore this card's color requirements") is not the keyword — it is an
  ordinary referencing condition, so it falls under the general restriction in CR
  3-4-7-8 ("information on cards in breeding areas can't be referenced unless the
  effect explicitly specifies or reference breeding areas"), whose own worked
  example is exactly this wording. The KB has a direct ruling on this for EX7-074
  (Q3873, LIBERATOR): breeding does **not** count.

No official Q&A specific to the `<Use Req.>` keyword and the breeding area was found
during this audit; the ruling above is inferred from CR 3-4-6 + CR 16-42-3 + the
LM-033..038 precedent, not a literal card Q&A. Replace this note if a direct
`<Use Req.>` ruling ever surfaces.

## Affected cards

All 38 cards printing the literal `＜Use Req.＞` keyword (grep `cardId` for
`＜Use Req` in `packages/shared/src/cards/data/cards.json`) now scope their
`WaiveColorRequirement` / `youHave` condition to
`zone: ["battleArea", "breeding"]` instead of battle-area-only:

BT25-043, BT25-057, BT25-085, BT25-093, BT25-098, BT25-100, BT25-101, BT25-104,
BT26-031, BT26-032, BT26-033, BT26-050, BT26-056, BT26-057, BT26-075, BT26-080,
BT26-099, BT26-101, BT26-102, EX12-018, EX12-033, EX12-052, EX12-069, EX12-070,
EX12-071, EX12-072, EX12-073, EX12-074, EX12-075, P-235, P-236, P-237, P-238,
P-243, ST23-09, ST23-15, ST24-07, ST24-15.

Pre-keyword free-text waivers (EX1-071, EX3-066, EX7-010, EX7-074, BT19-100,
BT21-090, BT23-091 through BT23-100, ST12-15, and any others matching the older
template) are unaffected and keep rejecting a matching card in breeding.

`packages/shared/src/effects/effects.json` was regenerated via
`pnpm effects:sync:set -- --set <SET>` for BT25, BT26, EX12, P, ST23, ST24 after
the source changes. Full suite: 41,024 tests passed; `pnpm -r typecheck` passed.

## Public BT26-080 field proof

The reviewed `comprehensive-0261` chunk has SHA-256
`bea2acb41142c08a4ce511f19dd3e0c0b2069a500a9a419267b553f3685e8b8a`.
`apps/api/src/engine/conformance/keyword-use-req-field.test.ts` publicly uses
the dual BT26-080 card as an Option. With real TS Digimon BT25-077 in the
breeding area, the Purple Option requirement is waived, the Option pays its
printed five memory, and its complete delete body removes the exact opposing
target. With only real non-TS green BT1-080 in breeding, the same Option is
rejected before payment and remains in hand. This proves the keyword's
`field = battle area or breeding area` scope and its trait predicate for this
consumer; it does not certify all 38 literal keyword cards.

The existing `ch16c-deletion-and-advanced-keywords.test.ts` sweep covers 24
compiled keyword records and BT25-093's battle-area TS runtime consumer. The
literal-text inventory above contains 38 cards, including dual cards and
source-specific forms. Pre-keyword free-text waivers remain a separate class:
the EX7-074/Q3873 breeding exclusion is not evidence against the keyword.
