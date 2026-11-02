import { getCompiledCard } from "@aegis/shared";
import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const generated = getCompiledCard("EX5-065")!;
export const compiled: CompiledCard = structuredClone(generated);

const startOfOpponentsTurn = compiled.effects.find((effect) => effect.trigger === "StartOfOpponentsTurn");
const dnaDigivolve = startOfOpponentsTurn?.actions.find((action) => action.kind === "DnaDigivolve");
if (dnaDigivolve?.kind === "DnaDigivolve") {
  dnaDigivolve.cost = {
    kind: "playFromDigivolutionCards",
    hostTarget: {
      filter: {
        controller: "mine",
        kind: ["Digimon"],
        nameOrTrait: [{ tokens: ["Night Claw", "Light Fang"], match: "trait" }],
      },
      count: 1,
    },
    target: { filter: { kind: ["Digimon"] }, count: 1 },
    sameLevelAsHost: true,
    bindResultAs: "ex5-065-played",
    raw: "By playing 1 card with the same level as one of your [Night Claw]/[Light Fang] trait Digimon from that Digimon's digivolution cards without paying the cost",
  };
}
if (startOfOpponentsTurn !== undefined) {
  startOfOpponentsTurn.description =
    "[Start of Opponent's Turn] Play a same-level stack card, DNA digivolve, then return the Digimon played at end of turn.";
  const immediateReturnIndex = startOfOpponentsTurn.actions.findIndex((action) => action.kind === "Return");
  if (immediateReturnIndex >= 0) {
    startOfOpponentsTurn.actions[immediateReturnIndex] = {
      kind: "DelayedEffect",
      trigger: "nextEndOfOpponentTurn",
      effect: {
        kind: "Return",
        target: { filter: { boundRef: "ex5-065-played" }, count: 1 },
        to: "hand",
      },
      raw: "At the end of the turn, return the Digimon played by this effect to hand.",
    };
  }
}

const yourTurn = compiled.effects.find((effect) => effect.trigger === "YourTurn");
if (yourTurn) {
  yourTurn.actions = [
    {
      kind: "SubTrigger",
      event: "onAddDigivolutionCards",
      sourceFilter: { controller: "mine", kind: ["Digimon"] },
      requirePlacedOwnTopAtStackBottom: true,
      cost: {
        kind: "suspend",
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        raw: "by suspending this Tamer",
      },
      actions: [{ kind: "GainMemory", amount: 1 }],
    },
  ];
}
compiled.coverage = "full";
compiled.residual = [];

registerIrCard("EX5-065", compiled);
