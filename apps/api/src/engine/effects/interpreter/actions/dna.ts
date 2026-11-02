import { definitionMatches } from "#api/engine/effects/interpreter/matching/definition";
import { Zone } from "@aegis/shared/schema/enums";
// DNA digivolution, App Fusion, and per-level play.

import type { EffectContext } from "../../EffectContext.js";
import { unsupported } from "../errors.js";
import { candidateLooseInstances, pickLoose } from "../targeting/loose.js";
import { candidatePermanents, resolvePermanentTargets } from "../targeting/permanents.js";
import { playEffectInstances } from "./effectPlayAssembly.js";
import { appFusionCostFor, requireCardDefinition } from "@aegis/shared";
import type { Action, Filter, Target, ZoneRef } from "@aegis/shared";

/**
 * Effect-driven DNA-digivolve. `materials` resolves to two-or-more battle-area
 * permanents (self + others, or a filtered set); `into` is the result card to play
 * from the controller's hand. Consume the materials and play the result on top.
 */
function dnaResultTarget(into: NonNullable<Extract<Action, { kind: "DnaDigivolve" }>["into"]>): Target {
  const encodedInto = into as Filter | Target;
  return "filter" in encodedInto ? (encodedInto as Target) : { filter: encodedInto as Filter, count: 1 };
}

type DnaResultCandidatesParams = {
  ctx: EffectContext;
  target: Target;
  zones: ZoneRef[];
};

function getDnaResultCandidates({ ctx, target, zones }: DnaResultCandidatesParams) {
  const resolving = ctx.game.player(ctx.source.ownerSeat).resolvingOption;
  if (
    target.filter.isSelfRef === true &&
    target.filter.zone === undefined &&
    resolving?.instanceId === ctx.source.instanceId
  ) {
    const { isSelfRef: _self, ...filter } = target.filter;
    if (definitionMatches(filter, ctx.game.definitionOf(resolving))) {
      return [resolving];
    }
    return [];
  }
  return candidateLooseInstances(ctx, target, zones);
}

function selfDnaPartnerFilter(filter: Filter): Filter {
  return {
    ...filter,
    controller: filter.controller ?? filter.controllerDefault ?? "mine",
    isSelfRef: undefined,
    includesSelf: undefined,
    excludeSelf: true,
  };
}

export async function runDnaDigivolve(
  ctx: EffectContext,
  action: Extract<Action, { kind: "DnaDigivolve" }>,
): Promise<void> {
  // Bind the DNA outcome for ordered follow-up clauses such as BT16-097's
  // "if this effect DNA digivolved, Recovery +1". Ordinary Digivolve owns the
  // same result binding; DNA must clear stale state before resolving and publish
  // success only after the merge primitive creates the result.
  ctx.lastDigivolveResult = false;
  if (action.into === undefined) {
    unsupported(ctx, action, "DnaDigivolve without an `into` filter is unresolvable");
    return;
  }
  const intoTarget = dnaResultTarget(action.into);
  const { hasDnaDigivolutionRequirement: _dnaRequirement, ...visibleIntoFilter } = intoTarget.filter;
  const visibleIntoTarget: Target = { ...intoTarget, filter: visibleIntoFilter };
  const intoZone = intoTarget.filter.zone;
  const intoZones: ZoneRef[] =
    intoZone !== undefined ? [Array.isArray(intoZone) ? intoZone[0]! : (intoZone as ZoneRef)] : ["hand"];
  const resultPool = getDnaResultCandidates({ ctx, target: intoTarget, zones: intoZones });
  const visibleResultPool = getDnaResultCandidates({ ctx, target: visibleIntoTarget, zones: intoZones });

  // Resolve the material permanents. "this Digimon and 1 of your other Digimon" is the
  // common shape; the IR may carry only `isSelf` (self + an implied partner) — in that
  // case we also include the source so there are >=2 materials.
  //
  // `materials.filter.zone` can name a non-permanent zone (BT17-095/EX6-072: "1 card in the
  // hand" compiles to `materials.filter.zone: "hand"`) — resolvePermanentTargets only scans
  // battleArea/breeding and always returns empty for those, so the whole slot must instead
  // resolve the same way `looseMaterials` already does (candidateLooseInstances + pickLoose).
  let materialIds: string[] = [];
  let looseMaterialIds: string[] = [];
  if (Array.isArray(action.materials)) {
    // W7-E-2: per-slot zone specs — each entry resolves independently in its own zone
    // (e.g. EX6-072: 1 field Digimon + 1 hand card). Every slot contributes its own
    // materials; there is no isSelf/includeRef handling in this form.
    const fieldOnlySlots = action.materials.every(
      (slot) => slot.zone === undefined || slot.zone === "battleArea" || slot.zone === "breeding",
    );
    const materialSlots = action.materials;
    if (
      action.looseMaterials === undefined &&
      resultPool.length === 1 &&
      materialSlots.length === 2 &&
      materialSlots.every(
        (slot) =>
          slot.count === 1 &&
          (slot.zone === undefined || slot.zone === "battleArea") &&
          Object.keys(slot).every((key) => key === "filter" || key === "zone" || key === "count"),
      )
    ) {
      materialIds = await chooseDnaMaterialPair({ ctx, slots: materialSlots, results: resultPool });
    } else {
      for (let slotIndex = 0; slotIndex < materialSlots.length; slotIndex += 1) {
        const slot = action.materials[slotIndex]!;
        const slotTarget: Target = { ...slot, filter: slot.filter, count: slot.count } as Target;
        // An omitted zone is the normal printed "this Digimon / another Digimon in play"
        // shape (ST10-02/ST10-04), so it defaults to battle-area permanents. Only an explicit
        // loose zone (hand/trash/security/...) uses the loose-card resolver.
        if (slot.zone === undefined || slot.zone === "battleArea" || slot.zone === "breeding") {
          const wanted = typeof slot.count === "number" ? slot.count : 1;
          const eligible =
            fieldOnlySlots && wanted === 1
              ? (permanentId: string): boolean =>
                  hasLegalDnaCompletion(
                    ctx,
                    action.materials as typeof action.materials & readonly DnaMaterialSlot[],
                    slotIndex + 1,
                    [...materialIds, permanentId],
                    resultPool,
                  )
              : undefined;
          materialIds.push(...(await resolvePermanentTargets(ctx, slotTarget, eligible ? { eligible } : undefined)));
        } else {
          looseMaterialIds.push(
            ...(await pickLoose(
              ctx,
              slotTarget,
              candidateLooseInstances(ctx, slotTarget, [slot.zone]).filter(
                (candidate) =>
                  slotIndex !== materialSlots.length - 1 ||
                  slot.count !== 1 ||
                  legalLooseMaterial(candidate.instanceId),
              ),
            )),
          );
        }
      }
    }
  } else {
    const materialsZone = action.materials.filter.zone;
    const materialsAreLoose =
      materialsZone !== undefined && materialsZone !== "battleArea" && materialsZone !== "breeding";
    if (
      !materialsAreLoose &&
      action.materials.count === 2 &&
      candidatePermanents(ctx, action.materials, { includeUnaffectable: true }).length > 2 &&
      Object.keys(action.materials).every((key) => key === "filter" || key === "count") &&
      action.looseMaterials === undefined &&
      !action.materials.isSelf &&
      !action.materials.filter.isSelfRef &&
      !action.materials.filter.includesSelf &&
      action.materials.includeRef === undefined
    ) {
      const slot: DnaMaterialSlot = { filter: action.materials.filter, count: 1, zone: Zone.BattleArea };
      materialIds = await chooseDnaMaterialPair({ ctx, slots: [slot, slot], results: resultPool });
    } else {
      materialIds = materialsAreLoose ? [] : await resolvePermanentTargets(ctx, action.materials);
    }
    looseMaterialIds = materialsAreLoose
      ? await pickLoose(
          ctx,
          action.materials,
          candidateLooseInstances(ctx, action.materials, [materialsZone as ZoneRef]),
        )
      : [];
    if (
      !materialsAreLoose &&
      (action.materials.isSelf || action.materials.filter.isSelfRef || action.materials.filter.includesSelf)
    ) {
      // `includesSelf` on the materials filter: the source permanent is always one of the selected
      // materials (BT21-046 "this Digimon and any of your other Digimon"). Pre-fill self, then let
      // the controller pick the remaining count-1 partners from the rest of the filter (excluding self).
      const self = ctx.source.permanent();
      const remainingCount = Math.max(1, (typeof action.materials.count === "number" ? action.materials.count : 2) - 1);
      if (self === undefined) return;
      const eligible =
        remainingCount === 1 && action.looseMaterials === undefined
          ? (permanentId: string): boolean =>
              resultPool.some(
                ({ instanceId }) => ctx.fx.canDnaDigivolve?.([self.permanentId, permanentId], instanceId) !== false,
              )
          : undefined;
      const others = await resolvePermanentTargets(
        ctx,
        {
          filter: selfDnaPartnerFilter(action.materials.filter),
          count: remainingCount,
        },
        eligible ? { eligible } : undefined,
      );
      materialIds = [self.permanentId, ...others];
    } else if (!materialsAreLoose && action.materials.includeRef !== undefined) {
      // One material slot is pinned to a referenced permanent; the player picks the
      // remaining count-1 materials from the filter, excluding the pinned id.
      const pinnedId =
        action.materials.includeRef === "triggerSubject"
          ? (ctx.trigger.subjectPermanentId ?? ctx.trigger.deletedPermanentId ?? ctx.trigger.attackerPermanentId)
          : ctx.source.permanent()?.permanentId;
      if (pinnedId === undefined) {
        // The pinned permanent is absent (e.g. the Replacement fired with no subject yet
        // recorded, or the trigger is from a non-permanent event). The DNA digivolve is not
        // legal — return without acting.
        return;
      }
      const remainingCount = (action.materials.count as number) - 1;
      let rest: string[] = [];
      if (remainingCount > 0) {
        // Build candidate pool from the filter, then exclude the pinned id so the controller
        // cannot select it again as the "other" material.
        const partnerCandidates = candidatePermanents(ctx, {
          filter: action.materials.filter,
          count: remainingCount,
        })
          .filter((p) => p.permanentId !== pinnedId)
          .map((p) => p.permanentId);
        const min = Math.min(remainingCount, partnerCandidates.length);
        rest = await ctx.ask.chooseTargets(ctx, {
          candidates: partnerCandidates,
          min,
          max: min,
        });
      }
      materialIds = [pinnedId, ...rest];
    }
  }
  function legalLooseMaterial(instanceId: string): boolean {
    if (looseMaterialIds.includes(instanceId)) return false;
    return resultPool.some(
      (result) =>
        result.instanceId !== instanceId &&
        !looseMaterialIds.includes(result.instanceId) &&
        ctx.fx.canDnaDigivolve?.(materialIds, result.instanceId, [...looseMaterialIds, instanceId]) !== false,
    );
  }
  if (action.looseMaterials !== undefined) {
    const zones = action.looseMaterials.from ?? ["trash"];
    looseMaterialIds = [
      ...looseMaterialIds,
      ...(await pickLoose(
        ctx,
        action.looseMaterials,
        candidateLooseInstances(ctx, action.looseMaterials, zones).filter(
          (candidate) => action.looseMaterials!.count !== 1 || legalLooseMaterial(candidate.instanceId),
        ),
      )),
    ];
  }
  if (materialIds.length + looseMaterialIds.length < 2) {
    // An optional DNA effect simply has no legal action when both required materials
    // are unavailable. It must never degrade into a one-stack normal digivolution or
    // surface a capability error to the player.
    return;
  }
  const candidates = resultPool.filter(
    (candidate) =>
      !looseMaterialIds.includes(candidate.instanceId) &&
      ctx.fx.canDnaDigivolve?.(materialIds, candidate.instanceId, looseMaterialIds) !== false,
  );
  if (candidates.length === 0) return;
  const chosen = await pickLoose(
    ctx,
    intoTarget,
    candidates,
    undefined,
    ctx.ask,
    visibleResultPool.map(({ instanceId }) => instanceId),
  );
  if (chosen.length === 0) return;
  const result = await ctx.fx.dnaDigivolveInto(materialIds, chosen[0]!, {
    payCost: action.payCost,
    ...(looseMaterialIds.length > 0 ? { extraMaterialInstanceIds: looseMaterialIds } : {}),
  });
  if (result !== undefined) ctx.lastDigivolveResult = true;
  if (action.bindResultAs && result !== undefined) {
    if (!ctx.boundPlayed) (ctx as { boundPlayed: Map<string, Set<string>> }).boundPlayed = new Map();
    ctx.boundPlayed!.set(action.bindResultAs, new Set([result.permanentId]));
  }
}

type DnaMaterialSlot =
  Extract<Action, { kind: "DnaDigivolve" }> extends { materials: infer Materials }
    ? Materials extends readonly (infer Slot)[]
      ? Slot
      : never
    : never;

type ChooseDnaMaterialPairParams = {
  ctx: EffectContext;
  slots: readonly DnaMaterialSlot[];
  results: readonly { instanceId: string }[];
};

async function chooseDnaMaterialPair({ ctx, slots, results }: ChooseDnaMaterialPairParams): Promise<string[]> {
  const firstSlot = slots[0]!;
  const secondSlot = slots[1]!;
  const firstCandidates = candidatePermanents(ctx, { filter: firstSlot.filter, count: "all" });
  const secondCandidates = candidatePermanents(ctx, { filter: secondSlot.filter, count: "all" });
  const allowedTargetCombinations: string[][] = [];
  for (const first of firstCandidates) {
    for (const second of secondCandidates) {
      const pair = [first.permanentId, second.permanentId];
      if (first.permanentId === second.permanentId) {
        continue;
      }
      if (allowedTargetCombinations.some((combination) => combination.every((id) => pair.includes(id)))) {
        continue;
      }
      const result = results.find(({ instanceId }) => ctx.fx.canDnaDigivolve?.(pair, instanceId) !== false);
      if (result !== undefined) {
        allowedTargetCombinations.push(ctx.fx.orderDnaMaterials?.(pair, result.instanceId) ?? pair);
      }
    }
  }
  if (allowedTargetCombinations.length === 0) {
    return [];
  }
  const selected = await ctx.ask.chooseTargets(ctx, {
    candidates: [...new Set(allowedTargetCombinations.flat())],
    min: 2,
    max: 2,
    allowedTargetCombinations,
  });
  return (
    allowedTargetCombinations.find(
      (combination) => combination.length === selected.length && combination.every((id) => selected.includes(id)),
    ) ?? []
  );
}

function hasLegalDnaCompletion(
  ctx: EffectContext,
  slots: readonly DnaMaterialSlot[],
  slotIndex: number,
  selected: string[],
  results: readonly { instanceId: string }[],
): boolean {
  if (slotIndex >= slots.length) {
    if (selected.length < 2) return false;
    return results.some(({ instanceId }) => ctx.fx.canDnaDigivolve?.(selected, instanceId) !== false);
  }
  const slot = slots[slotIndex]!;
  if (slot.zone !== undefined && slot.zone !== "battleArea" && slot.zone !== "breeding") return true;
  const wanted = typeof slot.count === "number" ? slot.count : 1;
  const self =
    (slot as DnaMaterialSlot & { isSelf?: boolean }).isSelf === true || slot.filter.isSelfRef === true
      ? ctx.source.permanent()
      : undefined;
  const available = (
    self !== undefined
      ? [self.permanentId]
      : candidatePermanents(ctx, { ...slot, filter: slot.filter, count: "all" } as Target).map(
          ({ permanentId }) => permanentId,
        )
  ).filter((permanentId) => !selected.includes(permanentId));

  function choose(start: number, chosen: string[]): boolean {
    if (chosen.length === wanted) {
      return hasLegalDnaCompletion(ctx, slots, slotIndex + 1, [...selected, ...chosen], results);
    }
    for (let index = start; index < available.length; index += 1) {
      if (choose(index + 1, [...chosen, available[index]!])) return true;
    }
    return false;
  }
  return choose(0, []);
}

/**
 * Synchronous availability gate for a triggered optional DNA action. It deliberately
 * runs before `orderTriggers`, so an inherited end-of-turn effect cannot ask the
 * player to confirm/select materials when no DNA result exists in hand (ST10-04).
 * Full material-requirement validation remains authoritative in `runDnaDigivolve`;
 * this preflight only proves that every declared material slot and a result candidate
 * exist without opening any decisions.
 */
export function canAttemptDnaDigivolve(ctx: EffectContext, action: Extract<Action, { kind: "DnaDigivolve" }>): boolean {
  if (action.into === undefined) return false;
  const intoTarget = dnaResultTarget(action.into);
  const intoZone = intoTarget.filter.zone;
  const intoZones: ZoneRef[] =
    intoZone !== undefined ? [Array.isArray(intoZone) ? intoZone[0]! : (intoZone as ZoneRef)] : ["hand"];
  const intoCandidates = getDnaResultCandidates({ ctx, target: intoTarget, zones: intoZones });
  if (intoCandidates.length === 0) return false;

  if (!Array.isArray(action.materials)) {
    const materialsZone = action.materials.filter.zone;
    const materialsAreLoose =
      materialsZone !== undefined && materialsZone !== "battleArea" && materialsZone !== "breeding";
    const wanted = typeof action.materials.count === "number" ? action.materials.count : 1;
    let materialCombinations: string[][];
    let looseMaterialCombinations: string[][] = [[]];

    if (materialsAreLoose) {
      const candidates = candidateLooseInstances(ctx, action.materials, [materialsZone as ZoneRef]).map(
        ({ instanceId }) => instanceId,
      );
      looseMaterialCombinations = combinations(candidates, wanted);
      materialCombinations = [[]];
    } else {
      const includesSelf =
        action.materials.isSelf || action.materials.filter.isSelfRef || action.materials.filter.includesSelf;
      const self = includesSelf ? ctx.source.permanent()?.permanentId : undefined;
      if (includesSelf && self === undefined) return false;
      const pinned =
        action.materials.includeRef === "triggerSubject"
          ? (ctx.trigger.subjectPermanentId ?? ctx.trigger.deletedPermanentId ?? ctx.trigger.attackerPermanentId)
          : action.materials.includeRef === "self"
            ? ctx.source.permanent()?.permanentId
            : self;
      if ((action.materials.includeRef !== undefined || self !== undefined) && pinned === undefined) return false;

      // The self-only encoding means "this Digimon and another", just as in
      // runDnaDigivolve. Do not keep the self filter on the partner candidates.
      const remaining = pinned === undefined ? wanted : Math.max(includesSelf ? 1 : 0, wanted - 1);
      const partnerFilter = includesSelf ? selfDnaPartnerFilter(action.materials.filter) : action.materials.filter;
      const candidates = candidatePermanents(ctx, { filter: partnerFilter, count: "all" })
        .map(({ permanentId }) => permanentId)
        .filter((permanentId) => permanentId !== pinned);
      materialCombinations = combinations(candidates, remaining).map((ids) =>
        pinned === undefined ? ids : [pinned, ...ids],
      );
    }

    if (action.looseMaterials !== undefined) {
      const looseZones = action.looseMaterials.from ?? ["trash"];
      const looseWanted = typeof action.looseMaterials.count === "number" ? action.looseMaterials.count : 1;
      const candidates = candidateLooseInstances(ctx, action.looseMaterials, looseZones).map(
        ({ instanceId }) => instanceId,
      );
      const additionalLooseCombinations = combinations(candidates, looseWanted);
      looseMaterialCombinations = looseMaterialCombinations.flatMap((existing) =>
        additionalLooseCombinations
          .filter((additional) => additional.every((instanceId) => !existing.includes(instanceId)))
          .map((additional) => [...existing, ...additional]),
      );
    }

    return materialCombinations.some((materialIds) =>
      looseMaterialCombinations.some(
        (looseMaterialIds) =>
          materialIds.length + looseMaterialIds.length >= 2 &&
          intoCandidates.some(
            ({ instanceId }) =>
              !looseMaterialIds.includes(instanceId) &&
              ctx.fx.canDnaDigivolve?.(materialIds, instanceId, looseMaterialIds) !== false,
          ),
      ),
    );
  }
  const slotCandidates: Array<{ ids: string[]; wanted: number }> = [];
  for (const slot of action.materials) {
    if (slot.zone !== undefined && slot.zone !== "battleArea" && slot.zone !== "breeding") {
      // Mixed loose/field DNA is validated at resolution; don't suppress it here.
      return true;
    }
    const wanted = typeof slot.count === "number" ? slot.count : 1;
    const self =
      (slot as { isSelf?: boolean }).isSelf === true || slot.filter.isSelfRef === true
        ? ctx.source.permanent()
        : undefined;
    const candidates =
      self !== undefined
        ? [self.permanentId]
        : candidatePermanents(ctx, { filter: slot.filter, count: "all" }).map((permanent) => permanent.permanentId);
    if (candidates.length < wanted) return false;
    slotCandidates.push({ ids: candidates, wanted });
  }

  function hasLegalCombination(slotIndex: number, selected: string[]): boolean {
    if (slotIndex === slotCandidates.length) {
      if (selected.length < 2) return false;
      return intoCandidates.some(({ instanceId }) => ctx.fx.canDnaDigivolve?.(selected, instanceId) !== false);
    }
    const slot = slotCandidates[slotIndex]!;
    const available = slot.ids.filter((id) => !selected.includes(id));
    function choose(start: number, chosen: string[]): boolean {
      if (chosen.length === slot.wanted) {
        return hasLegalCombination(slotIndex + 1, [...selected, ...chosen]);
      }
      for (let index = start; index < available.length; index += 1) {
        if (choose(index + 1, [...chosen, available[index]!])) return true;
      }
      return false;
    }
    return choose(0, []);
  }

  return hasLegalCombination(0, []);
}

function combinations(candidates: string[], count: number): string[][] {
  if (count === 0) return [[]];
  if (count < 0 || candidates.length < count) return [];
  const result: string[][] = [];
  function choose(start: number, selected: string[]): void {
    if (selected.length === count) {
      result.push(selected);
      return;
    }
    for (let index = start; index < candidates.length; index += 1) {
      choose(index + 1, [...selected, candidates[index]!]);
    }
  }
  choose(0, []);
  return result;
}

/**
 * PlayPerLevel (BT20-098 Apparition Legion).
 *
 * 1. Pay cost: the controller selects Digimon from `cost.target` (opponent's trash) whose
 *    printed levels sum to EXACTLY `cost.target.totalLevels`. Returns them to the bottom of deck.
 * 2. For each returned card at level L, play 1 card matching `playFilter` at level L from the
 *    controller's trash without paying its cost.
 * 3. Write the set of newly-played permanentIds under `bindResultAs` so downstream GainKeyword
 *    actions can reference them via `filter.boundRef`.
 *
 * The level-sum selection is done greedily by the engine (server-authoritative); the optional flag
 * on the action means the whole sequence may be declined at step 1.
 */
export async function runPlayPerLevel(
  ctx: EffectContext,
  action: Extract<Action, { kind: "PlayPerLevel" }>,
): Promise<void> {
  const cost = action.cost;
  if (!cost.target) return;

  const budget = cost.target.totalLevels;
  if (budget === undefined || budget <= 0) return;

  // Collect candidates from the cost target zone (opponent's trash for BT20-098).
  const costZone: ZoneRef = (cost.target.filter.zone as ZoneRef) ?? "trash";
  const costCandidates = candidateLooseInstances(ctx, cost.target, [costZone]);
  if (costCandidates.length === 0) return;

  // Filter to cards that have a numeric printed level (cards without a level cannot contribute).
  const leveled = costCandidates
    .map((c) => ({ ...c, level: ctx.game.definitionOf({ cardId: c.cardId } as never).level }))
    .filter((c): c is typeof c & { level: number } => c.level !== undefined && c.level > 0);

  // Select exactly `budget` levels' worth. Use a simple greedy approach: ask the controller to
  // choose cards whose levels sum to exactly the budget.
  const chosen: string[] = await ctx.ask.selectCards(ctx, {
    candidates: leveled.map((c) => c.instanceId),
    min: 0,
    max: leveled.length,
  });

  // Validate the level sum is exactly the budget; decline if the selection is invalid.
  const chosenLevels = chosen.map((id) => {
    const c = leveled.find((l) => l.instanceId === id);
    return c?.level ?? 0;
  });
  const levelSum = chosenLevels.reduce((a, b) => a + b, 0);
  if (levelSum !== budget) return;

  // Pay the cost: return chosen cards to the bottom of the deck.
  await ctx.fx.returnToDeck(chosen, { toTop: false });

  // For each returned card's level, play 1 matching card from `playFilter` zone.
  const playZone: ZoneRef = (action.playFilter.zone as ZoneRef) ?? "trash";
  const playedIds: string[] = [];

  for (const level of chosenLevels) {
    const levelFilter: Filter = { ...action.playFilter, levelComparison: { op: "eq", value: level } };
    const playCandidates = candidateLooseInstances(ctx, { filter: levelFilter, count: 1 }, [playZone]);
    if (playCandidates.length === 0) continue;
    const pick = await pickLoose(ctx, { filter: levelFilter, count: 1 }, playCandidates);
    if (pick.length === 0) continue;
    const pickedCards = pick
      .map((instanceId) => playCandidates.find((candidate) => candidate.instanceId === instanceId))
      .filter((candidate): candidate is (typeof playCandidates)[number] => candidate !== undefined);
    const played = await playEffectInstances(ctx, pickedCards, {
      payCost: action.payCost,
      ...(action.suppressOnPlayEffects === true ? { suppressOnPlayEffects: true } : {}),
    });
    if (played === undefined) {
      // Lightweight interpreter harnesses may stub the primitive without returning
      // permanents; production primitives always return the created permanents.
      playedIds.push(...pick);
    } else {
      playedIds.push(...played.map((permanent) => permanent.permanentId));
    }
  }

  // Bind the played permanentIds under `bindResultAs` for downstream filter.boundRef consumers.
  if (action.bindResultAs && playedIds.length > 0) {
    if (!ctx.boundPlayed) (ctx as { boundPlayed: Map<string, Set<string>> }).boundPlayed = new Map();
    ctx.boundPlayed!.set(action.bindResultAs, new Set(playedIds));
  }
}

/**
 * App Fusion (the Appmon mechanic). `source` resolves to the fusing battle-area Digimon
 * ("1 of your Digimon"); `into` filters the fusion-result card; `from` is its zone (trash for
 * BT24-087, hand for BT25-089). For the chosen fusing permanent, the candidate result cards
 * are those that (a) match `into` AND (b) the permanent legally satisfies their
 * `appFusionRequirement`. The fusion plays the result
 * on top, carrying the source's stack underneath, paying the target's app-fusion cost.
 */
export async function runAppFuse(ctx: EffectContext, action: Extract<Action, { kind: "AppFuse" }>): Promise<void> {
  const sourceIds = await resolvePermanentTargets(ctx, action.source);
  if (sourceIds.length === 0) return;
  const intoTarget: Target = { filter: action.into, count: 1 };
  for (const sourceId of sourceIds) {
    const permanent = ctx.game.permanentById(sourceId);
    if (permanent === undefined || permanent.topCard === undefined) continue;
    const topNames = ctx.game.effectiveNames?.(permanent) ?? [requireCardDefinition(permanent.topCard.cardId).nameEn];
    const linkedNames = Array.from(permanent.linked).map((c) => requireCardDefinition(c.cardId).nameEn);
    // Only fusion-target cards whose app-fusion condition this permanent satisfies are eligible.
    const candidates = candidateLooseInstances(ctx, intoTarget, action.from).filter(
      (c) => appFusionCostFor(c.cardId, { topNames, linkedNames }) !== undefined,
    );
    if (candidates.length === 0) continue;
    const chosen = await pickLoose(ctx, intoTarget, candidates);
    if (chosen.length === 0) continue;
    await ctx.fx.appFuseInto(sourceId, chosen[0]!);
  }
}
