import type { SubTriggerInstallParams } from "#api/engine/effects/interpreter/subtriggers/SubTriggerInstallParams";
import type { MatchedTriggerHistory } from "#api/engine/effects/interpreter/subtriggers/MatchedTriggerHistory";
import type { SubTriggerInstall } from "#api/engine/effects/context/subTriggers";

import { getSubTriggerDecisionSummary } from "#api/engine/effects/interpreter/getSubTriggerDecisionSummary";
import { hasAttackRedirection } from "#api/engine/effects/interpreter/hasAttackRedirection";
import { getAttackRedirectTargetIds } from "#api/engine/effects/interpreter/getAttackRedirectTargetIds";

import type { EffectContext } from "#api/engine/effects/EffectContext";
import { evaluateCondition } from "#api/engine/effects/interpreter/conditions";
import { canPayCost, payCost, payOneCostOption } from "#api/engine/effects/interpreter/costs";
import { runAction } from "#api/engine/effects/interpreter/dispatch";
import { trashDelaySource } from "#api/engine/effects/interpreter/optionTrash";

import {
  DefinitionFacts,
  definitionMatches,
  matchNameOrTrait,
} from "#api/engine/effects/interpreter/matching/definition";
import {
  matchingSubjectPermanentIds,
  subjectMatchesFilter,
  triggerAddedSecurityMatches,
} from "#api/engine/effects/interpreter/matching/trigger";
import {
  isPermanentUnaffectable,
  permanentMatchesFilter,
  seatsForController,
} from "#api/engine/effects/interpreter/matching/permanent";
import { candidatePermanents } from "#api/engine/effects/interpreter/targeting/permanents";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { Cost } from "@aegis/shared/effects/ir/predicates/costs";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import { findLooseCandidateByInstance } from "#api/engine/effects/interpreter/targeting/loose";
import { mayDeclareAttack } from "#api/engine/effects/interpreter/actions/meta";
import { isDetachTopAction, onlyInfeasibleDetachTop } from "#api/engine/effects/interpreter/targeting/detachTop";
import { canActivateEffect } from "#api/engine/effects/interpreter/effect";

/** Does this cost suspend the effect's OWN source ("by suspending this Tamer")? */
function suspendsSelf(cost: Cost | undefined): boolean {
  if (cost === undefined) {
    return false;
  }
  if (cost.kind === "compound") {
    return (cost.costs ?? []).some(suspendsSelf);
  }
  if (cost.kind !== "suspend") {
    return false;
  }
  return cost.target?.isSelf === true || cost.target?.filter?.isSelfRef === true;
}

/**
 * Does running `action` require suspending its own source? `costOptions` are deliberately
 * excluded: an alternative cost can be paid instead, so the action is not blocked by a
 * suspended source.
 */
function costsSelfSuspend(action: Action): boolean {
  const withCosts = action as {
    cost?: Cost | number;
    additionalCost?: Cost;
    additionalCosts?: Cost[];
    actions?: Action[];
  };
  const cost = typeof withCosts.cost === "number" ? undefined : withCosts.cost;
  if (suspendsSelf(cost) || suspendsSelf(withCosts.additionalCost)) {
    return true;
  }
  if ((withCosts.additionalCosts ?? []).some(suspendsSelf)) {
    return true;
  }
  return withCosts.actions !== undefined && withCosts.actions.some(costsSelfSuspend);
}

export function createSubTriggerInstall({
  ctx,
  action,
  event,
  playerScoped,
  isLinkedSource,
  isInheritedSource,
  printedWatcherClause,
  printedTiming,
  anchorPermanentId,
  expiresOnTurnEndOf,
  matchedEvents,
  sourceSelfInstanceId,
  bindsPrintedSource,
  linkedSelfSourceAtInstall,
}: SubTriggerInstallParams): SubTriggerInstall {
  // Capture the per-install sourceFilter ("a green Tamer", "a [Puppet] Digimon") so the
  // engine fires this sub-effect ONLY for a matching event payload. Without it every
  // filtered watcher would run on every play/deletion of its event kind (RESEARCH BLK-01
  // "Model gap" / Pitfall 2: BT10-044 would draw on every play, not just a green Tamer).
  // The filter is evaluated against the freshly bound context's payload subject via the
  // canonical `permanentMatchesFilter` / `definitionMatches` — never a hand-rolled matcher.
  const sourceFilter = action.sourceFilter;
  const hostFilterGate =
    action.hostFilter === undefined
      ? undefined
      : (subCtx: EffectContext): boolean => {
          const discardedHost =
            subCtx.discardedStackSourceProof?.activatesFromDiscardedCard === true
              ? subCtx.trigger.trashedDigivolutionHost
              : undefined;
          const host =
            discardedHost ??
            (anchorPermanentId === undefined ? undefined : subCtx.game.permanentById(anchorPermanentId));
          return host !== undefined && permanentMatchesFilter(subCtx, host, action.hostFilter!, subCtx.source);
        };
  const hostFilter = (action as Action & { hostFilter?: Filter }).hostFilter;
  // Some deletion reactions explicitly require their host to survive the same deletion batch
  // (BT22-065 Q4923; BT22-068 Q4928; BT22-070 Q4929). Deletion seams publish the complete
  // simultaneous permanent set, so reject the activation when it contains this watcher anchor.
  const notSimultaneousGate =
    action.notSimultaneous === true && anchorPermanentId !== undefined
      ? (subCtx: EffectContext): boolean => !(subCtx.trigger.deletedPermanentIds ?? []).includes(anchorPermanentId)
      : undefined;
  // Security-removal events carry no subject permanent — their payload names the seat whose
  // security lost a card. Interpret sourceFilter.controller as the watched stack direction:
  // most cards watch "your" stack, while BT9-016 watches the opponent's stack.
  const securityRemovalGate =
    event === "whenEffectRemovesFromSecurity" ||
    event === "whenSecurityRemoved" ||
    event === "whenCardTrashedFromSecurity" ||
    event === "whenEffectTrashesFromSecurity"
      ? (subCtx: EffectContext): boolean => {
          const removedSeat = subCtx.trigger?.removedFromSecuritySeat;
          if (removedSeat === undefined) {
            return false;
          }
          const direction = sourceFilter?.controller ?? "mine";
          if (direction === "any") {
            return true;
          }
          const watchedSeat =
            direction === "opponent" ? subCtx.game.opponentOf(subCtx.source.ownerSeat) : subCtx.source.ownerSeat;
          return removedSeat === watchedSeat;
        }
      : undefined;
  // `onDiscardLibrary` carries no subject permanent — its payload (`addedToHand.byEffect.ownerSeat`)
  // names the seat whose deck top was milled. The watcher's sourceFilter (controller "opponent"/
  // "mine") cannot be a subject filter here; gate instead on the milled deck's owner matching the
  // requested controller relative to the watcher's seat (BT14-077 "when a card in your OPPONENT's
  // deck is trashed"). Defaults to "opponent" since that is the only printed direction in-catalog.
  const discardLibraryGate =
    event === "onDiscardLibrary"
      ? (subCtx: EffectContext): boolean => {
          const milledSeat = subCtx.trigger?.addedToHand?.byEffect?.ownerSeat;
          if (milledSeat === undefined) {
            return false;
          }
          const want = sourceFilter?.controller ?? "opponent";
          if (want === "any") {
            return true;
          }
          const wantSeat =
            want === "opponent" ? subCtx.game.opponentOf(subCtx.source.ownerSeat) : subCtx.source.ownerSeat;
          return milledSeat === wantSeat;
        }
      : undefined;
  // `byEffect` normally describes a play event and is evaluated from `playedByEffect` by
  // subjectMatchesFilter. A digivolution-trash event instead carries its provenance through
  // `byEffectSeat`/`byEffectCardId`; remove only that play-specific field from the permanent
  // match and enforce the trash provenance in the dedicated gate below.
  const subjectFilter =
    (event === "whenDigivolutionTrashed" || event === "onAddDigivolutionCards") && sourceFilter?.byEffect === true
      ? { ...sourceFilter, byEffect: undefined, byOwnEffect: undefined }
      : sourceFilter;
  const filterMatch =
    subjectFilter === undefined ||
    event === "whenEffectRemovesFromSecurity" ||
    event === "whenSecurityRemoved" ||
    event === "whenCardTrashedFromSecurity" ||
    event === "whenEffectTrashesFromSecurity" ||
    event === "onDiscardLibrary" ||
    event === "onDigivolutionCardReturnToDeckBottom" ||
    event === "whenHandTrashed" ||
    event === "whenOpponentDraws" ||
    event === "endOfOpponentTurn" ||
    event === "whenEffectAddsToOpponentHand" ||
    // whenHatch/whenEffectAddsToHand/whenEffectAddsToDeck/whenCardReturnsFromTrashToHand carry
    // either no subject permanent, or (whenHatch) a subject the generic subjectMatchesFilter
    // can't apply the right "mine"/"opponent" default direction to; each has its own dedicated
    // gate below instead.
    event === "whenHatch" ||
    event === "whenFaceUpCardsAddedToOpponentSecurity" ||
    event === "whenEffectAddsToHand" ||
    event === "whenEffectAddsToDeck" ||
    event === "whenCardReturnsFromTrashToHand" ||
    event === "whenCardReturnsFromTrashToDeck" ||
    event === "whenDigimonReturnsToHand" ||
    // whenTrashedByEffect uses trashedByEffectPermanentId (not subjectPermanentId); the
    // isSelfRef + zone gates are handled entirely by whenTrashedByEffectGate below.
    event === "whenTrashedByEffect" ||
    // whenTrashedFromHand fires for a loose hand card (no permanent); the isSelfRef gate
    // is handled by whenTrashedFromHandGate below.
    event === "whenTrashedFromHand" ||
    // whenTrashedFromDeck fires for a loose deck card (no permanent); the isSelfRef gate
    // is handled entirely by whenTrashedFromDeckGate below.
    event === "whenTrashedFromDeck" ||
    // Deletion/leave events resolve after the causing effect or rule-processing seam may
    // have moved the permanent, so use the removal snapshot gate below instead of
    // attempting to re-resolve the subject from the battle area.
    event === "onDeletionOf" ||
    event === "whenLeavesPlay" ||
    event === "onDigivolutionCardDiscarded" ||
    event === "onDigivolutionCardsDiscardedBatch" ||
    event === "onDigiBurstCardDiscarded" ||
    (event === "whenUnsuspended" && subjectFilter.isSelfRef === true && anchorPermanentId !== undefined)
      ? undefined
      : subjectMatchSettledAtEvent({
          subjectFilter,
          bodyRefersToSubject: bodyRefersToTriggerSubject(action.actions),
          matchedEvents,
        });
  const digivolutionTrashByEffectGate =
    event === "whenDigivolutionTrashed" && sourceFilter?.byEffect === true
      ? (subCtx: EffectContext): boolean =>
          subCtx.trigger.byEffectSeat !== undefined || subCtx.trigger.byEffectCardId !== undefined
      : undefined;
  // "When an effect adds digivolution cards" (LM-017) is distinct from ordinary
  // digivolution. The add-card bus carries effect provenance only for the former.
  const addDigivolutionByEffectGate =
    event === "onAddDigivolutionCards" && sourceFilter?.byEffect === true
      ? (subCtx: EffectContext): boolean =>
          sourceFilter.byOwnEffect === true
            ? subCtx.trigger.byEffectSeat === subCtx.source.ownerSeat
            : subCtx.trigger.byEffectSeat !== undefined || subCtx.trigger.byEffectCardId !== undefined
      : undefined;
  const digimonReturnsToHandGate =
    event === "whenDigimonReturnsToHand"
      ? (subCtx: EffectContext): boolean => {
          const seat = subCtx.trigger.returnedDigimonToHandSeat;
          const returnedIds = subCtx.trigger.returnedDigimonToHandInstanceIds ?? [];
          if (seat === undefined || returnedIds.length === 0) {
            return false;
          }
          const scope = sourceFilter?.controller ?? sourceFilter?.controllerDefault;
          if (scope === "mine" && seat !== subCtx.source.ownerSeat) {
            return false;
          }
          if (scope === "opponent" && seat === subCtx.source.ownerSeat) {
            return false;
          }
          return sourceFilter?.excludeSelf === true
            ? returnedIds.some((instanceId) => instanceId !== subCtx.source.instanceId)
            : true;
        }
      : undefined;
  const requireByEffectGate =
    action.requireByEffect === true
      ? (subCtx: EffectContext): boolean =>
          subCtx.trigger.byEffectSeat !== undefined || subCtx.trigger.byEffectCardId !== undefined
      : undefined;
  // `onDigivolutionCardReturnToDeckBottom` fires for EVERY watcher (the bus is not host-scoped), so
  // gate on (a) the host that lost the stack card (TriggerInfo.subjectPermanentId) being THIS
  // watcher's own anchor permanent — i.e. "this Digimon's digivolution cards" — and (b) the returned
  // card's name matching the watcher's `sourceFilter` (BT11-065: "[Vemmon]").
  const digivolutionReturnGate =
    event === "onDigivolutionCardReturnToDeckBottom"
      ? (subCtx: EffectContext): boolean => {
          const anchor = subCtx.source.permanent()?.permanentId;
          if (anchor === undefined || anchor !== subCtx.trigger?.subjectPermanentId) {
            return false;
          }
          if (sourceFilter === undefined) {
            return true;
          }
          const refs = sourceFilter.nameOrTrait;
          if (refs === undefined || refs.length === 0) {
            return true;
          }
          const cardId = subCtx.trigger?.returnedToDeckCardId;
          if (cardId === undefined) {
            return false;
          }
          const def = getCardDefinition(cardId);
          if (def === undefined) {
            return false;
          }
          return refs.some((ref) => matchNameOrTrait(def as DefinitionFacts, ref));
        }
      : undefined;
  const deletionSourceFilterGate =
    (event === "onDeletionOf" || event === "whenLeavesPlay") && sourceFilter !== undefined
      ? (subCtx: EffectContext): boolean => {
          if (sourceFilter.isSelfRef === true) {
            const anchor = subCtx.source.permanent()?.permanentId;
            if (anchor === undefined || subCtx.trigger.deletedPermanentId !== anchor) {
              return false;
            }
          }
          const deletedSeat = subCtx.trigger.deletedControllerSeat;
          const scope = sourceFilter.controller ?? sourceFilter.controllerDefault;
          const seatMatches =
            deletedSeat === undefined ||
            scope === undefined ||
            scope === "any" ||
            (deletedSeat === subCtx.source.ownerSeat) === (scope === "mine");
          if (!seatMatches) {
            return false;
          }

          const deletedPermanentId = subCtx.trigger.deletedPermanentId;
          const deletedPermanent =
            deletedPermanentId === undefined ? undefined : subCtx.game.permanentById(deletedPermanentId);
          if (deletedPermanent !== undefined) {
            return permanentMatchesFilter(subCtx, deletedPermanent, sourceFilter, subCtx.source);
          }

          const deletedCardId = subCtx.trigger.deletedTopCardId;
          if (deletedCardId === undefined) {
            return false;
          }
          const definition = getCardDefinition(deletedCardId);
          if (definition === undefined) {
            return false;
          }
          let snapshotFilter = sourceFilter;
          // Granted keywords belong to the deletion event even after the subject leaves.
          // Keep the other activation gates live, including conditions on the watcher's board.
          const keywords = subCtx.trigger.deletedEffectiveKeywords;
          if (keywords !== undefined) {
            if (sourceFilter.keywords?.some((keyword) => !keywords.includes(keyword))) {
              return false;
            }
            if (sourceFilter.excludeKeywords?.some((keyword) => keywords.includes(keyword))) {
              return false;
            }
            const { keywords: _keywords, excludeKeywords: _excludeKeywords, ...rest } = snapshotFilter;
            snapshotFilter = rest;
          }
          const effectiveNames =
            deletedPermanentId === undefined
              ? undefined
              : subCtx.trigger.deletedEffectiveNamesByPermanentId?.[deletedPermanentId];
          if (
            effectiveNames !== undefined &&
            sourceFilter.nameOrTrait?.some(
              (reference) =>
                (reference.match === "name" || reference.match === "nameExact") &&
                effectiveNames.some((name) =>
                  matchNameOrTrait(
                    { ...definition, cardId: undefined, nameEn: name, nameAliases: undefined } as DefinitionFacts,
                    reference,
                  ),
                ),
            )
          ) {
            const { nameOrTrait: _nameOrTrait, ...rest } = snapshotFilter;
            snapshotFilter = rest;
          }
          if (!definitionMatches(snapshotFilter, definition as DefinitionFacts)) {
            return false;
          }

          const sourceCount = subCtx.trigger.deletedDigivolutionCardCount;
          if (sourceFilter.digivolutionCards === "hasAny" && !(sourceCount !== undefined && sourceCount > 0)) {
            return false;
          }
          if (
            (sourceFilter.digivolutionCards === "none" || sourceFilter.digivolutionCards === "hasNone") &&
            sourceCount !== 0
          ) {
            return false;
          }
          if (sourceFilter.hasDigivolutionCards === true && !(sourceCount !== undefined && sourceCount > 0)) {
            return false;
          }
          return true;
        }
      : undefined;
  // `whenHandTrashed` carries no subject permanent — its payload names the seat whose hand an
  // action just trashed from. Gate that payload against the explicit controller direction; older
  // watchers omit it and retain the historical "mine" default.
  const handTrashedGate =
    event === "whenHandTrashed"
      ? (subCtx: EffectContext): boolean => {
          if (action.fireCondition?.kind === "triggerHandTrashedSeat") {
            return true;
          }
          const expectedSeat =
            action.handTrashedController === "opponent"
              ? subCtx.source.ownerSeat === 0
                ? 1
                : 0
              : subCtx.source.ownerSeat;
          return subCtx.trigger?.handTrashedSeat === expectedSeat;
        }
      : undefined;
  // "When THIS Digimon's attack target is switched" is host-scoped, which the IR marks with a
  // self-referencing sourceFilter. The event bus broadcasts every switch to every watcher, so
  // bind the payload attacker to the permanent carrying this effect. Without this gate
  // BT11-008/010/014 reacted to a neighboring Digimon being blocked or using Raid. A watcher
  // that is NOT self-referencing (BT22-083's Tamer grants to another Digimon) keeps the
  // broader subject gate instead.
  const attackTargetSwitchedGate =
    event === "whenAttackTargetSwitched" && sourceFilter?.isSelfRef === true && anchorPermanentId !== undefined
      ? (subCtx: EffectContext): boolean => subCtx.trigger.attackerPermanentId === anchorPermanentId
      : undefined;
  // A deferred [Security] payload belongs to the exact checked card whose security battle
  // is ending. The watcher is installed while that card is face-up in security and follows
  // its source instance into trash; identity must therefore use the event's security card id,
  // not a battle-area permanent anchor.
  const securityBattleEndedGate =
    event === "whenSecurityBattleEnded"
      ? (subCtx: EffectContext): boolean => subCtx.trigger.securityInstanceId === ctx.source.instanceId
      : undefined;
  // `whenEffectSuspends` without an explicit subject/source filter is the printed self-scoped form:
  // "when an effect suspends THIS Digimon" (EX3-038 and its family). The bus broadcasts every
  // effect-suspension, including the opponent Digimon suspended by the watcher's own body, so
  // leaving this ungated makes every copy react to every Digimon and recursively suspend the
  // opponent's entire board. Filtered forms ("when your effect suspends a Tamer" or EX6-064's
  // "one of your Digimon") deliberately keep their broader subject gate above.
  const effectSuspendsSelfGate =
    event === "whenEffectSuspends" &&
    sourceFilter === undefined &&
    action.triggerFilter === undefined &&
    anchorPermanentId !== undefined
      ? (subCtx: EffectContext): boolean => {
          // One effect suspending several Digimon is ONE simultaneous timing carrying every
          // subject in `subjectPermanentIds` (the single-card payload only sets
          // `suspendedPermanentId`). Each suspended copy's own watcher must still fire, so
          // match the anchor against the whole batch rather than only its first member.
          const suspendedIds = subCtx.trigger.subjectPermanentIds ?? [
            ...(subCtx.trigger.suspendedPermanentId !== undefined ? [subCtx.trigger.suspendedPermanentId] : []),
          ];
          return suspendedIds.includes(anchorPermanentId);
        }
      : undefined;
  // `whenSuspended` is a board-wide bus. The single-card payload historically carries only
  // `suspendedPermanentId`, while a simultaneous suspension additionally carries
  // `subjectPermanentIds`; bind an isSelfRef watcher to its physical host across both shapes.
  const whenSuspendedSelfGate =
    event === "whenSuspended" && sourceFilter?.isSelfRef === true && anchorPermanentId !== undefined
      ? (subCtx: EffectContext): boolean => {
          const suspendedIds =
            subCtx.trigger.subjectPermanentIds ??
            (subCtx.trigger.suspendedPermanentId !== undefined
              ? [subCtx.trigger.suspendedPermanentId]
              : subCtx.trigger.subjectPermanentId !== undefined
                ? [subCtx.trigger.subjectPermanentId]
                : []);
          return suspendedIds.includes(anchorPermanentId);
        }
      : undefined;
  // The source of an inherited effect is the card in the digivolution stack, while "this
  // Digimon" means the permanent carrying that card. Bind an isSelfRef unsuspend watcher to
  // the installed permanent anchor instead of asking CardSource.permanent() to resolve the
  // stack card as though it were the current top card.
  const whenUnsuspendedSelfGate =
    event === "whenUnsuspended" && sourceFilter?.isSelfRef === true && anchorPermanentId !== undefined
      ? (subCtx: EffectContext): boolean => subCtx.trigger.unsuspendedPermanentId === anchorPermanentId
      : undefined;
  // `whenOpponentDraws` carries no subject permanent — its payload names the seat that just drew.
  // The watcher reacts only when the DRAWING seat is the watcher controller's OPPONENT ("when YOUR
  // OPPONENT draws a card"). Gate: drawingSeat !== watcher's owner seat (i.e. it is the opponent).
  const whenOpponentDrawsGate =
    event === "whenOpponentDraws"
      ? (subCtx: EffectContext): boolean => {
          const ds = subCtx.trigger?.drawingSeat;
          return ds !== undefined && ds !== subCtx.source.ownerSeat;
        }
      : undefined;
  // `endOfOpponentTurn` ("at the end of your opponent's turn", EX3-069/EX4-058/EX4-071/EX6-070/
  // BT16-084/BT16-085/BT16-088/BT17-025): fires unconditionally at every OnEndTurn window (the
  // same seam as the plain `endOfTurn` sibling) with NO trigger payload at all, so there is no
  // per-fire field to read. Instead read the ambient game state directly: `state.turnSeat` is
  // still the ENDING player's seat at this exact fire point (the turn machine has not advanced
  // it yet) — the watcher fires only when that seat is its own controller's OPPONENT.
  const endOfOpponentTurnGate =
    event === "endOfOpponentTurn"
      ? (subCtx: EffectContext): boolean => subCtx.game.state.turnSeat !== subCtx.source.ownerSeat
      : undefined;
  // `whenEffectAddsToOpponentHand` carries no subject permanent — its payload names the seat an
  // EFFECT just added cards to. The watcher ("[All Turns] when an effect adds cards to your
  // opponent's hand") reacts only when that seat is its controller's OPPONENT. This is broader
  // than `whenOpponentDraws` (any effect-driven add, not just the draw action) and excludes the
  // normal draw-phase draw (which never routes through the effect hand-add seams).
  const effectAddsToOpponentHandGate =
    event === "whenEffectAddsToOpponentHand"
      ? (subCtx: EffectContext): boolean => {
          const seat = subCtx.trigger?.effectAddedToHandSeat;
          return seat !== undefined && seat !== subCtx.source.ownerSeat;
        }
      : undefined;
  // `whenHatch` ("[All Turns] when YOU hatch [a Digi-Egg] in the breeding area", BT17-093;
  // KB Q2877: playing INTO breeding without hatching does not count). The payload names the
  // freshly-hatched permanent as the subject; gate on ITS controller matching the watcher's
  // requested seat (sourceFilter.controller — absent means "mine", the only printed
  // direction in-catalog, mirroring onDiscardLibrary's default-direction convention).
  const whenHatchGate =
    event === "whenHatch"
      ? (subCtx: EffectContext): boolean => {
          const hatchedId = subCtx.trigger?.subjectPermanentId;
          if (hatchedId === undefined) {
            return false;
          }
          const hatchedSeat = subCtx.game.permanentById(hatchedId)?.controllerSeat;
          if (hatchedSeat === undefined) {
            return false;
          }
          const want = sourceFilter?.controller ?? "mine";
          if (want === "any") {
            return true;
          }
          const wantSeat =
            want === "opponent" ? subCtx.game.opponentOf(subCtx.source.ownerSeat) : subCtx.source.ownerSeat;
          return hatchedSeat === wantSeat;
        }
      : undefined;
  // `whenFaceUpCardsAddedToOpponentSecurity` ("[Your Turn] when your opponent's face-up
  // security cards increase", EX11-004; KB Q5789/Q5790 binding: fires when an effect adds a
  // face-up card AND when an effect flips a face-down security card face up). A security check
  // never fires it: the checked card leaves the stack (CR 13-1-6, KB Q2036).
  // Shares the whenAddSecurity payload shape (addedToSecuritySeat/addedToSecurityInstanceIds)
  // fired from the same primitives.ts seams. The "ToOpponentSecurity" direction is
  // baked into the name itself (unlike whenAddSecurity, which defaults to "mine"), so the gate
  // hardcodes the opponent-seat check; `triggerAddedSecurityMatches` supplies the "at least one
  // added/flipped card is actually face-up" half (shared with whenAddSecurity's own gate).
  const whenFaceUpCardsAddedToOpponentSecurityGate =
    event === "whenFaceUpCardsAddedToOpponentSecurity"
      ? (subCtx: EffectContext): boolean => {
          const seat = subCtx.trigger?.addedToSecuritySeat;
          if (seat === undefined) {
            return false;
          }
          if (seat !== subCtx.game.opponentOf(subCtx.source.ownerSeat)) {
            return false;
          }
          return triggerAddedSecurityMatches(subCtx, sourceFilter);
        }
      : undefined;
  // `whenEffectAddsToHand` ("[Your Turn] when an effect adds cards to YOUR hand", BT9-002/
  // BT15-083/BT17-083; KB Q1794/Q1795/Q2861 binding: fires for effect Draw and Return-to-hand,
  // per-add-operation regardless of net hand-size change; Q2862 excludes the digivolution-
  // bonus hand increase, which never routes through these seams anyway). The "mine" mirror of
  // whenEffectAddsToOpponentHand, sharing its effectAddedToHandSeat payload and fire sites.
  const effectAddsToHandGate =
    event === "whenEffectAddsToHand"
      ? (subCtx: EffectContext): boolean => {
          const seat = subCtx.trigger?.effectAddedToHandSeat;
          if (seat === undefined || seat !== subCtx.source.ownerSeat) {
            return false;
          }
          if (sourceFilter === undefined) {
            return true;
          }
          const ids = subCtx.trigger?.addedToHand?.instanceIds ?? [];
          return ids.some((instanceId) => {
            const card = findLooseCandidateByInstance(subCtx, instanceId);
            if (card === undefined) {
              return false;
            }
            return definitionMatches(sourceFilter, subCtx.game.definitionOf(card));
          });
        }
      : undefined;
  // `whenEffectAddsToDeck` ("when your effects add to decks", BT26-001/BT26-015) is scoped to
  // the controller of the effect, not to the owner of the recipient deck. Q6948 explicitly
  // includes cards added to the opponent's deck by one of your effects.
  const effectAddsToDeckGate =
    event === "whenEffectAddsToDeck"
      ? (subCtx: EffectContext): boolean => {
          const seat = subCtx.trigger?.effectAddedToDeckBySeat ?? subCtx.trigger?.effectAddedToDeckSeat;
          return seat !== undefined && seat === subCtx.source.ownerSeat;
        }
      : undefined;
  // `whenCardReturnsFromTrashToHand` ("[All Turns] when a [red] Digimon card returns from your
  // trash to the hand", BT15-082/BT16-011): a returnToHand carrying loose cards (no subject
  // permanent), scoped to the watcher's own seat ("your trash") and to the sourceFilter's
  // color/kind/trait against each returned card's definition.
  const cardReturnsFromTrashToHandGate =
    event === "whenCardReturnsFromTrashToHand"
      ? (subCtx: EffectContext): boolean => {
          const seat = subCtx.trigger?.returnedFromTrashSeat;
          if (seat === undefined || seat !== subCtx.source.ownerSeat) {
            return false;
          }
          const cardIds = subCtx.trigger?.returnedFromTrashCardIds ?? [];
          if (cardIds.length === 0) {
            return false;
          }
          if (sourceFilter === undefined) {
            return true;
          }
          return cardIds.some((cardId) => {
            const def = getCardDefinition(cardId);
            return def !== undefined && definitionMatches(sourceFilter, def as DefinitionFacts);
          });
        }
      : undefined;
  // This event carries no permanent subject. Scope "your trash" to the returning
  // cards' owner seat, mirroring the trash-to-hand event above.
  const cardReturnsFromTrashToDeckGate =
    event === "whenCardReturnsFromTrashToDeck"
      ? (subCtx: EffectContext): boolean => subCtx.trigger?.returnedFromTrashToDeckSeat === subCtx.source.ownerSeat
      : undefined;
  // Event payloads attributed to an effect carry the acting seat. `bySourceController`
  // enforces printed clauses such as "one of YOUR effects suspends" and "using one of YOUR
  // effects, trash a card in your hand" without conflating the affected card's controller
  // with the effect's controller. Events without attribution fail this opt-in gate.
  const bySourceControllerGate =
    action.bySourceController !== undefined
      ? (subCtx: EffectContext): boolean => {
          const actingSeat =
            event === "whenEffectSuspends" ? subCtx.trigger?.effectSuspendSeat : subCtx.trigger?.byEffectSeat;
          if (actingSeat === undefined) {
            return false;
          }
          const own = subCtx.source.ownerSeat;
          return action.bySourceController === "mine" ? actingSeat === own : actingSeat !== own;
        }
      : undefined;
  // `startOfYourMainPhase` fires at EVERY main-phase start; the watcher must fire ONLY at the
  // watched permanent's owner's main phase, while it is still on the battle area — the
  // server-side turn-ownership + on-field re-check that stops a client forcing the granted
  // is anchored on the granted permanent, so its CardSource helpers answer for THAT permanent.
  const ownerMainPhaseGate =
    event === "startOfYourMainPhase"
      ? (subCtx: EffectContext): boolean => subCtx.source.isOwnersTurn() && subCtx.source.isOnBattleArea()
      : undefined;
  // A trigger granted to another permanent is installed even when that permanent can
  // currently be selected through immunity (Q6740). At the future timing, however, the
  // granted effect must not trigger while its recipient is unaffected by the granter's
  // source kind. Re-evaluate that live state here rather than suppressing the original grant.
  const grantedEffectAffectableGate =
    action.on !== undefined && anchorPermanentId !== undefined
      ? (subCtx: EffectContext): boolean => {
          const recipient = subCtx.game.permanentById(anchorPermanentId);
          if (recipient === undefined) {
            return false;
          }
          const sourceKinds = ctx.effectSourceKinds ?? (ctx.source.definition.kinds as readonly string[]);
          const relevantSourceKinds = sourceKinds.filter((kind) => kind === "Digimon" || kind === "Option");
          return !isPermanentUnaffectable(subCtx, ctx.source, recipient, relevantSourceKinds);
        }
      : undefined;
  // A fire-time payload gate ("your security" + the added-card trait check for whenAddSecurity)
  // evaluated against the freshly bound context's TriggerInfo. When it does not hold the watcher
  // body is skipped entirely, so a mandatory tail never runs on an off-gate event (BT23-083).
  // The printed turn window of the installing clause (`[Your Turn]` / `[Opponent's Turn]`).
  // The watcher persists past the resolution that armed it, so the window has to travel with it.
  const turnScopeGate =
    action.turnScope === undefined
      ? undefined
      : (subCtx: EffectContext): boolean =>
          action.turnScope === "yourTurn" ? subCtx.source.isOwnersTurn() : !subCtx.source.isOwnersTurn();
  const fireConditionGate =
    action.fireCondition === undefined
      ? undefined
      : (subCtx: EffectContext): boolean => evaluateCondition(subCtx, action.fireCondition!);
  // `wouldBeReturned` carries TriggerInfo.returnDestination (the zone the permanent would land in).
  // A watcher with `sourceFilter.returnDestination` only fires when the return target matches that
  // list (BT20-074: ["hand","deck"] — not trash). Absent => no destination gate.
  const returnDestinationGate =
    event === "wouldBeReturned" && sourceFilter?.returnDestination !== undefined
      ? (subCtx: EffectContext): boolean => {
          const dest = subCtx.trigger?.returnDestination;
          return dest !== undefined && (sourceFilter.returnDestination as string[]).includes(dest);
        }
      : undefined;
  // `whenTrashedByEffect` (CAP-E8, BT19-093): fires when the watcher's own anchor permanent
  // is trashed by an effect (the `isSelfRef` sourceFilter means "this card specifically") — OR,
  // for a watcher with NO isSelfRef (a plain kind/zone/color filter, e.g. "an Option in the
  // battle area", P-203/EX7-070/P-159 — the previously-dead "whenEffectTrashes" name collapsed
  // onto this already-live event, since both describe the exact same effect-driven trash seam),
  // matches ANY permanent trashed by an effect whose live definition satisfies that filter
  // (the trashed permanent is still live in the battle area at fire time — see the seam comment
  // in primitives.ts — so its definition/color/kind can be read before it leaves the field).
  // `zone: "battleArea"` requires the permanent was in the battle area at the time (the seam
  // in `deletePermanent` fires only from battle area, so this gate is always true — kept here
  // for explicitness and in case future seams fire from other zones).
  const whenTrashedByEffectGate =
    event === "whenTrashedByEffect"
      ? (subCtx: EffectContext): boolean => {
          const trashedId = subCtx.trigger?.trashedByEffectPermanentId;
          if (trashedId === undefined) {
            return false;
          }
          if (sourceFilter?.zone !== undefined && sourceFilter.zone !== "battleArea") {
            return false;
          }
          if (sourceFilter === undefined || sourceFilter.isSelfRef === true) {
            const anchor = subCtx.source.permanent()?.permanentId ?? anchorPermanentId;
            return anchor !== undefined && trashedId === anchor;
          }
          const def = subCtx.game.permanentById(trashedId)?.topCard;
          if (def === undefined) {
            return false;
          }
          return definitionMatches(sourceFilter, subCtx.game.definitionOf(def) as DefinitionFacts);
        }
      : undefined;
  // `whenTrashedFromDeck` (CAP-H-01, BT19-097): fires per-card when a card is milled from the
  // deck by a TrashTopDeck action. The payload carries `trashedFromDeckCardId` (the card ID of
  // the milled card, not a permanent ID — it is a loose deck card). `sourceFilter.isSelfRef` means
  // "fire only when the milled card ID matches THIS watcher's source card ID." No subject permanent
  // exists; the generic `filterMatch` path is bypassed for this event.
  const whenTrashedFromDeckGate =
    event === "whenTrashedFromDeck"
      ? (subCtx: EffectContext): boolean => {
          const milledCardId = subCtx.trigger?.trashedFromDeckCardId;
          if (milledCardId === undefined) {
            return false;
          }
          if (
            action.excludeSelfEffect === true &&
            subCtx.trigger?.trashedFromDeckByEffectCardId === subCtx.source.cardId
          ) {
            return false;
          }
          if (sourceFilter?.isSelfRef === true) {
            return (
              milledCardId === subCtx.source.cardId &&
              subCtx.trigger.trashedFromDeckInstanceId === subCtx.source.instanceId &&
              subCtx.source.isInTrash?.() === true
            );
          }
          return true;
        }
      : undefined;
  const whenTrashedFromHandGate =
    event === "whenTrashedFromHand"
      ? (subCtx: EffectContext): boolean => {
          const cardId = subCtx.trigger?.trashedFromHandCardId;
          if (cardId === undefined) {
            return false;
          }
          const seat = subCtx.trigger?.handTrashedSeat;
          if (seat !== undefined && seat !== subCtx.source.ownerSeat) {
            return false;
          }
          if (sourceFilter?.isSelfRef === true) {
            return subCtx.trigger?.trashedFromHandInstanceId === subCtx.source.instanceId;
          }
          // "When a card with [X] in its text is trashed from your hand" (LM-004) narrows the
          // watcher to a named card. The trashed card is loose, so the generic permanent-subject
          // gate never sees it; match its DEFINITION against the printed name/trait clause here.
          // Only `nameOrTrait` is applied: the other filter fields on existing hand-trash
          // watchers describe the watching permanent, not the trashed card.
          if (sourceFilter?.nameOrTrait !== undefined) {
            const definition = getCardDefinition(cardId);
            return (
              definition !== undefined &&
              definitionMatches({ nameOrTrait: sourceFilter.nameOrTrait }, definition as DefinitionFacts)
            );
          }
          return true;
        }
      : undefined;
  const digivolutionCardDiscardedGate =
    (event === "onDigivolutionCardDiscarded" ||
      event === "onDigivolutionCardsDiscardedBatch" ||
      event === "onDigiBurstCardDiscarded") &&
    sourceFilter?.isSelfRef === true &&
    sourceFilter.matchTrashedSource !== true
      ? (subCtx: EffectContext): boolean => {
          const matched =
            event === "onDigiBurstCardDiscarded" || event === "onDigivolutionCardsDiscardedBatch"
              ? (subCtx.trigger?.trashedDigivolutionInstanceIds ?? []).includes(subCtx.source.instanceId)
              : subCtx.trigger?.trashedDigivolutionInstanceId === subCtx.source.instanceId;
          return matched;
        }
      : undefined;
  const matchedTrashedSourceGate =
    (event === "onDigivolutionCardDiscarded" ||
      event === "onDigivolutionCardsDiscardedBatch" ||
      event === "onDigiBurstCardDiscarded") &&
    sourceFilter?.matchTrashedSource === true
      ? (subCtx: EffectContext): boolean =>
          event === "onDigivolutionCardDiscarded"
            ? subCtx.trigger?.trashedDigivolutionInstanceId === sourceSelfInstanceId
            : (subCtx.trigger?.trashedDigivolutionInstanceIds ?? []).includes(sourceSelfInstanceId)
      : undefined;
  const digivolutionHostFilterGate =
    hostFilter !== undefined &&
    (event === "onDigivolutionCardDiscarded" || event === "onDigivolutionCardsDiscardedBatch")
      ? (subCtx: EffectContext): boolean => {
          const hostId = subCtx.trigger?.subjectPermanentId;
          const discardedHost =
            subCtx.discardedStackSourceProof?.activatesFromDiscardedCard === true
              ? subCtx.trigger.trashedDigivolutionHost
              : undefined;
          const host = discardedHost ?? (hostId === undefined ? undefined : subCtx.game.permanentById(hostId));
          return host !== undefined && permanentMatchesFilter(subCtx, host, hostFilter, subCtx.source);
        }
      : undefined;
  // A Digi-Burst/batch watcher whose sourceFilter describes the permanent that LOST stack cards
  // (rather than `isSelfRef`, which describes a discarded inherited source) must scope against
  // the event's host. BT5-056/BT26-048 use this for "one of your Digimon"; the generic subject
  // gate is intentionally skipped for discard events because inherited self-watchers need card
  // identity.
  const digivolutionBatchHostSourceFilterGate =
    (event === "onDigiBurstCardDiscarded" || event === "onDigivolutionCardsDiscardedBatch") &&
    sourceFilter !== undefined &&
    sourceFilter.isSelfRef !== true
      ? (subCtx: EffectContext): boolean => {
          const hostId = subCtx.trigger?.subjectPermanentId;
          const host = hostId === undefined ? undefined : subCtx.game.permanentById(hostId);
          return (
            host !== undefined &&
            seatsForController(subCtx, sourceFilter).includes(host.controllerSeat) &&
            permanentMatchesFilter(subCtx, host, sourceFilter, subCtx.source)
          );
        }
      : undefined;
  const effectSourceGate =
    action.effectSourceFilter === undefined
      ? undefined
      : (subCtx: EffectContext): boolean => {
          const cardId = subCtx.trigger?.byEffectCardId;
          if (cardId === undefined) {
            return false;
          }
          const def = subCtx.game.definitionOf({ cardId } as never);
          return definitionMatches(action.effectSourceFilter!, def as DefinitionFacts);
        };
  // Match the effect that caused the event, not the source card's printed abilities.
  // Alliance can be granted or inherited; an unrelated effect on an Alliance card
  // must not activate "when Alliance suspends" watchers.
  const bySourceKeywordGate =
    action.bySourceKeyword === undefined
      ? undefined
      : (subCtx: EffectContext): boolean => subCtx.trigger?.byEffectKeyword === action.bySourceKeyword;
  // `triggerFilter` on an `onAddDigivolutionCards` watcher (LANE-F-15, BT20-080/BT21-080):
  // restricts WHICH permanent's digivolution-card additions fire this watcher. The event's
  // `subjectPermanentId` is the RECEIVER permanent (the Digimon whose stack grew). Gate on that
  // permanent matching the filter, evaluated via the same `subjectMatchesFilter` path that the
  // generic `filterMatch` uses for `sourceFilter` on other events.
  //   BT20-080: { isSelfRef: true } — fires only when cards are placed under THIS permanent.
  //   BT21-080: { kind: ["Digimon"], nameOrTrait: [...] } — receiver must be Gammamon/Hero trait.
  // For suspension events, the event subject is the Digimon that was actually
  // suspended; EX6-064 uses this to distinguish one of your Digimon from an
  // opponent's Digimon without requiring that it be the Tamer itself.
  // For attack events (whenAttacking / whenOpponentAttacks) the event subject is the
  // ATTACKER, so the same subject-filter gate lets a watcher fire only when the attacker matches —
  // including relative gates like `digivolutionCardsCompareToSource` ("with as many or fewer
  // digivolution cards as this Digimon attacks", BT15-032 and AD1/BT16-family cards).
  const SUBJECT_TRIGGER_FILTER_EVENTS = new Set([
    "whenAttacking",
    "whenOpponentAttacks",
    "whenLinked",
    "whenEffectSuspends",
  ]);
  const triggerFilterGate =
    action.triggerFilter !== undefined &&
    (event === "onAddDigivolutionCards" || SUBJECT_TRIGGER_FILTER_EVENTS.has(event))
      ? (subCtx: EffectContext): boolean => subjectMatchesFilter(subCtx, action.triggerFilter!)
      : undefined;
  // A `superlative` clause on a triggerFilter ("when the Digimon with the highest DP attacks",
  // BT11-074) is a BOARD-RELATIVE predicate: `permanentMatchesFilter` sees one permanent at a
  // time and cannot rank it. Route the gate through the same pool narrowing that target
  // selection uses (`candidatePermanents` -> narrowToSuperlative) and require the event subject
  // to survive it. Unaffectable permanents stay in the pool: immunity governs what an effect may
  // DO to a Digimon, never whether that Digimon is the board's extremum (CR 15-15-5-3).
  const triggerFilterSuperlativeGate =
    action.triggerFilter?.superlative !== undefined &&
    (event === "onAddDigivolutionCards" || SUBJECT_TRIGGER_FILTER_EVENTS.has(event))
      ? (subCtx: EffectContext): boolean => {
          const subjectIds = matchingSubjectPermanentIds(subCtx, action.triggerFilter!);
          if (subjectIds.length === 0) {
            return false;
          }
          const pool = candidatePermanents(
            subCtx,
            { filter: action.triggerFilter!, count: 1 },
            { includeUnaffectable: true },
          );
          return pool.some((permanent) => subjectIds.includes(permanent.permanentId));
        }
      : undefined;
  // Digivolution watchers can constrain the card being digivolved into separately from the
  // source Digimon (`sourceFilter`). The payload's subject is the resulting permanent, so use
  // the same canonical matcher used by ordinary trigger subjects. This also honors
  // `excludeSelf` (EX9-012/Q4754: its own evolution into Garurumon must not self-trigger).
  const digivolveIntoGate =
    action.digivolveIntoFilter !== undefined && (event === "whenOneOfYoursDigivolves" || event === "whenAnyDigivolves")
      ? (subCtx: EffectContext): boolean => subjectMatchesFilter(subCtx, action.digivolveIntoFilter!)
      : undefined;
  const addedDigivolutionCardGate =
    event === "onAddDigivolutionCards" && action.addedDigivolutionCardFilter !== undefined
      ? (subCtx: EffectContext): boolean => {
          const subjectId = subCtx.trigger?.subjectPermanentId;
          const ids = subCtx.trigger?.addedDigivolutionCardInstanceIds ?? [];
          if (subjectId === undefined || ids.length === 0) {
            return false;
          }
          const subject = subCtx.game.permanentById(subjectId);
          if (subject === undefined) {
            return false;
          }
          return subject.stack.some(
            (card) =>
              ids.includes(card.instanceId) &&
              (action.addedDigivolutionCardFilter!.faceDown !== true || card.faceUp === false) &&
              (action.addedDigivolutionCardFilter!.faceUp !== true || card.faceUp === true) &&
              definitionMatches(action.addedDigivolutionCardFilter!, subCtx.game.definitionOf(card)),
          );
        }
      : undefined;
  const addedDigivolutionPositionGate =
    event === "onAddDigivolutionCards" && action.addedDigivolutionCardsPosition !== undefined
      ? (subCtx: EffectContext): boolean =>
          subCtx.trigger.addedDigivolutionCardsPosition === action.addedDigivolutionCardsPosition
      : undefined;
  const placedOwnTopAtStackBottomGate =
    event === "onAddDigivolutionCards" && action.requirePlacedOwnTopAtStackBottom === true
      ? (subCtx: EffectContext): boolean => subCtx.trigger.placedOwnTopAtStackBottom === true
      : undefined;
  // `sourceFilter.nameMatchesInheritedHost` (CAP-G2, BT2-059 Kurisarimon): fires ONLY when the
  // played card's name matches the HOST permanent's current top-card name. "This Digimon" in an
  // inherited effect text refers to the Digimon whose digivolution stack contains this card —
  // the anchor permanent. KB Q1024: compare at fire time so a digivolved host's new top-card
  // name is used. The event subject is the just-played permanent (subjectPermanentId).
  const inheritedHostNameGate =
    sourceFilter?.nameMatchesInheritedHost === true
      ? (subCtx: EffectContext): boolean => {
          const hostPerm = anchorPermanentId !== undefined ? subCtx.game.permanentById(anchorPermanentId) : undefined;
          if (hostPerm?.topCard === undefined) {
            return false;
          }
          const hostName = subCtx.game.definitionOf(hostPerm.topCard).nameEn;
          if (hostName === undefined) {
            return false;
          }
          const subjectId = subCtx.trigger.subjectPermanentId;
          if (subjectId === undefined) {
            return false;
          }
          const subject = subCtx.game.permanentById(subjectId);
          if (subject?.topCard === undefined) {
            return false;
          }
          const subjectName = subCtx.game.definitionOf(subject.topCard).nameEn;
          return subjectName === hostName;
        }
      : undefined;
  const linkedCardGate =
    event === "whenLinked" && action.linkedCardFilter !== undefined
      ? (subCtx: EffectContext): boolean => {
          const subjectId = subCtx.trigger.subjectPermanentId;
          const linkedIds = subCtx.trigger.linkedCardInstanceIds ?? [];
          const subject = subjectId === undefined ? undefined : subCtx.game.permanentById(subjectId);
          if (subject === undefined || linkedIds.length === 0) {
            return false;
          }
          return subject.linked.some(
            (card) =>
              linkedIds.includes(card.instanceId) &&
              definitionMatches(action.linkedCardFilter!, subCtx.game.definitionOf(card)),
          );
        }
      : undefined;
  // A linked card's "when this card is linked" effect is physically scoped to that card,
  // not merely to the Digimon carrying it. All linked cards share the recipient permanent,
  // so the generic isSelfRef subject gate alone would let an older link card react whenever
  // a different card links to the same host. Preserve host-level "this Digimon gets linked"
  // watchers by applying the instance gate only when the watcher source is itself linked.
  const linkedSelfSourceGate =
    event === "whenLinked" && sourceFilter?.isSelfRef === true && linkedSelfSourceAtInstall
      ? (subCtx: EffectContext): boolean => {
          const linkedIds = subCtx.trigger.linkedCardInstanceIds ?? subCtx.trigger.linkedInstanceIds;
          return linkedIds === undefined || linkedIds.includes(subCtx.source.instanceId);
        }
      : undefined;
  const sourceDeleteCause = (sourceFilter as (Filter & { deleteCause?: string }) | undefined)?.deleteCause;
  // "When an EFFECT deletes ..." (LM-016) narrows the same knob to effect-driven removals. The
  // `onDeletionOf` payload carries the removal cause but no `byEffectSeat`, so the generic
  // `requireByEffect` gate cannot see it — this is the gate that can.
  const deleteCauseGate =
    event === "onDeletionOf" && (sourceDeleteCause === "dpReachedZero" || sourceDeleteCause === "byEffect")
      ? (subCtx: EffectContext): boolean =>
          subCtx.trigger.removalCause === (sourceDeleteCause === "byEffect" ? "byEffect" : "byRule")
      : undefined;
  // Leave-play watchers use the same relative cause vocabulary as replacements.  Preserve the
  // event's effect-owner provenance so "other than by one of your effects" can distinguish an
  // opponent effect, battle, and rules departure from the watcher's controller's own effect.
  const leaveCauseGate =
    event === "whenLeavesPlay" && action.leaveCause !== undefined
      ? (subCtx: EffectContext): boolean => {
          const cause = subCtx.trigger.removalCause ?? "byRule";
          const resolvingSeat = subCtx.trigger.byEffectSeat;
          switch (action.leaveCause) {
            case "opponentEffect":
            case "byOpponentEffect":
              return cause === "byEffect" && resolvingSeat !== undefined && resolvingSeat !== subCtx.source.ownerSeat;
            case "otherThanYourEffect":
              return !(cause === "byEffect" && resolvingSeat === subCtx.source.ownerSeat);
            case "byEffect":
              return cause === "byEffect";
            case "byBattle":
              return cause === "byBattle";
            case "otherThanBattle":
              return cause !== "byBattle";
            case "any":
            default:
              return true;
          }
        }
      : undefined;
  const trashedDigivolutionTopGate =
    event === "whenDigivolutionTrashed" && action.requireTrashedDigivolutionCardWasTop === true
      ? (subCtx: EffectContext): boolean => subCtx.trigger.trashedDigivolutionCardWasTop === true
      : undefined;
  const faceDownDigivolutionBatchGate =
    event === "onDigivolutionCardsDiscardedBatch" && action.requireFaceDownDigivolutionCardTrashed === true
      ? (subCtx: EffectContext): boolean => (subCtx.trigger.trashedFaceDownDigivolutionInstanceIds?.length ?? 0) > 0
      : undefined;
  // KB Q2957/Q6671/Q6708: a Tamer digivolves as a Tamer, not as a Digimon. A watcher whose
  // sourceFilter describes only Digimon ("when one of your Digimon digivolves") stays silent for
  // that evolution; one that names Tamers — `kind` includes Tamer (BT18-010 "Digimon or Tamers")
  // or `digivolutionStackKind` includes Tamer (BT7-081 "one of your Tamers digivolves") — fires.
  // The subject is already a Digimon by fire time, so the generic subject filter cannot tell the
  // two apart on its own.
  const tamerDigivolvedGate =
    event === "whenOneOfYoursDigivolves" || event === "whenAnyDigivolves"
      ? (subCtx: EffectContext): boolean =>
          action.requireDigivolvedFromTamer === true
            ? subCtx.trigger.digivolvedFromTamer === true
            : subCtx.trigger.tamerDigivolved !== true ||
              sourceFilter?.kind?.includes("Tamer") === true ||
              sourceFilter?.digivolutionStackKind?.includes("Tamer") === true
      : undefined;
  // A SubTrigger's action-level condition is checked when the watcher is installed, but the
  // board may change while simultaneous copies wait to activate. Keep it among the live event
  // gates so every pending copy revalidates before its optional prompt and activation cost.
  const actionConditionGate =
    action.condition !== undefined &&
    // A granted trigger's condition belongs to the granting effect and is paid/checked when
    // the recipient is chosen. Re-evaluating it later against the recipient-anchored context
    // changes "you" to the opponent (BT23-056's CS-Tamer gate) and suppresses a valid grant.
    action.on === undefined &&
    // A player-scoped watcher is the lasting result of an already-resolved conditional
    // effect. Its source may leave afterwards, but cards entering during the stated duration
    // still receive the grant (BT10-016/Q1945); rechecking the source condition would revoke
    // the delayed part early.
    !playerScoped &&
    action.condition.kind !== "bindingContains" &&
    action.condition.kind !== "bindingExists" &&
    action.condition.kind !== "bindingEmpty"
      ? (subCtx: EffectContext): boolean =>
          action.condition!.kind !== "raw" && evaluateCondition(subCtx, action.condition!)
      : undefined;
  const gates = [
    filterMatch,
    actionConditionGate,
    tamerDigivolvedGate,
    digivolutionTrashByEffectGate,
    addDigivolutionByEffectGate,
    digimonReturnsToHandGate,
    requireByEffectGate,
    deletionSourceFilterGate,
    ownerMainPhaseGate,
    grantedEffectAffectableGate,
    fireConditionGate,
    securityRemovalGate,
    discardLibraryGate,
    digivolutionReturnGate,
    handTrashedGate,
    attackTargetSwitchedGate,
    securityBattleEndedGate,
    effectSuspendsSelfGate,
    whenSuspendedSelfGate,
    whenUnsuspendedSelfGate,
    whenOpponentDrawsGate,
    endOfOpponentTurnGate,
    effectAddsToOpponentHandGate,
    whenHatchGate,
    whenFaceUpCardsAddedToOpponentSecurityGate,
    effectAddsToHandGate,
    effectAddsToDeckGate,
    cardReturnsFromTrashToHandGate,
    cardReturnsFromTrashToDeckGate,
    bySourceControllerGate,
    returnDestinationGate,
    whenTrashedByEffectGate,
    whenTrashedFromDeckGate,
    whenTrashedFromHandGate,
    digivolutionCardDiscardedGate,
    matchedTrashedSourceGate,
    digivolutionHostFilterGate,
    digivolutionBatchHostSourceFilterGate,
    effectSourceGate,
    bySourceKeywordGate,
    triggerFilterGate,
    triggerFilterSuperlativeGate,
    digivolveIntoGate,
    addedDigivolutionCardGate,
    addedDigivolutionPositionGate,
    placedOwnTopAtStackBottomGate,
    linkedCardGate,
    linkedSelfSourceGate,
    inheritedHostNameGate,
    hostFilterGate,
    deleteCauseGate,
    leaveCauseGate,
    notSimultaneousGate,
    trashedDigivolutionTopGate,
    faceDownDigivolutionBatchGate,
    turnScopeGate,
  ].filter((g): g is (subCtx: EffectContext) => boolean => g !== undefined);
  const matches = gates.length === 0 ? undefined : (subCtx: EffectContext): boolean => gates.every((g) => g(subCtx));
  // Inherited effects that trigger when their own source card is discarded from a
  // digivolution stack must keep that card as the watcher source. The host permanent
  // remains on the field, but the source card moves to trash before the event fires;
  // anchoring the watcher to the host would make `isSelfRef` compare against the host's
  // top card and silently skip the inherited effect (BT7 Digi-Burst cards).
  const discardedSelfSource =
    sourceFilter?.isSelfRef === true &&
    sourceFilter.matchTrashedSource !== true &&
    (event === "onDigiBurstCardDiscarded" ||
      event === "onDigivolutionCardsDiscardedBatch" ||
      event === "onDigivolutionCardDiscarded");
  // "by suspending this Tamer" is an optional processing condition, not a trigger condition: the
  // watcher triggers even while its source is suspended, and the cost is checked when it would
  // activate (CR 15-8-3-9-2, 15-7-4). A simultaneous effect resolved first may unsuspend the
  // source (Q4101/Q4108) or suspend it (Q938), so the check is never made at arming time.
  const requiresSelfSuspend = costsSelfSuspend(action);
  const selfSuspendPayable = (subCtx: EffectContext): boolean => subCtx.source.permanent()?.isSuspended !== true;
  // §16-17-3 bars a ＜Delay＞ activation on the turn its card entered play. `run` enforces that
  // below, but a watcher that can only refuse must not reach the simultaneous-trigger ordering
  // prompt either: the client renders that prompt from what the server offers, so an entry the
  // server would then block reads as a bug (EX12-070).
  const delayArmedIntrinsic = (action as { delayArmedIntrinsic?: boolean }).delayArmedIntrinsic === true;
  // A body made only of cost-free "you may" processing with no legal outcome can only be
  // declined, and a declined optional effect leaves its [Once Per Turn] unused (KB Q1818).
  // Announcing it or offering it in the ordering prompt shows the player an effect that cannot
  // do anything, and the next qualifying event offers it again (P-246 with no digivolution card
  // in hand). A clause with any cost keeps its pay-first path, because a payable processing
  // condition may be performed even when its payload has no target (CR 15-7-5, EX11-059).
  const hasCost = (candidate: Action): boolean => {
    const costed = candidate as {
      cost?: unknown;
      costOptions?: unknown[];
      additionalCost?: unknown;
      additionalCosts?: unknown[];
    };
    return (
      costed.cost !== undefined ||
      (costed.costOptions?.length ?? 0) > 0 ||
      costed.additionalCost !== undefined ||
      (costed.additionalCosts?.length ?? 0) > 0
    );
  };
  const parsedBody = action.actions.filter(
    (candidate): candidate is Exclude<Action, { kind: "RawUnparsed" }> => candidate.kind !== "RawUnparsed",
  );
  const costFreeOptionalBody =
    action.optional !== true &&
    (action as { delayArmedIntrinsic?: boolean }).delayArmedIntrinsic !== true &&
    !hasCost(action) &&
    parsedBody.length > 0 &&
    parsedBody.every((candidate) => candidate.optional === true && !hasCost(candidate));
  // CR 15-8-3-9-2: the watcher triggers even while its activation condition is false and stays
  // pending, so a simultaneous effect resolved first can still satisfy it (BT24-078).
  const activationCondition = action.activationCondition;
  const leadingCostGate = parsedBody[0]?.kind === "CostGatedBlock" ? parsedBody[0] : undefined;
  const bodyNeedsLeadingCost =
    leadingCostGate !== undefined &&
    (leadingCostGate.abortOnDecline === true || parsedBody.length === 1) &&
    leadingCostGate.cost.optional !== true;
  const fireGates = [
    ...(delayArmedIntrinsic
      ? [
          (subCtx: EffectContext) => {
            const delaySource = subCtx.source.permanent();
            return delaySource !== undefined && delaySource.enterFieldTurnCount !== subCtx.game.state.turnCount;
          },
        ]
      : []),
    // A watcher whose whole body places "the top card of a Digimon" with no digivolution cards
    // under it cannot activate at all (BT9-044 Q1840, EX13-032 Q7307), so it is neither
    // announced nor offered in the ordering prompt.
    ...(action.actions.some(isDetachTopAction)
      ? [(subCtx: EffectContext) => !onlyInfeasibleDetachTop(subCtx, action.actions)]
      : []),
  ];
  return {
    event,
    decisionSummary: getSubTriggerDecisionSummary({ action }),
    ...(event === "whenOpponentAttacks" && hasAttackRedirection(action.actions)
      ? {
          attackRedirectRequiresSelfSuspend: requiresSelfSuspend,
          attackRedirectTargetIds: (subCtx: EffectContext) =>
            getAttackRedirectTargetIds({ ctx: subCtx, actions: action.actions, activation: action }),
        }
      : {}),
    activationDeferred: true,
    ...(ctx.activeEffectKey !== undefined || ctx.activeActionPath !== undefined
      ? { dedupeKey: `${ctx.source.instanceId}/${ctx.activeEffectKey ?? "effect"}/${ctx.activeActionPath ?? "0"}` }
      : {}),
    ...(bindsPrintedSource && isInheritedSource ? { isInheritedSource: true } : {}),
    ...(bindsPrintedSource && isLinkedSource ? { isLinkedSource: true } : {}),
    ...(sourceFilter?.isSelfRef === true ? { watchesSelf: true } : {}),
    ...(fireGates.length === 0 ? {} : { canFire: (subCtx) => fireGates.every((gate) => gate(subCtx)) }),
    ...(costFreeOptionalBody || requiresSelfSuspend || activationCondition !== undefined || bodyNeedsLeadingCost
      ? {
          hasLegalOutcome: (subCtx: EffectContext) =>
            (!requiresSelfSuspend || selfSuspendPayable(subCtx)) &&
            (activationCondition === undefined || evaluateCondition(subCtx, activationCondition)) &&
            (!costFreeOptionalBody || canActivateEffect(subCtx, { actions: action.actions })) &&
            (!bodyNeedsLeadingCost || canPayCost(subCtx, leadingCostGate.cost)),
        }
      : {}),
    // Preserve the exact printed source. Discard contexts carry placement proof for that
    // instance after it moves to trash; binding the host top instead loses inherited
    // eligibility when this watcher waits behind a resolving effect (#5218).
    ...(discardedSelfSource ? {} : anchorPermanentId !== undefined ? { sourcePermanentId: anchorPermanentId } : {}),
    ...(playerScoped
      ? { activationContext: ctx }
      : bindsPrintedSource
        ? { sourceInstanceId: ctx.source.instanceId }
        : {}),
    // Anchor-less fallback (the eighth engine gap): when there is no on-field permanent to
    // anchor to AND the clause was not granted to another permanent (both cases already set
    // anchorPermanentId), the watcher's source is a loose hand/trash-resident CardInstance —
    // bind the fallback anchor to ITS instance so the engine can still resolve a context.
    // A watcher is one-shot only when the clause says so ("at the NEXT end of your opponent's
    // turn", EX3-069 / KB Q5722). `fire` evaluates `matches` BEFORE marking a sub as fired, so a
    // one-shot survives the turn ends its gates reject. Default: persists until its anchor leaves.
    once: action.once === true,
    ...(action.once === true ? { continuous: false } : {}),
    // A one-shot turn-end clause is pending processing from an effect that already resolved,
    // so the turn player orders it against the other end-of-turn processing even when the
    // armed effect is the opponent's (KB Q5564/Q5566/Q5568/Q5723).
    ...(action.once === true && (event === "endOfTurn" || event === "endOfOpponentTurn")
      ? { orderedByTurnPlayer: true }
      : {}),
    ...(matches ? { matches } : {}),
    ...(expiresOnTurnEndOf !== undefined ? { expiresOnTurnEndOf } : {}),
    ...(action.oncePerTiming ? { oncePerTiming: true } : {}),
    ...(action.oncePerTiming
      ? {
          oncePerTimingIdentity: `${ctx.source.instanceId}/${event}/${JSON.stringify({
            sourceFilter: action.sourceFilter,
            actions: action.actions,
            raw: action.raw,
          })}`,
        }
      : {}),
    ...(action.oncePerTurnKey
      ? {
          oncePerTurnKey: action.oncePerTurnKey.startsWith("global:")
            ? action.oncePerTurnKey.slice("global:".length)
            : `${ctx.source.instanceId}/${ctx.conferralGranterInstanceId ?? "printed"}/${action.oncePerTurnKey}`,
        }
      : {}),
    ...(printedTiming !== undefined ? { printedTiming } : {}),
    ...(printedWatcherClause !== undefined ? { printedClause: printedWatcherClause } : {}),
    description: playerScoped ? `${action.raw ?? event} [${ctx.source.instanceId}]` : (action.raw ?? event),
    run: async (subCtx) => {
      // Preserve the printed clause timing on every decision opened by the future watcher.
      // The freshly rebound context carries the event payload but not the installing effect's
      // activeTiming; without this, UI provenance degrades to a card-only guess (EX3-038's
      // opponent-target prompt lost its [Your Turn] label entirely).
      subCtx.activeTiming = printedTiming ?? subCtx.activeTiming;
      // A watcher's own printed clause names the moment better than the whole box of the
      // continuous effect that installed it (BT11-112 prints three clauses in one box).
      subCtx.activeEffectText = printedWatcherClause ?? subCtx.activeEffectText ?? ctx.activeEffectText;
      subCtx.activeEffectTextPart = action.effectTextPart;
      subCtx.activeEffectIsInherited = bindsPrintedSource && isInheritedSource;
      // The body is resolving a triggered event even when its watcher was installed by a
      // continuous effect. Any duration-scoped effects it creates must survive the trailing
      // continuous recompute instead of being mistaken for static contributions.
      subCtx.continuousPass = false;
      subCtx.residentCostRegistration = false;
      // A simultaneous play is one whenPlayed event, but a filtered watcher binds "those
      // Digimon" only to the members of that event that satisfied its sourceFilter. Keep the
      // narrowed provenance on this activation context so sourceRef:"triggerSubject" cannot
      // offer an unrelated card that happened to be played by the same effect (Q3664).
      if (sourceFilter !== undefined && (subCtx.trigger.subjectPermanentIds?.length ?? 0) > 1) {
        const matchingIds = matchingSubjectPermanentIds(subCtx, sourceFilter);
        subCtx.trigger = {
          ...subCtx.trigger,
          subjectPermanentIds: matchingIds,
          subjectPermanentId: matchingIds[0],
        };
      }
      // SubTrigger bodies share the same selection-binding contract as top-level effects.
      // A freshly-built watcher context has no map by default; without initializing it,
      // SelectBind silently drops the chosen permanent and every following
      // fromSelectionRef action no-ops (BT8-081's +3000 DP / unsuspend pair).
      // Carry effect-local bindings across the delayed boundary. A Bond effect, for example,
      // binds the Digimon that actually received the Bond and uses that same handle at end of
      // turn; rebuilding an empty map here loses the selected host before the watcher runs.
      subCtx.selections = new Map(ctx.selections ?? []);
      // CAP-E14: an intrinsic ＜Delay＞ gate (`withIntrinsicDelayGate`, comprehensive rules
      // §16-17) — this watcher belongs to a card printing ＜Delay＞ directly on a continuous
      // trigger. Its OWN optional-ask/cost supersedes `action.optional` below: §16-17-1 makes
      // trashing the source card the activation cost, and §16-17-3 bars activation the turn it
      // entered play.
      let activationCostPaid = false;
      if ((action as { delayArmedIntrinsic?: boolean }).delayArmedIntrinsic === true) {
        const delaySource = subCtx.source.permanent();
        if (delaySource === undefined) {
          return;
        }
        if (delaySource.enterFieldTurnCount === subCtx.game.state.turnCount) {
          return;
        }
        // Trashing the card is the activation cost, so a payload with no legal digivolution,
        // DNA, or link target never blocks the offer (CR 15-7-5, Q5710; Discord 1557483604253212703).
        const activate = await subCtx.ask.optional(
          subCtx,
          action.raw ?? "Trash this card to activate its ＜Delay＞ effect?",
        );
        if (!activate) {
          if (subCtx.oncePerTurnActivationChosen !== true) {
            subCtx.oncePerTurnActivationDeclined = true;
          }
          return;
        }
        subCtx.oncePerTurnActivationChosen = true;
        subCtx.oncePerTurnActivationDeclined = false;
        const trashed = await trashDelaySource(subCtx, delaySource);
        if (trashed <= 0 && subCtx.source.permanent() !== undefined) {
          return;
        }
        activationCostPaid = true;
      } else {
        const activationCost = action.cost as Cost | undefined;
        const activationCostOptions = (action.costOptions ?? []) as Cost[];
        const additionalCosts = [
          ...((action.additionalCosts ?? []) as Cost[]),
          ...(action.additionalCost !== undefined ? [action.additionalCost as Cost] : []),
        ];
        const hasActivationCost =
          activationCost !== undefined || activationCostOptions.length > 0 || additionalCosts.length > 0;
        if (activationCost !== undefined && !canPayCost(subCtx, activationCost)) {
          return;
        }
        if (activationCostOptions.length > 0 && !activationCostOptions.some((cost) => canPayCost(subCtx, cost))) {
          return;
        }
        if (additionalCosts.some((cost) => !canPayCost(subCtx, cost))) {
          return;
        }
        if (onlyInfeasibleDetachTop(subCtx, action.actions)) {
          return;
        }

        if (action.optional === true || hasActivationCost) {
          const yes = await subCtx.ask.optional(
            subCtx,
            action.raw ?? activationCost?.raw ?? "Activate this triggered effect?",
          );
          if (!yes) {
            if (subCtx.oncePerTurnActivationChosen !== true) {
              subCtx.oncePerTurnActivationDeclined = true;
            }
            return;
          }
          // Accepting the prompt is not yet an activation when the clause still has an
          // activation cost to pay: CR 15-7-2 makes the processing after an optional
          // processing condition unreachable when the condition is not executed, so an
          // unpayable cost leaves the [Once Per Turn] use unspent. `activationCostPaid`
          // below records the activation once payment succeeds.
          if (!hasActivationCost) {
            subCtx.oncePerTurnActivationChosen = true;
          }
          subCtx.oncePerTurnActivationDeclined = false;
        }
        if (activationCostOptions.length > 0) {
          if (!(await payOneCostOption(subCtx, activationCostOptions))) {
            if (subCtx.oncePerTurnActivationChosen !== true) {
              subCtx.oncePerTurnActivationDeclined = true;
            }
            return;
          }
        } else if (activationCost !== undefined) {
          if (!(await payCost(subCtx, activationCost))) {
            if (subCtx.oncePerTurnActivationChosen !== true) {
              subCtx.oncePerTurnActivationDeclined = true;
            }
            return;
          }
        }
        for (const cost of additionalCosts) {
          if (!(await payCost(subCtx, cost))) {
            if (subCtx.oncePerTurnActivationChosen !== true) {
              subCtx.oncePerTurnActivationDeclined = true;
            }
            return;
          }
        }
        activationCostPaid = hasActivationCost;
        if (activationCostPaid) {
          subCtx.oncePerTurnActivationChosen = true;
        }
      }
      let anyActionGateMatched = false;
      const runActionsFrom = async (startIndex: number): Promise<void> => {
        for (let index = startIndex; index < action.actions.length; index += 1) {
          const current = action.actions[index]!;
          const gate =
            current.kind === "RawUnparsed" || current.kind === "ConditionalBranch"
              ? undefined
              : (current.condition ?? ("while" in current ? current.while : undefined));
          if (gate === undefined || evaluateCondition(subCtx, gate)) {
            anyActionGateMatched = true;
          }
          const outerContinuation = subCtx.continueEffectAfterAttackDeclaration;
          const outerOptionalAnswer = subCtx.presetOptionalAnswer;
          if (index > 0 && current.kind === "Attack" && current.optional === true && outerOptionalAnswer === true) {
            subCtx.presetOptionalAnswer = undefined;
          }
          let continuationRan = false;
          if (mayDeclareAttack(current) && index + 1 < action.actions.length) {
            subCtx.continueEffectAfterAttackDeclaration = async () => {
              continuationRan = true;
              await runActionsFrom(index + 1);
            };
          }
          let abort: boolean;
          try {
            abort = await runAction(subCtx, current);
          } finally {
            subCtx.continueEffectAfterAttackDeclaration = outerContinuation;
            subCtx.presetOptionalAnswer = outerOptionalAnswer;
          }
          if (abort || continuationRan) {
            return;
          }
        }
      };
      await runActionsFrom(0);
      // A clause whose every action gate rejects the event never triggered, so it cannot spend
      // the printed [Once Per Turn] budget: BT11-008/010/014 watch "when this Digimon's attack
      // target is switched" and must stay armed while another Digimon's target is switched.
      // An activation cost already paid keeps the use consumed.
      if (!activationCostPaid && action.actions.length > 0 && !anyActionGateMatched) {
        if (subCtx.oncePerTurnActivationChosen !== true) {
          subCtx.oncePerTurnActivationDeclined = true;
        }
      }
    },
  };
}

/**
 * Deliberately broad: any trigger, attacker, leaving-Digimon, battle-opponent or same-target
 * reference in the body counts, so only bodies that cannot see the event subject relax.
 */
const TRIGGER_SUBJECT_REFERENCE = /trigger|attacker|leaving|battleOpponent|sameTarget/i;

function bodyRefersToTriggerSubject(actions: readonly Action[]): boolean {
  const references: string[] = [];
  JSON.stringify(actions, (key, value: unknown) => {
    if (key !== "attacker") {
      references.push(key);
    }
    if (typeof value === "string" && value !== "triggeredByEffect") {
      references.push(value);
    }
    return value;
  });
  return references.some((reference) => TRIGGER_SUBJECT_REFERENCE.test(reference));
}

/**
 * A watcher's subject filter is judged when the event happens. While the subject is still on
 * the field, a later change to it does not undo the trigger: a suspended Veedramon that
 * digivolves into a non-Veedramon still lets Rina activate (Q2143). A subject that left the
 * field is re-read only when the body acts on "that Digimon" (Q3430); otherwise only the
 * watcher's own source leaving cancels it (Q4735).
 */
type SubjectMatchParams = { subjectFilter: Filter; bodyRefersToSubject: boolean; matchedEvents: MatchedTriggerHistory };

function subjectMatchSettledAtEvent({
  subjectFilter,
  bodyRefersToSubject,
  matchedEvents,
}: SubjectMatchParams): (subCtx: EffectContext) => boolean {
  return (subCtx) => {
    const { subjectPermanentId, subjectPermanentIds } = subCtx.trigger;
    const subjectIds = subjectPermanentIds ?? (subjectPermanentId === undefined ? [] : [subjectPermanentId]);
    const subjectsOnField =
      subjectIds.length > 0 && subjectIds.every((id) => subCtx.game.permanentById(id) !== undefined);
    if ((subjectsOnField || !bodyRefersToSubject) && matchedEvents.has(subCtx.trigger)) {
      return true;
    }
    const matched = subjectMatchesFilter(subCtx, subjectFilter);
    if (matched && subjectsOnField) {
      matchedEvents.add(subCtx.trigger);
    }
    return matched;
  };
}
