import {
  CardKind,
  EffectTiming,
  Permanent,
  PlayerState,
  type CardColor,
  type CardInstance,
  type Seat,
} from "@aegis/shared";
import { cardHasTrait, lookupDefinition } from "../../cards/cardData.js";
import { effectsOf } from "../../effects/collect.js";
import { potentialWouldBePlayedSelfReduction, wouldBePlayedSelfReducersFor } from "../../effects/interpreter.js";
import type { CardSource } from "../../effects/CardSource.js";
import type { Effect } from "../../effects/Effect.js";
import type { EffectContext } from "../../effects/EffectContext.js";
import { findLooseInstance } from "../intents.js";
import type { GameEngine } from "../../GameEngine.js";
import { buildEffectContext, cardSourceOf } from "../effectContext.js";
import { setTopCard } from "../../state/access.js";

/** A detached payment target must never reparent the live card out of its hand schema. */
export function pendingPlayTarget(instance: CardInstance, source: CardSource): Permanent {
  const target = new Permanent();
  target.permanentId = `pending-play-${instance.instanceId}`;
  target.controllerSeat = source.ownerSeat;
  const enteringCard = instance.clone();
  enteringCard.faceUp = true;
  setTopCard(target, enteringCard);
  target.inBreeding = false;
  target.baseDP = source.definition.dp ?? 0;
  target.currentDP = target.baseDP;
  return target;
}

/**
 * Read-only hand-use-cost projection for card filters such as LM-023's Q5516 clause.
 * It mirrors only automatic card-local would-be-played reducers; paid/optional reducers remain
 * unknown until the actual payment window and must not be assumed or consumed by targeting.
 */
export function projectLooseUseCost(engine: GameEngine, instanceId: string, controllerSeat: Seat): number | undefined {
  const instance = findLooseInstance(engine, instanceId);
  if (instance === undefined) return undefined;
  const source = cardSourceOf(engine, instance);
  const baseCost = engine.modifiers.playCostFor(
    { def: source.definition, controllerSeat },
    Math.max(0, source.definition.playCost),
  );
  if (
    !source.definition.kinds.includes(CardKind.Option) &&
    engine.continuous.blocksCostReduction(controllerSeat, "play")
  )
    return baseCost;
  const ctx: EffectContext = { ...buildEffectContext(engine, source, {}), selections: new Map() };
  const reduction = wouldBePlayedSelfReducersFor(instance.cardId).reduce(
    (total, reducer) => total + potentialWouldBePlayedSelfReduction(ctx, reducer),
    0,
  );
  return Math.max(0, baseCost - reduction);
}

/**
 * The cost a card has while it sits in its owner's hand: the printed cost minus only the self
 * reducers that apply continuously in hand. "When you would use this card" reductions change
 * only the cost paid, so exact-cost filters must not see them (KB BT2-099 Q1501).
 */
export function projectInHandCost(engine: GameEngine, instanceId: string, controllerSeat: Seat): number | undefined {
  const instance = findLooseInstance(engine, instanceId);
  if (instance === undefined) return undefined;
  const source = cardSourceOf(engine, instance);
  const printedCost = source.definition.playCost;
  const inHand = engine.state.players[controllerSeat]?.hand.some((card) => card.instanceId === instanceId) === true;
  if (
    !inHand ||
    printedCost < 0 ||
    (!source.definition.kinds.includes(CardKind.Option) &&
      engine.continuous.blocksCostReduction(controllerSeat, "play"))
  )
    return printedCost;
  const ctx: EffectContext = { ...buildEffectContext(engine, source, {}), selections: new Map() };
  const reduction = wouldBePlayedSelfReducersFor(instance.cardId)
    .filter((reducer) => reducer.whileInHand === true)
    .reduce((total, reducer) => total + potentialWouldBePlayedSelfReduction(ctx, reducer), 0);
  return Math.max(0, printedCost - reduction);
}

/** Battle-area effects that react while their controller would play/use another card. */
export function residentPlayCostEffects(engine: GameEngine, seat: Seat): Array<{ effect: Effect; source: CardSource }> {
  const player = engine.state.players[seat];
  if (player === undefined) return [];
  return Array.from(player.battleArea).flatMap((permanent) => {
    if (permanent.inBreeding || permanent.topCard === undefined) return [];
    return [permanent.topCard, ...permanent.stack].flatMap((card, index) => {
      const residentSource = cardSourceOf(engine, card);
      return (
        effectsOf(EffectTiming.BeforePayCost, residentSource)
          // Explicit BeforePayCost builders belong to the card being played, not a resident watcher.
          .filter((effect) => effect.costWindow === undefined)
          .filter((effect) => index === 0 || effect.isInherited)
          .map((effect) => ({ effect, source: residentSource }))
      );
    });
  });
}

/**
 * Battle-area permanents the playing seat controls that carry a VERIFIED cross-permanent play-cost
 * reducer matching the card being played. BT10-093 handles Lv.4+ [Bagra Army] Digimon; EX3-040
 * handles green Digimon by suspending the Parasaurmon carrying the effect.
 * These reducers live on a watcher, not the played card, so `wouldBePlayedSelfReducersFor` (keyed
 * on the played card's own id) does not cover them. The accepted card IDs are explicit because
 * generated cross-card Replacement IR can omit decisive source/subject identity.
 */
export function crossPermanentPlayReducerWatchers(
  engine: GameEngine,
  instance: CardInstance,
  seat: Seat,
  simultaneousPlayCount = 1,
): Permanent[] {
  const def = lookupDefinition(instance.cardId);
  if (def === undefined) return [];
  const isLv4PlusBagraArmy =
    def.kinds.includes(CardKind.Digimon) &&
    def.level !== undefined &&
    def.level >= 4 &&
    (cardHasTrait(def, "Bagra Army") || cardHasTrait(def, "BagraArmy"));
  const player = engine.state.players[seat];
  if (player === undefined) return [];
  const isBossOrTsDigimon =
    def.kinds.includes(CardKind.Digimon) && (cardHasTrait(def, "Boss") || cardHasTrait(def, "TS"));
  return player.battleArea.filter((perm) => {
    if (perm.inBreeding) return false;
    // "When you would play 1 ... Digimon card": not when 2 or more cards are played at once (Q2026).
    if (perm.topCard?.cardId === "BT10-093") return isLv4PlusBagraArmy && simultaneousPlayCount === 1;
    if (perm.topCard?.cardId === "BT26-088") {
      return (
        isBossOrTsDigimon &&
        !perm.isSuspended &&
        !engine.continuous.hasRestriction(perm.permanentId, "beSuspended") &&
        !engine.continuous.hasRestriction(perm.permanentId, "beAffected")
      );
    }
    return false;
  });
}

/**
 * Run each verified cross-permanent reducer. Decisions use the watcher's own context so the UI
 * attributes the printed clause to the permanent providing the reduction, not the card in hand.
 */
export async function runCrossPermanentPlayReducers(
  engine: GameEngine,
  instance: CardInstance,
  ctx: EffectContext,
  watchers: Permanent[],
): Promise<void> {
  if (watchers.length === 0) return;
  const seat = ctx.source.ownerSeat;
  const player = engine.state.players[seat];
  if (player === undefined) return;
  for (const watcher of watchers) {
    if (watcher.topCard?.cardId === "BT26-088") {
      const watcherSource = cardSourceOf(engine, watcher.topCard);
      const watcherCtx: EffectContext = {
        ...buildEffectContext(engine, watcherSource, {}),
        selections: new Map(),
        activeTiming: "YourTurn",
        activeEffectText:
          "[Your Turn] When a [Boss] or [TS] Digimon would be played, by suspending engine Tamer, reduce the cost.",
      };
      if (!(await watcherCtx.ask.optional(watcherCtx, "Suspend Hiroko Sagisaka to reduce engine play cost?"))) {
        continue;
      }
      const paid = watcherCtx.fx.payActivationCost?.(watcher.permanentId, "suspend") ?? false;
      if (!paid) continue;
      const hasDigimon = player.battleArea.some((permanent) => {
        if (permanent.inBreeding || permanent.topCard === undefined) return false;
        return lookupDefinition(permanent.topCard.cardId)?.kinds.includes(CardKind.Digimon) === true;
      });
      ctx.playCostDelta = (ctx.playCostDelta ?? 0) + (hasDigimon ? 1 : 2);
      continue;
    }
    const key = `crossPlayReducer:${watcher.permanentId}`;
    if (engine.tracker.count(key, "crossReducer") > 0) continue;
    const candidates = purpleDigimonUnderTamers(engine, player);
    if (candidates.length === 0) continue;
    const prompt =
      "BT10-093: place up to 3 purple Digimon from under your Tamers as digivolution cards to reduce the play cost by 2 each?";
    if (!(await ctx.ask.optional(ctx, prompt))) continue;
    engine.tracker.register(key, "crossReducer");
    const chosen = await ctx.ask.selectCards(ctx, { candidates, min: 0, max: 3 });
    if (chosen.length === 0) continue;
    ctx.playCostDelta = (ctx.playCostDelta ?? 0) + 2 * chosen.length;
    const pending = engine.pendingPlayReducerPlacements.get(instance.instanceId) ?? [];
    engine.pendingPlayReducerPlacements.set(instance.instanceId, [...pending, ...chosen]);
  }
}

/** InstanceIds of purple Digimon sitting in the digivolution stacks of the seat's Tamers. */
export function purpleDigimonUnderTamers(engine: GameEngine, player: PlayerState): string[] {
  const out: string[] = [];
  for (const perm of player.battleArea) {
    const topDef = perm.topCard ? lookupDefinition(perm.topCard.cardId) : undefined;
    if (topDef === undefined || !topDef.kinds.includes(CardKind.Tamer)) continue;
    for (const card of perm.stack) {
      const def = lookupDefinition(card.cardId);
      if (def === undefined) continue;
      if (def.kinds.includes(CardKind.Digimon) && def.colors.includes("Purple" as CardColor)) {
        out.push(card.instanceId);
      }
    }
  }
  return out;
}
