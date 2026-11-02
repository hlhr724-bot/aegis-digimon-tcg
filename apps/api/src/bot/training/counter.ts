import type { Seat } from "@aegis/shared";
import type { GameEngine } from "../../engine/GameEngine.js";
import { blastDnaCounterChoices } from "../../engine/gameEngine/intents/combat.js";
import type { CounterContext } from "../policy.js";
import type { TrainingAction } from "./actions.js";

/** Preserve every published Counter route and expose its own visible evolution materials. */
export function counterActions(engine: GameEngine, seat: Seat, context: CounterContext): TrainingAction[] {
  const dnaChoices = context.eligibleCounters.some((counter) => counter.effectKey.startsWith("blast-dna-digivolve:"))
    ? blastDnaCounterChoices(engine, seat)
    : [];
  return [
    { intent: { type: "respondCounter" }, label: "Decline counter", targetId: context.attackerPermanentId },
    ...context.eligibleCounters.map((counter): TrainingAction => {
      const dna = dnaChoices.find(
        (choice) => choice.instanceId === counter.instanceId && choice.effectKey === counter.effectKey,
      );
      const materialIds = dna
        ? dna.extraMaterialsOnBottom
          ? [dna.handMaterialInstanceId, dna.materialPermanentId]
          : [dna.materialPermanentId, dna.handMaterialInstanceId]
        : counter.effectKey.startsWith("blast-digivolve:")
          ? [counter.effectKey.slice("blast-digivolve:".length)]
          : undefined;
      return {
        intent: { type: "respondCounter", sourceInstanceId: counter.instanceId, effectKey: counter.effectKey },
        label: counter.description,
        sourceId: counter.instanceId,
        targetId: context.attackerPermanentId,
        ...(materialIds === undefined ? {} : { materialIds }),
      };
    }),
  ];
}
