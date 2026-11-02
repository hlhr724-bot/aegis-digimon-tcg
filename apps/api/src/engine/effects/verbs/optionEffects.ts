import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import {
  CardKind,
  Permanent,
  Zone,
  EffectTiming,
  requireCardDefinition,
  CardInstance,
  type CardDefinition,
  type Seat,
} from "@aegis/shared";
import { applyOverflow, insertCard, setResolvingOption } from "../../state/access.js";
import type { EffectContext } from "../EffectContext.js";
import { getEffectModule } from "../registry.js";
import { observeEffectActivation } from "../activationPresentation.js";
import {
  hostOfLinkedInstance,
  hostOfStackInstance,
  looseZoneOfInstance,
  peekLooseInstance,
  removeLooseInstance,
} from "../verbs/looseInstances.js";

import type { PrimitivesContext } from "./context.js";

/**
 * Firing an Option's effect, and the buses reporting cards that leave the deck.
 */

export function createOptionEffectsVerbs(pc: PrimitivesContext) {
  const { engine, player, state } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const effectDrivenPlayCost: PrimitivesContext["helpers"]["effectDrivenPlayCost"] = (...args) =>
    pc.helpers.effectDrivenPlayCost(...args);

  const fireOptionUsed = async (usedInstanceId: string, usedOptionCost?: number): Promise<void> => {
    if (engine.fireSubTrigger) {
      await engine.fireSubTrigger("whenOptionUsed", { subjectPermanentId: usedInstanceId, usedOptionCost });
    }
  };

  /**
   * Fire onDiscardLibrary SubTrigger when cards are milled from a player's deck top.
   * BT14-077 Yuki Tamer watcher: fires once per mill operation (not per card), carrying
   * the milled deck's owner seat and the trashed instance IDs.
   */
  const fireOnDiscardLibrary = async (deckSeat: Seat, trashedInstanceIds: string[]): Promise<void> => {
    if (engine.fireSubTrigger && trashedInstanceIds.length > 0) {
      await engine.fireSubTrigger("onDiscardLibrary", {
        addedToHand: { instanceIds: trashedInstanceIds, byEffect: { ownerSeat: deckSeat, isDigimonEffect: false } },
      });
    }
  };

  /**
   * Fire whenTrashedFromDeck once per milled card (CAP-H-01, BT19-097). Carries the card ID
   * of the just-trashed deck card so a `sourceFilter.isSelfRef` watcher can match only when its
   * own card ID was the one trashed. Mirrors the fireOnDiscardLibrary pattern but fires per card.
   */
  const fireWhenTrashedFromDeck = async (
    cardId: string,
    instanceId?: string,
    byEffectCardId?: string,
  ): Promise<void> => {
    const alreadyArmed =
      instanceId !== undefined &&
      engine.subTriggers
        ?.subscriptionsFor("whenTrashedFromDeck")
        .some((subscription) => subscription.sourceInstanceId === instanceId);
    if (instanceId !== undefined && !alreadyArmed) {
      await engine.resolveSelfWhenTrashedFromDeck?.(instanceId, byEffectCardId);
    }
    if (engine.fireSubTrigger) {
      await engine.fireSubTrigger("whenTrashedFromDeck", {
        trashedFromDeckCardId: cardId,
        ...(instanceId === undefined ? {} : { trashedFromDeckInstanceId: instanceId }),
        ...(byEffectCardId !== undefined ? { trashedFromDeckByEffectCardId: byEffectCardId } : {}),
      });
    }
  };

  /**
   * Run `cardId`'s registered EffectModule effect(s) for `timing` under `ctx.source`'s control
   * (mirrors the interpreter's own `runUseOptionWithoutCost`, generalized past IR-compiled
   * cards). Looked up through the shared `registerCard` registry rather than the interpreter's
   * `getCompiledCard`, so a hand-written module resolves too — `getCompiledCard` only sees
   * IR-compiled records and would silently no-op for every hand-implemented card. `effectsForTiming`
   * is called with `ctx.source` (not a `CardSource` built for `cardId`), so any closures inside
   * the target module read the CALLER's identity — "runs under the using card's control", not
   * the used card's own. Bypasses each effect's `canActivate`/cost gate: the caller has already
   * committed to using the card. Returns false when nothing was found to run.
   */
  const resolveCardEffect = async (ctx: EffectContext, cardId: string, timing: EffectTiming): Promise<boolean> => {
    const targetModule = getEffectModule(cardId);
    if (targetModule === undefined) return false;
    const effects = targetModule.effectsForTiming(timing, ctx.source);
    for (const effect of effects) await effect.resolve(ctx);
    return effects.length > 0;
  };

  /**
   * A used Option's [Main], announced the way a hand play announces it (playCard's effect
   * stack): the client reads the clause off the docked card before its result lands.
   */
  const resolveAnnouncedOptionEffect = async (ctx: EffectContext, cardId: string): Promise<void> => {
    const targetModule = getEffectModule(cardId);
    if (targetModule === undefined) return;
    for (const effect of targetModule.effectsForTiming(EffectTiming.OnUseOption, ctx.source)) {
      const announced = {
        seat: ctx.source.ownerSeat,
        sourceCardId: ctx.source.cardId,
        sourceInstanceId: ctx.source.instanceId,
        effectKey: effect.effectKey,
        description: effect.description,
        timing: EffectTiming[EffectTiming.OnUseOption],
      };
      const outerEffectKey = ctx.activeEffectKey;
      ctx.activeEffectKey = effect.effectKey;
      const presentation = observeEffectActivation(ctx, effect.activationDeferred === true, () => {
        engine.emit({ kind: "effectTriggered", ...announced, printedTiming: "Main" });
      });
      ctx.fx.enterEffectResolution?.(ctx.source.ownerSeat, [CardKind.Option]);
      try {
        await effect.resolve(ctx);
      } finally {
        ctx.fx.leaveEffectResolution?.();
        presentation.restore();
        ctx.activeEffectKey = outerEffectKey;
        if (presentation.accepted()) engine.emit({ kind: "effectResolved", ...announced });
      }
    }
  };

  /**
   * "Use 1 Option card from your hand" (BT19-040 and 11 other callers). Resolves the used card's
   * [Main]/`OnUseOption` effect via `resolveCardEffect` under the CALLING card's control, then
   * trashes the Option (Options resolve then go to trash — they are not permanents) and fires
   * whenOptionUsed (BT19-040 token watcher). Returns the trashed instances. The fire lives here,
   * beside the trash, because only this layer reaches engine.fireSubTrigger (mirrors
   * trashDigivolutionCards). The cardId is read from the hand BEFORE trashing removes it.
   */
  const useOptionFromHand = async (
    ctx: EffectContext,
    usedInstanceId: string,
    usedOptionCost?: number,
    opts?: { payCost?: boolean; costDelta?: number; paymentHandled?: boolean },
  ): Promise<CardInstance[]> => {
    // `peekLooseInstance` (not `locateInHand`): callers may use an Option from a hand, stack,
    // link list, or (for shared engine verbs) trash. Before resolving, claim the exact physical
    // card into PlayerState.resolvingOption. §9-1-4 says a used Option is in NO area while its
    // first Main effect resolves; leaving it visible in a stack/trash lets that same instance be
    // selected again by PlaceUnder and creates duplicate identity (BT25-083 Q6396).
    const usedCard = peekLooseInstance(state, usedInstanceId);
    const usedOwner = usedCard === undefined ? undefined : state.players.find((p) => p.seat === usedCard.ownerSeat);
    const parentResolvingOption = usedOwner?.resolvingOption;
    // An Option's own "when you would use this card" reduction applies only while the card is
    // in hand. Capture that zone before removeLooseInstance and project it through the shared
    // GameAccess seam; Options used from trash, deck, or a digivolution stack keep the caller's
    // supplied use cost. Payment-only reductions are intentionally excluded from this snapshot.
    const usedOriginZone = usedCard === undefined ? undefined : looseZoneOfInstance(state, usedInstanceId);
    const projectedHandUseCost =
      usedOriginZone === "hand" ? engine.effectiveLooseUseCost?.(usedInstanceId, ctx.source.ownerSeat) : undefined;
    const notifiedUseCost = projectedHandUseCost ?? usedOptionCost;
    let resolvingCard: CardInstance | undefined;
    let wasUnderCard = false;
    let resolutionError: unknown;
    let activateOptionUsed: (() => Promise<void>) | undefined;
    let usedDefinition: CardDefinition | undefined;
    if (usedCard !== undefined && usedOwner !== undefined) {
      if (parentResolvingOption?.instanceId === usedInstanceId) {
        return [];
      }
      try {
        usedDefinition = requireCardDefinition(usedCard.cardId);
      } catch {
        // Unit-test and extension modules may register an effect-only card without card data.
      }
      if (opts?.payCost && usedDefinition !== undefined && opts.paymentHandled !== true) {
        const cost = await effectDrivenPlayCost(
          usedInstanceId,
          usedDefinition,
          ctx.source.ownerSeat,
          opts.costDelta,
          true,
          undefined,
          looseZoneOfInstance(state, usedInstanceId),
        );
        // A borrowed Option is used by the resolving effect's controller, not by the card's
        // owner (which may differ for a card captured under a Digimon's stack/link list).
        // Pending effects still resolve after memory crosses to the opponent's side.
        if (engine.memory.maxCostFor(ctx.source.ownerSeat) < cost) return [];
        if (cost > 0) engine.memory.pay(ctx.source.ownerSeat, cost, "useOption");
      }
      wasUnderCard =
        hostOfStackInstance(state, usedInstanceId) !== undefined ||
        hostOfLinkedInstance(state, usedInstanceId) !== undefined;
      resolvingCard = removeLooseInstance(state, usedInstanceId, true);
      if (resolvingCard === undefined) return [];
      setResolvingOption(usedOwner, resolvingCard);
      // This is the authoritative commit point: legality and payment passed, and the exact
      // physical Option has left its source zone for the no-area resolving slot. Callers use
      // this receipt for `ifThisEffectUsed`; a mere candidate selection is not a successful use.
      ctx.lastOptionUsed = true;
      activateOptionUsed = engine.prepareOptionUsed?.(usedInstanceId, notifiedUseCost);
      // Announced like an Option used from hand (playCard), so the client docks the card
      // before its [Main] resolves instead of the board changing with nothing on screen.
      engine.emit({
        kind: "cardPlayed",
        instanceId: resolvingCard.instanceId,
        fromZone: usedOriginZone,
        seat: ctx.source.ownerSeat,
        cardId: resolvingCard.cardId,
        ...(resolvingCard.artId ? { artId: resolvingCard.artId } : {}),
      });
      // Using an Option opens its own effect identity even when a Digimon or Tamer
      // initiated the use. Source-kind immunity and modifiers must read the Option
      // frame; restore the caller before Arts Digivolve and subsequent actions.
      pc.fx.enterEffectResolution?.(ctx.source.ownerSeat, [CardKind.Option]);
      try {
        if (usedDefinition === undefined) {
          await resolveCardEffect(ctx, usedCard.cardId, EffectTiming.OnUseOption);
        } else {
          const optionDefinition = usedDefinition;
          const permanent = (): Permanent | undefined => {
            // While the Option is being resolved it is in the transient no-area slot, even when
            // it originated under a permanent. A later self-placement clears that slot and makes
            // the live lookup below visible again (§9-1-4/9-1-5; BT25-083 Q6396).
            if (state.players.some((owner) => owner.resolvingOption?.instanceId === usedInstanceId)) return undefined;
            for (const owner of state.players) {
              const found = owner.battleArea.find(
                (candidate) =>
                  candidate.topCard.instanceId === usedInstanceId ||
                  candidate.stack.some(({ instanceId }) => instanceId === usedInstanceId),
              );
              if (found !== undefined) return found;
              if (
                owner.breeding?.topCard.instanceId === usedInstanceId ||
                owner.breeding?.stack.some(({ instanceId }) => instanceId === usedInstanceId) === true
              ) {
                return owner.breeding;
              }
            }
            return undefined;
          };
          const optionCtx: EffectContext = {
            ...ctx,
            presetOptionalAnswer: undefined,
            pickingAcceptedOptional: false,
            // Using an Option starts that card's own effect, even when a Digimon
            // initiated the use. Do not carry the caller's effect category into it.
            effectSourceKinds: [CardKind.Option],
            activeTiming: "Main",
            activeEffectTextPart: undefined,
            activeEffectTextEmphasis: undefined,
            source: {
              instanceId: usedInstanceId,
              cardId: usedCard.cardId,
              // Keep the physical Option identity, but resolve its effect under the caller's
              // controller. This is the rules meaning of "use ... from this Digimon's sources".
              ownerSeat: ctx.source.ownerSeat,
              definition: usedDefinition,
              permanent,
              isOnBattleArea: () =>
                !state.players.some((owner) => owner.resolvingOption?.instanceId === usedInstanceId) &&
                state.players.some((owner) =>
                  owner.battleArea.some(
                    (candidate) =>
                      candidate.topCard.instanceId === usedInstanceId ||
                      candidate.stack.some(({ instanceId }) => instanceId === usedInstanceId),
                  ),
                ),
              isOnBreedingArea: () =>
                !state.players.some((owner) => owner.resolvingOption?.instanceId === usedInstanceId) &&
                state.players.some(
                  (owner) =>
                    owner.breeding?.topCard.instanceId === usedInstanceId ||
                    owner.breeding?.stack.some(({ instanceId }) => instanceId === usedInstanceId) === true,
                ),
              isInTrash: () =>
                state.players.some((owner) => owner.trash.some(({ instanceId }) => instanceId === usedInstanceId)),
              isInHand: () =>
                state.players.some((owner) => owner.hand.some(({ instanceId }) => instanceId === usedInstanceId)),
              isOwnersTurn: () => state.turnSeat === ctx.source.ownerSeat,
              hasColor: (color) => optionDefinition.colors.includes(color),
            },
          };
          await resolveAnnouncedOptionEffect(optionCtx, usedCard.cardId);
        }
      } catch (error) {
        // Preserve the normal error surface, but finish the §9-1-4 routing first so a failed
        // Option effect cannot strand its identity outside every zone.
        resolutionError = error;
      } finally {
        pc.fx.leaveEffectResolution?.();
      }
    }
    // An Option that moved itself into a real area while resolving (e.g. an Option-permanent
    // or a self-placement effect) claimed the transient slot through removeLooseInstance and
    // must not be trashed. Otherwise route the exact transient identity to trash once, including
    // when its effect throws. This also keeps ordinary stack/link uses atomic.
    let moved: CardInstance[] = [];
    if (
      resolutionError === undefined &&
      resolvingCard !== undefined &&
      usedOwner?.resolvingOption === resolvingCard &&
      usedDefinition?.isDualCard &&
      !state.gameOver
    ) {
      try {
        await engine.artsDigivolve?.(ctx.source.ownerSeat, resolvingCard, usedDefinition);
      } catch (error) {
        resolutionError = error;
      }
    }
    if (resolvingCard !== undefined && usedOwner?.resolvingOption === resolvingCard) {
      setResolvingOption(usedOwner, undefined);
      insertCard(player(resolvingCard.ownerSeat), Zone.Trash, resolvingCard);
      moved = [resolvingCard];
      engine.emit({
        kind: "cardsMoved",
        instanceIds: [resolvingCard.instanceId],
        from: CardMovePosition.RESOLVING_OPTION.value,
        fromSeat: usedOwner.seat,
        to: Zone.Trash,
        optionUsed: true,
      });
      if (wasUnderCard) applyOverflow(engine.memory, [resolvingCard], state.turnSeat);
    }
    if (parentResolvingOption !== undefined && usedOwner !== undefined) {
      setResolvingOption(usedOwner, parentResolvingOption);
    }
    if (activateOptionUsed !== undefined) await activateOptionUsed();
    else await fireOptionUsed(usedInstanceId, notifiedUseCost);
    if (resolutionError !== undefined) throw resolutionError;
    return moved;
  };

  /**
   * Trash `n` security cards of `seat` (source TrashSecurityAndProcessAccordingToResult,
   * with `fromTop`). Default takes from the bottom (the source default trashes from
   * the bottom of the stack); `fromTop` takes from index 0. Returns the trashed
   * instances (the caller branches on the result, e.g. trigger an effect per trashed
   * card). Emits securityChecked-free cardsMoved (trashing security via an effect is
   * not a security CHECK).
   */

  return { fireOptionUsed, fireOnDiscardLibrary, fireWhenTrashedFromDeck, resolveCardEffect, useOptionFromHand };
}
