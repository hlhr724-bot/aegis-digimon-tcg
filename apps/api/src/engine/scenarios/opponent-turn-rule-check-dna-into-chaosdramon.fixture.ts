import type { ScenarioFixture } from "../scenario/types.js";

const filler = (count: number): string[] => Array.from({ length: count }, () => "BT1-009");

export const opponentTurnRuleCheckDnaIntoChaosdramon: ScenarioFixture = {
  name: "opponent-turn-rule-check-dna-into-chaosdramon",
  board: {
    0: {
      battleArea: [
        { card: "EX12-058", as: "hiandromon", dp: 8000, under: ["EX12-003", "EX12-055"] },
        { card: "EX12-055", as: "andromon" },
      ],
      hand: [
        { card: "EX12-059", as: "machinedramon" },
        { card: "EX12-060", as: "chaosdramon" },
        { card: "EX12-055", as: "handMaterial" },
      ],
      trash: [{ card: "EX12-055", as: "trashMaterial" }],
      deck: filler(10),
      security: filler(5),
    },
    1: {
      battleArea: [
        { card: "BT24-041", as: "minervamon" },
        { card: "BT24-102", as: "homeros" },
      ],
      hand: [{ card: "BT26-081", as: "mervamon" }],
      trash: [{ card: "BT25-011", as: "aquilamon" }],
      deck: filler(10),
      security: filler(5),
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 5,
  isFirstPlayersFirstTurn: false,
  presentation: {
    opponent: {
      endBreeding: true,
      fallbackMain: "end",
      main: [{ kind: "digivolve", card: "BT26-081", base: "BT24-041", alternate: true }],
      decisions: [
        { sourceCard: "BT26-081", kind: "optional", accept: true },
        { sourceCard: "BT26-081", kind: "selectCards", target: "aquilamon" },
        { sourceCard: "BT26-081", kind: "chooseTargets", target: "hiandromon" },
      ],
    },
  },
};

export default opponentTurnRuleCheckDnaIntoChaosdramon;
