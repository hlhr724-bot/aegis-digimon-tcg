import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-collision",
  player: {
    hand: ["ST1-02"],
    security: ["ST1-04"],
    battleArea: [
      { card: "EX8-051", as: "proganomon" },
      { card: "ST1-05", as: "birdramon" },
    ],
  },
  opponent: { security: ["ST2-04"], battleArea: [{ card: "ST2-02", as: "gomamon" }] },
  opponentPolicy: { endBreeding: true, fallbackMain: "end", blockerCard: "ST2-02" },
});

export default fixture;
