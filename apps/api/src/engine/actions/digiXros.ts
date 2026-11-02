import { ArraySchema } from "@colyseus/schema";
import {
  CardInstance,
  Permanent,
  Phase,
  CardKind,
  EffectTiming,
  Zone,
  digiXrosRequirementFor,
  digiXrosSlotMatches,
  effectiveExactNames,
  type CardDefinition,
  type DigiXrosMaterial,
  type DigiXrosRequirement,
  digiXrosTrashNameAllowanceFor,
  type GameState,
  type PlayerState,
  type Seat,
} from "@aegis/shared";
import { hasDistinctRepresentatives } from "@aegis/shared/effects/hasDistinctRepresentatives";
import { cardHasTrait, definitionOf, dpOf } from "../cards/cardData.js";
import { extractCardAt, placePermanent as appendPermanent, setTopCard } from "../state/access.js";
import { digiXrosZoneExpanderFor } from "../digiXros/zoneExpanders.js";
import {
  allowsDigiXrosMaterialsFromTrash,
  allowsExtraDigiXrosMaterials,
  matchNameOrTrait,
} from "../effects/interpreter.js";

/**
 * cost block ~670-700).
 *
 * A card that carries a `digiXrosRequirement` may be played by placing the named material cards
 * under it — "When you would play this card, you may place specified cards from your hand/battle
 * area under it. Each placed card reduces the play cost." The play cost is reduced by
 *
 * Default material source zones are the player's HAND and the top cards of the player's BATTLE-AREA
 * Digimon. The TRASH and the cards UNDER the player's TAMERS are legal sources only while a
 * zone-expander Tamer (BT19-079 / BT19-087 / EX4-062) is active — the player suspends those Tamers
 * as the activation cost (the `expanderPermanentIds` in the plan), unlocking up to the expander's
 * per-zone maximum.
 *
 * The whole declaration (which materials, which Tamers to suspend) is carried in the intent and the
 * server validates it atomically — the engine never trusts a client cost, only the chosen pieces.
 */

/** A DigiXros play declaration (the `digiXros` field of a playCard intent), narrowed for this action. */
export interface DigiXrosPlanInput {
  materialInstanceIds: string[];
  expanderPermanentIds?: string[];
  /** When an expander scopes materials to one Tamer, the selected host Tamer. */
  underTamerHostPermanentId?: string;
}

export interface DigiXrosIntent {
  type: "playCard";
  instanceId: string;
  targetSlot?: number;
  digiXros: DigiXrosPlanInput;
}

export type DigiXrosRejection =
  | "not-your-turn"
  | "wrong-phase"
  | "decision-pending"
  | "game-over"
  | "no-such-player"
  | "card-not-in-zone"
  | "not-playable-kind"
  | "not-digixros" // the played card has no DigiXros requirement
  | "no-materials" // a DigiXros declaration must place at least one material
  | "invalid-material" // a chosen material is in an illegal zone, or does not satisfy any recipe slot
  | "invalid-expander" // a chosen expander Tamer is not a controllable expander for this play
  | "insufficient-memory";

/** Where a chosen DigiXros material currently sits (drives how it is placed under the new card). */
type MaterialSource = "hand" | "field" | "trash" | "underTamer";

interface ResolvedMaterial {
  instanceId: string;
  source: MaterialSource;
  definition: CardDefinition;
  /** When source === "field": the battle-area permanent that is relocated whole. */
  fieldPermanentId?: string;
  /** When source === "underTamer": the Tamer permanent hosting the material. */
  hostPermanentId?: string;
  /** A digivolution card declared from the trash it will reach when a "would be played" cost places its host. */
  awaitsRuleTrash?: boolean;
}

export type DigiXrosCheck =
  | { ok: false; reason: DigiXrosRejection }
  | {
      ok: true;
      instance: CardInstance;
      instanceIndex: number;
      definition: CardDefinition;
      requirement: DigiXrosRequirement;
      materials: ResolvedMaterial[];
      expanderPermanentIds: string[];
      perMaterialReduction: number;
      cost: number;
    };

export interface DigiXrosDeps {
  reservedMaterialInstanceIds?(instance: CardInstance): readonly string[];
  conditionalTrashAllowed?(instance: CardInstance): boolean | undefined;
  pendingSelfReduction?(instance: CardInstance): number;
  hasBeforePayCost?(instance: CardInstance): boolean;
  minimumDeferredPlayCost?(instance: CardInstance, baseCost: number): number | undefined;
  maxAffordable(state: GameState, seat: Seat): number;
  payMemory(state: GameState, seat: Seat, cost: number): void;
  /** Apply continuous play-cost modifiers to the printed cost (before the DigiXros reduction). */
  adjustedPlayCost?(state: GameState, seat: Seat, definition: CardDefinition, base: number): number;
  /** Whether the seat may apply DigiXros's own play-cost reduction. */
  canReducePlayCost?(state: GameState, seat: Seat): boolean;
  /** Resolve pay-time effects on the card after the DigiXros material reduction is known. */
  finalizePlayCost?(
    state: GameState,
    seat: Seat,
    instance: CardInstance,
    definition: CardDefinition,
    baseCost: number,
  ): Promise<number>;
  /**
   * Returns DigiXros-only granted name aliases for a material card instance (KB Q3068/Q3105/Q3119).
   * These are names the card is "also treated as [X] for a DigiXros" — valid ONLY in material
   * slot matching, not for any other name check. When omitted, no extra aliases are consulted.
   */
  digiXrosNamesOf?(instanceId: string): string[];
  /** Whether this field permanent may replace exactly one otherwise-required DigiXros slot. */
  canSubstituteMaterial?(permanentId: string): boolean;
  /**
   * Digivolution cards the played card's own "would be played" cost may trash by rule before the
   * DigiXros (BT12-112 Q2253). They count as trash materials.
   */
  ruleTrashMaterialCandidates?(playedInstance: CardInstance): readonly CardInstance[];
  nextPermanentId(): string;
  /** Fire On Play for the placed permanent through the effect stack.
   *  `materialCount` carries the number of DigiXros materials used, threaded into the trigger
   *  payload so a `digiXrosCount` condition can gate on "DigiXrosing with N or more cards". */
  fireTiming(
    state: GameState,
    seat: Seat,
    timing: EffectTiming,
    sourceInstanceId: string,
    materialCount?: number,
  ): Promise<void>;
  placeMaterialsUnder(targetPermanentId: string, instanceIds: string[]): Promise<unknown>;
  /**
   * Place the cards a cross-permanent play-cost reducer (BT10-093) committed. Its "when you would
   * play" effect resolves before the DigiXros, so the DigiXros materials go beneath these cards
   * (KB Q2025).
   */
  placePendingReducerCards?(playedInstanceId: string, permanentId: string): Promise<void>;
  /** Place costs committed while the played permanent did not yet exist. */
  placePendingDigivolution?(playedInstanceId: string, permanentId: string): Promise<void>;
  /** Move a whole battle-area permanent under another as digivolution cards. */
  relocatePermanent(
    destPermanentId: string,
    sourcePermanentId: string,
    opts?: { belowTop?: boolean; shedOwnCards?: boolean },
  ): boolean;
  /**
   * Resolve the "would leave" interrupts of the chosen field materials before they are placed
   * (§7-2-2-7, §15-8-5-2, Q3724/Q3725). The played card is still only revealed at this point.
   * Returns the material permanents whose leave was prevented or replaced.
   */
  interruptFieldMaterialLeave?(fieldPermanentIds: string[]): Promise<Set<string>>;
  /**
   * Zones an ACTIVE effect grant has opened as DigiXros material sources for this seat, from the
   * engine's `expandDigiXrosZones` ledger (BT17-057's Static "while you have a black Tamer",
   * Q2811). Distinct from the two static tables above: those are properties of the played card,
   * this is live board state that comes and goes with the granting permanent.
   */
  digiXrosExpandedZones?(seat: Seat, playedInstanceId: string): readonly string[];
  /** Per-zone material quotas for the same ledger, when the granting effect supplied them. */
  digiXrosExpandedZoneCounts?(seat: Seat, playedInstanceId: string): Partial<Record<string, number>>;
  /** Suspend an expander Tamer (the activation cost of unlocking its source zones). */
  suspendPermanent(permanentId: string): Promise<void>;
  emit?: (event: { kind: string; [k: string]: unknown }) => void;
}

export interface DigiXrosOutcome {
  cardId: string;
  instanceId: string;
  permanentId: string;
  cost: number;
  materialInstanceIds: string[];
}

/** Validate a DigiXros play declaration. Pure: mutates nothing. */
export function validateDigiXros(
  state: GameState,
  seat: Seat,
  intent: DigiXrosIntent,
  deps: Pick<
    DigiXrosDeps,
    | "maxAffordable"
    | "reservedMaterialInstanceIds"
    | "conditionalTrashAllowed"
    | "pendingSelfReduction"
    | "hasBeforePayCost"
    | "minimumDeferredPlayCost"
    | "adjustedPlayCost"
    | "canReducePlayCost"
    | "digiXrosNamesOf"
    | "canSubstituteMaterial"
    | "ruleTrashMaterialCandidates"
    | "digiXrosExpandedZones"
    | "digiXrosExpandedZoneCounts"
  >,
): DigiXrosCheck {
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
  if (!definition.kinds.includes(CardKind.Digimon)) return { ok: false, reason: "not-playable-kind" };
  const requirement = digiXrosRequirementFor(instance.cardId)?.[0];
  if (requirement === undefined) return { ok: false, reason: "not-digixros" };

  const materialIds = intent.digiXros.materialInstanceIds;
  if (materialIds.length === 0) return { ok: false, reason: "no-materials" };
  if (materialIds.some((id) => deps.reservedMaterialInstanceIds?.(instance).includes(id)))
    return { ok: false, reason: "invalid-material" };
  if (new Set(materialIds).size !== materialIds.length) return { ok: false, reason: "invalid-material" };

  // Resolve the chosen expander Tamers and aggregate the unlocked per-zone maxima. Each Tamer
  // is a separately paid effect, so multiple copies add their quotas (EX10-064 Q5178/Q5179).
  // An expander must be an unsuspended Tamer this seat controls whose
  // trait gate accepts the card being played.
  //
  // AllowDigiXrosMaterialsFromTrash (CAP-C-14, BT21-030): the played card's own IR declares that
  // trash is a valid material source, so trash is unrestricted regardless of expander Tamers.
  let underTamerMax = allowsExtraDigiXrosMaterials(instance.cardId) ? 1 : 0;
  let singleUnderTamerHost = false;
  let unrestrictedUnderTamerHost = false;
  const intrinsicTrashNames = digiXrosTrashNameAllowanceFor(instance.cardId);
  const intrinsicTrashAllowed =
    intrinsicTrashNames !== undefined &&
    player.battleArea.every((permanent) => {
      if (permanent.topCard === undefined) return true;
      const materialDefinition = definitionOf(permanent.topCard.cardId);
      return (
        !materialDefinition.kinds.includes(CardKind.Digimon) || intrinsicTrashNames.includes(materialDefinition.nameEn)
      );
    });
  const conditionalTrash = deps.conditionalTrashAllowed?.(instance);
  let trashMax =
    (conditionalTrash ?? allowsDigiXrosMaterialsFromTrash(instance.cardId)) || intrinsicTrashAllowed ? Infinity : 0;
  if (allowsExtraDigiXrosMaterials(instance.cardId)) trashMax = 1;
  // A live effect grant can open the trash as a material source for THIS seat regardless of what
  // the played card itself declares (BT17-057's Static "while you have a black Tamer", Q2811). The
  // effect-driven play path (interpreter/actions/play.ts) already consumes this ledger with the
  // same quota rule — a grant carrying no explicit count is worth one material — so the direct
  // playCard/DigiXros verb must not be the stricter of the two.
  const ledgerZones = deps.digiXrosExpandedZones?.(seat, instance.instanceId) ?? [];
  if (ledgerZones.includes("trash")) {
    const ledgerCounts = deps.digiXrosExpandedZoneCounts?.(seat, instance.instanceId);
    trashMax += ledgerCounts === undefined ? 1 : (ledgerCounts.trash ?? 1);
  }
  const expanderPermanentIds = intent.digiXros.expanderPermanentIds ?? [];
  if (new Set(expanderPermanentIds).size !== expanderPermanentIds.length) {
    return { ok: false, reason: "invalid-expander" };
  }
  for (const permanentId of expanderPermanentIds) {
    const perm = player.battleArea.find((p) => p.permanentId === permanentId);
    if (perm === undefined || perm.controllerSeat !== seat || perm.topCard === undefined || perm.isSuspended) {
      return { ok: false, reason: "invalid-expander" };
    }
    const expander = digiXrosZoneExpanderFor(perm.topCard.cardId);
    if (expander === undefined || !expander.appliesTo(definition)) {
      return { ok: false, reason: "invalid-expander" };
    }
    underTamerMax += expander.underTamerMax;
    singleUnderTamerHost ||= expander.underTamerHostScope === "single";
    unrestrictedUnderTamerHost ||= expander.underTamerHostScope === "any" || expander.underTamerHostScope === undefined;
    trashMax += expander.trashMax;
  }

  const selectedUnderTamerHost = intent.digiXros.underTamerHostPermanentId;
  if (selectedUnderTamerHost !== undefined) {
    const host = player.battleArea.find((permanent) => permanent.permanentId === selectedUnderTamerHost);
    if (
      host?.controllerSeat !== seat ||
      host.topCard === undefined ||
      !definitionOf(host.topCard.cardId).kinds.includes(CardKind.Tamer)
    ) {
      return { ok: false, reason: "invalid-expander" };
    }
  }
  const requiresSingleUnderTamerHost = singleUnderTamerHost && !unrestrictedUnderTamerHost;
  let resolvedUnderTamerHost = selectedUnderTamerHost;

  // Resolve each chosen material to its source zone, gated by the unlocked maxima.
  const materials: ResolvedMaterial[] = [];
  let trashUsed = 0;
  let underTamerUsed = 0;
  const ruleTrashCandidates = deps.ruleTrashMaterialCandidates?.(instance) ?? [];
  for (const materialId of materialIds) {
    if (materialId === instance.instanceId) return { ok: false, reason: "invalid-material" };
    const resolved = resolveMaterial(player, materialId) ?? resolveRuleTrashMaterial(ruleTrashCandidates, materialId);
    if (resolved === undefined) return { ok: false, reason: "invalid-material" };
    if (resolved.source === "trash") {
      trashUsed += 1;
      if (trashUsed > trashMax) return { ok: false, reason: "invalid-material" };
    }
    if (resolved.source === "underTamer") {
      underTamerUsed += 1;
      if (underTamerUsed > underTamerMax) return { ok: false, reason: "invalid-material" };
      if (requiresSingleUnderTamerHost) {
        if (resolved.hostPermanentId === undefined) return { ok: false, reason: "invalid-material" };
        resolvedUnderTamerHost ??= resolved.hostPermanentId;
        if (resolvedUnderTamerHost !== resolved.hostPermanentId) return { ok: false, reason: "invalid-material" };
      }
    }
    materials.push(resolved);
  }

  // `maxMaterials` caps a recipe that explicitly forbids "one of each" alternative (KB ruling,
  // e.g. EX6-025 Q3732: place 1 [A], 1 [B], or 1 [C] — NOT more than one). Absent = unbounded,
  // preserving the default single-slot "place N of [trait]" form (e.g. "[Bagra Army] x2").
  if (requirement.maxMaterials !== undefined && materials.length > requirement.maxMaterials) {
    return { ok: false, reason: "invalid-material" };
  }

  // Each material must satisfy a DISTINCT recipe slot (one per DigiXrosConditionElement). A
  // single-slot recipe (e.g. "[Bagra Army] x2") instead lets every material satisfy that one slot.
  // DigiXros-only name aliases (KB Q3068/Q3105/Q3119) are consulted per-material via `digiXrosNamesOf`.
  const digiXrosNamesAt =
    deps.digiXrosNamesOf !== undefined ? (i: number) => deps.digiXrosNamesOf!(materials[i]!.instanceId) : undefined;
  const canSubstituteAt = (index: number): boolean => {
    const permanentId = materials[index]?.fieldPermanentId;
    return permanentId !== undefined && deps.canSubstituteMaterial?.(permanentId) === true;
  };
  if (
    !materialsSatisfyRecipe(
      materials.map((m) => m.definition),
      requirement.materials,
      digiXrosNamesAt,
      canSubstituteAt,
    )
  ) {
    return { ok: false, reason: "invalid-material" };
  }

  const printed = normalizeCost(definition.playCost);
  const base = deps.adjustedPlayCost ? Math.max(0, deps.adjustedPlayCost(state, seat, definition, printed)) : printed;
  // When count is "∞", any number of matching materials is accepted; the per-material cost
  // reduction is supplied by `costReduction` (default 1 when absent). When count is a number,
  // `count` itself is the per-material reduction (legacy field semantics).
  const perMaterialReduction =
    deps.canReducePlayCost?.(state, seat) === false
      ? 0
      : requirement.count === "∞"
        ? (requirement.costReduction ?? 1)
        : requirement.count;
  const cost = Math.max(0, base - materials.length * perMaterialReduction);
  const payableCost = Math.max(0, cost - (deps.pendingSelfReduction?.(instance) ?? 0));
  const affordable = deps.maxAffordable(state, seat);
  if (affordable < payableCost) {
    const minimum = deps.minimumDeferredPlayCost?.(instance, payableCost);
    if (deps.hasBeforePayCost?.(instance) !== true || (minimum !== undefined && minimum > affordable))
      return { ok: false, reason: "insufficient-memory" };
  }

  return {
    ok: true,
    instance,
    instanceIndex,
    definition,
    requirement,
    materials,
    expanderPermanentIds,
    perMaterialReduction,
    cost,
  };
}

/** Apply a validated DigiXros play. */
export async function applyDigiXros(
  state: GameState,
  seat: Seat,
  intent: DigiXrosIntent,
  deps: DigiXrosDeps,
): Promise<{ ok: false; reason: DigiXrosRejection } | { ok: true; outcome: DigiXrosOutcome }> {
  const check = validateDigiXros(state, seat, intent, deps);
  if (!check.ok) return check;

  const { definition, materials, expanderPermanentIds } = check;
  let cost = deps.finalizePlayCost
    ? await deps.finalizePlayCost(state, seat, check.instance, definition, check.cost)
    : check.cost;
  if (cost > deps.maxAffordable(state, seat)) return { ok: false, reason: "insufficient-memory" };
  const player = state.players[seat]!;

  // (1) Pay the activation cost: suspend the chosen expander Tamers.
  for (const permanentId of expanderPermanentIds) {
    await deps.suspendPermanent(permanentId);
  }

  // (2) The chosen field materials' "would leave" interrupts resolve right before they are
  //     placed, while the played card is only revealed: it is neither paid for nor in play yet.
  //     A prevented or replaced material is not placed, so it does not reduce the cost.
  const fieldMaterialPermanentIds = materials.flatMap((material) =>
    material.source === "field" && material.fieldPermanentId !== undefined ? [material.fieldPermanentId] : [],
  );
  const interruptedPermanentIds =
    fieldMaterialPermanentIds.length === 0
      ? new Set<string>()
      : ((await deps.interruptFieldMaterialLeave?.(fieldMaterialPermanentIds)) ?? new Set<string>());
  const interruptedMaterialCount = materials.filter(
    (material) => material.fieldPermanentId !== undefined && interruptedPermanentIds.has(material.fieldPermanentId),
  ).length;
  cost += interruptedMaterialCount * check.perMaterialReduction;

  // (3) Pay the (reduced) memory cost.
  if (cost > 0) {
    const memoryBefore = state.memory;
    deps.payMemory(state, seat, cost);
    deps.emit?.({ kind: "memoryChanged", from: memoryBefore, to: state.memory, reason: "playCard" });
  }

  // (4) Remove the played card from hand and place it as a new battle-area permanent.
  const playIndex = player.hand.findIndex((c) => c.instanceId === check.instance.instanceId);
  if (playIndex < 0) return { ok: false, reason: "card-not-in-zone" };
  const instance = extractCardAt(player, Zone.Hand, playIndex);
  if (instance === undefined) return { ok: false, reason: "card-not-in-zone" };
  instance.faceUp = true;

  const permanent = placePermanent(deps, player, instance, definition);
  permanent.enterFieldTurnCount = state.turnCount;
  // A DigiXros is a play with materials (§7-2-2-7), so the mechanic rides on `cardPlayed`
  // rather than being re-derived client-side from the card's printed DigiXros requirement —
  // that heuristic said "this card CAN be DigiXros'd", not "this play WAS one".
  deps.emit?.({
    kind: "cardPlayed",
    instanceId: instance.instanceId,
    fromZone: "hand",
    seat,
    cardId: instance.cardId,
    ...(instance.artId ? { artId: instance.artId } : {}),
    permanentId: permanent.permanentId,
    mechanic: "digiXros",
    sourceCardIds: materials.map((material) => material.definition.cardId),
  });

  // (5) Place each material under the new permanent. A battle-area material contributes only its
  //     TOP card — §7-2-2-7 removes it from the battle area, so anything under it is trashed
  //     (`shedOwnCards`). A hand / trash / under-Tamer material is a single loose card already.
  //     "Would be played" placements resolve first, so a card they trash by rule can be a material (Q2252/Q2253).
  await deps.placePendingReducerCards?.(instance.instanceId, permanent.permanentId);
  await deps.placePendingDigivolution?.(instance.instanceId, permanent.permanentId);
  const placedIds: string[] = [];
  const orderedMaterialIndices =
    digiXrosMaterialOrder(
      materials.map((material) => material.definition),
      check.requirement.materials,
      deps.digiXrosNamesOf === undefined ? undefined : (index) => deps.digiXrosNamesOf!(materials[index]!.instanceId),
      (index) => {
        const permanentId = materials[index]?.fieldPermanentId;
        return permanentId !== undefined && deps.canSubstituteMaterial?.(permanentId) === true;
      },
    ) ?? materials.map((_material, index) => index);
  for (const index of orderedMaterialIndices) {
    const material = materials[index]!;
    if (material.source === "field" && material.fieldPermanentId !== undefined) {
      if (interruptedPermanentIds.has(material.fieldPermanentId)) continue;
      const relocated = deps.relocatePermanent(permanent.permanentId, material.fieldPermanentId, {
        shedOwnCards: true,
        belowTop: false,
      });
      if (!relocated) {
        continue;
      }
    } else {
      if (material.awaitsRuleTrash === true && !player.trash.some((card) => card.instanceId === material.instanceId)) {
        continue;
      }
      await deps.placeMaterialsUnder(permanent.permanentId, [material.instanceId]);
    }
    placedIds.push(material.instanceId);
  }

  // A declared material can still fail to arrive after payment (it moved during an interrupt, or
  // a "would be played" cost did not trash it). DigiXros reduces the play cost only for cards
  // placed, so restore that reduction and report only the material count that reached the new
  // permanent.
  const unplacedAfterPaymentCount = materials.length - interruptedMaterialCount - placedIds.length;
  const restoredCost = unplacedAfterPaymentCount * check.perMaterialReduction;
  if (restoredCost > 0) {
    const memoryBefore = state.memory;
    deps.payMemory(state, seat, restoredCost);
    deps.emit?.({ kind: "memoryChanged", from: memoryBefore, to: state.memory, reason: "playCard" });
    cost += restoredCost;
  }

  // (6) Fire On Play, carrying the material count so `digiXrosCount` conditions can gate on it.
  await deps.fireTiming(state, seat, EffectTiming.OnPlay, instance.instanceId, placedIds.length);

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

export function normalizeCost(playCost: number): number {
  return playCost < 0 ? 0 : playCost;
}

/** Locate a chosen material in `player`'s zones and report how it is sourced (or undefined). */
function resolveMaterial(player: PlayerState, instanceId: string): ResolvedMaterial | undefined {
  const inHand = player.hand.find((c) => c.instanceId === instanceId);
  if (inHand !== undefined) {
    return { instanceId, source: "hand", definition: definitionOf(inHand.cardId) };
  }
  // Battle-area Digimon top card (the whole permanent becomes a digivolution stack).
  for (const perm of player.battleArea) {
    if (perm.controllerSeat !== player.seat) continue;
    if (perm.topCard?.instanceId === instanceId) {
      const def = definitionOf(perm.topCard.cardId);
      if (perm.inBreeding) return undefined;
      return { instanceId, source: "field", definition: def, fieldPermanentId: perm.permanentId };
    }
  }
  const inTrash = player.trash.find((c) => c.instanceId === instanceId);
  if (inTrash !== undefined) {
    return { instanceId, source: "trash", definition: definitionOf(inTrash.cardId) };
  }
  // A card under one of the player's Tamers.
  for (const perm of player.battleArea) {
    if (
      perm.controllerSeat !== player.seat ||
      perm.topCard === undefined ||
      !definitionOf(perm.topCard.cardId).kinds.includes(CardKind.Tamer)
    ) {
      continue;
    }
    const under = perm.stack.find((c) => c.instanceId === instanceId);
    if (under !== undefined) {
      return {
        instanceId,
        source: "underTamer",
        definition: definitionOf(under.cardId),
        hostPermanentId: perm.permanentId,
      };
    }
  }
  return undefined;
}

function resolveRuleTrashMaterial(
  candidates: readonly CardInstance[],
  instanceId: string,
): ResolvedMaterial | undefined {
  const card = candidates.find((candidate) => candidate.instanceId === instanceId);
  if (card === undefined) return undefined;
  return { instanceId, source: "trash", definition: definitionOf(card.cardId), awaitsRuleTrash: true };
}

function materialMatchesSlot(def: CardDefinition, slot: DigiXrosMaterial, digiXrosNames?: string[]): boolean {
  return digiXrosSlotMatches(def, slot, { hasTrait: cardHasTrait, matchNameOrTrait }, digiXrosNames ?? []);
}

/** §15-15-6-2: a requirement for a card that isn't the same as another can't be replaced. */
function slotAcceptsSubstitute(slot: DigiXrosMaterial): boolean {
  return slot.differentCardNumbers !== true && slot.differentNames !== true;
}

/**
 * Whether `materials` can be assigned to the recipe `slots`. Each material must match a DISTINCT
 * slot (one per DigiXrosConditionElement). A single-slot recipe is the exception: every material
 * must satisfy that one slot (the "place N of [trait]" form).
 *
 * `digiXrosNamesAt` is an optional per-index lookup for name aliases granted to a material only
 * in the DigiXros context (KB Q3068/Q3105/Q3119: "also treated as [X] for a DigiXros").
 */
export function materialsSatisfyRecipe(
  materials: CardDefinition[],
  slots: DigiXrosMaterial[],
  digiXrosNamesAt?: (index: number) => string[],
  canSubstituteAt?: (index: number) => boolean,
): boolean {
  if (materials.length === 0) return false;
  if (slots.length === 1) {
    const slot = slots[0]!;
    const mismatches = materials.reduce(
      (count, material, index) => count + (materialMatchesSlot(material, slot, digiXrosNamesAt?.(index)) ? 0 : 1),
      0,
    );
    if (mismatches > 1) return false;
    if (mismatches === 1) {
      const mismatchIndex = materials.findIndex(
        (material, index) => !materialMatchesSlot(material, slot, digiXrosNamesAt?.(index)),
      );
      if (mismatchIndex < 0 || !slotAcceptsSubstitute(slot) || canSubstituteAt?.(mismatchIndex) !== true) {
        return false;
      }
    }
    // "with different card numbers" (BT19-065, BT21-030, EX3-013): no two placed materials may
    // share a printed card number (cardId).
    if (slot.differentCardNumbers === true) {
      const ids = materials.map((m) => m.cardId);
      if (new Set(ids).size !== ids.length) return false;
    }
    if (
      slot.differentNames === true &&
      !hasDistinctRepresentatives(
        materials.map((material, index) =>
          [...effectiveExactNames(material), ...(digiXrosNamesAt?.(index) ?? [])].map((name) => name.toLowerCase()),
        ),
      )
    ) {
      return false;
    }
    return true;
  }
  return digiXrosMaterialOrder(materials, slots, digiXrosNamesAt, canSubstituteAt) !== undefined;
}

/** Material indices in printed recipe order (leftmost goes directly below the played card).
 * Callers supply a material selection already checked by `materialsSatisfyRecipe`.
 */
export function digiXrosMaterialOrder(
  materials: CardDefinition[],
  slots: DigiXrosMaterial[],
  digiXrosNamesAt?: (index: number) => string[],
  canSubstituteAt?: (index: number) => boolean,
): number[] | undefined {
  if (materials.length === 0 || slots.length === 0) return undefined;
  // A counted, single-slot recipe leaves its material order to the player.
  if (slots.length === 1) return materials.map((_material, index) => index);
  if (materials.length > slots.length) return undefined;
  // Bipartite matching: assign each material to a distinct satisfying slot (backtracking; sizes are
  // tiny — at most a handful of slots/materials).
  const usedSlots = new Array<boolean>(slots.length).fill(false);
  const assignedSlots = new Array<number>(materials.length);
  const assign = (i: number, substitutionUsed: boolean): boolean => {
    if (i === materials.length) return true;
    for (let s = 0; s < slots.length; s++) {
      if (usedSlots[s]) continue;
      const matches = materialMatchesSlot(materials[i]!, slots[s]!, digiXrosNamesAt?.(i));
      const substitutes =
        !matches && !substitutionUsed && slotAcceptsSubstitute(slots[s]!) && canSubstituteAt?.(i) === true;
      if (!matches && !substitutes) continue;
      usedSlots[s] = true;
      assignedSlots[i] = s;
      if (assign(i + 1, substitutionUsed || substitutes)) return true;
      usedSlots[s] = false;
    }
    return false;
  };
  return assign(0, false)
    ? materials.map((_material, index) => index).sort((left, right) => assignedSlots[left]! - assignedSlots[right]!)
    : undefined;
}

/** Build a fresh battle-area Permanent for a hand card being played (shared with Assembly). */
export function placePermanent(
  deps: Pick<DigiXrosDeps, "nextPermanentId">,
  player: PlayerState,
  instance: CardInstance,
  definition: CardDefinition,
): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = deps.nextPermanentId();
  permanent.controllerSeat = player.seat;
  setTopCard(permanent, instance);
  permanent.stack = new ArraySchema<CardInstance>();
  permanent.linked = new ArraySchema<CardInstance>();
  const dp = dpOf(definition);
  permanent.baseDP = dp;
  permanent.currentDP = dp;
  permanent.isSuspended = false;
  permanent.inBreeding = false;
  appendPermanent(player, permanent);
  return permanent;
}
