# Attack effect follow-up timing

## Contract

An effect-directed attack pauses the effect that ordered it. The rest of that effect
resolves right after the attack declaration, before the [When Attacking] effects that
the declaration triggered (CR §15-4-3-2, §11-1-4, Q777). Those effects stay pending
until the ordering effect finishes, then resolve before Counter Timing.

For EX13-077, every color-scaled activation, including a direct `Battle` and the
trash-return Recovery, therefore resolves before the attacker's [When Attacking]
effects and before the security check. The number of activations is the snapshot
taken when the modal activates; each later choice is reevaluated on the live board
(Q7473/Q7474/Q7476). A Digimon that an opponent's immediate replacement plays during
one Battle is a legal defender for a later Battle (Q7477).

A `Battle` bullet is offered only while its attacker is on the battle area and at
least one defender exists. Choosing it otherwise would be a silent no-op.

## Engine seam

`runEffect` hands the remaining actions to combat through
`continueEffectAfterAttackDeclaration`; `CombatController` runs them after the
declaration and before declaration-triggered effects. The modal resolves every
scaled activation inline. `canAttemptBattle` in `actions/modal.ts` gates Battle
bullets.

## Evidence

- `apps/api/src/cards/EX13/EX13-077.test.ts`, Discord bug 1554922883652784198:
  BT4-057 attacks through EX13-077's On Play. The Battle deletion and the trash
  return both precede BT4-057's [When Attacking] memory gain, which precedes the
  security check. The second activation offers only Recovery once no opposing
  Digimon remains.
- `apps/api/src/cards/EX13/EX13-077.test.ts` Q7477: the first Battle would delete
  BT9-050, whose replacement plays BT1-035 Leomon; the second Battle battles that
  new instance before the effect resolves.

## History

- Commit `34d447938` (September 25) deferred a chosen Battle, and every later scaled
  activation, until the end of the attack. That order let [When Attacking] effects
  and the security check resolve first. This fix removes the deferral.

## Rule-reaction queue ownership

`collectRuleProcessPending` can replace the engine's pending-effects array while
it awaits continuous-effect recomputation. Callers must await collection before
reading the array they append to. Evaluating `array.push(...await collect())`
retained the old array receiver and silently dropped deletion reactions during
an effect-directed attack. The wrapper now collects into a local value and then
appends to the current queue. `derivedTriggerPriority.test.ts` exercises this
through public card interactions and verifies the resulting resolution order.
