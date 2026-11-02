import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-barrier",
  player: { hand: ["ST1-02"], security: ["ST1-04"], battleArea: [{ card: "EX6-019", as: "angemon" }] },
  opponent: { security: ["ST2-05"] },
});

export default fixture;
