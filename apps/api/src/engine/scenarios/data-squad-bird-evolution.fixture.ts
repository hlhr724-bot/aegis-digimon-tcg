import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "data-squad-bird-evolution",
  board: {
    0: {
      battleArea: [
        { card: "BT27-074", as: "line", under: ["BT26-005"] },
        { card: "BT27-096", as: "keenan", under: [{ card: "BT1-009", as: "bottomPayment", faceUp: false }] },
      ],
      hand: [
        { card: "BT27-074", as: "falcomon" },
        { card: "BT27-078", as: "peckmon" },
        { card: "BT27-081", as: "crowmon" },
        { card: "BT26-094", as: "recruitedKeenan" },
        { card: "BT27-078", as: "reward" },
        { card: "BT1-011", as: "placement" },
        { card: "BT1-012", as: "discard" },
      ],
      deck: [{ card: "BT1-009", as: "turnDraw" }, ...Array<string>(15).fill("BT1-009")],
      security: 3,
    },
    1: { hand: Array<string>(6).fill("BT1-009"), deck: Array<string>(8).fill("BT1-009"), security: 3 },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
