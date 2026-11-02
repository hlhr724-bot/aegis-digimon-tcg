import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-digi-burst",
  player: {
    security: [],
    battleArea: [
      {
        card: "ST4-13",
        as: "hercules",
        under: ["ST4-05", "ST4-08", "ST4-10"],
      },
      {
        card: "ST1-05",
        as: "birdramon",
      },
    ],
  },
  opponent: {
    security: ["ST2-02"],
    battleArea: [
      {
        card: "BT14-011",
        as: "monochromon",
      },
    ],
  },
  opponentPolicy: {
    endBreeding: true,
    fallbackMain: "end",
    blockerCard: "BT14-011",
  },
});

export default fixture;
