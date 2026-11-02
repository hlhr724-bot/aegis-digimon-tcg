import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = {
  ...buildKeywordDrillFixture({
    name: "practice-game-preparation",
    memory: 0,
    player: {
      hand: [
        { card: "ST1-03", as: "agumon" },
        { card: "ST1-07", as: "greymon" },
        { card: "ST1-08", as: "garudamon" },
        { card: "ST1-02", as: "biyomon" },
        "ST1-12",
      ],
      security: ["ST1-02", "ST1-03", "ST1-04", "ST1-05", "ST1-06"],
      eggDeck: [{ card: "ST1-01", as: "egg" }],
    },
    opponent: {
      hand: ["ST2-02", "ST2-04", "ST2-05", "ST2-06", "ST2-07"],
      security: ["ST2-02", "ST2-02", "ST2-02", "ST2-04", "ST2-04"],
    },
  }),
  turnCount: 0,
  isFirstPlayersFirstTurn: true,
};

export default fixture;
