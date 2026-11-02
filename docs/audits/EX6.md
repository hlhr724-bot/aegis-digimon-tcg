# EX6 focused verification

### EX6-055 — DanDevimon

- Catalog: `packages/shared/src/cards/data/cards.json`, entry `EX6-055`; [official card](https://world.digimoncard.com/images/cardlist/card/EX6-055.png).
- Printed contract: On Play and When Digivolving delete an opposing level 5 or lower Digimon; if no deletion occurs, the controller trashes one opponent hand card without permission to inspect the hand. During its controller's turn, five or fewer opposing hand cards grant Rush and Security Attack +1.
- Trace: both `Trash` actions now declare `blind: true`, using the existing explicit empty visibility list. Previously face-up cards in an opponent's hand must remain concealed for this selection. Registration remains exclusively `registerIrCard`; the EX6 effect snapshot is synchronized.
- Behavioral proof: `blind-opponent-hand-discard` fails before the repair because candidate identities remain visible, and passes afterward. Its shared fixture drives the browser regression through the real GameScreen, checks empty visible identities, discards exactly one card, and drains the presentation queue without failures or expired gates. The existing card suite covers successful deletion, fallback discard, ordinary evolution, and the five-card keyword boundary.
- Replay provenance: GitHub #6320, private report 749, match `f2c685a7-79e5-4056-bcdd-c5addca08f2b`, server `0c3d236cf8d98cf0ef8006e89ca82a7be1f92386`. The complete extracted match reproduced without divergence before changes. At input 34, the discard request exposed P-039, which had previously entered the hand from a public zone.
- Sweep: EX6-059 has the same missing blind marker and is repaired below. No additional `Trash` actions with opponent-hand targeting, controller selection, and neither blind selection nor explicit look permission were found in the committed effect catalog.
- KB: `node tools/kb/query.mjs card EX6-055 --json`; printed text grants no hand inspection.
- **8/10** (c 2 + ir 2 + b 2 + p 1 + g 1). Focused hand-visibility audit; no independent audit of all possible deletion-prevention interactions.
- Ambiguities: none for the repaired visibility boundary. Changes are local, with no production deployment.

### EX6-059 — Barbamon

- Catalog: `packages/shared/src/cards/data/cards.json`, entry `EX6-059`; [official card](https://world.digimoncard.com/images/cardlist/card/EX6-059.png).
- Printed contract: Scapegoat; On Play and When Digivolving trash one opposing hand card without looking. Its All Turns once-per-turn watcher may play a purple card from trash with a maximum play cost of ten minus the opponent's remaining hand count.
- Trace: both generated entry effects now map their `Trash` actions to blind selections. The watcher and its cost scaling are preserved. Registration uses `registerIrCard`, with synchronized snapshots.
- Behavioral proof: the EX6-059 case in `blind-opponent-hand-discard` failed before its blind marker was added and passes after repair. The colocated suite covers the scaled ceiling, refusal, watcher rearming, and Scapegoat.
- KB: `node tools/kb/query.mjs card EX6-059 --json`; the printed entry effect explicitly says without looking.
- **8/10** (c 2 + ir 2 + b 2 + p 1 + g 1). Same-defect sweep from #6320; no separate player report is claimed.
- Ambiguities: none for the blind selection. No broader engine change is required.

### EX6-073 — Ogudomon

- Catalog: `packages/shared/src/cards/data/cards.json`, entry `EX6-073`; [official card](https://world.digimoncard.com/images/cardlist/card/EX6-073.png).
- Printed contract: alternate evolution from a level 5 or higher Seven Great Demon Lords Digimon costs six. When Digivolving or When Attacking, optionally place up to seven differently named Seven Great Demon Lords cards from trash underneath; four or more placed permit one deletion. The second When Attacking effect returns exactly seven differently named Seven Great Demon Lords cards from its own sources to the deck bottom, deletes up to seven opposing Digimon or Tamers, and trashes seven security minus actual deletions.
- Trace: the return payment incorrectly filtered sources to Digimon. It now accepts all card kinds with the printed trait while retaining the count, different-name, own-host, and bottom-deck requirements. EX6-069 Rise of the Seven Great Demon Lords is a legal Option payment. Snapshots remain synchronized and registration uses `registerIrCard`.
- Behavioral proof: `demon-lord-option-payment` recreates the reported seven-card mix, including EX6-069. Before repair, seven sources remained and no second effect could activate. After repair, all seven return to the deck bottom and security is trashed. Existing EX6-073 tests cover duplicate-name and incomplete payments, actual deletion counts, replacement effects, source departure, and cards placed by the first attack effect.
- Replay provenance: GitHub #6321, private report 750, match `87d72e06-e38d-4860-9449-44704e02ab52`, server `0c3d236cf8d98cf0ef8006e89ca82a7be1f92386`. The complete match reproduced without divergence before changes. Inputs 142–143 place six differently named Digimon and EX6-069 under Ogudomon.
- KB: `node tools/kb/query.mjs card EX6-073 --json`; Q3823/Q3824 distinguish names, Q3826 requires complete payment, Q3827 counts actual deletions, and Q6040 preserves the resolving tail after source departure.
- Sweep: the mismatch is in this card's payment filter; no shared return-cost behavior changed.
- **8/10** (c 2 + ir 2 + b 2 + p 1 + g 1). Focused payment audit with realistic sources and comparative Option eligibility.
- Ambiguities: none for Option eligibility. No production deployment is claimed.
