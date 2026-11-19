import type { ScenarioFixture } from "#api/engine/scenario/types";
import type { PermanentSpec, SeatSpec } from "#api/engine/scenario/types";

type RemovalResponse = "decoy" | "replacement";

const DEFENDERS: Record<RemovalResponse, PermanentSpec[]> = {
  decoy: [
    { card: "BT6-063", as: "endangered" },
    { card: "BT6-063", as: "same-name-bystander" },
    { card: "BT6-059", as: "responder" },
  ],
  replacement: [
    { card: "BT2-032", as: "endangered" },
    { card: "BT2-032", as: "same-name-bystander" },
    { card: "BT20-091", as: "responder" },
  ],
};

const DEFENDER_HANDS: Record<RemovalResponse, SeatSpec["hand"]> = {
  decoy: [],
  replacement: [{ card: "BT20-083", as: "replacement-play" }],
};

export function buildRemovalResponseNamesTheEndangeredDigimon(response: RemovalResponse): ScenarioFixture {
  return {
    name: "removal-response-names-the-endangered-digimon",
    board: {
      0: {
        battleArea: [{ card: "ST1-03", as: "color-source" }],
        hand: [{ card: "ST1-16", as: "removal" }],
        deck: Array<string>(12).fill("BT1-010"),
        security: 3,
      },
      1: {
        battleArea: DEFENDERS[response],
        hand: DEFENDER_HANDS[response],
        deck: Array<string>(12).fill("BT1-010"),
        security: 3,
      },
    },
    memory: 10,
    turnSeat: 0,
    turnCount: 4,
    isFirstPlayersFirstTurn: false,
  };
}

export default buildRemovalResponseNamesTheEndangeredDigimon("decoy");
