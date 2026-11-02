# Attack target lock preflight

An attack target change restriction belongs to the attacking permanent. It survives ordinary digivolution for its printed duration. AD1-011 Paildramon applies this restriction after DNA digivolution, so evolving into AD1-024 during the attack does not permit Sirenmon to redirect it.

`CombatPrimitives.isAttackTargetLocked` reads the authoritative continuous-effect ledger for an explicit attacker or the current attack. It checks the restriction only. A removed historical attacker is not itself a target lock: revalidating completed watcher outcomes must not refund a successful once-per-turn redirect after battle deletes its attacker.

The interpreter checks the lock when evaluating an optional redirect's legal outcome, before transactional activation costs, and before selecting the new target. The combat primitive also checks it for callers outside the interpreter. A cost-free inherited redirect with no legal outcome uses the existing `effectHadNoEffect` event and remains unused for its once-per-turn budget.

Printed processing conditions permitted without an available outcome retain that permission. Analogman may suspend and Shota Kazama may return a Tamer, but neither asks the player to select an impossible redirect target. Ending an attack is independent of changing its target and bypasses this restriction check.

Behavioral proof lives in `locked-attack-target-skips-redirection.test.ts` and its shared `.fixture.ts`. The trimmed replay proves the Paildramon-to-Fighter-Mode interaction, while the small fixture proves that a later unrestricted attack can still be redirected. The browser regression verifies the visible play log and queue completion.

Sources: [Paildramon AD1-011](https://world.digimoncard.com/cardlist/?search=true&card_no=AD1-011), [Sirenmon BT25-039](https://world.digimoncard.com/cardlist/?search=true&card_no=BT25-039). Investigation provenance: [Discord report](https://discord.com/channels/1525646227608178798/1564506537303736410).
