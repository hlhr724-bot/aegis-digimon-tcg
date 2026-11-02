import { assemblyRequirementFor, digivolutionRequirementsFor, type Intent, type Seat } from "@aegis/shared";
import type { GameEngine } from "../../engine/GameEngine.js";
import { validateAssembly, validateAttack, validateDigivolve, validatePlayCard } from "../../engine/actions/index.js";
import { validateHatchEgg, validateMoveFromBreeding } from "../../engine/actions/breeding.js";
import { validateActivateEffect } from "../../engine/actions/activateEffect.js";
import {
  activateEffectDeps,
  assemblyDeps,
  attackDeps,
  breedingDeps,
  digivolveDeps,
  playCardDeps,
} from "../../engine/gameEngine/actionDeps.js";
import { assemblyMaterialCandidates, firstAssemblyRecipe, type AssemblyMaterialCandidate } from "./assembly.js";
import { specialMainActions } from "./specialActions.js";
import { digiXrosMainActions } from "./digiXros.js";
import type { ActivationMemoryCost } from "#api/engine/effects/ActivationMemoryCost";

export interface TrainingAction {
  intent: Intent;
  label: string;
  sourceId?: string;
  targetId?: string;
  projectedCost?: number;
  activationMemoryCost?: ActivationMemoryCost;
  /** Physical material identities for compound declarations; encoded only through visible card state. */
  materialIds?: readonly string[];
  /** Materials are chosen in follow-up windows; `intent` holds one valid recipe for legality only. */
  assembly?: { cardId: string; candidates: AssemblyMaterialCandidate[] };
}

export function breedingActions(engine: GameEngine, seat: Seat): TrainingAction[] {
  const actions: TrainingAction[] = [{ intent: { type: "endPhase" }, label: "Skip breeding" }];
  if (validateHatchEgg(engine.state, seat).ok) actions.push({ intent: { type: "hatchEgg" }, label: "Hatch" });
  const permanent = engine.state.players[seat]?.breeding;
  if (permanent !== undefined) {
    const intent: Intent = { type: "moveFromBreeding", permanentId: permanent.permanentId };
    if (validateMoveFromBreeding(engine.state, seat, intent, breedingDeps(engine)).ok) {
      actions.push({ intent, label: "Move from breeding", sourceId: permanent.permanentId });
    }
  }
  return actions;
}

const DEFAULT_DIGIXROS_VALIDATION_BUDGET = 256;

/** Match the real main-verb handlers, including alternate costs and breeding effects. */
export function mainActions(
  engine: GameEngine,
  seat: Seat,
  options: { includeSpecialActions?: boolean; digiXrosValidationBudget?: number } = {},
): TrainingAction[] {
  const state = engine.state;
  const player = state.players[seat];
  if (player === undefined) throw new Error(`Unseated training player ${seat}`);
  const actions: TrainingAction[] = [
    { intent: { type: "endPhase" }, label: "End main phase" },
    ...(options.includeSpecialActions === false ? [] : specialMainActions(engine, seat)),
    ...digiXrosMainActions(engine, seat, {
      validationBudget: options.digiXrosValidationBudget ?? DEFAULT_DIGIXROS_VALIDATION_BUDGET,
    }),
  ];
  const bases = [...player.battleArea, ...(player.breeding === undefined ? [] : [player.breeding])];
  const playDeps = playCardDeps(engine);
  const evolveDeps = digivolveDeps(engine);
  const combatDeps = attackDeps(engine);
  const effectDeps = activateEffectDeps(engine);
  for (const card of player.hand) {
    const intent: Intent = { type: "playCard", instanceId: card.instanceId };
    const check = validatePlayCard(state, seat, intent, playDeps);
    if (check.ok)
      actions.push({ intent, label: "Play or use card", sourceId: card.instanceId, projectedCost: check.cost });
    if (assemblyRequirementFor(card.cardId) !== undefined) {
      const candidates = assemblyMaterialCandidates(
        card.cardId,
        Array.from(player.trash, ({ instanceId, cardId }) => ({ instanceId, cardId })),
      );
      const recipe = firstAssemblyRecipe(card.cardId, candidates);
      if (recipe !== undefined) {
        const assembly: Intent = {
          type: "playCard",
          instanceId: card.instanceId,
          assembly: { materialInstanceIds: recipe },
        };
        const route = validateAssembly(
          state,
          seat,
          { type: "playCard", instanceId: card.instanceId, assembly: { materialInstanceIds: recipe } },
          assemblyDeps(engine),
        );
        if (route.ok)
          actions.push({
            intent: assembly,
            label: "Assembly play",
            sourceId: card.instanceId,
            projectedCost: route.cost,
            assembly: { cardId: card.cardId, candidates },
          });
      }
    }
    for (const base of bases) {
      // Test alternate requirements independently: a failed normal path must not
      // suppress a different legal trait/name path for the same pair of cards.
      for (const index of [
        -1,
        ...(digivolutionRequirementsFor(card.cardId) ?? []).map((_, requirementIndex) => requirementIndex),
      ]) {
        const evolve: Intent = {
          type: "digivolve",
          instanceId: card.instanceId,
          permanentId: base.permanentId,
          ...(index < 0 ? {} : { alternateRequirementIndex: index }),
        };
        const route = validateDigivolve(state, seat, evolve, evolveDeps, { deferAffordability: true });
        if (route.ok)
          actions.push({
            intent: evolve,
            label: index < 0 ? "Digivolve" : `Alternate digivolution ${index}`,
            sourceId: card.instanceId,
            targetId: base.permanentId,
            projectedCost: route.cost,
          });
      }
    }
  }
  for (const attacker of player.battleArea) {
    const targets: Extract<Intent, { type: "attack" }>["target"][] = [
      { kind: "player" },
      ...Array.from(state.players[seat === 0 ? 1 : 0]!.battleArea, (permanent) => ({
        kind: "permanent" as const,
        permanentId: permanent.permanentId,
      })),
    ];
    for (const target of targets) {
      const intent: Intent = { type: "attack", attackerPermanentId: attacker.permanentId, target };
      if (validateAttack(combatDeps, seat, intent) === null) {
        actions.push({
          intent,
          label: target.kind === "player" ? "Attack player" : "Attack Digimon",
          sourceId: attacker.permanentId,
          ...(target.kind === "player" ? {} : { targetId: target.permanentId }),
        });
      }
    }
  }
  const instances = [
    ...player.hand,
    ...player.trash,
    ...player.delayZone,
    ...bases.flatMap((base) => [base.topCard, ...base.stack, ...base.linked]),
  ];
  const seen = new Set<string>();
  for (const { source, effect } of engine.projection.activatableEffectsFor(instances)) {
    const intent: Intent = { type: "activateEffect", sourceInstanceId: source.instanceId, effectKey: effect.effectKey };
    const key = JSON.stringify(intent);
    if (seen.has(key) || !validateActivateEffect(state, seat, intent, effectDeps).ok) continue;
    seen.add(key);
    const host = source.permanent();
    const activationMemoryCost = effect.activationMemoryCost ?? { minimum: 0, maximum: null };
    actions.push({
      intent,
      label: effect.description,
      sourceId: source.instanceId,
      activationMemoryCost,
      ...(activationMemoryCost.maximum !== null && activationMemoryCost.maximum === activationMemoryCost.minimum
        ? { projectedCost: activationMemoryCost.maximum }
        : {}),
      ...(host === undefined ? {} : { targetId: host.permanentId }),
    });
  }
  return actions;
}

/** Do not ask a synchronous external policy while async entry/effect work still owns the turn. */
export function mainActionReady(engine: GameEngine): boolean {
  return (
    !engine.mainEntryPending &&
    engine.effectResolutionDepth === 0 &&
    engine.optionResolutionDepth === 0 &&
    engine.mainVerbContinuationsInFlight === 0 &&
    !engine.combat.isAttacking
  );
}
