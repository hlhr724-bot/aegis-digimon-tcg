import type { Permanent, Seat } from "@aegis/shared";
import type { ReplacementSubscriptionPrevent } from "#api/engine/effects/subtriggers";
import type { EffectContext } from "#api/engine/effects/EffectContext";
import type { DecoySource } from "#api/engine/effects/listDecoySources";
import { KeywordReaction } from "#api/engine/effects/KeywordReaction";
import { buildKeywordReactionId } from "#api/engine/effects/buildKeywordReactionId";

type DecoyReactionDeps = {
  permanentById(id: string): Permanent | undefined;
  isBattleAreaDigimon(permanent: Permanent): boolean;
  hasDecoy(id: string): boolean;
  isDecoyCost(id: string): boolean;
  protectingSource(holder: Permanent, target: Permanent): DecoySource | undefined;
  select(
    seat: Seat,
    candidateInstanceIds: string[],
    min: number,
    promptText: string,
    source: DecoySource,
    affectedPermanentIds: readonly string[],
  ): Promise<string[]>;
  deleteAsCost(holderId: string): Promise<boolean>;
};

type ProtectableTarget = {
  target: Permanent;
  source: DecoySource;
};

export const DECOY_EFFECT_TEXT =
  "＜Decoy＞: you may delete this Digimon to prevent 1 of your other Digimon's deletion.";
export const DECOY_CONFIRMATION_TEXT = "＜Decoy＞: delete this Digimon to prevent the other Digimon's deletion?";
export const DECOY_TARGET_CHOICE_TEXT = "＜Decoy＞: choose 1 Digimon to protect from deletion";

export function decoyLeaveReplacements(
  holderIds: readonly string[],
  deps: DecoyReactionDeps,
): ReplacementSubscriptionPrevent[] {
  return holderIds.flatMap((id) => {
    const holder = deps.permanentById(id);
    if (holder?.topCard === undefined || !deps.isBattleAreaDigimon(holder) || !deps.hasDecoy(id)) {
      return [];
    }
    const holderInstanceId = holder.topCard.instanceId;
    const ownerSeat = holder.controllerSeat;
    const liveHolder = () => {
      const live = deps.permanentById(id);
      return live?.topCard?.instanceId === holderInstanceId &&
        live.controllerSeat === ownerSeat &&
        deps.isBattleAreaDigimon(live) &&
        deps.hasDecoy(id)
        ? live
        : undefined;
    };
    const protectableTarget = (targetId: string): ProtectableTarget | undefined => {
      const live = liveHolder();
      const target = deps.permanentById(targetId);
      if (
        live === undefined ||
        target?.topCard === undefined ||
        targetId === id ||
        target.controllerSeat !== ownerSeat ||
        deps.isDecoyCost(targetId)
      ) {
        return undefined;
      }
      const source = deps.protectingSource(live, target);
      return source === undefined ? undefined : { target, source };
    };
    const chooseTarget = async (protectable: readonly ProtectableTarget[], first: ProtectableTarget) => {
      if (protectable.length === 1) {
        return first;
      }
      const [chosenInstanceId] = await deps.select(
        ownerSeat,
        protectable.map(({ target }) => target.topCard.instanceId),
        1,
        DECOY_TARGET_CHOICE_TEXT,
        first.source,
        [],
      );
      return protectable.find(({ target }) => target.topCard.instanceId === chosenInstanceId) ?? first;
    };
    const preventOneOf = async (
      ctx: EffectContext,
      candidatePermanentIds: readonly string[],
    ): Promise<string | undefined> => {
      const protectable = candidatePermanentIds.flatMap((candidateId) => protectableTarget(candidateId) ?? []);
      const [first] = protectable;
      if (first === undefined || ctx.presetOptionalAnswer === false) {
        return undefined;
      }
      if (ctx.presetOptionalAnswer !== true) {
        const confirmed = await deps.select(
          ownerSeat,
          [holderInstanceId],
          0,
          DECOY_CONFIRMATION_TEXT,
          first.source,
          protectable.map(({ target }) => target.permanentId),
        );
        if (!confirmed.includes(holderInstanceId)) {
          return undefined;
        }
      }
      const saved = await chooseTarget(protectable, first);
      if (liveHolder() === undefined || !(await deps.deleteAsCost(id))) {
        return undefined;
      }
      return saved.target.permanentId;
    };
    return [
      {
        id: buildKeywordReactionId(KeywordReaction.DECOY.value, id),
        event: "wouldBeDeleted" as const,
        mode: "prevent" as const,
        sourcePermanentId: id,
        sourceInstanceId: holderInstanceId,
        activationIdentity: KeywordReaction.DECOY.value,
        preventionKeyword: "Decoy" as const,
        description: DECOY_EFFECT_TEXT,
        causeAllows: (cause, resolvingSeat) =>
          cause === "byEffect" && resolvingSeat !== undefined && resolvingSeat !== ownerSeat,
        protects: (_ctx, leavingId) => protectableTarget(leavingId) !== undefined,
        preventCheck: async (ctx, leavingId) => (await preventOneOf(ctx, [leavingId])) === leavingId,
        preventOneOf,
      },
    ];
  });
}
