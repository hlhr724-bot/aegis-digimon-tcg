# Exact hand trash costs

A declinable cost that trashes multiple cards advertises its full required count
through `min` and `max`, with `declinesCost: true`. The existing decision contract
allows an empty refusal but rejects a nonempty partial selection while leaving
the decision open. The client uses the same count to disable incomplete payment.
Single-card costs retain their existing zero-or-one contract.

The same rule applies when the cost accepts a mixture of hand and digivolution
cards. The test harness recognizes the explicit refusal capability when declining
optional hand costs.

[Issue #6528](https://github.com/vinicius3333/aegis-digimon-tcg/issues/6528)
was reproduced from its saved replay through the WereGarurumon (X Antibody)
payment. Before correction, selecting one card was accepted as a response, but
the unpaid effect silently ended without trashing that card or unsuspending.
The corrected choice requires either two cards or an explicit refusal.

`exact-hand-trash-cost.test.ts` rejects one card, then covers both refusal and full
payment through the remaining attack. EX5-023 Q3583 supplies the printed contract:
the effect, including its subsequent return, requires both cards to be trashed.
