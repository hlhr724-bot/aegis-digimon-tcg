# Prevention activation usage

A prevention that reports activation acceptance consumes its once-per-turn use at that point, before paying its cost. The leave-prevention resolver records that acceptance once. Its completion-time fallback applies only to prevention implementations that did not report acceptance.

This distinction preserves the rules for a source that leaves its area while paying the cost. The engine clears the departing card's usage. If a later effect returns that physical card, completing the old prevention must not consume the returned card's fresh usage. Repeated acceptance notifications from nested cost processing must not restore the cleared use either.

Cometmon EX10-030 may trash itself or another link card to prevent removal (official Q5086 and Q5089). When it trashes itself and God Grade Unleashed EX10-070 links it again, the returned source has fresh usage under comprehensive rules 3-1-3-1-1 and 3-1-3-1-2. When it trashes Warudamon instead, Cometmon stays linked and retains its spent use. These are distinct cases even though both restore the host's original link lineup after the first removal attempt.

The public-intent regression `relinked-prevention-source-resets-usage.test.ts` uses an attacking Dragon Mode that evolves into AD1-024 Fighter Mode, producing successive When Digivolving and All Turns removal attempts. Its shared fixture supports browser verification. The control declines Warudamon's unrelated optional security-trash effect so its payment cannot obscure the prevention cost.

`leavePrevent.test.ts` also verifies repeated acceptance notifications across a usage reset, declined prevention, and completion-time accounting for custom preventions without an acceptance callback.

The other completion-time sites have different activation contracts. The `instead` branch has no resolver-installed early acceptance callback; the current once-per-turn leave-replacement cards BT20-091 and BT22-007 do not require their own source to leave as their payment. `preventOneOf` has no production subscription. Those branches retain their existing completion-time accounting.

Sources: [Cometmon official rulings](https://world.digimoncard.com/rule/?card_no=EX10-030), `data/kb/rules/comprehensive.md`, `apps/api/src/engine/effects/leavePrevention.ts`, and `apps/api/src/engine/gameEngine/effectContext.ts`.
