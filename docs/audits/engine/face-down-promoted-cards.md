# Face-down promoted cards and Overflow

De-Digivolve and Armor Purge can expose a face-down digivolution card as a permanent's top card. Neither operation instructs the player to turn that card face up. The rule check trashes the invalid face-down permanent; its hidden ACE information must not cause Overflow.

The authoritative references are the [Comprehensive Rules](https://world.digimoncard.com/rule/pdf/general_rule.pdf), sections 4-7-9 (face-down source information), 4-18 (Overflow), 16-19-1 (Armor Purge), and 17-1-3-2-4 (face-down field cards). These sections are also recorded in `data/kb/rules/comprehensive.md`.

`setTopCard` retains the existing face-down source marker when promoting a hidden card. A face-up promotion clears it. Armor Purge preserves the promoted card's facing. The marker must survive insertion into the face-up trash because Overflow is evaluated after that move.

## Evidence

GitHub #6558, feedback #854: the exact recorded match reproduces without divergence before input 67. Machinedramon's De-Digivolve exposes one of two face-down Titamon ACE sources. The original engine incorrectly charges 4 memory for the exposed ACE; the other hidden ACE is correctly exempt. The report's claim of an 8-memory charge is not supported by this replay.

The trimmed fixture `face-down-ace-exposed-by-dedigivolve.replay.json` preserves the state before the decision. Its regression asserts both ACE cards reach trash and the turn passes with 4 memory, without the erroneous charge keeping the previous player's turn alive. `face-down-ace-no-overflow.test.ts` also covers normal host deletion and Armor Purge; `advancedKeywords.test.ts` retains the face-up Armor Purge survival control.
