# Effect play and digivolution route matrix

Reviewed: 2026-09-23. Scope: six mechanics and five recipient-source routes.
The canonical executable links and complete 30-cell manifest are in
`data/kb/rule-obligations.json`, scope `effect-play-routes`.

## Coverage and source interpretation

| Mechanic              | Manual hand | Effect hand         | Effect trash        | Effect security     | Effect deck reveal  |
| --------------------- | ----------- | ------------------- | ------------------- | ------------------- | ------------------- |
| Assembly              | BT26-014    | EX12-072 → EX12-064 | BT26-067 → BT26-073 | ST10-06 → EX12-064  | EX12-058 → EX12-064 |
| DigiXros              | BT10-077    | BT21-021 → BT19-014 | BT10-084 → BT10-077 | ST10-06 → BT10-077  | BT10-105 → BT10-061 |
| DNA                   | EX13-045    | EX3-020 → EX3-074   | BT17-101 from trash | No printed provider | No printed provider |
| App Fusion            | BT23-021    | BT21-084 → BT21-073 | BT24-087 → BT24-038 | No printed provider | No printed provider |
| Burst                 | BT13-020    | No printed provider | No printed provider | No printed provider | No printed provider |
| Alternate requirement | EX4-051     | BT19-077 → EX4-051  | BT13-085 → BT26-082 | BT16-024 → EX6-028  | BT24-060 → BT20-080 |

Each covered cell has a real-card behavioral test. The column describes the
recipient's source zone, not the effect provider's zone. EX12-072's Security
effect plays Megadramon from hand; it is not a security-source play.

The original matrix incorrectly omitted three applicable routes. BT17-101's
Trash effect explicitly DNA digivolves into itself after a qualifying level-6
play. ST10-06's DNA-triggered effect searches security and plays a level-5-or-lower
Digimon, enabling both Assembly and DigiXros. New regressions assert the actual
physical target, its removal from the source zone and selected materials.

CR §§8-2-2-4, 8-3-2-2 and 8-4-2-2 prohibit substituting a standard-digivolution
effect for DNA, Burst or App Fusion. They do not prohibit a specifically named
effect from selecting a card from security, trash or a revealed deck. The eight
remaining cells are reviewed catalog absences, not normative exclusions.

## Review of cells without printed providers

The input is the committed 4,480-card catalog at
`packages/shared/src/cards/data/cards.json`. Search all `effectText`,
`inheritedEffectText` and `securityEffectText` fields, including clauses stored
on a single line, then inspect the actual operation and recipient zone.

- DNA: inspect text containing `DNA digivolv`, including explicit actions,
  self references and Blast DNA. BT17-101 targets itself from trash; the other
  reviewed providers target hand. BT18-015, BT18-073 and EX11-059 can use trash
  materials but still select the DNA result from hand. References to security
  and deck in other clauses describe outcomes, not a DNA result from those zones.
- App Fusion: the seven explicit providers are BT21-084, BT22-087, BT23-079,
  BT24-087, BT25-089, EX10-062 and P-241. Six select a hand target; BT24-087 selects
  a trash target. None selects security or a revealed deck card.
- Burst: inspect all `burst digivolv` matches, not only `Burst Digivolve:`.
  BT13-020/033/060/092 and BT26-050 contain printed requirements or reminders,
  not an effect instructing Burst digivolution. Blast Digivolve is a different
  mechanic. No printed effect provider was found for these four effect routes.

Search patterns are candidate-finding aids, not automatic semantic proofs.
The manifest records review rationale and candidate IDs and pins both catalog
and rule-index hashes. Changes to either input fail validation until reviewed;
a refresh preserves the old review rather than silently updating its hash.
No current official-catalog completeness claim is made beyond the committed input.

## Behavioral corrections and evidence

- The original route tests checked some stack membership without its order.
  Strengthening BT21-021 → BT19-014 exposed DigiXros materials being stacked by
  candidate/source-zone order instead of printed recipe order (CR §7-2-2-8).
  Both direct and effect plays now use the same recipe slot assignment, including
  name aliases and substitution. Counted single-slot recipes retain the player's
  ordering. The Chapter 7 regression swaps which material starts on field and
  which starts in hand; both produce the same printed order.
- Charismon's App Fusion test now follows the complete printed flow: its
  optional When Digivolving effect moves the former host into linked cards.
  That move was not an App Fusion implementation bug; both physical cards are
  accounted for in their resulting zones.
- Manual Assembly and DigiXros assert reduced costs (15 → 10 and 10 → 7).
  Alternate requirement routes assert exact costs from hand, trash and security,
  and the waived cost for the revealed-deck route. Tests retain exact recipient
  identities and check the material/source-zone transitions relevant to each route.
- The Metal Empire seed proves its level filter accepts the level-5, play-cost-7
  Megadramon while leaving the level-6 card in hand. The Examon seed uses the
  two printed level-5 providers treated as level 6 for its DNA requirement.
- The Biting Crush seed observes the opponent's effect play, pays Delay by
  trashing Biting Crush and plays the exact Leviamon from trash. This is linked
  to CR §16-17-1; it does not claim the additional Leviamon X chain in Q4735 or
  the distinct own-effect/opponent-play branch in Q3678.

## Local verification

```bash
NODE_OPTIONS=--max-old-space-size=2048 node tools/kb/verify-rule-scenarios.mjs effect-play-routes
```

The verifier checks 14 obligations, 30 scenario links and 28 distinct tests after
the UI-flow follow-up added the real-room DigiXros scenario (see `ui-rule-flows.md`). Its
report includes all 30 route cells; eight reviewed absences are not counted as
executed tests. Expected failures, skipped tests, missing names, missing cells,
unrelated rule references and stale source/catalog reviews are rejected.

## Catalog revalidation — 2026-10-05

The player-fix patch changes only two catalog effect-text fields relative to
`dd930061b`: AD1-018's play-cost reduction condition and EX12-048's Assembly
material name from Sangomon to Sagomon. The first changes no play/digivolution
provider or recipient source zone. The second changes material eligibility,
while retaining the Assembly mechanic and every recipient route. Neither
introduces a DNA, App Fusion, or Burst effect provider. The eight reviewed
absence lists and all 30 route-cell classifications therefore remain unchanged.

After reviewing this bounded catalog delta, the matrix catalog fingerprint was
updated to `0cc982b8fd7d52beeef31950bd8555b8c9ded33fbc79ca37f3df918ea210d310`.
No obligation status, rule-source fingerprint, scenario link, exclusion rationale,
or candidate list was changed. The real `verify-rule-scenarios.mjs effect-play-routes`
run passed with no gaps or errors, including its engine and UI dependency scopes.

All Node processes retain the 2 GB heap limit and test workers are serialized.
Full API typecheck exceeds this limit; a temporary TypeScript configuration
covering the changed modules/tests and their import graph is checked separately.
This completes a bounded route matrix, not every possible card interaction or
whole-engine parity. No CI changes or deployment are part of this work.

The extended collection regression also exposed timing-test latency from the
previous rule-check changes. The quiet-window fix and its isolated baseline
comparison are recorded in `trigger-ordering.md`; no test wait limits were widened.
The BT10-111 substitute-material and BT21-021 Q4727 tests were updated to assert
printed stack order rather than the previous candidate enumeration order.

A further BT21-083 regression exposed a real pass/play race: Main could end while
an accepted play was still resolving Taiki's forced Rush attack. The router now
keeps a valid pass pending until accepted main-action continuations finish.
`mainVerbEndPhase.test.ts` proves both the completed security attack before turn
end and preservation of paid memory when the gauge has already crossed. These
cases are linked to CR §6-5-1, which permits Main actions only without unresolved
processing. Decision, seat, combat and game-over guards remain authoritative.

### Verification results (2026-09-23)

- Route verifier: 14 obligations, 29 links and 27 distinct tests verified;
  22 covered cells and eight reviewed catalog absences, with no verification errors.
- Trigger verifier: 31 obligations, 72 links and 59 distinct tests verified,
  including engine and UI scenarios.
- Full engine conformance: 85 files and 743 tests passed.
- Collection regressions: BT10 (683), BT19 (1,325) and BT21 (1,436),
  totaling 335 files and 3,444 passing tests.
- Main-phase regressions: six files and 30 tests passed.
- Scenario and matrix tooling: 25 tests passed; audit layout: four tests passed.
- Citation validation: all 497 recognized citations pinned, with no errors,
  unresolved references, hash mismatches or warnings.
- Scoped API TypeScript validation and formatting/lint checks passed for the
  changed implementation. Full API typecheck remains limited by the 2 GB heap.
- `git diff --check` passed.

The King Drasil joint-placement regression now answers its pending card-order
decision before ending Main. The final conformance run includes that correction.
These results establish the bounded scenarios above; the remaining obligation
inventory and interactions outside these scenarios still require evidence.

### Catalog review after printed-text corrections (2026-09-27)

PR verification failed at `representative reviewed clauses keep proof only while exact source stays current` because the catalog fingerprint still referred to `e8d4b1e18a61` (`26be2caa0051a502df269bf61a629ca5ae1df36eca76b22dedd3b69e74e04477`). The current catalog is `d84b7aef01e7be6832fe5e95fe79b0432560f275c60d20ca75669f45666863f1`. The exact failure reproduced in a clean checkout before changing the review fingerprint.

The incremental review compared every changed field against that previously reviewed catalog: 244 existing cards changed, with 217 `effectText` and 48 `inheritedEffectText` changes; all 4,480 card IDs and all security-effect fields are unchanged. The differences restore keywords, alternate/DNA requirements, printed name/trait/deck-size rules, and several corrected clauses. These are semantic catalog changes, so the fingerprint guard correctly required review.

The eight absence classifications remain valid for this committed input:

- All App Fusion and Burst matching card texts are unchanged. The seven explicit App Fusion providers still choose six hand targets and one trash target; the five Burst matches still describe requirements/reminders rather than effect instructions.
- Four changed DNA-related texts were inspected in full. BT23-032 adds its Angel trait rule. EX4-051 restores De-Digivolve in a separate mode; its DNA mode still selects from hand. EX8-029 and EX8-064 restore printed DNA requirements, not effect instructions selecting an evolution result from security or the deck. Their When Digivolving clauses play cards from evolution sources and trash respectively; playing a Digimon is not DNA digivolving into it.
- The remaining changed clauses add no instruction to perform DNA, App Fusion, or Burst digivolution from an excluded recipient zone. In particular, BT20-089's restored inherited text plays Eiji from evolution sources, and restored Blast Digivolve keywords are not Burst effects.

The 22 covered route classifications and eight catalog absences are preserved. Only the reviewed catalog fingerprint is updated; the validator, source-rule fingerprint, scenario statuses, and automatic-refresh safeguards remain unchanged. This review does not expand the matrix into a whole-catalog card-fidelity claim.

Verification after review: the original failing test passes, and all four route-matrix tooling tests pass, including catalog/rule drift invalidation. In isolated checkout `/tmp/aegis-ci-0db8e29e6`, `pnpm verify:simulator` exits 0 (shared build, API typecheck, 81 verification tests, 22 rules-tool tests, inventory/citation checks, and lint). The route verifier also exits 0 with 14 obligations, 36 scenario links, 34 distinct linked tests, verified engine/UI layers, and empty gaps/errors. These local runs use Node 24.21; the PR's Node 26 CI remains the environment confirmation.

### Catalog review after restored requirement lines (2026-10-02)

`pnpm test:tools` failed with "Effect-play route matrix catalog changed" because the reviewed fingerprint still referred to `a55a2c6e5` (`d84b7aef01e7be6832fe5e95fe79b0432560f275c60d20ca75669f45666863f1`). Commits `0ffa8f9a5`, `1f9fb0919`, `b4429132c` and `bb98518e5` changed the catalog to `b848b89fe6516605f313ca0fcc696c7ba209decdb1afb62afd0860732d923d62`.

The incremental review compared every field against `a55a2c6e5`: 29 cards changed (27 `effectText`, 2 `evoCosts`). All 4,480 card IDs, every `inheritedEffectText` and every `securityEffectText` are unchanged.

- Every changed text adds a printed requirement line (`[Digivolve]`, `[DNA Digivolve]`, `[Assembly]` or `[DigiXros]`), except two count fixes: EX10-031's alternate digivolve cost (4 to 3) and EX10-034's DigiXros material count (2 to 3).
- The 14 added `[DNA Digivolve]` lines are printed requirements for the manual-hand route. None is an effect instruction that selects a DNA result from security or a revealed deck card.
- No changed line mentions App Fusion or Burst. The App Fusion and Burst exclusions keep their reviewed inputs.

The 22 covered route classifications and eight catalog absences are preserved. Only the reviewed catalog fingerprint is updated.

### Catalog review for v1.10.0-BETA (2026-10-04)

The failing route-matrix tooling test reproduced before updating its fingerprint. A field-by-field comparison against `v1.9.1-BETA` found exactly two changed cards, BT10-087 and BT10-088. Their only changed field is `effectText`: “under one of your Tamers” becomes “under your Tamers”, restoring the material-host scope of their existing DigiXros permissions. Every card ID, other field, inherited clause and Security clause is unchanged.

These changes add no play or digivolution recipient zone and no DNA, App Fusion or Burst provider. The 22 covered cells and eight reviewed catalog absences retain their classifications. The reviewed catalog fingerprint moves from `b848b89fe6516605f313ca0fcc696c7ba209decdb1afb62afd0860732d923d62` to `f445cf491742ba36ac351efdd554b279995f85500fba26b9f3195f7b6e398491`; rule fingerprints and scenario proof statuses remain unchanged.

Verification: all 67 tooling tests pass under Node 26.5.0, including the original failing obligation check and catalog/rule drift guards. The obligation inventory check, all 535 pinned conformance citations and the 66-set audit index check pass.

### Catalog review after Digivolve requirement fixes (2026-10-11)

The obligation test reproduced the catalog-drift failure before this review: 15 tests passed and `representative reviewed clauses keep proof only while exact source stays current` failed. The matrix fingerprint matches the catalog reviewed in `928f306a5`; the field-by-field comparison from that revision to the current catalog finds exactly two changed `effectText` fields introduced by `93719c1b1`:

- BT21-038 Deramon's alternate requirement changes from a level-3 [WG] Digimon for cost 2 to a level-4 [WG] Digimon for cost 3. Its Evade, unsuspend effect and inherited attack-target restriction are unchanged.
- P-140 MegaKabuterimon's alternate requirement changes from [Insectoid] in the source's name to the [Insectoid] trait, retaining level 4 and cost 3. Its protection effect and inherited security-trash effect are unchanged.

All 4,480 card IDs, every other catalog field, all inherited texts and all security texts are unchanged. Neither corrected requirement instructs a play or digivolution by effect, changes a recipient source zone, or changes a provider/recipient used by the 22 covered cells. ST23-05's implementation correction in the same commit does not change the catalog or any matrix seed.

Rechecking all three effect-text fields finds the same 134 DNA-matching fields, 38 App Fusion-matching fields and five Burst-matching fields, with identical full text to the reviewed catalog. The reviewed provider conclusions therefore remain valid: BT17-101 selects itself from trash; the DNA candidates using trash materials still select the result from hand; the seven explicit App Fusion providers select six hand targets and BT24-087's trash target; the Burst matches describe requirements/reminders rather than effect instructions. No new provider targets the eight excluded recipient routes.

The 22 covered cells, eight absence classifications, candidate lists, scenario evidence and rule-source fingerprint are preserved. After this bounded provider/exclusion review, the catalog fingerprint moves from `39a12bc2101da115533d7775cdc3062fedcbeec17781347c8e7d5f0e2ee2dd02` to `8edd8d1375831988c9bec8980c0f1348dc4e3d1e3733e117d947fba9eb61d84a`. Catalog drift and automatic-refresh safeguards remain enforced.

Verification under Node 26.5.0 and pnpm 10.30.1: all 66 tooling tests pass, including the original failing test and catalog/rule drift guards. `pnpm verify:simulator` passes the shared build, API typecheck, 100 API verification tests, 22 rules-tool tests, obligation inventory check and all 536 pinned citations. Its final lint step fails on an existing unused `ANIMATION_SPEED_CHANNEL` import in `apps/web/src/game/useAnimationSpeedReport.ts:2`, outside this change. Formatting checks for the two changed review files and `git diff --check` pass. This run does not replay the full route scenario scope or deploy a fix.

### Catalog review after MetalGreymon text correction (2026-10-12)

The full tooling suite reproduced the catalog fingerprint failure. A field-by-field comparison against the reviewed catalog at `bfc57a04e9` finds exactly one changed field: EX12-016 MetalGreymon's `effectText` removes the unprinted Security Attack +1 keyword. Its Assembly requirement, alternate digivolution requirement, Decode and removal effects remain identical. All card IDs and other catalog fields are unchanged.

All DNA, App Fusion and Burst matching effect, inherited and security fields retain identical complete text. The removal introduces no provider, recipient zone or route requirement. The 22 covered cells, eight absence classifications, scenario evidence and rule-source fingerprint remain unchanged. The reviewed catalog fingerprint moves from `268f0ababc2de8e15a5ac50194bca5ca645a0709d8ef41b9fd704feba9afcc3a` to `f1f65e7c8771028cad7360a90ca223a5048878ac96250d20f89cce8f0a5cf45e`; drift guards remain enforced.

### Catalog review after BT27-084 addition (2026-10-13)

The simulator verification check on PR #5462 failed on the catalog fingerprint. The only catalog change since the previous review is one new card: BT27-084 LordKnightmon (X Antibody). Its texts contain no Assembly, DigiXros, DNA, App Fusion or Burst requirement or provider. Its [When Digivolving] effect plays cards from hand, and its [Digivolve] requirement is an ordinary hand digivolution from LordKnightmon. It adds no provider for any of the eight reviewed absence cells.

The 22 covered cells, eight absence classifications, scenario evidence and rule-source fingerprint remain unchanged. After merging `develop`, whose EX8-071 text fix was reviewed separately as route-neutral, the reviewed catalog fingerprint moves from `abe2764d45739099111feb6cb447c0e40511078598300889ad549867df8c2d07` to `d162e1967d88f030cfcfdedee7b00ff885443b279ce2c912b1d182069848fd44`; drift guards remain enforced.

### Catalog review after reprint and errata updates (2026-10-14)

The simulator verification check on PR #5526 failed on the catalog fingerprint. A field-by-field comparison against `origin/develop` finds no added or removed cards. Twenty-four existing cards change only `effectText`, `inheritedEffectText`, `securityEffectText`, `nameEn` or `imageId`: newer printing wording (BT3-039, BT4-109, BT8-038, EX1-068, BT9-102, BT11-095, RB1-032), errata text (EX4-072, EX2-028, BT12-037, BT12-051, BT14-002, BT14-029, BT14-091, BT16-060, BT20-095, ST10-06, P-115), errata names (BT10-101, BT4-031) and default art (BT1-042, BT12-094, P-071, P-123).

None of these changes adds or alters an Assembly, DigiXros, DNA, App Fusion or Burst requirement or provider, or an alternate digivolution requirement. ST10-06 keeps its DNA requirement and changes only its security-search sentence. BT12-037 and BT12-051 keep their DigiXros text and change only the Ryoma Mogami spelling. EX4-072 digivolves from hand while ignoring requirements, which is not one of the matrix mechanics.

The 22 covered cells, eight absence classifications, scenario evidence and rule-source fingerprint remain unchanged. The reviewed catalog fingerprint moves from `d162e1967d88f030cfcfdedee7b00ff885443b279ce2c912b1d182069848fd44` to `abe6ef929a8d8c1e0834af8186f839d891da3816089cc71b94fdb98def69872e`; drift guards remain enforced.

### Catalog review for BT27 and EX14 additions (2026-10-15)

Compared with the reviewed catalog at `68d82b6773`, five cards were added (BT27-035, BT27-070, BT27-103, EX14-012, EX14-054), EX1-068 changed, and no cards were removed. The review includes DUAL `optionEffect` text as well as effect, inherited and security fields.

- BT27-035 adds a manual Burst requirement; neither side instructs Burst digivolution by effect. It is included in all four Burst absence candidate lists.
- BT27-103 adds a manual DNA requirement and an Option action that DNA digivolves into the resolving card itself. It does not select a result from security or revealed deck cards. Both DNA absence reviews now explicitly include this provider.
- BT27-070 and EX14-012 add alternate requirements and Arts Digivolve; neither provides DNA, App Fusion or Burst from an excluded zone. EX14-012's security action uses itself as an Option, not as a DNA/App Fusion/Burst result.
- EX14-054 adds an Assembly requirement and a trash-play effect. These routes are already covered; it adds no excluded digivolution provider.
- EX1-068 changes only the Ice Wall memory-loss wording, unrelated to these routes.

The App Fusion search still finds seven explicit providers: six target hand and BT24-087 targets trash. The 22 covered cells, eight absence classifications, scenario proof and rules fingerprint remain unchanged. The catalog fingerprint is renewed only after this review; catalog drift remains an error.

### Catalog review after preview colors and Hjaðningar Waltz (2026-10-15)

The PR verification failure reproduced with `node --test tools/kb/rule-obligations.test.mjs`: the reviewed catalog fingerprint was stale. A field-by-field comparison against the reviewed catalog at `4f5453f89f` finds one added card, two changed cards, and no removals:

- BT27-035 changes its colors from blue/yellow to blue/black. Its printed requirements and every effect field remain unchanged.
- EX14-054 adds red to its colors and a red level-5 evolution requirement for cost 4. Its Assembly requirement and all effect text remain unchanged.
- BT27-100 Hjaðningar Waltz grants a forced attack, places itself in the battle area, and uses Delay to De-Digivolve and delete opposing Digimon. Its Security effect deletes Digimon and returns itself to hand. None of these clauses instructs play, DNA, App Fusion, Burst, or alternate digivolution from a new recipient zone.

All other catalog fields are unchanged. These additions and corrections preserve the 22 covered route classifications and eight reviewed provider absences. Scenario evidence, candidate lists and the rules fingerprint remain unchanged. The reviewed catalog fingerprint moves from `3fbdd1ed3350aeee8899f4027ec2ec89b57952377ea794365dd7675bcf1e7687` to `3a6953f662084646e6b7ba47c391819fb669fd03962b81f7b0d904389c41a032`; catalog drift remains an error and automatic refresh still cannot recertify a review.

### Catalog review after Mistymon inherited consent correction (2026-10-20)

PR #5882 changes exactly one catalog field relative to `d7dadc1939`: BT18-039's `inheritedEffectText` adds the printed optional consent to unsuspend. No card is added or removed, and every other catalog field is unchanged. Mistymon has no Assembly, DigiXros, DNA, App Fusion, Burst or alternate digivolution provider in this changed clause. The correction changes no recipient zone or route requirement.

The 22 covered cells, eight reviewed provider absences, candidate lists, scenario evidence and rule-source fingerprint remain unchanged. After reviewing this bounded delta, the matrix catalog fingerprint changes from `febc2e47c2a358bab84433796571387fbdaaccc9fa7acc61810e3d1c8ce9d766` to `d206dee6d3cea97d6b96598a55b2adbd6179e752b92b1a27078473a392a653dc`. Catalog drift continues to fail validation, and automatic refresh cannot recertify the review.

### Catalog review after the Falcomon evolution line (2026-10-24)

The PR check reproduced the catalog-drift failure in `node --test tools/kb/rule-obligations.test.mjs`. The reviewed fingerprint matches the catalog at `9975d9f3cc`. Comparing that catalog with this branch finds exactly three added cards (BT27-074 Falcomon, BT27-078 Peckmon and BT27-081 Crowmon), no removed cards and no changed fields on existing cards.

All three add alternate DATA SQUAD evolution requirements. Falcomon places a hand card under Keenan Crier and draws/discards; its inherited effect draws/discards. Peckmon plays Keenan from hand and has an inherited opponent discard. Crowmon plays or uses a cost-five-or-lower DATA SQUAD card from hand and its inherited effect plays an eligible Avian/Bird or DATA SQUAD card from trash. These use already covered hand/trash play routes; none instructs DNA, App Fusion or Burst digivolution, or introduces an excluded security/deck-reveal recipient route. Existing covered providers and all eight reviewed absence candidate lists and conclusions remain applicable.

After this bounded delta review, the catalog fingerprint changes from `9f16adfc4a6344101f82757d76723f59252a6c35bd3abf7ef00977d83021f2cd` to `f3da384b801928ebe75349e6e58b3f952ac4a00094f898a870915f5558adc39d`. All 30 route classifications, scenario evidence, exclusion rationale and rule-source fingerprint remain unchanged. Catalog drift is still rejected; no checker or test expectation was weakened.

### Catalog review after Ravemon dual-card additions (2026-10-25)

PR #6087 reproduced the catalog fingerprint failure in `node --test tools/kb/rule-obligations.test.mjs`. Compared with the reviewed catalog at `9e4bd72a60`, this branch adds only BT27-083 Ravemon and BT27-085 Ravemon: Burst Mode. Existing card records are unchanged.

Ravemon adds ordinary and alternate evolution requirements, an opponent hand/security discard, a purple Avian/Bird trash play and an Option discard/deletion effect. Burst Mode adds ordinary green and alternate DATA SQUAD evolution routes, plus a manual Burst requirement returning Keenan Crier. Its effects activate its Option's Main effect, discard, delete and unsuspend. Both cards have Arts Digivolve, which evolves into the resolving Option card; neither instructs DNA, App Fusion or Burst digivolution by effect or introduces a provider for an excluded security/deck-reveal route.

BT27-085 is added to the four Burst absence candidate lists as a printed requirement, following the existing BT27-035 classification. All 30 route classifications, scenario links, exclusion rationale and rule-source fingerprint remain unchanged. After reviewing this bounded delta, the catalog fingerprint is renewed; drift checking remains enforced.

### Catalog review after the purple Ravemon evolution correction (2026-10-26)

Compared with the reviewed catalog at `4763de3067`, no card is added or removed. The only changed field is BT27-085's `evoCosts`: it adds the printed purple level-6 cost-5 route alongside the existing green route. All printed effect text, alternate DATA SQUAD evolution, manual Burst requirements and Option actions remain unchanged.

This ordinary evolution correction also permits Arts Digivolve onto a purple level-6 base, as covered by `arts-digivolve-purple-level-six.test.ts`. It introduces no DNA, App Fusion or Burst effect provider and changes no recipient source zone. The 22 covered cells, eight reviewed provider absences, candidate lists, scenario evidence and rule-source fingerprint remain applicable.

After this bounded semantic review, the catalog fingerprint changes from `92c3b9e01cdbd6193dca0a369524d9c139d9ab28b1e4dacf88589e85b1b4c70d` to `86b3f0dcd41c4ffc8d08a709ef99d2c0f6a139da7f06a08080634de3e00ae71f`. Catalog drift remains an error; no validator or test expectation is weakened.

### Catalog review after printed-text corrections (2026-10-31)

PR #6314 reproduced the catalog-drift failure in `node --test tools/kb/rule-obligations.test.mjs`. Compared with the reviewed catalog at `63e8463749`, no card is added or removed and no non-text field changes. 127 text fields on 113 cards change, all checked against the official card images:

- Punctuation only: full-width commas become ASCII commas, wrong closing quotes are fixed (BT1-104, BT1-112, BT3-109), and BT2-111 gains a paragraph break before `[When Digivolving]`.
- Spelling: "digivoLv.e" becomes "digivolve" on BT1-078, BT1-109, BT2-062 and BT2-111, and BT2-097's DP modifier spacing is fixed. BT1-078 keeps its existing revealed-deck digivolution.
- Wording that keeps the same recipient zone: LM-054 to LM-062 digivolve into a card "in the hand" with the cost reduced by 2 (LM-056 lists purple before blue). BT18-100 keeps its trash digivolutions. BT12-109 keeps digivolving into a card under the Tamers. P-103 to P-108 change only their reveal-and-add sentence. P-161 removes a duplicated trash trigger.

Re-running the three absence searches (`DNA digivolv`, `app fus`, `burst digivolv`) over the effect fields returns the same card sets as the reviewed catalog (134, 38 and 7 cards). No change introduces a DNA, App Fusion or Burst provider or a new recipient zone, so the 22 covered cells, eight reviewed provider absences, candidate lists, scenario evidence and rule-source fingerprint remain applicable.

After this bounded review, the catalog fingerprint changes from `6d0c162bcf8ee07b48bc32e573159e683d2dd0e69748d91b1039b51fd5aca307` to `2c2aadcbb89ce3de9ae9f097a2328fa124a4237781b0965a0a5ddf23ef575894`. Catalog drift remains an error; no validator or test expectation is weakened.

### Catalog review after MirageGaogamon (2026-10-31)

Compared with `develop` at `4f2ddbbcba`, this branch adds only BT27-032 MirageGaogamon. Existing card records are unchanged. Its ordinary blue level-5 evolution and alternate Gaogamon-name or DATA SQUAD evolution do not introduce DNA, App Fusion or Burst providers. Full Moon Blaster returns an opposing highest-level Digimon to hand; Arts Digivolve uses the resolving DUAL Option as its recipient. Neither clause creates a provider for any excluded security or deck-reveal route.

The 22 covered route cells, eight reviewed provider absences, candidate lists, scenario evidence and rule-source fingerprint remain applicable. After this bounded review, the catalog fingerprint changes from `20a69972d246e0c19110acdf319bb6003ea4473ea8abdfe9942da67dc6b47068` to `c6a63b269c518ad5cfa19c27d52cbe0054d00b95ca6f1d339801fa91c60560ec`. Catalog drift remains an error; no validator or test expectation is weakened.

### Catalog review after Solarmon's black evolution correction (2026-10-31)

Compared with the reviewed catalog at `6d1c0502c3`, all 4,552 card identities remain unchanged. The only changed field is BT27-007 Solarmon's `evoCosts`: it adds the printed black level-2 cost-0 requirement alongside the existing red requirement. Its alternate Flame evolution, effect text, inherited deletion and all other catalog fields are unchanged.

This correction adds an ordinary Digi-Egg evolution base. It does not introduce an effect provider or change a recipient source zone. Comparing the DNA, App Fusion and Burst searches over all five effect text fields produces the same candidate sets as the reviewed catalog (134, 38 and 7 cards). All 22 covered cells, eight reviewed provider absences, candidate lists, scenario evidence and the rule-source fingerprint remain applicable.

After this bounded semantic review, the catalog fingerprint changes from `c6a63b269c518ad5cfa19c27d52cbe0054d00b95ca6f1d339801fa91c60560ec` to `e193fee1e406c425a23ed90a544164bf5daab362dea2956556cff18dacca2149`. Catalog drift remains an error; no validator or test expectation is weakened.

### Catalog review after BanchoLeomon (2026-11-01)

Compared with `develop` at `f7ed44fc4e`, this branch adds only BT27-053 BanchoLeomon. Existing card records are unchanged. Its ordinary green or yellow level-5 evolution and alternate Leomon-name or DATA SQUAD evolution do not introduce DNA, App Fusion or Burst providers. Its On Deletion effect plays a Tamer or uses an Option from the hand, so it adds no Digimon recipient and no security or deck-reveal source zone. Comparing the DNA, App Fusion and Burst searches over all five effect text fields produces the same candidate sets as the reviewed catalog (134, 38 and 7 cards).

The 22 covered route cells, eight reviewed provider absences, candidate lists, scenario evidence and rule-source fingerprint remain applicable. After this bounded review, the catalog fingerprint changes from `e193fee1e406c425a23ed90a544164bf5daab362dea2956556cff18dacca2149` to `ba3ccd7642198d024e5dd17b79b88ef480eaa434809d5e269ca929374aec7199`. Catalog drift remains an error; no validator or test expectation is weakened.

### Catalog review after unmatched-bracket text corrections (2026-10-31)

Compared with the reviewed catalog after BanchoLeomon (`1d88003359`), no card is added or removed and no non-text field changes. Three `effectText` fields change, each checked against the official card image:

- BT3-093 Davis Motomiya: a line break and the opening bracket return before `[On Play]`. The Start of Your Turn and On Play effects were already separate in the card module.
- EX8-027 Plesiomon: a stray closing bracket after "DNA digivolve" is removed. The effect still DNA digivolves 2 Digimon into a [DS] card in the hand.
- RB1-018 Monzaemon: a stray `on]` after `[When Digivolving]` is removed.

Re-running the three absence searches (`DNA digivolv`, `app fus`, `burst digivolv`) over the effect fields returns the same card sets as the reviewed catalog (134, 38 and 7 cards). No change introduces a provider or a new recipient zone, so the 22 covered cells, eight reviewed provider absences, candidate lists, scenario evidence and rule-source fingerprint remain applicable.

After this bounded review, the catalog fingerprint changes from `ba3ccd7642198d024e5dd17b79b88ef480eaa434809d5e269ca929374aec7199` to `66359d05278a5f652017fb71f9ebb1e1caa250e5f44d105386a2de7510c0a1d3`. Catalog drift remains an error; no validator or test expectation is weakened.

### Catalog review after Spencer and Kurata's Army cards (2026-11-01)

Compared with the reviewed catalog after the bracket corrections (`373533af17`), this branch adds three cards. Existing card records are unchanged.

- BT27-090 Spencer Damon places itself under a played Digimon and grants protection. It plays and digivolves nothing.
- BT27-092 Nanami, Kouki, & Ivan lets this Tamer digivolve into a Kurata's Army Digimon from the hand or trash through that card's printed requirement. Hand and trash recipients are already covered cells.
- BT27-102 Bio Hybrid Digivolution plays a Tamer from the hand or trash, and its Delay lets a Tamer digivolve from the hand or trash without paying the cost. Its Security effect plays a card from the hand or trash. None of these routes reads from security or a revealed deck.

Re-running the three absence searches (`DNA digivolv`, `app fus`, `burst digivolv`) over the effect fields returns the same counts as the reviewed catalog (134, 38 and 7 cards). No new card provides DNA, App Fusion, Burst, or a security or deck-reveal recipient, so the 22 covered cells, eight reviewed provider absences, candidate lists, scenario evidence and rule-source fingerprint remain applicable.

After this bounded review, the catalog fingerprint changes from `66359d05278a5f652017fb71f9ebb1e1caa250e5f44d105386a2de7510c0a1d3` to `af81130a84a6fec753e17a6b92dfe531029233ee13399a430a1583529b45c995`. Catalog drift remains an error; no validator or test expectation is weakened.
