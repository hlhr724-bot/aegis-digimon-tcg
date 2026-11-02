import type { ScenarioFixture } from "#api/engine/scenario/types";

const deck = (seat: 0 | 1) =>
  Array.from({ length: 10 }, (_, index) => ({ card: "BT1-009", as: `deck-${seat}-${index}-card` }));

const fixture: ScenarioFixture = {
  name: "derived-opponent-hand-trash-before-pending-security-watcher",
  memory: 8,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      deck: deck(0),
      security: [
        { card: "BT1-009", as: "security-0-0-card" },
        { card: "BT1-009", as: "security-0-1-card" },
      ],
      hand: [
        { card: "BT26-033", as: "jupitermon-card" },
        { card: "BT24-074", as: "skullseadramon-card" },
      ],
      battleArea: [
        {
          card: "BT16-102",
          as: "magnamon",
          top: { card: "BT16-102", as: "magnamon-card" },
          under: [{ card: "BT9-044", as: "magnamon-source-card" }],
        },
        { card: "BT24-062", as: "jupitermon-host", top: { card: "BT24-062", as: "jupitermon-host-card" } },
      ],
    },
    1: {
      deck: deck(1),
      security: 2,
      hand: [
        { card: "BT1-009", as: "titamon-cost-0-card" },
        { card: "BT1-009", as: "titamon-cost-1-card" },
      ],
      battleArea: [{ card: "BT25-084", as: "titamon", top: { card: "BT25-084", as: "titamon-card" } }],
    },
  },
};

export default fixture;
