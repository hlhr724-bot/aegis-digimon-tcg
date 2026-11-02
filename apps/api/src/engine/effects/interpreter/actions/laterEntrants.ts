// Timed "all of ... Digimon" grants that also reach permanents entering after resolution.

import type { EffectDurationRef, Filter, Seat } from "@aegis/shared";
import type { EffectContext } from "../../EffectContext.js";
import { permanentMatchesFilter } from "../matching/permanent.js";

/** The seat whose turn end closes a printed duration, framed from the resolving effect. */
function turnEndSeatOf(ctx: EffectContext, duration: EffectDurationRef | undefined): Seat | undefined {
  switch (duration) {
    case "forTheTurn":
      return ctx.game.state.turnSeat;
    case "untilYourTurnEnd":
      return ctx.source.ownerSeat;
    case "untilOpponentTurnEnd":
    case "endOfOpponentTurn":
      return ctx.game.opponentOf(ctx.source.ownerSeat);
    default:
      return undefined;
  }
}

/**
 * Overall processing that is continuous also affects targets added later (Comprehensive Rules
 * 15-11-2-2). Apply `grant` to each permanent that enters matching `filter` before the
 * duration ends, once per permanent; `alreadyGranted` holds the ids the resolution covered.
 */
export function subscribeLaterEntrants(
  ctx: EffectContext,
  options: {
    filter: Filter;
    duration: EffectDurationRef | undefined;
    label: string;
    printedClause?: string;
    alreadyGranted: Iterable<string>;
    grant: (permanentId: string) => void | Promise<void>;
  },
): void {
  const granted = new Set(options.alreadyGranted);
  const expiresOnTurnEndOf = turnEndSeatOf(ctx, options.duration);
  ctx.fx.subscribeSubTrigger({
    event: "onEnterFieldAnyone",
    activationContext: ctx,
    once: false,
    appliesOnEntry: true,
    // A triggered, duration-scoped watcher: keep it out of the continuous tier even when a
    // concurrent recompute makes the ambient continuous flag look set.
    continuous: false,
    ...(expiresOnTurnEndOf === undefined ? {} : { expiresOnTurnEndOf }),
    description: `${options.label} later entrant from ${ctx.source.cardId}`,
    ...(options.printedClause === undefined ? {} : { printedClause: options.printedClause }),
    matches: (subCtx) => {
      const id = subCtx.trigger.subjectPermanentId;
      const permanent = id === undefined ? undefined : subCtx.game.permanentById(id);
      return permanent !== undefined && permanentMatchesFilter(subCtx, permanent, options.filter, subCtx.source);
    },
    run: async (subCtx) => {
      const id = subCtx.trigger.subjectPermanentId;
      if (id === undefined || granted.has(id) || subCtx.game.permanentById(id) === undefined) return;
      granted.add(id);
      await options.grant(id);
    },
  });
}
