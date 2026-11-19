import { CardKind, effectiveStaticNames } from "@aegis/shared";
import type { Action, Target } from "@aegis/shared";
import type { EffectContext } from "#api/engine/effects/EffectContext";
import { availableEffectPlayAssembly } from "#api/engine/effects/interpreter/actions/effectPlayAssembly";
import { availableEffectPlayDigiXrosReduction } from "#api/engine/effects/interpreter/actions/effectPlayDigiXrosAvailability";
import { getPaidPlayCostReduction } from "#api/engine/effects/interpreter/actions/getPaidPlayCostReduction";
import { optionUseDefinition } from "#api/engine/effects/interpreter/actions/optionUseDefinition";
import {
  applyDecodeHostScope,
  applyPlayCostCeiling,
  applyPlayDpCeilingModifier,
  candidatesAllowedBySameNameRestriction,
  isEffectPlayProhibited,
  materializeLevelComparisonScaling,
  materializePlayCostLteScaling,
  playableCandidates,
} from "#api/engine/effects/interpreter/actions/play";
import { scaleFactor } from "#api/engine/effects/interpreter/scaling";
import {
  DEFAULT_PLAY_ZONES,
  candidateLooseInstances,
  type LooseCandidate,
} from "#api/engine/effects/interpreter/targeting/loose";

type ResolveFilteredPlayCandidatesParams = {
  ctx: EffectContext;
  action: Extract<Action, { kind: "PlayWithoutCost" }>;
};

type FilteredPlayCandidates = {
  candidates: LooseCandidate[];
  target: Target;
  zones: NonNullable<Extract<Action, { kind: "PlayWithoutCost" }>["from"]>;
  costReduction: number | undefined;
};

export async function resolveFilteredPlayCandidates({
  ctx,
  action,
}: ResolveFilteredPlayCandidatesParams): Promise<FilteredPlayCandidates> {
  const scaledPlayTarget: Target =
    action.scaling !== undefined && typeof action.target.count === "number"
      ? {
          ...action.target,
          count: action.target.count * scaleFactor(ctx, action.scaling),
        }
      : action.target;
  const playTarget = applyPlayDpCeilingModifier(ctx, action, scaledPlayTarget);
  const levelCeilingAdjustedTarget =
    ctx.playLevelCeilingDelta === undefined || ctx.playLevelCeilingDelta === 0
      ? playTarget
      : {
          ...playTarget,
          filter: {
            ...playTarget.filter,
            levelComparison:
              playTarget.filter.levelComparison?.op === "lte" && playTarget.filter.levelComparison.value !== undefined
                ? {
                    ...playTarget.filter.levelComparison,
                    value: playTarget.filter.levelComparison.value + ctx.playLevelCeilingDelta,
                  }
                : playTarget.filter.levelComparison,
          },
        };
  const scaledCostAdjustedTarget = materializePlayCostLteScaling(ctx, levelCeilingAdjustedTarget);
  const levelComparison = scaledCostAdjustedTarget.filter.levelComparison;
  const levelScaledTarget = materializeLevelComparisonScaling(
    scaledCostAdjustedTarget,
    levelComparison?.scaling === undefined ? 0 : scaleFactor(ctx, levelComparison.scaling),
  );
  const adjustedTarget = applyDecodeHostScope(action, applyPlayCostCeiling(ctx, action, levelScaledTarget));
  const playCostAdjustedTarget =
    action.ignorePlayCostLimit === true
      ? {
          ...adjustedTarget,
          filter: {
            ...adjustedTarget.filter,
            playCostLte: undefined,
            playCostLteScaling: undefined,
          },
        }
      : adjustedTarget;
  const zones = action.from && action.from.length > 0 ? action.from : DEFAULT_PLAY_ZONES;
  let candidates = playableCandidates(
    ctx,
    playCostAdjustedTarget,
    candidateLooseInstances(ctx, playCostAdjustedTarget, zones, optionUseDefinition),
    action.chooseDualMode,
  );
  if (action.fromTriggerHandTrash === true) {
    const triggeringIds = new Set(ctx.trigger.handTrashedInstanceIds ?? []);
    candidates = candidates.filter((candidate) => triggeringIds.has(candidate.instanceId));
  }
  candidates = candidates.filter((c) => !isEffectPlayProhibited(ctx, c));
  if (action.target?.filter?.excludeSameNameAsOwnTamers === true) {
    const ownTamerNames = new Set<string>();
    for (const permanent of ctx.game.player(ctx.source.ownerSeat).battleArea) {
      if (permanent.topCard === undefined) continue;
      const definition = ctx.game.definitionOf(permanent.topCard);
      if (!definition.kinds.includes(CardKind.Tamer)) continue;
      for (const name of effectiveStaticNames(definition)) ownTamerNames.add(name);
    }
    candidates = candidates.filter((candidate) => {
      const names = effectiveStaticNames(ctx.game.definitionOf({ cardId: candidate.cardId } as never));
      return !names.some((name) => ownTamerNames.has(name));
    });
  }
  candidates = candidatesAllowedBySameNameRestriction(ctx, candidates);
  if (action.target?.filter?.sameLevelAsAttacker === true) {
    const attackerId = ctx.trigger.subjectPermanentId ?? ctx.trigger.attackerPermanentId;
    const attackerPermanent = attackerId !== undefined ? ctx.game.permanentById(attackerId) : undefined;
    const attackerLevel =
      attackerPermanent?.topCard !== undefined ? ctx.game.definitionOf(attackerPermanent.topCard).level : undefined;
    candidates =
      attackerLevel !== undefined
        ? candidates.filter((c) => ctx.game.definitionOf({ cardId: c.cardId } as never).level === attackerLevel)
        : [];
  }
  if (action.notSameNameAs && action.notSameNameAs.length > 0) {
    const seat = ctx.source.ownerSeat;
    const player = ctx.game.player(seat);
    const excludedNames = new Set<string>();
    for (const zone of action.notSameNameAs) {
      if (zone === "battleArea") {
        for (const permanent of player.battleArea) {
          if (permanent.topCard === undefined) continue;
          const n = ctx.game.definitionOf(permanent.topCard).nameEn;
          if (n) excludedNames.add(n);
        }
      } else {
        for (const card of player.trash) {
          const n = ctx.game.definitionOf(card).nameEn;
          if (n) excludedNames.add(n);
        }
      }
    }
    candidates = candidates.filter(
      (c) => !excludedNames.has(ctx.game.definitionOf({ cardId: c.cardId } as never).nameEn),
    );
  }
  const excludedTriggerSubjectName = (action as typeof action & { excludeNameOfTriggerSubject?: boolean })
    .excludeNameOfTriggerSubject
    ? ctx.trigger.subjectPermanentId !== undefined
      ? ctx.game.permanentById(ctx.trigger.subjectPermanentId)?.topCard !== undefined
        ? ctx.game.definitionOf(ctx.game.permanentById(ctx.trigger.subjectPermanentId)!.topCard!).nameEn
        : undefined
      : undefined
    : undefined;
  if (excludedTriggerSubjectName !== undefined) {
    candidates = candidates.filter(
      (c) => ctx.game.definitionOf({ cardId: c.cardId } as never).nameEn !== excludedTriggerSubjectName,
    );
  }
  const costReduction = getPaidPlayCostReduction({ ctx, action }) ?? action.costReduction;
  if (action.payCost === true && ctx.fx.canAffordEffectPlay !== undefined) {
    const affordability: { candidate: (typeof candidates)[number]; play: boolean; use: boolean }[] = [];
    for (const candidate of candidates) {
      const definition = ctx.game.definitionOf({ cardId: candidate.cardId } as never);
      const hasOption = definition.kinds.includes(CardKind.Option);
      const hasPermanent =
        !hasOption && (definition.kinds.includes(CardKind.Digimon) || definition.kinds.includes(CardKind.Tamer));
      const canUseByColor =
        hasOption &&
        ctx.game.optionColorRequirementMet?.(ctx.source.ownerSeat, candidate.instanceId, definition) !== false;
      const digiXrosReduction =
        hasPermanent && playCostAdjustedTarget.count === 1 ? availableEffectPlayDigiXrosReduction(ctx, candidate) : 0;
      const basePlayAffordable =
        hasPermanent &&
        (await ctx.fx.canAffordEffectPlay!(candidate.instanceId, {
          costDelta: (costReduction ?? 0) + digiXrosReduction,
          controllerSeat: ctx.source.ownerSeat,
        }));
      const assembly = basePlayAffordable ? undefined : availableEffectPlayAssembly(ctx, candidate);
      const play =
        basePlayAffordable ||
        (hasPermanent &&
          assembly !== undefined &&
          (await ctx.fx.canAffordEffectPlay!(candidate.instanceId, {
            costDelta: (costReduction ?? 0) + assembly.reduction,
            controllerSeat: ctx.source.ownerSeat,
          })));
      const use =
        canUseByColor &&
        (await ctx.fx.canAffordEffectPlay!(candidate.instanceId, {
          costDelta: costReduction,
          useAsOption: true,
          controllerSeat: ctx.source.ownerSeat,
        }));
      affordability.push({ candidate, play, use });
    }
    candidates = affordability
      .filter(({ candidate, play, use }) => {
        const kinds = ctx.game.definitionOf({ cardId: candidate.cardId } as never).kinds;
        return kinds.includes(CardKind.Option) ? use : play;
      })
      .map(({ candidate }) => candidate);
  }
  return { candidates, target: playCostAdjustedTarget, zones, costReduction };
}
