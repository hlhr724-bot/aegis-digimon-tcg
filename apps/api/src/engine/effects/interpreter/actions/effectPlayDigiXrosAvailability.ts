import { digiXrosRequirementFor, effectiveExactNames, type ZoneRef } from "@aegis/shared";
import { materialsSatisfyRecipe } from "../../../actions/digiXros.js";
import { digiXrosZoneExpanderActiveOnTurn, digiXrosZoneExpanderFor } from "../../../digiXros/zoneExpanders.js";
import type { EffectContext } from "../../EffectContext.js";
import { looseCardsInZone, type LooseCandidate } from "../targeting/loose.js";

/** Read-only upper bound from material assignments the effect-play picker can actually offer. */
export function availableEffectPlayDigiXrosReduction(
  ctx: EffectContext,
  playedCard: LooseCandidate,
  options: {
    allowsTrash?: boolean;
    ruleTrashMaterials?: readonly LooseCandidate[];
    reservedInstanceIds?: readonly string[];
  } = {},
): number {
  const requirement = digiXrosRequirementFor(playedCard.cardId)?.[0];
  if (requirement === undefined) return 0;
  const seat = playedCard.ownerSeat;
  const player = ctx.game.player(seat);
  const playedDefinition = ctx.game.definitionOf({ cardId: playedCard.cardId });
  const expanders = Array.from(player.battleArea).flatMap((permanent) => {
    if (permanent.isSuspended || permanent.topCard === undefined) return [];
    if (ctx.fx.canSuspend?.(permanent.permanentId, seat) === false) {
      return [];
    }
    const expander = digiXrosZoneExpanderFor(permanent.topCard.cardId);
    if (expander === undefined || !digiXrosZoneExpanderActiveOnTurn(expander, seat, ctx.game.state.turnSeat)) return [];
    return expander.appliesTo(playedDefinition) ? [expander] : [];
  });
  const zones = new Set(ctx.fx.digiXrosExpandedZones?.(seat, playedCard.instanceId) ?? []);
  const counts = ctx.fx.digiXrosExpandedZoneCounts?.(seat, playedCard.instanceId);
  const underZones: ZoneRef[] = ["underTamers", "underMyTamers", "underTamer", "digivolutionCards"];
  const ledgerUnder =
    counts === undefined
      ? underZones.some((zone) => zones.has(zone))
        ? 1
        : 0
      : underZones.reduce((sum, zone) => sum + (counts[zone] ?? 0), 0);
  const ledgerTrash = counts === undefined ? (zones.has("trash") ? 1 : 0) : (counts.trash ?? 0);
  const underQuota = ledgerUnder + expanders.reduce((sum, expander) => sum + expander.underTamerMax, 0);
  const trashQuota = options.allowsTrash
    ? Infinity
    : ledgerTrash + expanders.reduce((sum, expander) => sum + expander.trashMax, 0);
  const singleHost =
    ledgerUnder === 0 &&
    expanders.some((expander) => expander.underTamerMax > 0) &&
    expanders
      .filter((expander) => expander.underTamerMax > 0)
      .every((expander) => expander.underTamerHostScope === "single");
  const ordinary = [
    ...looseCardsInZone(ctx, seat, "hand"),
    ...Array.from(player.battleArea).flatMap((permanent) =>
      permanent.inBreeding || permanent.topCard === undefined
        ? []
        : [
            {
              instanceId: permanent.topCard.instanceId,
              cardId: permanent.topCard.cardId,
              ownerSeat: seat,
            },
          ],
    ),
  ];
  const under = underQuota > 0 ? looseCardsInZone(ctx, seat, "underTamers") : [];
  const trash = trashQuota > 0 ? [...looseCardsInZone(ctx, seat, "trash"), ...(options.ruleTrashMaterials ?? [])] : [];
  const hosts = singleHost ? [...new Set(under.map((card) => card.hostPermanentId))] : [undefined];
  const cap =
    requirement.maxMaterials ??
    (requirement.materials.length === 1 ? ordinary.length + under.length + trash.length : requirement.materials.length);
  let maximum = 0;
  for (const host of hosts.length === 0 ? [undefined] : hosts) {
    const groups = [ordinary, singleHost ? under.filter((card) => card.hostPermanentId === host) : under, trash].map(
      (cards) =>
        cards.filter(
          (card) =>
            card.instanceId !== playedCard.instanceId && !options.reservedInstanceIds?.includes(card.instanceId),
        ),
    );
    // Maximum flow: zone quotas -> physical cards -> distinct recipe slots. A repeated
    // single-slot recipe has capacity `cap`; named multi-slot recipes allow one per slot.
    // This avoids counting duplicate names or the played card as its own material.
    const candidates = groups.flatMap((cards, group) => cards.map((card) => ({ card, group })));
    const repeatedSlot = requirement.materials.length === 1 ? requirement.materials[0] : undefined;
    const identitiesOf = (card: LooseCandidate): string[] | undefined => {
      if (repeatedSlot?.differentCardNumbers === true) return [card.cardId];
      if (repeatedSlot?.differentNames === true)
        return effectiveExactNames(ctx.game.definitionOf({ cardId: card.cardId })).map((name) => name.toLowerCase());
      return undefined;
    };
    const identities = [...new Set(candidates.flatMap(({ card }) => identitiesOf(card) ?? []))];
    const identityStart = 4 + candidates.length;
    const slotStart = identityStart + identities.length;
    const sink = slotStart + requirement.materials.length;
    const edges = Array.from({ length: sink + 1 }, () => new Map<number, number>());
    function edge(from: number, to: number, capacity: number): void {
      edges[from]!.set(to, capacity);
      edges[to]!.set(from, 0);
    }
    [cap, underQuota, trashQuota].forEach((quota, group) => edge(0, group + 1, Math.min(cap, quota)));
    candidates.forEach(({ card, group }, index) => {
      const node = 4 + index;
      edge(group + 1, node, 1);
      const definition = ctx.game.definitionOf({ cardId: card.cardId });
      requirement.materials.forEach((slot, slotIndex) => {
        if (!materialsSatisfyRecipe([definition], [slot])) return;
        const cardIdentities = identitiesOf(card);
        if (cardIdentities === undefined) {
          edge(node, slotStart + slotIndex, 1);
          return;
        }
        for (const identity of cardIdentities) edge(node, identityStart + identities.indexOf(identity), 1);
      });
    });
    identities.forEach((_identity, index) => edge(identityStart + index, slotStart, 1));
    requirement.materials.forEach((_slot, index) =>
      edge(slotStart + index, sink, requirement.materials.length === 1 ? cap : 1),
    );
    let matched = 0;
    while (matched < cap) {
      const parents = new Map<number, number>([[0, -1]]);
      const queue = [0];
      for (let index = 0; index < queue.length && !parents.has(sink); index += 1) {
        const node = queue[index]!;
        for (const [next, capacity] of edges[node]!) {
          if (capacity <= 0 || parents.has(next)) continue;
          parents.set(next, node);
          queue.push(next);
        }
      }
      if (!parents.has(sink)) break;
      for (let node = sink; node !== 0;) {
        const previous = parents.get(node)!;
        edges[previous]!.set(node, edges[previous]!.get(node)! - 1);
        edges[node]!.set(previous, edges[node]!.get(previous)! + 1);
        node = previous;
      }
      matched += 1;
    }
    maximum = Math.max(maximum, matched);
  }
  return maximum * (requirement.count === "∞" ? (requirement.costReduction ?? 1) : requirement.count);
}
