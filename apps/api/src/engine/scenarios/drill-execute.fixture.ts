import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-execute",
  player: {
    hand: ["ST1-02"],
    security: ["ST1-04"],
    battleArea: [
      { card: "BT20-072", as: "phantomon" },
      { card: "ST1-05", as: "birdramon" },
    ],
  },
  opponent: { security: [], battleArea: [{ card: "BT14-011", as: "monochromon" }] },
  opponentPolicy: { endBreeding: true, fallbackMain: "end", blockerCard: "BT14-011" },
});

export default fixture;
