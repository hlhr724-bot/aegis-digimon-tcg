import {
  CardInstance,
  EffectTiming,
  Phase,
  Zone,
  assemblyMaterialLevels,
  assemblyRequirementFor,
  canAssignDistinctColors,
  type AssemblyMaterial,
  type AssemblyRequirement,
  type CardDefinition,
  type GameState,
  type Seat,
  effectiveExactNames,
  effectiveStaticNames,
  nameIncludesToken,
} from "@aegis/shared";
import { canAssignDistinctNames } from "@aegis/shared/cards/canAssignDistinctNames";
import { cardHasTrait, definitionOf, isDigimon } from "../cards/cardData.js";
import { matchNameOrTrait } from "../effects/interpreter.js";
import { definitionHasKeyword } from "../effects/interpreter/matching/definition.js";
import { extractCardAt } from "../state/access.js";
import { normalizeCost, placePermanent } from "./digiXros.js";
import type { PlayCardDeps } from "./playCard.js";

/**
 * Assembly (Comprehensive Rules §7-3): a distinct alternate play mode from DigiXros. A card
 * printing "[Assembly -N] <materials>" may be played by placing the EXACT named/traited card
 * count from the player's TRASH (never hand/field, unlike DigiXros) under it, reducing the play
 * cost by a fixed N. Structurally modeled on `actions/digiXros.ts`:
 *   - source zone is trash only (§7-3-1), not hand/battle-area/under-Tamer
 *   - the reduction is a flat `reduceCost`, not per-material scaling
 *   - the exact material count must be placed — no partial Assembly (§7-3-2-4)
 *   - stacking order is dictated by the requirement's slot order for distinct-named slots, and by
 *     the player's own declaration order when the requirement is a single repeated slot (§7-3-2-6)
 *
 * IR coverage: `AssemblyMaterial` carries `names`/`namesExact`/`traits`/`nameOrTrait`/`printedKeywords`/`level`/`levelMin`/
 * `levelMax`/`colors`/`differentLevels`/`differentNames`/`differentColors`/`differentCardNumbers`, all enforced below. The
 * `differentColors` constraint applies to the repeated single-slot form used by EX13-077. `nameOrTrait` mirrors
 * `DigiXrosMaterial.nameOrTrait` for a genuine cross-kind disjunction the compiler can't flatten
 * into one AND-combined `names`+`traits` slot (e.g. EX12-016/-017's "in name or ... trait",
 * BT26-073's "in text or ... trait"). It also preserves alternatives with different trait
 * semantics, such as EX12-031's substring [Aqua]/[Sea Animal] match OR exact [TB] match. A slot
 * with no structured predicate at all (still
 * desc-only after that) is rejected as unenforceable, mirroring `digiXros.ts`'s
 * `materialMatchesSlot` refusal to accept an unconstrained desc-only slot. A level bound WITHOUT
 * a name/trait/nameOrTrait anchor is not sufficient on its own — it would silently accept any
 * card of that level — so that gate stays a hard prerequisite for enforcement.
 */

/** An Assembly play declaration (the `assembly` field of a playCard intent), narrowed for this action. */
export interface AssemblyPlanInput {
  /** Trash instance ids to place under the played card, in stacking-declaration order (left-to-right
   *  per the Assembly requirement's slot order; the player's own order for a same-slot recipe). */
  materialInstanceIds: string[];
}

export interface AssemblyIntent {
  type: "playCard";
  instanceId: string;
  targetSlot?: number;
  assembly: AssemblyPlanInput;
}

export type AssemblyRejection =
  | "not-your-turn"
  | "wrong-phase"
  | "decision-pending"
  | "game-over"
  | "no-such-player"
  | "card-not-in-zone"
  | "not-playable-kind"
  | "not-assembly" // the played card has no Assembly requirement
  | "no-materials" // an Assembly declaration must place at least one material
  | "invalid-material" // wrong zone, wrong count, or doesn't satisfy the recipe
  | "insufficient-memory";

export type AssemblyCheck =
  | { ok: false; reason: AssemblyRejection }
  | {
      ok: true;
      instance: CardInstance;
      definition: CardDefinition;
      requirement: AssemblyRequirement;
      materialInstanceIds: string[];
      cost: number;
    };

export interface AssemblyDeps extends Pick<
  PlayCardDeps,
  "finalizePlayCost" | "hasBeforePayCost" | "minimumDeferredPlayCost" | "placePendingDigivolution"
> {
  maxAffordable(state: GameState, seat: Seat): number;
  payMemory(state: GameState, seat: Seat, cost: number): void;
  /** Apply continuous play-cost modifiers to the printed cost (before the Assembly reduction). */
  adjustedPlayCost?(state: GameState, seat: Seat, definition: CardDefinition, base: number): number;
  /** Seat-level prohibitions suppress the discount without preventing material placement. */
  canReducePlayCost?(state: GameState, seat: Seat): boolean;
  nextPermanentId(): string;
  /** Fire On Play for the placed permanent through the effect stack. */
  fireTiming(state: GameState, seat: Seat, timing: EffectTiming, sourceInstanceId: string): Promise<void>;
  placeMaterialsUnder(targetPermanentId: string, instanceIds: string[]): Promise<unknown>;
  emit?: (event: { kind: string; [k: string]: unknown }) => void;
}

export interface AssemblyOutcome {
  cardId: string;
  instanceId: string;
  permanentId: string;
  cost: number;
  materialInstanceIds: string[];
}

/** Validate an Assembly play declaration. Pure: mutates nothing. */
export function validateAssembly(
  state: GameState,
  seat: Seat,
  intent: AssemblyIntent,
  deps: Pick<
    AssemblyDeps,
    "maxAffordable" | "adjustedPlayCost" | "canReducePlayCost" | "hasBeforePayCost" | "minimumDeferredPlayCost"
  >,
): AssemblyCheck {
  if (state.gameOver) return { ok: false, reason: "game-over" };
  if (state.pendingDecision !== undefined) return { ok: false, reason: "decision-pending" };
  if (state.turnSeat !== seat) return { ok: false, reason: "not-your-turn" };
  if (state.phase !== Phase.Main) return { ok: false, reason: "wrong-phase" };

  const player = state.players[seat];
  if (player === undefined) return { ok: false, reason: "no-such-player" };

  const instanceIndex = player.hand.findIndex((c) => c.instanceId === intent.instanceId);
  const instance = player.hand[instanceIndex];
  if (instance === undefined) return { ok: false, reason: "card-not-in-zone" };

  const definition = definitionOf(instance.cardId);
  if (!isDigimon(definition)) return { ok: false, reason: "not-playable-kind" };
  const requirements = assemblyRequirementFor(instance.cardId) ?? [];
  if (requirements.length === 0) return { ok: false, reason: "not-assembly" };

  const materialIds = intent.assembly.materialInstanceIds;
  if (materialIds.length === 0) return { ok: false, reason: "no-materials" };

  // §7-3-1: materials come from the trash ONLY (unlike DigiXros's hand/field/trash/under-Tamer).
  const materialDefs: CardDefinition[] = [];
  const seen = new Set<string>();
  for (const materialId of materialIds) {
    if (seen.has(materialId)) return { ok: false, reason: "invalid-material" };
    seen.add(materialId);
    const inTrash = player.trash.find((c) => c.instanceId === materialId);
    if (inTrash === undefined) return { ok: false, reason: "invalid-material" };
    materialDefs.push(definitionOf(inTrash.cardId));
  }

  const requirement = satisfiedAssemblyRequirement(requirements, materialDefs, definition);
  if (requirement === undefined) return { ok: false, reason: "invalid-material" };

  const printed = normalizeCost(definition.playCost);
  const base = deps.adjustedPlayCost ? Math.max(0, deps.adjustedPlayCost(state, seat, definition, printed)) : printed;
  const reduction = deps.canReducePlayCost?.(state, seat) === false ? 0 : requirement.reduceCost;
  const cost = Math.max(0, base - reduction);
  if (deps.maxAffordable(state, seat) < cost) {
    const minimum = deps.minimumDeferredPlayCost?.(instance, cost);
    if (
      deps.hasBeforePayCost?.(instance) !== true ||
      (minimum !== undefined && minimum > deps.maxAffordable(state, seat))
    ) {
      return { ok: false, reason: "insufficient-memory" };
    }
  }

  return {
    ok: true,
    instance,
    definition,
    requirement,
    materialInstanceIds: (assemblyMaterialOrder(materialDefs, requirement.materials, definition) ?? []).map(
      (index) => materialIds[index]!,
    ),
    cost,
  };
}

/** Apply a validated Assembly play. */
export async function applyAssembly(
  state: GameState,
  seat: Seat,
  intent: AssemblyIntent,
  deps: AssemblyDeps,
): Promise<{ ok: false; reason: AssemblyRejection } | { ok: true; outcome: AssemblyOutcome }> {
  const check = validateAssembly(state, seat, intent, deps);
  if (!check.ok) return check;

  const { definition, materialInstanceIds } = check;
  // CR 7-3-2-2: would-be-played effects resolve before Assembly placement/payment.
  // The declared recipe discount is only arithmetic here; no material has moved yet.
  const needsFinalize =
    deps.finalizePlayCost !== undefined &&
    (deps.hasBeforePayCost === undefined || deps.hasBeforePayCost(check.instance));
  const cost = needsFinalize
    ? Math.max(0, await deps.finalizePlayCost!(state, seat, check.instance, definition, check.cost, "permanent"))
    : check.cost;
  if (needsFinalize) {
    // Optional costs can change the hand or consume trash materials. Never place a
    // partial recipe or charge memory using stale pre-prompt identities.
    const recheck = validateAssembly(state, seat, intent, { ...deps, maxAffordable: () => Infinity });
    if (!recheck.ok) return recheck;
  }
  if (deps.maxAffordable(state, seat) < cost) return { ok: false, reason: "insufficient-memory" };
  const player = state.players[seat]!;

  if (cost > 0) {
    const memoryBefore = state.memory;
    deps.payMemory(state, seat, cost);
    deps.emit?.({ kind: "memoryChanged", from: memoryBefore, to: state.memory, reason: "playCard" });
  }

  const playIndex = player.hand.findIndex((c) => c.instanceId === check.instance.instanceId);
  if (playIndex < 0) return { ok: false, reason: "card-not-in-zone" };
  const instance = extractCardAt(player, Zone.Hand, playIndex);
  if (instance === undefined) return { ok: false, reason: "card-not-in-zone" };
  instance.faceUp = true;

  const permanent = placePermanent(deps, player, instance, definition);
  permanent.enterFieldTurnCount = state.turnCount;
  deps.emit?.({
    kind: "cardPlayed",
    instanceId: instance.instanceId,
    fromZone: "hand",
    seat,
    cardId: instance.cardId,
    ...(instance.artId ? { artId: instance.artId } : {}),
    permanentId: permanent.permanentId,
  });

  // §7-3-2-6: cards are placed in stacking order so the card shown on the LEFT of the Assembly
  // requirements ends up ON TOP (closest to the played card). `placeUnder`'s default (non-belowTop)
  // placement inserts each call at the bottom of the pile, pushing prior placements up toward the
  // top — so processing `materialInstanceIds` in left-to-right declaration order, one call per
  // material, naturally leaves the FIRST-processed (leftmost) material on top. For a single
  // repeated slot (all materials identical/interchangeable), §7-3-2-6 explicitly leaves the
  // stacking order to the player, which is exactly the order they declared.
  const placedIds: string[] = [];
  for (const materialId of materialInstanceIds) {
    await deps.placeMaterialsUnder(permanent.permanentId, [materialId]);
    placedIds.push(materialId);
  }

  await deps.placePendingDigivolution?.(instance.instanceId, permanent.permanentId);
  await deps.fireTiming(state, seat, EffectTiming.OnPlay, instance.instanceId);

  return {
    ok: true,
    outcome: {
      cardId: instance.cardId,
      ...(instance.artId ? { artId: instance.artId } : {}),
      instanceId: instance.instanceId,
      permanentId: permanent.permanentId,
      cost,
      materialInstanceIds: placedIds,
    },
  };
}

// --- pure helpers ---

/** Whether a material's definition satisfies a single Assembly slot (name/trait AND level gates). */
export function materialMatchesAssemblySlot(
  def: CardDefinition,
  slot: AssemblyMaterial,
  destination?: CardDefinition,
): boolean {
  // A desc-only slot (no structured `names`/`namesExact`/`traits`/`nameOrTrait`) can't be matched precisely —
  // reject rather than accept an unconstrained material. See the module doc comment (IR coverage).
  // A level bound alone is never sufficient: it must anchor a name/trait gate, or it would accept
  // any card of that level regardless of the printed identity/trait requirement.
  const hasNameOrTrait =
    (slot.names?.length ?? 0) > 0 ||
    (slot.namesExact?.length ?? 0) > 0 ||
    (slot.traits?.length ?? 0) > 0 ||
    (slot.nameOrTrait?.length ?? 0) > 0 ||
    (slot.printedKeywords?.length ?? 0) > 0;
  if (!hasNameOrTrait) return false;

  if (slot.kinds && slot.kinds.length > 0 && !slot.kinds.some((kind) => def.kinds.includes(kind as never))) {
    return false;
  }

  if (slot.colors && slot.colors.length > 0 && !slot.colors.some((color) => def.colors.includes(color as never))) {
    return false;
  }

  // Printed (Rule) Name aliases apply in the trash too (EX5-046 is "treated as having [Sukamon]").
  if (slot.names && slot.names.length > 0) {
    const names = effectiveStaticNames(def);
    if (!slot.names.some((n) => names.some((name) => nameIncludesToken(name, n)))) return false;
  }
  if (slot.namesExact && slot.namesExact.length > 0) {
    const names = effectiveExactNames(def);
    if (!slot.namesExact.some((n) => names.includes(n))) return false;
  }
  if (slot.traits && slot.traits.length > 0) {
    if (!slot.traits.some((t) => cardHasTrait(def, t))) return false;
  }
  // Name-OR-trait disjunction ("[Agumon]/[Greymon] in name OR [ME]/[VB] trait" — EX12-016/-017,
  // BT26-073): qualify on any ref (union), reusing the engine's shared name/trait/text matcher.
  if (slot.nameOrTrait && slot.nameOrTrait.length > 0) {
    if (!slot.nameOrTrait.some((ref) => matchNameOrTrait(def, ref))) return false;
  }
  if (slot.printedKeywords?.some((keyword) => !definitionHasKeyword(def, keyword))) return false;
  return assemblyMaterialLevels(def, destination).some(
    (level) =>
      (slot.level === undefined || level === slot.level) &&
      (slot.levelMin === undefined || (level !== undefined && level >= slot.levelMin)) &&
      (slot.levelMax === undefined || (level !== undefined && level <= slot.levelMax)),
  );
}

/**
 * Whether `materials` can be assigned to the Assembly recipe `slots`. A repeated single-slot
 * requirement (such as EX13-077) requires every material to match that slot and applies its
 * cross-material `differentLevels`/`differentNames`/`differentColors` flags. Multi-slot
 * requirements use a per-slot partition for disjoint named/traited slots; their distinct-color
 * assignment is not inferred across slots.
 */
export function materialsSatisfyAssemblyRecipe(
  materials: CardDefinition[],
  slots: AssemblyMaterial[],
  destination?: CardDefinition,
): boolean {
  if (materials.length === 0 || slots.length === 0) return false;
  if (slots.length === 1) {
    const slot = slots[0]!;
    if (materials.length !== slot.count) return false;
    if (!materials.every((m) => materialMatchesAssemblySlot(m, slot, destination))) return false;
    if (slot.differentLevels === true) {
      const levels = materials.map((m) => m.level);
      if (levels.some((l) => l === undefined)) return false;
      if (new Set(levels).size !== levels.length) return false;
    }
    if (slot.differentNames === true && !canAssignDistinctNames(materials)) return false;
    if (slot.differentColors === true && !canAssignDistinctColors(materials.map((m) => m.colors))) return false;
    if (slot.differentCardNumbers === true) {
      const cardNumbers = materials.map((m) => m.cardId);
      if (new Set(cardNumbers).size !== cardNumbers.length) return false;
    }
    return true;
  }
  // Multi-slot: each slot claims its own exact-count partition of qualifying materials, tried
  // greedily in slot order (left-to-right) — sufficient for disjoint name/trait slots.
  const remaining = materials.slice();
  for (const slot of slots) {
    let claimed = 0;
    for (let i = remaining.length - 1; i >= 0 && claimed < slot.count; i--) {
      if (materialMatchesAssemblySlot(remaining[i]!, slot, destination)) {
        remaining.splice(i, 1);
        claimed += 1;
      }
    }
    if (claimed !== slot.count) return false;
  }
  return remaining.length === 0;
}

/** Material indices in the printed top-to-bottom slot order; repeated slots retain the player's order. */
export function assemblyMaterialOrder(
  materials: readonly CardDefinition[],
  slots: readonly AssemblyMaterial[],
  destination?: CardDefinition,
): number[] | undefined {
  if (slots.length === 1) return materials.map((_material, index) => index);
  const expanded = slots.flatMap((slot) => Array.from({ length: slot.count }, () => slot));
  if (expanded.length !== materials.length) return undefined;
  const order: number[] = [];
  function assign(slotIndex: number): boolean {
    if (slotIndex === expanded.length) return true;
    for (let index = 0; index < materials.length; index++) {
      if (order.includes(index) || !materialMatchesAssemblySlot(materials[index]!, expanded[slotIndex]!, destination))
        continue;
      order.push(index);
      if (assign(slotIndex + 1)) return true;
      order.pop();
    }
    return false;
  }
  return assign(0) ? order : undefined;
}

/**
 * The first alternative recipe that `materials` fully satisfies. §7-3-2-4 demands the exact
 * count, so a recipe of another size never matches.
 */
export function satisfiedAssemblyRequirement(
  requirements: readonly AssemblyRequirement[],
  materials: CardDefinition[],
  destination?: CardDefinition,
): AssemblyRequirement | undefined {
  return requirements.find(
    (requirement) =>
      materials.length === requirement.materials.reduce((sum, slot) => sum + slot.count, 0) &&
      materialsSatisfyAssemblyRecipe(materials, requirement.materials, destination),
  );
}
