# Arts Digivolve entry provenance

Comprehensive Rules v4.3 sections 4-20-1 and 4-20-2 define Arts Digivolve as a DUAL card rule replacing the pending trash procedure after using an Option. It is not an effect-driven digivolution. See the [official rules](https://digimoncard.com/rule/pdf/general_rule.pdf) and [DUAL card rules announcement](https://digimoncard.com/rule/revised/).

The Arts procedure shares `digivolveFromInstance` with effect-driven digivolution. It passes `byEffect: false` so entry dispatch clears the permanent's effect-entry flag and omits `enteredByEffect` from its own, enter-field, and digivolution-watcher trigger payloads. Other callers preserve the existing effect-driven default. Evolution draws, normal digivolution triggers, pending rule processing, and watcher ordering remain on the shared path.

`arts-digivolve-rule-entry.test.ts` verifies that Arts and ordinary digivolution still let AD1-024 suspend the evolved Digimon and unsuspend itself without returning that Digimon to the deck. The evolved card remains in play and its evolution bonus draw occurs. A separate real attack-effect digivolution verifies that AD1-024 still returns an effect-evolved Digimon to the bottom of the deck.

Related coverage includes AD1-024's card suite, the shared digivolution primitives, Arts pending On Play handling, opponent security-trigger ordering, gained-color bases, breeding-area evolution, and Bacchusmon's Arts procedure. This is an engine provenance correction, not a complete audit of every card referencing effect-driven entry.
