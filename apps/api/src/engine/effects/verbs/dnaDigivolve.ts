import { locateMoveOrigins } from "#api/engine/effects/verbs/locateMoveOrigins";
import { groupCardsByOrigin } from "#api/engine/effects/verbs/groupCardsByOrigin";
import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import { ArraySchema } from "@colyseus/schema";
import {
  CardKind,
  Permanent,
  Zone,
  EffectTiming,
  requireCardDefinition,
  CardInstance,
  appFusionCostFor,
} from "@aegis/shared";
import {
  applyOverflow,
  extractLinkedById,
  extractPermanentAt,
  insertCard,
  placePermanent as appendPermanent,
  placePermanentAt,
  pushOnStack,
  setTopCard,
} from "../../state/access.js";
import { effectiveColors, effectiveNames } from "../continuous.js";
import { matchingDnaDigivolveCost, matchingDnaMaterialOrder } from "../verbs/digivolveCost.js";
import {
  locateLooseInstance,
  looseZoneOfInstance,
  peekLooseInstance,
  removeLooseInstance,
} from "../verbs/looseInstances.js";

import type { InternalVerbs, PrimitivesContext } from "./context.js";

/**
 * DNA digivolution and App Fusion — the two forms that consume several materials.
 */

export function createDnaDigivolveVerbs(pc: PrimitivesContext) {
  const { engine, access, continuous, dropPermanentLedgers, ledger, player, state } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const adjustedEvoCost: PrimitivesContext["helpers"]["adjustedEvoCost"] = (...args) =>
    pc.helpers.adjustedEvoCost(...args);
  const draw: InternalVerbs["draw"] = (...args) => pc.fx.draw(...args);

  const dnaDigivolveInto = async (
    materialPermanentIds: string[],
    resultInstanceId: string,
    opts?: {
      payCost?: boolean;
      extraMaterialInstanceIds?: string[];
      extraMaterialsOnBottom?: boolean;
      costOverride?: number;
      publicEntry?: boolean;
    },
  ): Promise<Permanent | undefined> => {
    const materials = materialPermanentIds
      .map((id) => access.permanentById(id))
      .filter((p): p is Permanent => p !== undefined && p.topCard !== undefined);
    const extraMaterialIds = opts?.extraMaterialInstanceIds ?? [];
    const extraMaterials = extraMaterialIds
      .map((id) => peekLooseInstance(state, id))
      .filter((c): c is CardInstance => c !== undefined);
    if (materials.length < 1 || materials.length + extraMaterials.length < 2) return undefined;
    if (extraMaterials.length !== extraMaterialIds.length) return undefined;
    if (extraMaterials.some((c) => !requireCardDefinition(c.cardId).kinds.includes(CardKind.Digimon))) return undefined;
    // Q5256: a Digimon that can't digivolve also can't be consumed by an effect-driven DNA digivolution.
    if (materials.some((material) => continuous.hasRestriction(material.permanentId, "digivolve"))) return undefined;
    const peek = peekLooseInstance(state, resultInstanceId);
    if (peek === undefined) return undefined;
    const definition = requireCardDefinition(peek.cardId);
    if (!definition.kinds.includes(CardKind.Digimon)) return undefined;
    const seat = materials[0]!.controllerSeat;
    // Each reward is resolved to its material's top card BEFORE the materials are consumed, so the
    // announcement can name the card that printed the clause once the stack no longer exists.
    const dnaMemoryGains = (engine.dnaDigivolveMemoryGains?.(materialPermanentIds, definition) ?? []).map((gain) => ({
      ...gain,
      cardId: access.permanentById(gain.sourcePermanentId)?.topCard?.cardId,
      instanceId: access.permanentById(gain.sourcePermanentId)?.topCard?.instanceId,
    }));
    const dnaMemoryGain = dnaMemoryGains.reduce((sum, gain) => sum + gain.amount, 0);
    const materialDefinitions = [
      ...materials.map((mat) => {
        const printed = requireCardDefinition(mat.topCard!.cardId);
        const effectiveLevel = continuous.dnaLevelFor(mat.permanentId, definition);
        const names = effectiveNames(continuous, mat, printed.nameEn ?? printed.cardId);
        return {
          ...printed,
          colors: effectiveColors(continuous, mat.permanentId, printed.colors) as typeof printed.colors,
          ...(effectiveLevel === undefined ? {} : { level: effectiveLevel }),
          nameEn: names.join(" | "),
        };
      }),
      ...extraMaterials.map((card) => requireCardDefinition(card.cardId)),
    ];
    // Keep each material's own sources together. Printed DNA order is top-first,
    // whereas Permanent.stack is bottom-first. Blast DNA supplies its own named
    // recipe order because it may differ from the ordinary DNA requirement.
    const materialGroups = materials.map((mat) => [...mat.stack, mat.topCard!]);
    const printedOrder =
      opts?.extraMaterialsOnBottom === undefined
        ? matchingDnaMaterialOrder(definition, materialDefinitions)
        : undefined;
    if (opts?.payCost) {
      // A printed DNA requirement is authoritative: every material slot must match it. Only cards
      // whose historical compiled data has no structured DNA requirement may use the legacy
      // single-base digivolve-cost fallback. Mixed-zone DNA effects (BT18-073) need the structured
      // requirement because one material may be a loose card in trash rather than on the field.
      // Only a matching printed DNA requirement authorizes the merge. Apply used to fall back to
      // the best single-base digivolve cost when the card carried no structured requirement; that
      // mirrored the same hole in `dnaDigivolveCostFor` and is gone for the same reason.
      const printedCost = matchingDnaDigivolveCost(definition, materialDefinitions);
      if (printedCost === undefined) return undefined;
      const chosenMaterial = materials[0]!;
      // Route the chosen material's printed cost through the continuous evo-cost ledger so
      // cost-reductions apply to the DNA path too (KB BT1-109 Q980). The chosen material is the
      // ledger target so a base-keyed or "into this card" reduction is evaluated against the
      // actual base being consumed. Floored at 0.
      const cost = Math.max(0, opts.costOverride ?? adjustedEvoCost(seat, chosenMaterial, printedCost, definition));
      if (engine.memory.maxCostFor(seat) < cost) return undefined;
      if (cost > 0) engine.memory.pay(seat, cost, "digivolve");
    }
    const linkedOrigins = locateMoveOrigins({
      state,
      instanceIds: materials.flatMap((material) => material.linked.map((card) => card.instanceId)),
    });
    const fromZone = looseZoneOfInstance(state, resultInstanceId);
    const instance = removeLooseInstance(state, resultInstanceId);
    if (instance === undefined) return undefined;
    instance.faceUp = true;
    // Gather the materials' cards (each material's stack then its top) as the new stack.
    // CR 8-2-2-1-2: each material's own linked cards are trashed immediately before it
    // becomes a digivolution card under the DNA-digivolved result — they do NOT carry
    // over (mirrors GameStateAccess.deletePermanent's stack/top/linked-to-trash pattern).
    const materialStackCards: CardInstance[] = [];
    const trashedLinked: CardInstance[] = [];
    // The materials' own top cards, kept for the `cardPlayed` announcement: the cut-in flanks
    // the result with the two faces that merged, and they are about
    // to be buried in the new stack where the client can no longer tell them from older cards.
    const materialSourceCardIds: string[] = [];
    const materialSourceArtIds: string[] = [];
    const resultSlot = Math.min(
      ...materials
        .filter((mat) => mat.controllerSeat === seat)
        .map((mat) => player(seat).battleArea.findIndex((p) => p.permanentId === mat.permanentId))
        .filter((index) => index >= 0),
    );
    for (const mat of materials) {
      for (const c of mat.stack) materialStackCards.push(c);
      if (mat.topCard !== undefined) {
        materialSourceCardIds.push(mat.topCard.cardId);
        materialSourceArtIds.push(mat.topCard.artId || mat.topCard.cardId);
        materialStackCards.push(mat.topCard);
      }
      for (const c of mat.linked) {
        insertCard(player(c.ownerSeat), Zone.Trash, c);
        trashedLinked.push(c);
      }
      // Remove the material permanent from its controller's battle area.
      const owner = player(mat.controllerSeat);
      const idx = owner.battleArea.findIndex((p) => p.permanentId === mat.permanentId);
      if (idx >= 0) extractPermanentAt(owner, idx);
      dropPermanentLedgers(mat.permanentId);
    }
    const extraStackCards: CardInstance[] = [];
    for (const id of extraMaterialIds) {
      const extra = removeLooseInstance(state, id);
      if (extra !== undefined) {
        extra.faceUp = true;
        extraStackCards.push(extra);
      }
    }
    const extraSourceCardIds = extraStackCards.map((card) => card.cardId);
    const groups = [...materialGroups, ...extraStackCards.map((card) => [card])];
    const stackCards =
      printedOrder !== undefined
        ? [...printedOrder].reverse().flatMap((index) => groups[index]!)
        : opts?.extraMaterialsOnBottom
          ? [...extraStackCards, ...materialStackCards]
          : [...materialStackCards, ...extraStackCards];
    const sourceCardIds = opts?.extraMaterialsOnBottom
      ? [...extraSourceCardIds, ...materialSourceCardIds]
      : [...materialSourceCardIds, ...extraSourceCardIds];
    // <Overflow> (CR §4-18): each material's linked cards just left the field for trash — a
    // genuine leave. The materials' own stack/top cards are NOT included here: they become
    // digivolution cards under the new result (moving TO under a card, excluded by §4-18-4).
    applyOverflow(engine.memory, trashedLinked, state.turnSeat);
    for (const { cards, ...origin } of groupCardsByOrigin({ origins: linkedOrigins, cards: trashedLinked })) {
      engine.emit({
        kind: "cardsMoved",
        instanceIds: cards.map((card) => card.instanceId),
        ...origin,
        to: Zone.Trash,
      });
    }
    const owner = player(seat);
    const permanent = new Permanent();
    permanent.permanentId = engine.nextPermanentId();
    permanent.controllerSeat = seat;
    setTopCard(permanent, instance);
    permanent.stack = new ArraySchema<CardInstance>(...stackCards);
    permanent.linked = new ArraySchema<CardInstance>();
    const dp = definition.dp;
    permanent.baseDP = dp;
    permanent.currentDP = dp;
    // CR 8-2-2-1-1: the DNA-digivolved Digimon always enters unsuspended — materials'
    // suspended state is NOT carried over (unlike a standard same-permanent digivolve).
    permanent.isSuspended = false;
    permanent.inBreeding = false;
    // CR 8-2-2-1-4: a Digimon created by DNA Digivolution may attack in the same turn.
    // `canAttackerDeclare` models ordinary summoning sickness through enterFieldTurnCount,
    // so keep the DNA result outside the current-turn bucket.
    permanent.enterFieldTurnCount = engine.state.turnCount - 1;
    if (Number.isFinite(resultSlot)) placePermanentAt(owner, permanent, resultSlot);
    else appendPermanent(owner, permanent);
    // CR 8-2-2-1-6: the result is a different Digimon, so [X Per Turn] uses spent by the
    // materials' cards this turn (including their inherited effects) are available again.
    engine.forgetCardUses?.(stackCards.map((card) => card.instanceId));
    // The new stack exists only after both material permanents are consumed. Reinstall continuous
    // effects now so inherited effects from every DNA material are active before entry timings run.
    await engine.recomputeContinuousEffects?.();
    if (dnaMemoryGain > 0) {
      for (const gain of dnaMemoryGains) {
        const announced = {
          seat,
          sourceCardId: gain.cardId,
          sourceInstanceId: gain.instanceId,
          sourcePermanentId: gain.sourcePermanentId,
          effectKey: gain.activationIdentity ?? `dnaMemoryGain/${gain.sourcePermanentId}`,
          description: gain.description,
          // The clause is only live on its controller's turn, so the printed timing is the label
          // even for the compiled data that omits it.
          timing: gain.timing ?? "YourTurn",
        };
        if (gain.cardId !== undefined)
          engine.emit({ kind: "effectTriggered", ...announced, sourceCardId: gain.cardId });
        engine.memory.addMemoryForSeat(seat, gain.amount, "gainMemory", { isTamerEffect: false });
        if (gain.cardId !== undefined) engine.emit({ kind: "effectResolved", ...announced, sourceCardId: gain.cardId });
      }
    }
    // A DNA digivolution is announced as a play because that is how the engine models it — one
    // card arriving on a new permanent — so the mechanic rides on `cardPlayed` rather than
    // duplicating the moment with a second `digivolved` event.
    engine.emit({
      kind: "cardPlayed",
      instanceId: instance.instanceId,
      fromZone,
      seat,
      cardId: instance.cardId,
      ...(instance.artId ? { artId: instance.artId } : {}),
      permanentId: permanent.permanentId,
      mechanic: "dna",
      sourceCardIds,
      sourceArtIds: opts?.extraMaterialsOnBottom
        ? [...extraStackCards.map((card) => card.artId || card.cardId), ...materialSourceArtIds]
        : [...materialSourceArtIds, ...extraStackCards.map((card) => card.artId || card.cardId)],
    });
    // CR 8-2-3-3: the DNA digivolution procedure itself draws 1 card — unconditional, part of
    // the placement procedure (mirrors applyDigivolve step 6), not an optional card effect.
    await draw(seat, 1, { drawReason: "digivolution" });
    if (opts?.publicEntry === true) {
      await engine.fireWhenDigivolving?.(seat, permanent, undefined, true);
    } else {
      await engine.fireEnteredByEffect?.(EffectTiming.WhenDigivolving, instance.instanceId, seat, {
        isDnaDigivolve: true,
      });
    }
    return permanent;
  };

  /**
   * App Fusion: play the fusion-target card `resultInstanceId` (a loose card in trash/hand)
   * ON TOP of the battle-area Digimon `sourcePermanentId` and its selected linked partner.
   * CR 8-4-3-3 places the partner above the prior top, below the result. Other linked cards
   * stay linked; no permanent leaves the field and no link card is trashed by this procedure.
   *
   * `appFusionCondition` produced by `AddAppfuseMethodByName`): the fusing permanent's top
   * card plus its linked cards must collectively cover >= 2 distinct required names (with the
   * top card being one of them). The controller chooses the linked physical material when
   * multiple links qualify; that card is consumed into the result stack and other links remain
   * attached. The app-fusion cost is paid from memory. Returns the fused permanent, or undefined
   * when the source/result is missing, the fusion is illegal, the choice is invalid, or the cost
   * is unaffordable.
   */
  const appFuseInto = async (
    sourcePermanentId: string,
    resultInstanceId: string,
    requestedLinkedInstanceId?: string,
    costOverride?: number,
    opts?: { publicEntry?: boolean },
  ): Promise<Permanent | undefined> => {
    const permanent = access.permanentById(sourcePermanentId);
    if (permanent === undefined || permanent.topCard === undefined) return undefined;
    const peek = peekLooseInstance(state, resultInstanceId);
    if (peek === undefined) return undefined;
    const originalResultLocation = locateLooseInstance(state, resultInstanceId);
    if (originalResultLocation === undefined) return undefined;
    const definition = requireCardDefinition(peek.cardId);
    if (!definition.kinds.includes(CardKind.Digimon)) return undefined;
    if (permanent.inBreeding) return undefined;
    // The engine hook is the authoritative digivolve-restriction gate (it shares
    // `digivolveBaseRestricted`/`digivolveIntoAllowed` with the ordinary digivolve path).
    // The inline checks remain the fallback for engines that do not supply it.
    if (engine.appFusionTargetAllowed !== undefined) {
      if (!engine.appFusionTargetAllowed(permanent.controllerSeat, permanent, peek)) return undefined;
    } else if (
      continuous.hasRestriction(sourcePermanentId, "digivolve") ||
      !continuous.digivolveIntoAllowed(sourcePermanentId, definition) ||
      (definition.level === 7 && continuous.hasRestriction(sourcePermanentId, "digivolveToLevel7")) ||
      (!permanent.isSuspended && continuous.isUnsuspendedDigivolveProhibited(permanent.controllerSeat))
    )
      return undefined;
    // Enforce the fusion-target's app-fusion legality + read its cost (server-authoritative).
    const originalTopId = permanent.topCard.instanceId;
    const topNames = effectiveNames(continuous, permanent, requireCardDefinition(permanent.topCard.cardId).nameEn);
    const linkedNames = Array.from(permanent.linked).map((c) => requireCardDefinition(c.cardId).nameEn);
    if (appFusionCostFor(peek.cardId, { topNames, linkedNames }) === undefined) return undefined;
    const seat = permanent.controllerSeat;
    // The fusion requirement identifies which linked physical card is consumed. A merely
    // different name is insufficient when several links are present (and would silently
    // consume an unrelated link). Ask the controller to choose the exact physical card while
    // every candidate is still linked; no cost or zone mutation occurs until that choice is valid.
    const eligiblePartners = permanent.linked.filter(
      (card) =>
        appFusionCostFor(peek.cardId, {
          topNames,
          linkedNames: [requireCardDefinition(card.cardId).nameEn],
        }) !== undefined,
    );
    if (eligiblePartners.length === 0) return undefined;
    // Only a genuine choice is put to the controller. An explicit declaration names the card,
    // and a single eligible link has nothing to choose, so neither opens a decision.
    const selectedPartnerIds =
      requestedLinkedInstanceId !== undefined
        ? [requestedLinkedInstanceId]
        : eligiblePartners.length === 1
          ? [eligiblePartners[0]!.instanceId]
          : await engine.ask.selectInstances(
              seat,
              eligiblePartners.map((card) => card.instanceId),
              1,
              1,
              "App Fusion: choose the link card used as fusion material.",
              { sourceCardId: peek.cardId, timing: "WhenDigivolving", effectText: "App Fusion" },
            );
    if (selectedPartnerIds.length !== 1) return undefined;
    const selectedPartnerId = selectedPartnerIds[0]!;
    const partnerIndex = permanent.linked.findIndex((card) => card.instanceId === selectedPartnerId);
    if (partnerIndex < 0 || !eligiblePartners.some((card) => card.instanceId === selectedPartnerId)) return undefined;
    // Revalidate every mutable identity after the awaited choice. The source may have moved,
    // changed controller/top card, or lost the result card while the decision was open.
    const currentPermanent = access.permanentById(sourcePermanentId);
    const currentResult = locateLooseInstance(state, resultInstanceId);
    if (
      currentPermanent !== permanent ||
      permanent.controllerSeat !== seat ||
      permanent.topCard?.instanceId !== originalTopId ||
      currentResult?.card !== peek ||
      currentResult.ownerSeat !== originalResultLocation.ownerSeat ||
      currentResult.zone !== originalResultLocation.zone
    )
      return undefined;
    // The selected physical card determines the actual printed route and therefore the cost paid.
    const selectedName = requireCardDefinition(permanent.linked[partnerIndex]!.cardId).nameEn;
    const selectedRouteCost = appFusionCostFor(peek.cardId, {
      topNames: effectiveNames(continuous, permanent, requireCardDefinition(permanent.topCard.cardId).nameEn),
      linkedNames: [selectedName],
    });
    if (selectedRouteCost === undefined || peekLooseInstance(state, resultInstanceId) === undefined) return undefined;
    const selectedCost = costOverride ?? selectedRouteCost;
    if (opts?.publicEntry !== true) await engine.prepareAppFusion?.(seat, permanent, peek, definition);
    // CR 8-4-2-3: digivolution cost effects also modify App Fusion. Resolve them
    // before moving the pair, while "no digivolution cards" still describes the base.
    const effectiveCost =
      costOverride !== undefined
        ? selectedCost
        : Math.max(
            0,
            engine.finalizeEffectDigivolveCost !== undefined
              ? await engine.finalizeEffectDigivolveCost(permanent, resultInstanceId, definition, selectedCost)
              : adjustedEvoCost(seat, permanent, selectedCost, definition),
          );
    const postAwaitPermanent = access.permanentById(sourcePermanentId);
    const postAwaitResult = locateLooseInstance(state, resultInstanceId);
    const postAwaitPartnerIndex =
      postAwaitPermanent?.linked.findIndex(({ instanceId }) => instanceId === selectedPartnerId) ?? -1;
    if (
      postAwaitPermanent !== permanent ||
      postAwaitPermanent.controllerSeat !== seat ||
      postAwaitPermanent.topCard?.instanceId !== originalTopId ||
      postAwaitResult?.card !== peek ||
      postAwaitResult.ownerSeat !== originalResultLocation.ownerSeat ||
      postAwaitResult.zone !== originalResultLocation.zone ||
      postAwaitPartnerIndex < 0
    )
      return undefined;
    if (engine.memory.maxCostFor(seat) < effectiveCost) return undefined;
    if (opts?.publicEntry !== true) await engine.fireWouldDigivolve?.(seat, permanent, definition);
    const afterWouldPermanent = access.permanentById(sourcePermanentId);
    const afterWouldResult = locateLooseInstance(state, resultInstanceId);
    const afterWouldPartnerIndex =
      afterWouldPermanent?.linked.findIndex(({ instanceId }) => instanceId === selectedPartnerId) ?? -1;
    if (
      afterWouldPermanent !== permanent ||
      afterWouldPermanent.controllerSeat !== seat ||
      afterWouldPermanent.topCard?.instanceId !== originalTopId ||
      afterWouldResult?.card !== peek ||
      afterWouldResult.ownerSeat !== originalResultLocation.ownerSeat ||
      afterWouldResult.zone !== originalResultLocation.zone ||
      afterWouldPartnerIndex < 0
    )
      return undefined;
    // Names can change while link selection, cost effects or would-digivolve decisions
    // are awaited without changing any physical identity. Revalidate the selected live
    // pair immediately before payment/material movement, even for a cost override.
    if (
      appFusionCostFor(peek.cardId, {
        topNames: effectiveNames(continuous, permanent, requireCardDefinition(permanent.topCard.cardId).nameEn),
        linkedNames: [requireCardDefinition(permanent.linked[afterWouldPartnerIndex]!.cardId).nameEn],
      }) === undefined
    )
      return undefined;
    if (engine.memory.maxCostFor(seat) < effectiveCost) return undefined;
    if (effectiveCost > 0) engine.memory.pay(seat, effectiveCost, "appFusion");
    const origin = locateMoveOrigins({ state, instanceIds: [resultInstanceId] }).get(resultInstanceId);
    const instance = removeLooseInstance(state, resultInstanceId);
    if (instance === undefined) return undefined;
    instance.faceUp = true;
    const carriedSuspended = permanent.isSuspended;
    const priorTop = permanent.topCard;
    const previousLevel = requireCardDefinition(priorTop.cardId).level;
    const partner = extractLinkedById(permanent, selectedPartnerId);
    pushOnStack(permanent, priorTop);
    if (partner !== undefined) pushOnStack(permanent, partner);
    setTopCard(permanent, instance);
    permanent.enteredByEffect = opts?.publicEntry !== true;
    continuous.reanchorCustomEffectGrants(priorTop.instanceId, instance.instanceId);
    const dp = definition.dp;
    permanent.baseDP = dp;
    permanent.currentDP = dp;
    ledger.recomputeDP(state, permanent.permanentId);
    permanent.isSuspended = carriedSuspended;
    engine.emit({
      kind: "digivolved",
      seat,
      cardId: instance.cardId,
      ...(instance.artId ? { artId: instance.artId } : {}),
      permanentId: permanent.permanentId,
      mechanic: "appFusion",
      inBreeding: false,
    });
    engine.emit({
      kind: "cardsMoved",
      instanceIds: [instance.instanceId],
      from: origin?.from ?? CardMovePosition.VARIOUS.value,
      ...origin,
      to: Zone.BattleArea,
    });
    // CR 8-4-3-3: the app fusion procedure itself draws 1 card — unconditional, part of the
    // placement procedure (mirrors applyDigivolve step 6 / dnaDigivolveInto).
    await draw(seat, 1, { drawReason: "digivolution" });
    // The fusion result is now the permanent's live top card. Re-derive its printed
    // continuous effects before opening the [When Digivolving] window, matching the
    // ordinary digivolution path (BT24-077's printed Blocker is immediately active).
    await engine.recomputeContinuousEffects?.();
    // CR 8-4-1 ("a player can digivolve 1 Digimon card with [App Fusion]..."), 8-4-2-3
    // ("effects that affect digivolution will also affect app fusion"), and 15-16-3's definition
    // of [When Digivolving] ("triggered ... when the action of digivolving into a card with that
    // effect is complete") together say App Fusion IS "digivolving" for the entering card's own
    // [When Digivolving] window, so it fires here.
    if (opts?.publicEntry === true) {
      await engine.fireWhenDigivolving?.(seat, permanent, previousLevel);
    } else {
      await engine.fireEnteredByEffect?.(EffectTiming.WhenDigivolving, instance.instanceId, seat);
    }
    return permanent;
  };

  /**
   * De-Digivolve `n`: up to `n` times, move the permanent's current top card to the
   * trash and promote the digivolution card directly beneath it
   * to the new top (the Digimon reverts a stage). Stops when the stack is empty.
   */

  return { dnaDigivolveInto, appFuseInto };
}
