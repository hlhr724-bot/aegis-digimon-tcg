import type { EffectContext } from "../../EffectContext.js";
import { seatsForController } from "../matching/permanent.js";
import { knownCards, orderForStackEnd } from "../placeAtChosenStackEnd.js";
import { candidateLooseInstances, looseCardsInZone, pickLoose } from "../targeting/loose.js";
import { resolvePermanentTargets } from "../targeting/permanents.js";
import { isSelfFromFieldPlaceCost, selfFromFieldPlaceHosts } from "./candidates.js";
import { relocateByEffect } from "./relocate.js";
import { payRoutedPlaceCost } from "./placeRouted.js";
import { payPlaceOwnTopAtStackBottomCost, rotatesChosenStack, selfRestackHost } from "./stacks.js";
import { CardKind } from "@aegis/shared";
import type { Cost, Filter, Target, ZoneRef } from "@aegis/shared";

/**
 * Pay a `place` cost: put cards under a permanent, or route them elsewhere.
 */
export async function payPlaceCost(ctx: EffectContext, cost: Cost, out?: { paidCount: number }): Promise<boolean> {
  // "By placing the top card of your deck as this Digimon's bottom digivolution card":
  // the deck top is deterministic, so it needs no selection and precedes every branch
  // below. The attacker (not the source) is the host while an attack is in flight.
  if (cost.destination === "digivolutionStack" && cost.target?.from?.includes("deck")) {
    const host =
      ctx.trigger.attackerPermanentId !== undefined
        ? ctx.game.permanentById(ctx.trigger.attackerPermanentId)
        : ctx.source.permanent();
    if (host === undefined || ctx.game.player(ctx.source.ownerSeat).deck.length === 0) return false;
    const placed = await ctx.fx.placeUnderFromDeck(host.permanentId, ctx.source.ownerSeat);
    if (placed !== undefined && out) out.paidCount = 1;
    return placed !== undefined;
  }
  // BT22-043/044 self-restack: "By placing this [CS] Digimon's top stacked card as its
  // bottom digivolution card" rotates the SOURCE permanent's OWN top card to the bottom of
  if (cost.raw && /bottom digivolution card/i.test(cost.raw) && /\btop\s+(?:stacked\s+)?card/i.test(cost.raw)) {
    // P-225 "the top stacked card of any of your [CS] Digimon" names no "this": rotate a chosen Digimon.
    if (rotatesChosenStack(cost)) return payPlaceOwnTopAtStackBottomCost(ctx, cost, out);
    const selfPerm = selfRestackHost(ctx, cost);
    if (selfPerm === undefined) return false;
    const rotated = await ctx.fx.placeOwnTopAtStackBottom(selfPerm.permanentId);
    if (rotated && out) out.paidCount = 1;
    return rotated;
  }
  // "By placing this card from the battle area face down under any of your [X] trait Tamers"
  // (ST23-15, ST24-15): the source permanent itself moves under the chosen host, face down and
  // at the bottom of the cards already there (KB Q6232 / Q6194). It keeps no cards of its own —
  // a placed Option permanent has none — so the ordinary shedding relocation applies.
  if (isSelfFromFieldPlaceCost(cost)) {
    const self = ctx.source.permanent();
    const hosts = selfFromFieldPlaceHosts(ctx, cost);
    if (self === undefined || hosts.length === 0) return false;
    const hostIds = hosts.map((permanent) => permanent.permanentId);
    const hostId =
      hostIds.length === 1
        ? hostIds[0]!
        : (await ctx.ask.chooseTargets(ctx, { candidates: hostIds, min: 1, max: 1 }))[0];
    if (hostId === undefined) return false;
    const relocated = await relocateByEffect(ctx, hostId, self.permanentId, {
      belowTop: false,
      faceUp: cost.faceDown !== true,
    });
    if (relocated) {
      ctx.lastPlacedUnderInstanceIds = [ctx.source.instanceId];
      if (out) out.paidCount = 1;
    }
    return relocated;
  }
  const routed = await payRoutedPlaceCost(ctx, cost, out);
  if (routed !== undefined) return routed;
  // "By placing N card(s) from your hand as this Digimon's bottom digivolution
  // card(s)" (EX9-037/EX9-038, EX11-018). Source zones come from cost.target.from
  // (emitted by the compiler); absent, defaults to hand. Destination comes from
  // cost.underFilter when set ("under one of your Tamers"); absent, uses the source
  // permanent itself. Exotic variants (BT24-040, BT9-044, BT23-073) still lack a
  // derivable destination when neither underFilter nor a battle-area source exists.
  const self =
    ctx.source.permanent() ??
    (ctx.trigger.attackerPermanentId !== undefined
      ? ctx.game.permanentById(ctx.trigger.attackerPermanentId)
      : undefined);
  if (!cost.target) return false;
  const zones: ZoneRef[] = (cost.target.from?.length ?? 0) > 0 ? (cost.target.from as ZoneRef[]) : ["hand"];
  const candidates = candidateLooseInstances(ctx, cost.target, zones);
  const visibleSourceIds = zones.every((zone) => zone === "hand" || zone === "trash")
    ? seatsForController(ctx, cost.target.filter).flatMap((seat) =>
        zones
          .filter((zone) => zone === "trash" || seat === ctx.source.ownerSeat)
          .flatMap((zone) => looseCardsInZone(ctx, seat, zone).map((candidate) => candidate.instanceId)),
      )
    : undefined;
  const want = cost.target.count === "all" ? candidates.length : (cost.target.count ?? 1);
  if (want <= 0 || candidates.length < want) return false;
  const chosen = await pickLoose(
    ctx,
    { ...cost.target, count: want },
    candidates,
    undefined,
    ctx.ask,
    visibleSourceIds,
  );
  if (chosen.length < want) return false;
  let hostId: string | undefined;
  // Older compiled records place the destination selector on the cost target,
  // while newer hand-authored IR uses the cost-level field. Both encode the
  // same printed "under this Digimon or one of your Tamers" destination.
  const underFilter = cost.underFilter ?? (cost.target as Target & { underFilter?: Filter }).underFilter;
  if (underFilter) {
    const destTarget: Target = { filter: underFilter, count: 1 };
    const destIds = await resolvePermanentTargets(ctx, destTarget);
    if (destIds.length === 0) return false;
    hostId =
      destIds.length === 1
        ? destIds[0]
        : (await ctx.ask.chooseTargets(ctx, { candidates: destIds, min: 1, max: 1 }))[0];
  } else {
    const inBattleArea =
      self !== undefined &&
      Array.from(ctx.game.player(ctx.source.ownerSeat).battleArea).some((p) => p.permanentId === self.permanentId);
    if (cost.raw && /as 1 of your Digimon's/i.test(cost.raw)) {
      const destIds = ctx.game
        .player(ctx.source.ownerSeat)
        .battleArea.filter((permanent) => ctx.game.definitionOf(permanent.topCard).kinds.includes(CardKind.Digimon))
        .map((permanent) => permanent.permanentId);
      if (destIds.length === 0) return false;
      hostId =
        destIds.length === 1
          ? destIds[0]
          : (await ctx.ask.chooseTargets(ctx, { candidates: destIds, min: 1, max: 1 }))[0];
    } else {
      if (self === undefined || !inBattleArea) return false;
      hostId = self.permanentId;
    }
  }
  if (hostId === undefined) return false;
  const orderedChosen = await orderForStackEnd(
    ctx,
    chosen,
    knownCards(
      ctx,
      candidates.filter(({ instanceId }) => chosen.includes(instanceId)),
    ),
    false,
  );
  await ctx.fx.placeUnder(hostId, [...orderedChosen].reverse(), {
    belowTop: false,
    faceUp: cost.faceDown !== true,
  });
  ctx.lastPlacedUnderInstanceIds = [...orderedChosen];
  if (cost.storeAs !== undefined && chosen.length > 0) {
    const pickedCard = candidates.find((c) => c.instanceId === chosen[0]);
    const level = pickedCard !== undefined ? ctx.game.definitionOf(pickedCard as never).level : undefined;
    if (level !== undefined && level > 0) {
      if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
      ctx.namedCounts.set(cost.storeAs, level);
    }
  }
  if (out) out.paidCount = chosen.length;
  return true;
}
