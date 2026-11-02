import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-retaliation",
  player: {
    hand: ["ST1-02"],
    security: ["ST1-04"],
    battleArea: [
      { card: "BT20-062", as: "candlemon" },
      { card: "ST1-05", as: "birdramon" },
    ],
  },
  opponent: { security: [], battleArea: [{ card: "BT14-011", as: "monochromon", suspended: true }] },
});

export default fixture;
