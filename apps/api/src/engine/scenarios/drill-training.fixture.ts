import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-training",
  player: {
    hand: ["ST1-02"],
    security: ["ST1-04"],
    battleArea: [
      { card: "EX9-009", as: "greymon" },
      { card: "ST1-04", as: "dracomon" },
    ],
  },
  opponent: { hand: ["ST2-04"], security: [], battleArea: [{ card: "ST2-07", as: "grizzlymon" }] },
  opening: [["ST1-10", "ST1-03", "ST1-02", "ST1-07"], ["ST2-04"]],
  opponentPolicy: { endBreeding: true, fallbackMain: "end", blockerCard: "ST2-07" },
});

export default fixture;
