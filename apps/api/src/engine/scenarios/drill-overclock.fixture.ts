import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-overclock",
  player: {
    hand: ["ST1-02"],
    security: ["ST1-04"],
    battleArea: [
      { card: "ST19-08", as: "shoeShoemon" },
      { card: "ST19-03", as: "shoemon", enteredThisTurn: true },
    ],
  },
  opponent: { security: ["ST2-04"] },
});

export default fixture;
