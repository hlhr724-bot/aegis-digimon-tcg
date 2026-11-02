import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-raid",
  player: {
    hand: ["ST1-02"],
    security: ["ST1-04"],
    battleArea: [
      { card: "BT11-010", as: "grizzlymon", under: ["ST1-03"] },
      { card: "ST1-05", as: "birdramon" },
    ],
  },
  opponent: { security: [], battleArea: [{ card: "BT14-011", as: "monochromon" }] },
  opponentPolicy: { endBreeding: true, fallbackMain: "end", blockerCard: "BT14-011" },
});

export default fixture;
