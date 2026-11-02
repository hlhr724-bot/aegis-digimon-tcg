import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "practice-inherited-unsuspend-engage",
  player: {
    hand: ["ST1-02"],
    security: ["ST1-04"],
    battleArea: [{ card: "EX12-060", as: "chaosdramon", under: ["EX9-018", "BT2-064"] }],
  },
  opponent: { hand: ["ST2-04"], security: ["ST2-02", "ST2-03"] },
});

export default fixture;
