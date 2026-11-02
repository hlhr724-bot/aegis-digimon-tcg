import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-blitz",
  memory: 1,
  player: {
    hand: [{ card: "BT8-013", as: "betelGammamon" }],
    security: ["ST1-04"],
    battleArea: [{ card: "ST1-02", as: "biyomon" }],
  },
  opponent: { security: [] },
});

export default fixture;
