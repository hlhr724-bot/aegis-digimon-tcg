import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-engage",
  player: { hand: ["ST1-02"], security: ["ST1-04"], battleArea: [{ card: "EX13-013", as: "warGrowlmon" }] },
  opponent: { security: [] },
});

export default fixture;
