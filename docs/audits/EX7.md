# EX7 focused verification

### EX7-072 — Seventh Fascination

- Catalog: `packages/shared/src/cards/data/cards.json`, entry `EX7-072`; printed Main and Security clauses checked against the [official card image](https://world.digimoncard.com/images/cardlist/card/EX7-072.png).
- Printed contract: Main grants opposing Digimon an end-of-turn effect that deletes one of their controller's Digimon. That controller chooses the target. The trash reaction optionally returns this Option to the deck bottom when an own Digimon evolves into Lilithmon (X Antibody), then activates Main. Security deletes one unsuspended opposing Digimon.
- Trace: `apps/api/src/cards/EX7/EX7-072.ts` uses `GainTriggeredEffect` and recipient-relative `Delete`. Removing the nested target's opponent chooser restores the recipient's decision ownership. No shared engine change was needed; the effect snapshot is synchronized.
- Proof: `granted-deletion-controller.test.ts` fails on the old IR because the granting player receives the choice. It now rejects the other player's response, accepts the recipient's selection, deletes the chosen opposing recipient before its pending effect activates, and finishes with one survivor and no pending decision. Preparation is shared through `granted-deletion-controller.fixture.ts`.
- Browser proof: `granted-deletion-controller.spec.ts` swaps the same fixture so the human receives the effect, uses a scripted opposing Option play, selects the second own Digimon in the real prompt, retains the first and drains the presentation queue without failed steps or expired gates. Desktop Chromium passed.
- Card proof: `EX7-072.test.ts` covers the real Main grant, later entrants, the trash cost and exact evolution name, refusal, Security deletion and immunity at trigger timing. The recipient-controller regression adds the missing decision-owner assertion.
- Replay provenance: [issue 6312](https://github.com/vinicius3333/aegis-digimon-tcg/issues/6312), private report 747. All 73 original inputs reproduced without divergence before the fix. The first affected choice is input 56. After the fix, the replay reaches that choice without divergence and offers it to seat 1. All 73 inputs replay without divergence after correcting only the actor of the four recorded granted-deletion responses.
- Peer sweep: all six `GainTriggeredEffect` nodes containing a direct `Delete` were inspected in the synchronized snapshot. EX10-058 already uses the recipient chooser, EX6-057 deletes its recipient, and BT10-080 grants its own deletion reaction. No additional occurrence of the chooser defect was found.
- KB: Q3872 assigns the gained effect to the recipient's player; Q3871 checks immunity when it triggers; Q5728/Q5729 cover the trash reaction and simultaneous evolution effects.
- **8/10** (c 2 + ir 2 + b 2 + p 1 + g 1). Focused decision-ownership repair with replay and peer evidence; no complete new set audit.
- Ambiguities: none for target ownership or controller attribution.
