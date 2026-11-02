import { CardColor, CardKind, nameIncludesToken, type CardDefinition, type Intent } from "@aegis/shared";
import { cardHasTrait, matchingEvoCost, matchingAlternateDigivolutionRequirement } from "../engine/cards/cardData.js";
import { isDigimonCard, isDigiEggCard, isOptionCard, isTamerCard, type BotUnit, type BotView } from "./view.js";

/**
 * Candidate enumeration — the bot's answer to "what may I do right now?".
 *
 * The engine already projects the authoritative attack legality onto every permanent
 * (`canAttackPlayer` / `attackablePermanentIds`, resolved through the same combat
 * legality seam `applyIntent` uses), so attack candidates are read straight off state
 * and are legal by construction. Play and digivolve have no such projection, so those
 * are reconstructed here from the card data using the same predicates the engine's
 * validators use — printed evolution requirements, affordability against the memory
 * gauge, and the printed Option color requirement.
 *
 * A candidate the engine still rejects is not a correctness bug (an unmodelled
 * continuous restriction can forbid a play), so the policy blocklists a rejected key
 * for the rest of the turn and re-plans rather than stalling.
 */

export type CandidateKind =
  | "attackPlayer"
  | "attackDigimon"
  | "dnaDigivolve"
  | "linkCard"
  | "digivolve"
  | "playDigimon"
  | "playTamer"
  | "playOption"
  | "activateEffect"
  | "endPhase";

export interface Candidate {
  kind: CandidateKind;
  /** Stable identity so a rejected candidate can be blocklisted for the turn. */
  key: string;
  intent: Intent;
  /** Memory this action moves off our side of the gauge. */
  cost: number;
  attacker?: BotUnit;
  target?: BotUnit;
  base?: BotUnit;
  definition?: CardDefinition;
  materials?: readonly BotUnit[];
}

/** Every action the bot may take in its own Main phase, including passing. */
export function enumerateMainPhaseCandidates(view: BotView): Candidate[] {
  return [
    ...attackCandidates(view),
    ...digivolveCandidates(view),
    ...playCandidates(view),
    ...activateCandidates(view),
    { kind: "endPhase", key: "endPhase", intent: { type: "endPhase" }, cost: 0 },
  ];
}

export function attackCandidates(view: BotView): Candidate[] {
  const candidates: Candidate[] = [];
  const opponentById = new Map(view.opponentBoard.map((unit) => [unit.permanentId, unit]));
  for (const attacker of view.board) {
    if (attacker.canAttackPlayer) {
      candidates.push({
        kind: "attackPlayer",
        key: `attackPlayer:${attacker.permanentId}`,
        intent: { type: "attack", attackerPermanentId: attacker.permanentId, target: { kind: "player" } },
        cost: 0,
        attacker,
      });
    }
    for (const targetId of attacker.attackablePermanentIds) {
      const target = opponentById.get(targetId);
      if (target === undefined) continue;
      candidates.push({
        kind: "attackDigimon",
        key: `attackDigimon:${attacker.permanentId}:${targetId}`,
        intent: {
          type: "attack",
          attackerPermanentId: attacker.permanentId,
          target: { kind: "permanent", permanentId: targetId },
        },
        cost: 0,
        attacker,
        target,
      });
    }
  }
  return candidates;
}

function digivolveCandidates(view: BotView): Candidate[] {
  const bases = view.breeding === undefined ? view.board : [...view.board, view.breeding];
  const candidates: Candidate[] = [];
  for (const card of view.hand) {
    if (!isDigimonCard(card.definition)) continue;
    for (const base of bases) {
      if (base.cardId === undefined || base.cannotDigivolve) continue;
      const cost =
        card.digivolveCosts === undefined
          ? digivolveCost(card.cardId, base.cardId, {
              inBreeding: base === view.breeding,
              controlledUnits: view.board,
            })
          : card.digivolveCosts[base.permanentId];
      if (cost === undefined || cost > view.maxAffordable) continue;
      candidates.push({
        kind: "digivolve",
        key: `digivolve:${card.instanceId}:${base.permanentId}`,
        intent: { type: "digivolve", permanentId: base.permanentId, instanceId: card.instanceId },
        cost,
        base,
        definition: card.definition,
      });
    }
  }
  return candidates;
}

function playCandidates(view: BotView): Candidate[] {
  const candidates: Candidate[] = [];
  for (const card of view.hand) {
    const definition = card.definition;
    if (definition === undefined || isDigiEggCard(definition)) continue;
    // The engine normalizes a "no printed cost" (-1) card to a free play rather than
    // refusing it, so the bot must not quietly drop those cards from its options.
    const cost = Math.max(0, definition.playCost);
    if (cost > view.maxAffordable) continue;

    const kind = playKindOf(definition);
    if (kind === undefined) continue;
    if (!colorRequirementMet(definition, kind, view)) continue;

    candidates.push({
      kind,
      // One key spelling for all three play kinds: a rejected `playCard` intent cannot
      // tell us which kind it was, and an instance only ever produces one of them.
      key: `play:${card.instanceId}`,
      intent: { type: "playCard", instanceId: card.instanceId },
      cost,
      definition,
    });
  }
  return candidates;
}

function playKindOf(definition: CardDefinition): CandidateKind | undefined {
  // A DUAL card can be used as an Option or digivolved, never played as a Digimon.
  if (isOptionCard(definition)) return "playOption";
  if (isDigimonCard(definition)) return "playDigimon";
  if (isTamerCard(definition)) return "playTamer";
  return undefined;
}

/**
 * The printed color requirement gate: EVERY required color must be present on a Digimon or
 * Tamer we control (Comprehensive Rules §4-21-2).
 *
 * The `required` expression mirrors `GameEngine.printedColorRequirementMet` exactly, and
 * the exactness matters: an explicit `optionColorRequirements` list gates the play in EVERY
 * mode, not just the Option one. DUAL cards classify as `playOption` and use their
 * Option-side color requirements.
 *
 * Conservative by construction: it cannot see the continuous color grants the engine folds
 * in, so it may skip a play a grant would have allowed, never propose one that is illegal.
 */
function colorRequirementMet(definition: CardDefinition, kind: CandidateKind, view: BotView): boolean {
  const required = definition.optionColorRequirements ?? (kind === "playOption" ? (definition.colors ?? []) : []);
  if (required.length === 0) return true;
  return required.every((color) => color === CardColor.None || view.ownFieldColors.has(color));
}

function activateCandidates(view: BotView): Candidate[] {
  const candidates: Candidate[] = [];
  const sources = view.breeding === undefined ? view.board : [...view.board, view.breeding];
  for (const unit of sources) {
    for (const effect of unit.activatableEffects) {
      candidates.push({
        kind: "activateEffect",
        key: `activate:${effect.instanceId}:${effect.effectKey}`,
        intent: { type: "activateEffect", sourceInstanceId: effect.instanceId, effectKey: effect.effectKey },
        cost: 0,
      });
    }
  }
  for (const card of view.hand) {
    for (const effect of card.activatableEffects) {
      candidates.push({
        kind: "activateEffect",
        key: `activate:${effect.instanceId}:${effect.effectKey}`,
        intent: { type: "activateEffect", sourceInstanceId: effect.instanceId, effectKey: effect.effectKey },
        cost: 0,
      });
    }
  }
  return candidates;
}

/**
 * Memory cost to digivolve `evolvingId` onto `baseId`, or undefined when no legal path
 * exists. Prefers the printed EvoCost and falls back to an alternate requirement.
 *
 * An alternate path is skipped when it carries a NON-MEMORY condition the enumeration
 * cannot evaluate — a placement cost, a ＜Burst Digivolve＞ Tamer return, or a
 * digivolution-stack count gate on the base. Each of those is a separate legality check in
 * `digivolve.ts` that would reject the intent, and the memory cost alone does not describe
 * them. Skipping is the safe failure: the path is unavailable, never wrongly available.
 */
export function digivolveCost(
  evolvingId: string,
  baseId: string,
  options: { inBreeding?: boolean; controlledUnits?: readonly BotUnit[] } = {},
): number | undefined {
  const evo = matchingEvoCost(evolvingId, baseId);
  if (evo !== undefined) return evo.memoryCost;
  const alternate = matchingAlternateDigivolutionRequirement(evolvingId, baseId);
  if (alternate === undefined) return undefined;
  const hasUnverifiableCost =
    (alternate.battleAreaOnly === true && options.inBreeding === true) ||
    alternate.placementCost !== undefined ||
    alternate.burstDigivolve !== undefined ||
    alternate.minTraitStackCount !== undefined ||
    alternate.minNameStackCount !== undefined;
  if (hasUnverifiableCost || !controllerControlsGateMet(alternate.controllerControls, options.controlledUnits)) {
    return undefined;
  }
  return alternate.cost;
}

function controllerControlsGateMet(
  gate: NonNullable<ReturnType<typeof matchingAlternateDigivolutionRequirement>>["controllerControls"],
  controlledUnits: readonly BotUnit[] | undefined,
): boolean {
  if (gate === undefined) return true;
  if (controlledUnits === undefined) return false;
  const matching = controlledUnits.filter((unit) => {
    const definition = unit.definition;
    if (definition === undefined) return false;
    if (gate.kind?.length && !gate.kind.some((kind) => definition.kinds.includes(kind as CardKind))) return false;
    if (gate.namesExact?.length && !gate.namesExact.includes(definition.nameEn)) return false;
    if (gate.names?.length && !gate.names.some((name) => nameIncludesToken(definition.nameEn, name))) return false;
    if (gate.traits?.length && !gate.traits.some((trait) => cardHasTrait(definition, trait))) return false;
    return true;
  }).length;
  return matching >= (gate.min ?? 1);
}
