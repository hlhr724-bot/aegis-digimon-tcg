# Burst Digivolve end-of-turn processing

Burst Digivolve's top-card trash is pending rule processing under comprehensive
rules 8-3-2-1 and 18-1-1 through 18-1-2. It joins effects triggered at the same
end-of-turn boundary and is ordered by the turn player. It must not run after the
entire end-of-turn window has finished.

`collectPendingBurstDigivolveTrash` captures the marked permanents when the
boundary window opens, clears their pending flags, and contributes one mandatory
entry per permanent to the existing resolution pool. Each entry follows the
permanent identity and checks its current top and sources when it resolves. The
processing remains pending if the original top card changes; no card is trashed
if the permanent has left, has no sources, or is no longer a Digimon. Ordinary
digivolutions have no pending flag and contribute no entry.

The shared resolver handles attacks initiated by another end-of-turn effect, so
unresolved Burst processing settles before the attack proceeds to Counter Timing.
No card module or effect snapshot changes are needed.

`burst-end-turn-order.test.ts` proves both order choices with BT25-104 and
AD1-021, the resulting 6000 DP Marcus, multiple simultaneous marked permanents,
turn-player ordering, one-time processing, ordinary evolution stacks, and the
no-source/non-Digimon exceptions. Existing BT25-104 and chapter 8 tests exercise
the actual Burst Digivolve intent that creates the pending flag.

Rule source: [official comprehensive rules](https://en.digimoncard.com/rule/pdf/general_rule.pdf),
verified on 2026-10-24.
