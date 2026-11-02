import type { Filter } from "@aegis/shared";
import type { EffectContext } from "../../EffectContext.js";
import { permanentMatchesFilter } from "../matching/permanent.js";

export function stackHostMatches(
  ctx: EffectContext,
  hostFilter: Filter["hostFilter"],
  hostPermanentId: string | undefined,
): boolean {
  if (hostFilter === undefined || hostPermanentId === undefined) return true;
  if (hostFilter.sourceRef === "triggerSubject") {
    const triggerSubjectId =
      ctx.trigger.subjectPermanentId ?? ctx.trigger.attackerPermanentId ?? ctx.trigger.deletedPermanentId;
    return hostPermanentId === triggerSubjectId;
  }
  if (hostFilter.isSelfRef === true) {
    return ctx.source.permanent()?.permanentId === hostPermanentId;
  }
  const boundRef = (hostFilter as { boundRef?: string }).boundRef;
  if (boundRef !== undefined) {
    return ctx.selections?.get(boundRef) === hostPermanentId;
  }
  const host = ctx.game.permanentById(hostPermanentId);
  return host === undefined || permanentMatchesFilter(ctx, host, hostFilter, ctx.source);
}
