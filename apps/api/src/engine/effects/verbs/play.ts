import { locateMoveOrigins } from "#api/engine/effects/verbs/locateMoveOrigins";
import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import { peekCheckedCard, takeCheckedCard } from "../../security/checkedCard.js";
import {
  CardKind,
  Permanent,
  Zone,
  EffectTiming,
  requireCardDefinition,
  digiXrosRequirementFor,
  type Seat,
  type ZoneRef,
} from "@aegis/shared";
import { extractCardAt, extractPermanentAt, setBreeding } from "../../state/access.js";
import { isOption } from "../../cards/cardData.js";
import { digiXrosMaterialOrder } from "../../actions/digiXros.js";
import { digiXrosOnlyNameAliasesFor, universalNameAliasesFor } from "../interpreter/compiledCards.js";
import type { Primitives } from "../EffectContext.js";
import type { CollectedEffect } from "../collect.js";
import { isPermanentKind, placePermanent } from "../verbs/cardPlacement.js";
import {
  hostOfStackInstance,
  hostOfLinkedInstance,
  locateInHand,
  locateInSecurity,
  looseZoneOfInstance,
  ownerSeatOfLoose,
  peekLooseInstance,
  removeLooseInstance,
} from "../verbs/looseInstances.js";

import type { PrimitivesContext } from "./context.js";

/**
 * Playing a card from hand or security.
 */

export function createPlayVerbs(pc: PrimitivesContext) {
  const { engine, continuous, effectSeatStack, player, state, ledger } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const effectDrivenPlayCost: PrimitivesContext["helpers"]["effectDrivenPlayCost"] = (...args) =>
    pc.helpers.effectDrivenPlayCost(...args);
  const placePlayMaterialsUnder: Primitives["placePlayMaterialsUnder"] = (...args) =>
    pc.fx.placePlayMaterialsUnder(...args);
  const relocatePermanent: Primitives["relocatePermanent"] = (...args) => pc.fx.relocatePermanent(...args);

  const playFromHand = async (
    instanceIds: string[],
    opts?: { payCost?: boolean; suspended?: boolean; costDelta?: number },
  ): Promise<Permanent[]> => {
    const created: Permanent[] = [];
    for (const instanceId of instanceIds) {
      const located = locateInHand(state, instanceId);
      if (located === undefined) continue;
      const { owner, index } = located;
      const definition = requireCardDefinition(owner.hand[index]!.cardId);
      if (!isPermanentKind(definition) || isOption(definition)) continue;
      const effectSeat = effectSeatStack.at(-1) ?? owner.seat;
      if (continuous.isPlayBlocked(effectSeat, definition, "play", true, "hand")) continue;
      if (opts?.payCost) {
        const cost = await effectDrivenPlayCost(
          instanceId,
          definition,
          owner.seat,
          opts.costDelta,
          false,
          undefined,
          "hand",
        );
        if (engine.memory.maxCostFor(owner.seat) < cost) continue; // unaffordable: skip (no partial pay)
        if (cost > 0) engine.memory.pay(owner.seat, cost, "playCard");
      }
      const instance = extractCardAt(owner, Zone.Hand, index)!;
      instance.faceUp = true;
      const permanent = placePermanent(engine, owner, instance, definition, opts?.suspended ?? false);
      created.push(permanent);
      engine.emit({
        kind: "cardPlayed",
        instanceId: instance.instanceId,
        fromZone: "hand",
        seat: owner.seat,
        cardId: instance.cardId,
        ...(instance.artId ? { artId: instance.artId } : {}),
        permanentId: permanent.permanentId,
      });
      engine.emit({
        kind: "cardsMoved",
        instanceIds: [instance.instanceId],
        from: Zone.Hand,
        to: Zone.BattleArea,
      });
    }
    return created;
  };

  const playFromSecurity = async (instanceId: string, opts?: { payCost?: boolean }): Promise<Permanent | undefined> => {
    const located = locateInSecurity(state, instanceId);
    const checked = peekCheckedCard(state, instanceId);
    const owner = located?.owner ?? (checked === undefined ? undefined : state.players[checked.seat]);
    const card = located === undefined ? checked?.card : located.owner.security[located.index];
    if (owner === undefined || card === undefined) return undefined;
    const definition = requireCardDefinition(card.cardId);
    if (!isPermanentKind(definition) || isOption(definition)) return undefined;
    const effectSeat = effectSeatStack.at(-1) ?? owner.seat;
    if (continuous.isPlayBlocked(effectSeat, definition, "play", true, "security")) return undefined;
    if (opts?.payCost) {
      const cost = await effectDrivenPlayCost(instanceId, definition, owner.seat, 0, false, undefined, "security");
      if (engine.memory.maxCostFor(owner.seat) < cost) return undefined;
      if (cost > 0) engine.memory.pay(owner.seat, cost, "playCard");
    } else {
      // Free security-origin plays retain optional would-be-played costs (Q4784).
      await engine.finalizeEffectPlayCost?.(instanceId, 0, false, "security");
    }
    // Payment windows may reorder security; remove the selected instance, not a stale index.
    const currentIndex = owner.security.findIndex((candidate) => candidate.instanceId === instanceId);
    const instance =
      currentIndex < 0 ? takeCheckedCard(state, instanceId) : extractCardAt(owner, Zone.Security, currentIndex);
    if (instance === undefined) return undefined;
    instance.faceUp = true;
    const permanent = placePermanent(engine, owner, instance, definition, false);
    engine.emit({
      kind: "cardPlayed",
      instanceId: instance.instanceId,
      fromZone: "security",
      seat: owner.seat,
      cardId: instance.cardId,
      ...(instance.artId ? { artId: instance.artId } : {}),
      permanentId: permanent.permanentId,
    });
    engine.emit({
      kind: "cardsMoved",
      instanceIds: [instance.instanceId],
      from: Zone.Security,
      to: Zone.BattleArea,
    });
    // A [Security] effect that says "play this card" is still an effect-driven play: its own
    // [On Play] window resolves, then watchers such as ST10-06 see a `whenPlayed` event with the
    // trigger-time level snapshot. The snapshot is captured from `definition` before either
    // window can change or remove the permanent (KB Q737/Q738).
    await engine.fireEnteredByEffect?.(EffectTiming.OnPlay, instance.instanceId, owner.seat, {
      playedFromZone: "security",
    });
    // Playing a card from security is still an effect-driven removal from that stack. Publish
    // both security-removal buses after the entering card's effects have installed its live
    // watchers, so cards such as BT15-037 observe the same-time removal (KB Q2519).
    // The check already removed a staged card. Moving it into play creates no second removal.
    if (checked === undefined) {
      await engine.fireSubTrigger?.("whenEffectRemovesFromSecurity", { removedFromSecuritySeat: owner.seat });
      await engine.fireSubTrigger?.("whenSecurityRemoved", {
        removedFromSecuritySeat: owner.seat,
        securityRemovedByEffect: true,
      });
    }
    await engine.fireSubTrigger?.("whenPlayed", {
      subjectPermanentId: permanent.permanentId,
      playedByEffect: true,
      playedFromZone: "security",
      ...(definition.level !== undefined ? { playedLevel: definition.level } : {}),
      ...(definition.playCost !== undefined ? { playedPlayCost: definition.playCost } : {}),
    });
    return permanent;
  };

  /**
   * Play specific loose card instances as new battle-area permanents (the generalized
   * PlayWithoutCost: "play 1 [X] from your hand/trash/security/deck/under your Tamers
   * without paying the cost"). Each instance is located wherever it currently sits
   * (hand, security, deck, trash, breeding, or as a digivolution/linked card under
   * another permanent — NOT a permanent's top card) and removed from there; only a
   * permanent kind is placed. `payCost` pays the printed play cost if affordable;
   * the default is free. Returns the created permanents.
   */
  const playInstances = async (
    instanceIds: string[],
    opts?: {
      payCost?: boolean;
      suspended?: boolean;
      breeding?: boolean;
      costDelta?: number;
      costDeltaByPlay?: Record<string, number>;
      costOverride?: number;
      suppressOnPlayEffects?: boolean;
      effectSourceCardId?: string;
      playedByDecode?: boolean;
      digiXrosMaterialInstanceIds?: string[];
      digiXrosMaterialInstanceIdsByPlay?: Record<string, string[]>;
      assemblyMaterialInstanceIds?: string[];
      assemblyMaterialInstanceIdsByPlay?: Record<string, string[]>;
      hostPermanentIds?: Record<string, string>;
      playedFromZone?: ZoneRef;
    },
  ): Promise<Permanent[]> => {
    const created: Permanent[] = [];
    // Snapshot which (if any) of the played instances originate from a digivolution stack
    // BEFORE removal, so the whenPlayed fire can set playedFromZone for the
    // `fromDigivolution` sourceFilter gate (BT20-028 KB Q4321).
    const originByInstance = new Map(
      instanceIds.map((id) => [id, opts?.playedFromZone ?? looseZoneOfInstance(state, id)]),
    );
    const originHostByInstance = new Map(
      instanceIds.map((id) => [id, opts?.hostPermanentIds?.[id] ?? hostOfStackInstance(state, id)?.hostPermanentId]),
    );
    const securityOriginSeats = new Set<Seat>();
    const placedMaterialCountByInstance = new Map<string, number>();
    const heldTriggeredByInstance = new Map<string, readonly CollectedEffect[]>();
    const placements: (() => Promise<void>)[] = [];
    try {
      for (const instanceId of instanceIds) {
        const owner = ownerSeatOfLoose(state, instanceId);
        if (owner === undefined) continue;
        const ownerPlayer = player(owner);
        const peek = peekLooseInstance(state, instanceId);
        if (peek === undefined) continue;
        const definition = requireCardDefinition(peek.cardId);

        // Breeding play: gate to Digimon/DigiEgg only (§6-4), require empty breeding slot
        if (opts?.breeding) {
          if (!(definition.kinds.includes(CardKind.Digimon) || definition.kinds.includes(CardKind.DigiEgg))) continue;
          if (ownerPlayer.breeding !== undefined) continue; // single-occupancy — no-op
        }

        // DUAL cards have no play cost and cannot be played, even for free (CR 7-1-1).
        // Keep DigiEgg breeding plays and token placement on their existing dedicated paths.
        if (!isPermanentKind(definition) || isOption(definition)) continue;
        const effectSeat = effectSeatStack.at(-1) ?? ownerPlayer.seat;
        if (continuous.isPlayBlocked(effectSeat, definition, "play", true, originByInstance.get(instanceId))) continue;
        const declaredMaterials =
          opts?.digiXrosMaterialInstanceIdsByPlay?.[instanceId] ?? opts?.digiXrosMaterialInstanceIds;
        // The battle-area materials' "would leave" interrupts resolve before payment and placement,
        // while the played card is only revealed. A prevented material is not placed and does not
        // reduce the cost; what the interrupts triggered waits for this card's [On Play].
        const battleAreaMaterials = (declaredMaterials ?? []).flatMap((materialInstanceId) => {
          const fieldMaterial = Array.from(state.players)
            .flatMap((candidatePlayer) => Array.from(candidatePlayer.battleArea))
            .find((candidate) => candidate.topCard?.instanceId === materialInstanceId);
          return fieldMaterial === undefined ? [] : [{ materialInstanceId, permanentId: fieldMaterial.permanentId }];
        });
        const materialInterrupt =
          battleAreaMaterials.length === 0
            ? undefined
            : await engine.interruptDigiXrosMaterialLeave?.(
                battleAreaMaterials.map(({ permanentId }) => permanentId),
                effectSeat,
              );
        const preventedMaterialInstanceIds = new Set(
          battleAreaMaterials
            .filter(({ permanentId }) => materialInterrupt?.prevented.has(permanentId) === true)
            .map(({ materialInstanceId }) => materialInstanceId),
        );
        const playMaterials = declaredMaterials?.filter(
          (materialInstanceId) => !preventedMaterialInstanceIds.has(materialInstanceId),
        );
        const abandonPlay = async () => {
          if ((materialInterrupt?.triggered.length ?? 0) > 0)
            await engine.resolveHeldTriggeredEffects?.(materialInterrupt!.triggered);
        };
        if (opts?.payCost) {
          const requirement = digiXrosRequirementFor(definition.cardId)?.[0];
          const materialCount = playMaterials?.length ?? 0;
          const perMaterialReduction =
            requirement?.count === "∞" ? (requirement.costReduction ?? 1) : (requirement?.count ?? 0);
          const digiXrosReduction = materialCount * perMaterialReduction;
          const cost = await effectDrivenPlayCost(
            instanceId,
            definition,
            ownerPlayer.seat,
            (opts.costDeltaByPlay?.[instanceId] ?? opts.costDelta ?? 0) + digiXrosReduction,
            false,
            opts.costOverride,
            originByInstance.get(instanceId),
            false,
            instanceIds.length,
            instanceIds,
          );
          if (engine.memory.maxCostFor(ownerPlayer.seat) < cost) {
            await abandonPlay();
            continue;
          }
          if (cost > 0) engine.memory.pay(ownerPlayer.seat, cost, "playCard");
        } else {
          // A free play still opens the would-be-played window (EX9-030 Q4784).
          // Optional processing costs may be paid, but its result cannot charge memory.
          await engine.finalizeEffectPlayCost?.(
            instanceId,
            0,
            false,
            originByInstance.get(instanceId),
            false,
            instanceIds.length,
            instanceIds,
          );
        }
        placements.push(async function placePreparedCard() {
          if (opts?.breeding && ownerPlayer.breeding !== undefined) {
            await abandonPlay();
            return;
          }
          // Preserve the resolved host when moving stack material.  A material selected from
          // the breeding stack must be detached from that exact permanent before the new
          // permanent is placed; falling back to the global loose lookup can otherwise retain
          // stale breeding material when the same instance id is observed through another view.
          const resolvedHostPermanentId =
            hostOfStackInstance(state, instanceId)?.hostPermanentId ?? opts?.hostPermanentIds?.[instanceId];
          const origin = locateMoveOrigins({ state, instanceIds: [instanceId] }).get(instanceId);
          const linkedHostId = hostOfLinkedInstance(state, instanceId);
          const instance = removeLooseInstance(state, instanceId, true, resolvedHostPermanentId);
          if (instance === undefined) {
            await abandonPlay();
            return;
          }
          if (linkedHostId !== undefined) {
            ledger.recomputeDP(state, linkedHostId);
          }
          instance.faceUp = true;
          // A source played onto a new permanent is a new card (CR 7-1-1, 3-4-4),
          // so its [X Per Turn] uses reset (15-14-1-5-2). The field-departure event
          // cannot cover this same-area play. Reset only after extraction succeeds,
          // before entry effects can spend the new card's use; leave its old host alone.
          if (originHostByInstance.get(instanceId) !== undefined) engine.forgetCardUses?.([instanceId]);
          const permanent = placePermanent(engine, ownerPlayer, instance, definition, opts?.suspended ?? false);
          if (originByInstance.get(instanceId) === "security") securityOriginSeats.add(ownerPlayer.seat);
          // Breeding: relocate permanent from battle area to breeding slot
          if (opts?.breeding) {
            const idx = ownerPlayer.battleArea.findIndex((p) => p.permanentId === permanent.permanentId);
            if (idx >= 0) extractPermanentAt(ownerPlayer, idx);
            permanent.inBreeding = true;
            setBreeding(ownerPlayer, permanent);
          }
          created.push(permanent);
          // Resolve paid would-be-played placements before material placement (Q2253).
          await engine.placePendingPlayCosts?.(instanceId, permanent.permanentId);
          if (playMaterials !== undefined) placedMaterialCountByInstance.set(instanceId, playMaterials.length);
          if (materialInterrupt !== undefined) heldTriggeredByInstance.set(instanceId, materialInterrupt.triggered);
          if ((playMaterials?.length ?? 0) > 0) {
            const fieldMaterials = playMaterials!.map((materialInstanceId) =>
              Array.from(state.players)
                .flatMap((candidatePlayer) => Array.from(candidatePlayer.battleArea))
                .find((candidate) => candidate.topCard?.instanceId === materialInstanceId),
            );
            const materialCards = playMaterials!.map(
              (materialInstanceId, index) =>
                fieldMaterials[index]?.topCard ?? peekLooseInstance(state, materialInstanceId),
            );
            const recipe = digiXrosRequirementFor(instance.cardId)?.[0];
            const order =
              recipe !== undefined && materialCards.every((card) => card !== undefined)
                ? digiXrosMaterialOrder(
                    materialCards.map((card) => requireCardDefinition(card!.cardId)),
                    recipe.materials,
                    (index) => [
                      ...universalNameAliasesFor(materialCards[index]!.cardId),
                      ...digiXrosOnlyNameAliasesFor(materialCards[index]!.cardId),
                      ...(fieldMaterials[index] === undefined
                        ? []
                        : [
                            ...continuous.grantedNames(fieldMaterials[index]!.permanentId),
                            ...continuous.grantedDigiXrosNames(fieldMaterials[index]!.permanentId),
                          ]),
                    ],
                    (index) =>
                      fieldMaterials[index] !== undefined &&
                      continuous.hasKeyword(fieldMaterials[index]!.permanentId, "DigiXrosSubstitute"),
                  )
                : undefined;
            for (const index of order ?? playMaterials!.map((_materialId, materialIndex) => materialIndex)) {
              const materialInstanceId = playMaterials![index]!;
              let fieldMaterial: Permanent | undefined;
              for (const candidatePlayer of state.players) {
                fieldMaterial = candidatePlayer.battleArea.find(
                  (candidatePermanent) => candidatePermanent.topCard?.instanceId === materialInstanceId,
                );
                if (fieldMaterial !== undefined) break;
              }
              if (fieldMaterial !== undefined && fieldMaterial.permanentId !== permanent.permanentId) {
                relocatePermanent(permanent.permanentId, fieldMaterial.permanentId, {
                  belowTop: false,
                  faceUp: true,
                  shedOwnCards: true,
                });
              } else {
                await placePlayMaterialsUnder(permanent.permanentId, [materialInstanceId]);
              }
            }
          }
          const assemblyMaterials =
            opts?.assemblyMaterialInstanceIdsByPlay?.[instanceId] ?? opts?.assemblyMaterialInstanceIds;
          for (const materialInstanceId of assemblyMaterials ?? []) {
            await placePlayMaterialsUnder(permanent.permanentId, [materialInstanceId]);
          }
          engine.emit({
            kind: "cardPlayed",
            instanceId: instance.instanceId,
            fromZone: originByInstance.get(instanceId),
            fromPermanentId: originHostByInstance.get(instanceId),
            seat: ownerPlayer.seat,
            cardId: instance.cardId,
            ...(instance.artId ? { artId: instance.artId } : {}),
            permanentId: permanent.permanentId,
          });
          engine.emit({
            kind: "cardsMoved",
            instanceIds: [instance.instanceId],
            from: origin?.from ?? CardMovePosition.VARIOUS.value,
            ...origin,
            to: opts?.breeding ? Zone.Breeding : Zone.BattleArea,
          });
        });
      }
      for (const place of placements) {
        await place();
      }
    } finally {
      for (const instanceId of instanceIds) engine.clearPreparedDigiXrosPlay?.(instanceId);
    }
    if (created.length > 0 && !opts?.breeding) {
      // A played permanent is already in the battle area before its [On Play] resolves.
      // Install its continuous effects and reactive subscriptions now so they can observe
      // nested events caused by that [On Play] (BT10-085: Sistermon Ciel must see the
      // Royal Knight digivolution performed by her own effect).
      await engine.recomputeContinuousEffects?.();
      const triggerSubject = created[0]!;
      const triggerSubjectTop = triggerSubject.topCard;
      const playedLevel =
        triggerSubjectTop === undefined ? undefined : requireCardDefinition(triggerSubjectTop.cardId).level;
      const playedPlayCost =
        triggerSubjectTop === undefined ? undefined : requireCardDefinition(triggerSubjectTop.cardId).playCost;
      // Each effect-played Digimon's OWN [On Play] fires (it was PLAYED, not merely placed), with
      // `enteredByEffect` set to its controller (the producer for the BT25-084 by-effect gate). A
      // manual hand play takes the play action's own seam, which leaves the marker unset.
      if (opts?.suppressOnPlayEffects === true) {
        for (const held of heldTriggeredByInstance.values()) await engine.resolveHeldTriggeredEffects?.(held);
      } else {
        for (const permanent of created) {
          if (permanent.topCard === undefined) continue;
          const placedMaterialCount = placedMaterialCountByInstance.get(permanent.topCard.instanceId);
          const heldTriggered = heldTriggeredByInstance.get(permanent.topCard.instanceId);
          await engine.fireEnteredByEffect?.(
            EffectTiming.OnPlay,
            permanent.topCard.instanceId,
            permanent.controllerSeat,
            {
              ...(originByInstance.get(permanent.topCard.instanceId) !== undefined
                ? { playedFromZone: originByInstance.get(permanent.topCard.instanceId)! }
                : {}),
              ...(placedMaterialCount !== undefined ? { digiXrosMaterialCount: placedMaterialCount } : {}),
              ...(opts?.effectSourceCardId !== undefined
                ? { playedByEffectSourceCardId: opts.effectSourceCardId }
                : {}),
              ...(opts?.playedByDecode === true ? { playedByDecode: true } : {}),
              ...(heldTriggered !== undefined ? { procedurePending: heldTriggered } : {}),
              // A multi-card play is one event, so its per-entry windows defer the watcher
              // bus to the canonical batch event below. A one-card play publishes through
              // its entry window, where replacement-play watchers can be snapshotted and
              // resolved even when there is no enclosing resolver pass (EX11-058/Q5911).
              ...(instanceIds.length > 1 ? { deferWhenPlayed: true } : {}),
            },
          );
        }
      }
      // Generic PlayWithoutCost can source permanents directly from security. That move is
      // still an effect-driven security removal, just like playFromSecurity above. Publish
      // the buses after On Play has installed live watchers so the entering card can observe
      // its own same-time removal (BT15-037 / KB Q2519).
      for (const seat of securityOriginSeats) {
        await engine.fireSubTrigger?.("whenEffectRemovesFromSecurity", { removedFromSecuritySeat: seat });
        await engine.fireSubTrigger?.("whenSecurityRemoved", {
          removedFromSecuritySeat: seat,
          securityRemovedByEffect: true,
        });
      }
      // An EFFECT just played one or more Digimon (Q3665: "when an effect plays one of your Digimon").
      // Fire the whenPlayed bus ONCE for the play event (KB Q3664: a single effect that plays 2+ at
      // once triggers the watcher only once), marked effect-driven so a "when an effect plays" watcher
      // (EX5-062) fires while manual hand plays (which leave `playedByEffect` unset) do not. Breeding
      // placements are not "plays" in this sense and are excluded.
      // `playedFromZone` is set when ANY played instance originated from a digivolution stack so a
      // `fromDigivolution: true` sourceFilter (BT20-028 KB Q4321) can gate on the source zone.
      // The snapshot `fromDigivolutionIds` was captured before removal to survive the splicing.
      const playedFromZone =
        triggerSubjectTop === undefined ? undefined : originByInstance.get(triggerSubjectTop.instanceId);
      if (instanceIds.length > 1 || opts?.suppressOnPlayEffects === true) {
        await engine.fireSubTrigger?.("whenPlayed", {
          subjectPermanentId: triggerSubject.permanentId,
          subjectPermanentIds: created.map((permanent) => permanent.permanentId),
          playedByEffect: true,
          ...(opts?.effectSourceCardId !== undefined ? { playedByEffectSourceCardId: opts.effectSourceCardId } : {}),
          ...(opts?.playedByDecode === true ? { playedByDecode: true } : {}),
          ...(playedLevel !== undefined ? { playedLevel } : {}),
          ...(playedPlayCost !== undefined ? { playedPlayCost } : {}),
          ...(playedFromZone !== undefined ? { playedFromZone } : {}),
        });
      }
    }
    return created;
  };

  /**
   * Place a loose Option card into its owner's battle area as a battle-area PERMANENT
   * (source CanPlayAsNewPermanent isPlayOption:true / PlaceDelayOptionCards). `playInstances`
   * skips Options (isPermanentKind excludes Option); this is the dedicated option-permanent
   * placement path. Gated to Option kind so it cannot place a non-Option card; a missing or
   * non-Option instance is a no-op. The Option enters as a 0-DP permanent (placePermanent), is
   * face up, and emits cardPlayed + cardsMoved. Does NOT pay a cost (the placement is a free
   * "place ... in your battle area", not a use). Returns the created Permanent or undefined.
   */
  const placeOptionAsPermanent = async (instanceId: string): Promise<Permanent | undefined> => {
    const owner = ownerSeatOfLoose(state, instanceId);
    if (owner === undefined) return undefined;
    const ownerPlayer = player(owner);
    const peek = peekLooseInstance(state, instanceId);
    if (peek === undefined) return undefined;
    const definition = requireCardDefinition(peek.cardId);
    // Strictly an Option-permanent path: do NOT broaden the normal permanent kinds.
    if (!isOption(definition)) return undefined;
    // §9-1-5's placement exception: the card being placed may be the Option that is
    // still resolving its own [Main] body, which `removeLooseInstance` claims out of
    // `resolvingOption` below. That makes this movement the used Option's final
    // routing, so it carries the same marker the trash route emits — the client's
    // resolving-Option dock closes on it and would otherwise sit on screen until its
    // failsafe ceiling.
    const routesUsedOption = ownerPlayer.resolvingOption?.instanceId === instanceId;
    const fromZone = looseZoneOfInstance(state, instanceId) ?? (routesUsedOption ? "resolvingOption" : undefined);
    const origin = locateMoveOrigins({ state, instanceIds: [instanceId] }).get(instanceId);
    const instance = removeLooseInstance(state, instanceId);
    if (instance === undefined) return undefined;
    instance.faceUp = true;
    const permanent = placePermanent(engine, ownerPlayer, instance, definition, false);
    // CR 17-1-3-2-2 exempts Options placed in the battle area BY AN EFFECT from the
    // rule-check trash sweep; mark the origin so the sweep can tell them apart.
    permanent.placedByEffect = true;
    engine.emit({
      kind: "cardPlayed",
      instanceId: instance.instanceId,
      fromZone,
      seat: ownerPlayer.seat,
      cardId: instance.cardId,
      ...(instance.artId ? { artId: instance.artId } : {}),
      permanentId: permanent.permanentId,
    });
    engine.emit({
      kind: "cardsMoved",
      instanceIds: [instance.instanceId],
      from: origin?.from ?? CardMovePosition.VARIOUS.value,
      ...origin,
      to: Zone.BattleArea,
      ...(routesUsedOption ? { optionUsed: true as const } : {}),
    });
    // Option cards placed as permanents are a distinct event from using an Option effect:
    // inherited watchers such as BT13-007's Royal Knight clause react here, after the
    // permanent exists so sourceFilter can inspect its kind/trait/controller.
    await engine.fireSubTrigger?.("whenOptionPlayed", { subjectPermanentId: permanent.permanentId });
    return permanent;
  };

  return { playFromHand, playFromSecurity, playInstances, placeOptionAsPermanent };
}
