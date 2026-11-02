import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-progress",
  player: { hand: ["ST1-02"], security: ["ST1-04"], battleArea: [{ card: "P-189", as: "dimetromon" }] },
  opponent: { hand: ["ST2-04"], security: ["ST2-16"] },
  opponentPolicy: {
    endBreeding: true,
    fallbackMain: "end",
    decisions: [{ sourceCard: "ST2-16", kind: "chooseTargets", target: "dimetromon" }],
  },
});

export default fixture;
