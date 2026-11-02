import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-vortex",
  memory: 6,
  player: { hand: [{ card: "ST18-08", as: "galemon" }], security: ["ST1-04"] },
  opponent: { security: [], battleArea: [{ card: "BT14-011", as: "monochromon", suspended: true }] },
  opponentPolicy: { endBreeding: true, fallbackMain: "end", blockerCard: "BT14-011" },
});

export default fixture;
