import type { Permanent, Seat } from "@aegis/shared";
import { partitionSpecOf } from "../../combat/keywords.js";
import type { RemovalCause } from "../EffectContext.js";
import type { EffectContext } from "../EffectContext.js";
import type { ReplacementSubscriptionInstead } from "../subtriggers.js";
import type { PrimitivesContext } from "./context.js";
import { KeywordReaction } from "#api/engine/effects/KeywordReaction";
import { buildKeywordReactionId } from "#api/engine/effects/buildKeywordReactionId";
import { listPartitionAssignments } from "#api/engine/effects/verbs/listPartitionAssignments";
import { choosePartitionMaterials } from "#api/engine/effects/verbs/choosePartitionMaterials";
import { PARTITION_MATERIAL_PROMPT } from "#api/engine/effects/verbs/partitionMaterialPrompt";

function listOfferedInstanceIds(assignments: readonly (readonly string[])[]): string[] {
  return [...new Set(assignments.flat())];
}

function hasSameCards(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((instanceId) => right.includes(instanceId));
}

function hasAllCards(stack: Permanent["stack"], instanceIds: readonly string[]): boolean {
  return instanceIds.every((instanceId) => stack.some((card) => card.instanceId === instanceId));
}

/** A live Partition clause and the exact materials its declaration requires. */
function partitionCandidate(permanent: Permanent) {
  const topSpec = partitionSpecOf(permanent.topCard.cardId);
  const stackSource =
    topSpec === undefined
      ? permanent.stack.find((card) => card.faceUp && partitionSpecOf(card.cardId) !== undefined)
      : undefined;
  const spec = topSpec ?? (stackSource === undefined ? undefined : partitionSpecOf(stackSource.cardId));
  if (spec === undefined) return undefined;
  const assignments = listPartitionAssignments({ clauses: spec, sources: permanent.stack });
  if (assignments.length === 0) {
    return undefined;
  }
  return {
    holderPermanentId: permanent.permanentId,
    seat: permanent.controllerSeat,
    assignments,
    offeredInstanceIds: listOfferedInstanceIds(assignments),
    partitionSourceInstanceId: topSpec === undefined ? stackSource!.instanceId : permanent.topCard.instanceId,
    partitionSourceCardId: topSpec === undefined ? stackSource!.cardId : permanent.topCard.cardId,
    partitionSourceRole: topSpec === undefined ? ("stack" as const) : ("top" as const),
  };
}

type PartitionCandidate = NonNullable<ReturnType<typeof partitionCandidate>>;

/** CR 16-29-2: Partition competes with every other immediate would-leave effect. */
export function partitionLeaveReplacements(
  permanentIds: readonly string[],
  deps: {
    permanentById(id: string): Permanent | undefined;
    hasPartition(id: string): boolean;
    select(ctx: EffectContext, candidate: PartitionCandidate): Promise<string[]>;
    chooseMaterial(candidate: PartitionCandidate, candidateInstanceIds: string[]): Promise<string | undefined>;
    play(sourceInstanceId: string, materialIds: string[]): Promise<unknown>;
  },
): ReplacementSubscriptionInstead[] {
  return permanentIds.flatMap((id) => {
    const permanent = deps.permanentById(id);
    if (permanent?.topCard === undefined || permanent.inBreeding || !deps.hasPartition(id)) return [];
    const candidate = partitionCandidate(permanent);
    if (candidate === undefined) return [];
    const liveAssignments = () => {
      const live = deps.permanentById(id);
      if (live === undefined || !deps.hasPartition(id)) {
        return [];
      }
      const sourceInRole =
        candidate.partitionSourceRole === "top"
          ? live.topCard.instanceId === candidate.partitionSourceInstanceId
          : live.stack.some((card) => card.instanceId === candidate.partitionSourceInstanceId);
      if (!sourceInRole) {
        return [];
      }
      return candidate.assignments.filter((assignment) => hasAllCards(live.stack, assignment));
    };
    const stillAvailable = () => liveAssignments().length > 0;
    return [
      {
        id: buildKeywordReactionId(KeywordReaction.PARTITION.value, id),
        event: "wouldLeavePlay" as const,
        mode: "instead" as const,
        sourcePermanentId: id,
        sourceInstanceId: candidate.partitionSourceInstanceId,
        activationIdentity: KeywordReaction.PARTITION.value,
        description: "＜Partition＞: you may play the specified digivolution cards without paying their costs.",
        causeAllows: (cause, seat) =>
          cause !== "byBattle" && !(cause === "byEffect" && seat === permanent.controllerSeat),
        appliesTo: (_ctx, leavingId) => leavingId === id && stillAvailable(),
        apply: async (ctx) => {
          if (!stillAvailable() || ctx.presetOptionalAnswer === false) {
            return;
          }
          const accepted = ctx.presetOptionalAnswer === true || (await deps.select(ctx, candidate)).length > 0;
          if (!accepted) {
            return;
          }
          const materials = await choosePartitionMaterials({
            assignments: liveAssignments(),
            chooseOne: (candidateInstanceIds) => deps.chooseMaterial(candidate, candidateInstanceIds),
          });
          if (materials === undefined || !liveAssignments().some((assignment) => hasSameCards(assignment, materials))) {
            return;
          }
          await deps.play(candidate.partitionSourceInstanceId, materials);
        },
      },
    ];
  });
}

/** Shared Partition source capture and replay for qualifying battle-area removals (§16-29). */
export function createPartitionReactions(pc: PrimitivesContext) {
  const { access, continuous, effectSeatStack, engine } = pc;

  function capture(
    permanentIds: readonly string[],
    cause: RemovalCause,
    resolvingSeat = effectSeatStack.at(-1) ?? engine.controllerSeat(),
  ) {
    // Production uses the ordered would-leave consult; retain this fallback for primitive-only hosts.
    if (engine.consultLeavePrevention !== undefined) return [];
    return permanentIds
      .map((permanentId) => {
        if (cause === "byBattle") return undefined;
        const perm = access.permanentById(permanentId);
        if (perm === undefined || perm.topCard === undefined) return undefined;
        if (!continuous.hasKeyword(permanentId, "Partition")) return undefined;
        if (cause === "byEffect" && resolvingSeat === perm.controllerSeat) return undefined;
        return partitionCandidate(perm);
      })
      .filter((candidate): candidate is PartitionCandidate => candidate !== undefined);
  }

  function captureReturns(
    instanceIds: readonly string[],
    resolvingSeat?: Seat,
    destination: "handOrDeck" | "security" = "handOrDeck",
  ) {
    const permanentIds = instanceIds.flatMap((instanceId) => {
      const permanentId = pc.helpers.permanentByTopInstance(instanceId);
      if (
        permanentId === undefined ||
        (destination !== "security" && pc.helpers.isRestricted(permanentId, "beReturned")) ||
        pc.helpers.isRestricted(permanentId, "leaveBattleAreaExceptByDeletion")
      )
        return [];
      return [permanentId];
    });
    return capture(permanentIds, "byEffect", resolvingSeat);
  }

  async function resolve(candidates: ReturnType<typeof capture>, movedInstanceIds: readonly string[] = []) {
    for (const candidate of candidates) {
      const { holderPermanentId, seat, partitionSourceInstanceId, partitionSourceCardId, partitionSourceRole } =
        candidate;
      const survivingHolder = access.permanentById(holderPermanentId);
      const partitionSourceStillInRole =
        partitionSourceRole === "top"
          ? survivingHolder?.topCard?.instanceId === partitionSourceInstanceId
          : survivingHolder?.stack.some((card) => card.instanceId === partitionSourceInstanceId) === true;
      const available = candidate.assignments.filter(
        (assignment) =>
          assignment.every((id) => movedInstanceIds.includes(id)) ||
          (survivingHolder !== undefined &&
            partitionSourceStillInRole &&
            hasAllCards(survivingHolder.stack, assignment)),
      );
      if (available.length === 0) {
        continue;
      }
      const offered = listOfferedInstanceIds(available);
      const chosen = await engine.ask.selectInstances(
        seat,
        [offered[0]!],
        0,
        1,
        "＜Partition＞: play the specified digivolution cards without paying their costs?",
        {
          sourceCardId: partitionSourceCardId,
          sourceInstanceId: partitionSourceInstanceId,
          selectionContext: "partitionActivation",
          visibleInstanceIds: offered,
        },
      );
      if (chosen.length === 0) {
        continue;
      }
      const materials = await choosePartitionMaterials({
        assignments: available,
        chooseOne: async (candidateInstanceIds) =>
          (
            await engine.ask.selectInstances(seat, candidateInstanceIds, 1, 1, PARTITION_MATERIAL_PROMPT, {
              sourceCardId: partitionSourceCardId,
              sourceInstanceId: partitionSourceInstanceId,
            })
          )[0],
      });
      if (materials === undefined) {
        continue;
      }
      // Q2860: Partition plays from digivolution cards even after the holder's deletion trashed them.
      if (engine.playForKeywordEffect) {
        await engine.playForKeywordEffect(partitionSourceInstanceId, materials, {
          playedFromZone: "digivolutionCards",
        });
      } else {
        await pc.fx.playInstances(materials, { payCost: false, playedFromZone: "digivolutionCards" });
      }
    }
  }

  return { capture, captureReturns, resolve };
}
