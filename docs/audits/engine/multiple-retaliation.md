# Independent Retaliation instances

Retaliation is a mandatory trigger effect under comprehensive rules 16-13. Each instance belongs to the holder, including instances gained from inherited effects. A prevented deletion does not consume the other pending instances.

Combat snapshots the number of active Retaliation grants before the holder leaves the field. It carries that count with the battle opponent and deleted top-card identity into the On Deletion window. The collector creates an independently orderable effect for each instance. The first retains `keyword/retaliation`; subsequent instances receive numeric suffixes. Older trigger payloads without a count retain their single-instance behavior. Each activation still requires the holder to remain in the trash and deletes its original battle opponent by effect.

The keyword grant ledger already represents separate native and inherited declarations, as used by Alliance counting. The count uses those grants with a single-instance fallback for a keyword supplied without ledger entries. It does not add printed text again to ledger grants.

`engine/scenarios/multiple-retaliation.test.ts` uses the shared `multiple-retaliation.fixture.ts` through `setupScenario`. It proves different inherited cards, duplicate inherited cards, and native plus inherited instances resolve separately. Wingdramon unsuspends the winning Examon, its Evade prevents the first Retaliation, and the second deletes it. The regression failed with one resolved Retaliation before the fix.

Production report 736 replayed all 147 saved inputs without divergence before the change. Its Nosferamon carried NightChiropmon BT26-070 and Chiropmon ST23-12, both of which print inherited Retaliation. The same engine path serves every Retaliation grant; no card module or effect snapshot requires a change.
