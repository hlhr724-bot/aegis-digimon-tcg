import type { ScenarioFixture } from "../scenario/types.js";

const fixture: ScenarioFixture = {
  name: "ruin-mode-deletion-debuff-ends-with-opponent-turn",
  board: {
    "0": {
      deck: [
        { card: "BT1-009", as: "attacker-deck-0-card" },
        { card: "BT1-009", as: "attacker-deck-1-card" },
        { card: "BT1-009", as: "attacker-deck-2-card" },
        { card: "BT1-009", as: "attacker-deck-3-card" },
        { card: "BT1-009", as: "attacker-deck-4-card" },
      ],
      eggDeck: [{ card: "BT1-001", as: "attacker-egg-card" }],
      security: [
        { card: "BT1-084", as: "attacker-security-0-card" },
        { card: "BT1-084", as: "attacker-security-1-card" },
      ],
      battleArea: [
        { card: "BT1-009", as: "attacker", dp: 20000 },
        { card: "BT1-009", as: "bystander", dp: 7000 },
      ],
    },
    "1": {
      deck: [
        { card: "BT1-009", as: "owner-deck-0-card" },
        { card: "BT1-009", as: "owner-deck-1-card" },
        { card: "BT1-009", as: "owner-deck-2-card" },
        { card: "BT1-009", as: "owner-deck-3-card" },
        { card: "BT1-009", as: "owner-deck-4-card" },
      ],
      eggDeck: [{ card: "BT1-001", as: "owner-egg-card" }],
      security: [
        { card: "BT1-084", as: "owner-security-0-card" },
        { card: "BT1-084", as: "owner-security-1-card" },
      ],
      battleArea: [{ card: "EX4-074", as: "ruin-mode", suspended: true }],
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
