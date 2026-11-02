# Arts Digivolve and stale On Play effects

## Contract

Effects triggered by cards an Option plays remain pending until the Option has finished resolving and completed its post-use routing. For a DUAL card, that routing includes the optional Arts Digivolve overwrite before the normal trash step.

While `optionResolutionDepth` is nonzero, the resolver withholds nested entry effects and their parked play-event watchers from unrelated collection passes. Once the Option completes routing, a dedicated On Play drain revalidates each pending source. If Arts Digivolve placed the DUAL card on top of a played Digimon, the former top card has become a digivolution card and its pending printed On Play effect cannot activate.

The digivolution itself remains complete before this revalidation, including its mandatory evolution bonus draw and its own valid entry timings.

## Q7430/Q7434 regressions

Divine Pierce (Awakened) EX13-065 and Mickey Bullet (Awakened) EX13-066 may play Sistermon Blanc or Sistermon Noir, then Arts Digivolve onto that played Digimon. The played Sistermon's pending On Play effect is removed because its source is no longer the top card. The only deck reduction in the Blanc case is the evolution bonus draw; Noir's lost On Play memory effect likewise does not activate.

Covered by `engine/artsDigivolvePendingOnPlay.test.ts` and the focused EX13-065 Q7430 / EX13-066 Q7434 tests.

## Shared post-use trigger group

The interval after the Option's Main body and before its post-use routing completes has `optionResolutionDepth > 0` and `optionMainDepth === 0`. Entry timings produced during that interval remain deferred. Arts Digivolve's printed When Digivolving effects and its evolution watchers therefore join the pending On Play effects of other cards the Option played. The controller can choose their order instead of automatically activating the evolution effects first.

Rule-check movements still occur before the evolution's entry timing is collected. Their pending deletion effects, replacement reactions, and rule watchers join the same final group; `flushRuleTriggerPool` stages these reactions while post-use routing remains open. Otherwise an opposing Partition play could open its own window and activate an On Play effect before the turn player's pending evolution effects.

`arts-evolution-shares-play-trigger-order` exercises both printed activation orders, optional refusal, final queue completion, and a purple-evolution Tamer watcher in the same ordering prompt. The Partition/security-priority and rule-entry regressions retain turn-player priority. The stale-source regressions above continue to retire a played card's On Play effect when Arts buries that source.
