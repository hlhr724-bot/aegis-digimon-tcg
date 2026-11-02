import { locateMoveOrigins } from "#api/engine/effects/verbs/locateMoveOrigins";
import { groupCardsByOrigin } from "#api/engine/effects/verbs/groupCardsByOrigin";
import { Zone, CardInstance } from "@aegis/shared";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import { applyOverflow, insertCard, removeFromStackAt } from "../../state/access.js";
import type { Primitives } from "../EffectContext.js";

import type { PrimitivesContext } from "./context.js";

/**
 * Atomic digivolution-card trashes and the redirect that picks their hosts.
 */

export function createTrashStackVerbs(pc: PrimitivesContext) {
  const { engine, access, continuous, ledger, player, state } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const isRestricted: PrimitivesContext["helpers"]["isRestricted"] = (...args) => pc.helpers.isRestricted(...args);

  const trashDigivolutionCardsAtomic: Primitives["trashDigivolutionCardsAtomic"] = async (
    selections,
    exactCount,
    opts,
  ) => {
    if (exactCount < 1 || selections.length !== exactCount) return [];
    const uniqueIds = new Set(selections.map(({ instanceId }) => instanceId));
    if (uniqueIds.size !== exactCount) return [];

    const hostSnapshots = new Map<string, Permanent>();
    const validated: {
      hostPermanentId: string;
      card: CardInstance;
      wasTop: boolean;
      wasFaceDown: boolean;
    }[] = [];
    for (const { hostPermanentId, instanceId } of selections) {
      const host = access.permanentById(hostPermanentId);
      if (host === undefined || host.inBreeding || isRestricted(hostPermanentId, "beTrashed")) return [];
      if (
        !state.players[host.controllerSeat]?.battleArea.some((permanent) => permanent.permanentId === hostPermanentId)
      )
        return [];
      if (opts?.byEffectSeat !== undefined && continuous.stackTrashLocked(hostPermanentId)) {
        if (opts.byEffectSeat !== host.controllerSeat) return [];
      }
      if (continuous.stackCardTrashLocked(instanceId)) return [];
      const index = host.stack.findIndex((card) => card.instanceId === instanceId);
      if (index < 0) return [];
      if (!hostSnapshots.has(hostPermanentId)) {
        hostSnapshots.set(hostPermanentId, host.clone());
      }
      validated.push({
        hostPermanentId,
        card: host.stack[index]!,
        wasTop: index === host.stack.length - 1,
        wasFaceDown: !host.stack[index]!.faceUp,
      });
    }

    const origins = locateMoveOrigins({ state, instanceIds: validated.map(({ card }) => card.instanceId) });
    // Commit every move before publishing any event/trigger.
    for (const entry of validated) {
      const host = access.permanentById(entry.hostPermanentId)!;
      const index = host.stack.findIndex((card) => card.instanceId === entry.card.instanceId);
      removeFromStackAt(host, index);
      entry.card.faceUp = true;
      insertCard(player(entry.card.ownerSeat), Zone.Trash, entry.card);
      entry.card.trashOriginCardId = host.topCard.cardId;
    }
    const moved = validated.map(({ card }) => card);
    applyOverflow(engine.memory, moved, state.turnSeat);
    for (const { cards, ...origin } of groupCardsByOrigin({ origins, cards: moved })) {
      engine.emit({
        kind: "cardsMoved",
        instanceIds: cards.map((card) => card.instanceId),
        ...origin,
        to: Zone.Trash,
      });
    }
    if (engine.fireSubTrigger) {
      const byHost = new Map<string, typeof validated>();
      for (const entry of validated) {
        const entries = byHost.get(entry.hostPermanentId) ?? [];
        entries.push(entry);
        byHost.set(entry.hostPermanentId, entries);
      }
      for (const [hostPermanentId, entries] of byHost) {
        const ids = entries.map(({ card }) => card.instanceId);
        if (opts?.isDigiBurst === true) {
          await engine.fireSubTrigger("onDigiBurstCardDiscarded", {
            subjectPermanentId: hostPermanentId,
            trashedDigivolutionHost: hostSnapshots.get(hostPermanentId),
            trashedDigivolutionInstanceIds: ids,
            ...(opts.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
            ...(opts.byEffectCardId !== undefined ? { byEffectCardId: opts.byEffectCardId } : {}),
            isDigiBurstTrash: true,
          });
        }
        await engine.fireSubTrigger("onDigivolutionCardsDiscardedBatch", {
          subjectPermanentId: hostPermanentId,
          trashedDigivolutionHost: hostSnapshots.get(hostPermanentId),
          trashedDigivolutionInstanceIds: ids,
          trashedFaceDownDigivolutionInstanceIds: entries
            .filter(({ wasFaceDown }) => wasFaceDown)
            .map(({ card }) => card.instanceId),
          ...(opts?.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
          ...(opts?.byEffectCardId !== undefined ? { byEffectCardId: opts.byEffectCardId } : {}),
          ...(opts?.isDigiBurst === true ? { isDigiBurstTrash: true } : {}),
        });
        for (const entry of entries) {
          await engine.fireSubTrigger("onDigivolutionCardDiscarded", {
            subjectPermanentId: hostPermanentId,
            trashedDigivolutionHost: hostSnapshots.get(hostPermanentId),
            trashedDigivolutionInstanceId: entry.card.instanceId,
            ...(opts?.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
            ...(opts?.byEffectCardId !== undefined ? { byEffectCardId: opts.byEffectCardId } : {}),
            ...(opts?.isDigiBurst === true ? { isDigiBurstTrash: true } : {}),
          });
        }
        await engine.fireSubTrigger("whenDigivolutionTrashed", {
          subjectPermanentId: hostPermanentId,
          trashedDigivolutionCardWasTop: entries.some(({ wasTop }) => wasTop),
          ...(opts?.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
        });
      }
    }
    ledger.dropSourceInstances(
      state,
      moved.map((card) => card.instanceId),
    );
    return moved;
  };

  /**
   * Consult active digivolution-card-trash "redirect" replacements (BT10-084 Tactimon; KB
   * Q2002-Q2008) for a trash operation about to target `hostPermanentIds`. Called by every
   * effect-driven digivolution-card-trash site BEFORE it selects which cards to take, so the
   * SAME top/bottom/choose/amount logic that would have run against the original host(s)
   * re-runs, unchanged, against the redirected host — see `Primitives.redirectDigivolutionTrashHosts`'s
   * doc comment. Default-safe (returns the input unchanged) when the engine port doesn't wire
   * `consultDigivolutionTrashRedirect` (test fakes).
   */
  const redirectDigivolutionTrashHosts = async (hostPermanentIds: string[]): Promise<string[]> => {
    if (!engine.consultDigivolutionTrashRedirect) return hostPermanentIds;
    const redirected = await engine.consultDigivolutionTrashRedirect(hostPermanentIds);
    return redirected === undefined ? hostPermanentIds : [redirected];
  };

  /**
   * Fire whenOptionUsed (BT19-040 token watcher). The 08-06 use-option-without-cost verb calls
   * this at its produce site; defined in 08-01 so the watcher substrate exists. Carries the used
   * Option instance as the subject permanent ref for a watcher's gate.
   */

  return { trashDigivolutionCardsAtomic, redirectDigivolutionTrashHosts };
}
