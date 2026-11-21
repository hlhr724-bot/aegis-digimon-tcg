import type { Permanent, Seat } from "@aegis/shared";
import type { ReplacementSubscriptionPrevent } from "#api/engine/effects/subtriggers";
import { KeywordReaction } from "#api/engine/effects/KeywordReaction";
import { buildKeywordReactionId } from "#api/engine/effects/buildKeywordReactionId";

type FragmentReactionSource = {
  sourceCardId: string;
  sourceInstanceId: string;
  sourcePermanentId: string;
};

type FragmentReactionDeps = {
  permanentById(id: string): Permanent | undefined;
  fragmentCount(id: string): number | undefined;
  select(
    seat: Seat,
    candidateInstanceIds: string[],
    bounds: { min: number; max: number; declinesCost: boolean },
    promptText: string,
    source: FragmentReactionSource,
  ): Promise<string[]>;
  trash(
    hostPermanentId: string,
    instanceIds: string[],
    provenance: { byEffectSeat: Seat; byEffectCardId: string },
  ): Promise<unknown>;
  announce(saved: Permanent): void;
};

export const FRAGMENT_EFFECT_TEXT =
  "＜Fragment＞: you may trash the specified number of this Digimon's digivolution cards to prevent its deletion.";

export function fragmentLeaveReplacements(
  permanentIds: readonly string[],
  deps: FragmentReactionDeps,
): ReplacementSubscriptionPrevent[] {
  return permanentIds.flatMap((id) => {
    const holder = deps.permanentById(id);
    const count = deps.fragmentCount(id);
    if (holder?.topCard === undefined || holder.inBreeding || count === undefined || holder.stack.length < count) {
      return [];
    }
    const holderInstanceId = holder.topCard.instanceId;
    const ownerSeat = holder.controllerSeat;
    return [
      {
        id: buildKeywordReactionId(KeywordReaction.FRAGMENT.value, id),
        event: "wouldBeDeleted" as const,
        mode: "prevent" as const,
        sourcePermanentId: id,
        sourceInstanceId: holderInstanceId,
        activationIdentity: KeywordReaction.FRAGMENT.value,
        description: FRAGMENT_EFFECT_TEXT,
        yieldsToEarlierPrevention: true,
        protects: (_ctx, leavingId) => leavingId === id,
        preventCheck: async (ctx) => {
          const live = deps.permanentById(id);
          const liveCount = deps.fragmentCount(id);
          if (live?.topCard?.instanceId !== holderInstanceId || liveCount === undefined) {
            return false;
          }
          if (live.stack.length < liveCount || ctx.presetOptionalAnswer === false) {
            return false;
          }
          const candidateInstanceIds = live.stack.map((card) => card.instanceId);
          const accepted = ctx.presetOptionalAnswer === true;
          const chosen =
            accepted && candidateInstanceIds.length === liveCount
              ? candidateInstanceIds
              : await deps.select(
                  ownerSeat,
                  candidateInstanceIds,
                  { min: liveCount, max: liveCount, declinesCost: !accepted },
                  accepted
                    ? `＜Fragment (${liveCount})＞: choose ${liveCount} of this Digimon's digivolution cards to trash.`
                    : `＜Fragment (${liveCount})＞: trash ${liveCount} of this Digimon's digivolution cards to prevent its deletion?`,
                  { sourceCardId: live.topCard.cardId, sourceInstanceId: holderInstanceId, sourcePermanentId: id },
                );
          if (chosen.length < liveCount) {
            return false;
          }
          await deps.trash(id, chosen, { byEffectSeat: ownerSeat, byEffectCardId: live.topCard.cardId });
          deps.announce(live);
          return true;
        },
      },
    ];
  });
}
