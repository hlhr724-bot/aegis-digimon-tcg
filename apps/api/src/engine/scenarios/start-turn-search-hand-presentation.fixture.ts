import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "start-turn-search-hand-presentation",
  board: {
    0: {
      hand: [
        { card: "ST22-02", as: "discarded-renamon" },
        { card: "ST22-03", as: "kept-kyubimon" },
        { card: "ST22-05", as: "kept-sakuyamon" },
      ],
      trash: [
        { card: "ST22-04", as: "recycled-taomon" },
        { card: "BT17-031", as: "searching-renamon" },
      ],
      deck: [
        { card: "ST22-07", as: "searched-rika" },
        { card: "BT1-009", as: "returned-agumon" },
        { card: "BT1-010", as: "normal-draw" },
        { card: "BT1-009", as: "remaining-deck" },
      ],
      eggDeck: [{ card: "ST22-01", as: "egg" }],
      security: [{ card: "BT1-009", as: "own-security" }],
      battleArea: [{ card: "LM-029", as: "scramble", enterFieldTurnCount: 1, placedByEffect: true }],
    },
    1: {
      deck: [{ card: "BT1-009", as: "opponent-deck" }],
      security: [{ card: "BT1-009", as: "opponent-security" }],
      battleArea: [{ card: "BT26-079", as: "zombieplutomon", dp: 12000, enterFieldTurnCount: -1 }],
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
