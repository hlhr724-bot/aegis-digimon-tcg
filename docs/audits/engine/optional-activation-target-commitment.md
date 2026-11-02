# Optional activation and target commitment

The interpreter permits a tentative optional activation to be cancelled while its first public-board target selection is still open. This is a precommit choice, not an undo operation. The server advertises `canCancelActivation` only for an initial costless Suspend, Unsuspend, ModifyDP, Delete, or battle-area Return that belongs to an optional effect or explicitly aborts its containing processing when declined.

The target request retains its printed minimum. An empty response cancels only when the server offered the capability; a nonempty partial selection must still satisfy the printed minimum. The normal seat, decision identity, candidate and combination validation remains authoritative. The client labels this action **Cancel effect** and does not infer it from a zero minimum.

Initial acceptance does not announce or finalize an activation. A valid target response commits it before the action mutates the board. Cancellation unwinds that specific interpreter activation, stops its remaining actions, and releases its provisional once-per-turn reservation. Independent earlier actions, an evolution already performed, payments, revealed information, and other effects are never restored. An optional first action followed by mandatory processing does not acquire whole-effect cancellation merely because that first action is optional.

The capability ends at the first committed target. It is absent after any earlier processing, cost, automatic self/all target, unknown structural wrapper, or nonpublic selection. These paths retain their existing optional refusal rules. The shared cancellation receipt is identity-scoped so nested effect contexts cannot cancel their callers.

Proof lives in `optionalActivationCancellation.test.ts`, the reusable `optional-activation-target-cancellation` scenario, target/minimum enforcement suites, and the selection-overlay tests. The MirageGaogamon scenario exercises a real evolution, tentative acceptance, cancellation, retained evolution cost and a subsequent opportunity to activate the shared once-per-turn effect.
