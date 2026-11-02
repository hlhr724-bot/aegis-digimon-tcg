import type { ScenarioFixture } from "#api/engine/scenario/types";

const deck = (seat: 0 | 1) =>
  Array.from({ length: 10 }, (_, index) => ({ card: "BT1-009", as: `deck-${seat}-${index}-card` }));

const fixture: ScenarioFixture = {
  name: "turn-player-retaliation-before-blocker-battle-win",
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      deck: deck(0),
      security: 2,
      battleArea: [{ card: "BT19-059", as: "deadlyaxemon", top: { card: "BT19-059", as: "deadlyaxemon-card" } }],
    },
    1: {
      deck: deck(1),
      security: 2,
      battleArea: [
        { card: "EX13-076", as: "paladin", top: { card: "EX13-076", as: "paladin-card" } },
        { card: "BT1-009", as: "returnable", top: { card: "BT1-009", as: "returnable-card" } },
      ],
    },
  },
};

export default fixture;
