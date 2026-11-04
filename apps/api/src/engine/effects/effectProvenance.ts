import { CardKind } from "@aegis/shared";
import type { EffectContext } from "./EffectContext.js";

/**
 * The card kinds an effect counts as while it resolves. A linked card's clause is an
 * effect of its host Digimon, even when the linked card is an Option (BT25-100/101,
 * KB Q6471/Q6476). An effect from a digivolution card takes only the kinds of the
 * permanent that has it, whatever the card's own category (CR 15-3-2). A top card's
 * effect keeps its printed kinds and also takes the permanent's effective kinds, so a
 * Tamer treated as a Digimon activates effects that are both Tamer and Digimon effects
 * (CR 15-12-1-6, KB Q5980, Q5999, Q6008, Q6104).
 */
export function effectProvenanceKinds(ctx: EffectContext, opts: { isLinked?: boolean } = {}): string[] {
  if (opts.isLinked === true) return [CardKind.Digimon];
  const printedKinds: readonly string[] = ctx.source?.definition?.kinds ?? [];
  const host = ctx.source?.permanent?.();
  const effectiveHostKinds = host === undefined ? undefined : ctx.game?.effectiveKinds?.(host.permanentId);
  const hostIsDual = host?.topCard !== undefined && ctx.game?.definitionOf?.(host.topCard).isDualCard === true;
  // On the field a DUAL host is a Digimon, including for its inherited effects.
  const hostKinds = hostIsDual ? effectiveHostKinds?.filter((kind) => kind !== CardKind.Option) : effectiveHostKinds;
  if (host !== undefined && hostKinds !== undefined && host.topCard?.instanceId !== ctx.source.instanceId) {
    return [...hostKinds];
  }
  // DUAL faces have separate effect identities (manual: Dual card rules).
  // The catalog lists both kinds so either face can be referenced; that union
  // must not make an Option's [Main] count as an opponent's Digimon effect.
  if (ctx.source?.definition?.isDualCard) {
    if (ctx.activeTiming === "Main" || isBeingUsedAsOption(ctx)) return [CardKind.Option];
    return [...new Set([CardKind.Digimon, ...(hostKinds ?? [])])];
  }
  if (host === undefined || hostKinds === undefined) return [...printedKinds];
  return [...new Set([...printedKinds, ...hostKinds])];
}

function isBeingUsedAsOption(ctx: EffectContext): boolean {
  return ctx.trigger?.wouldBePlayedAsOption === true && ctx.trigger.wouldBePlayedInstanceId === ctx.source.instanceId;
}
