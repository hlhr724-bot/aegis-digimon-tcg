import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-succession",
  player: {
    security: [],
    battleArea: [
      {
        card: "BT26-032",
        as: "ceresmon",
        under: ["BT25-059"],
      },
      {
        card: "ST4-04",
        as: "palmon",
      },
      {
        card: "ST1-04",
        as: "finisher",
      },
    ],
  },
  opponent: {
    security: ["BT1-029"],
    battleArea: [
      {
        card: "BT1-031",
        as: "monmon",
      },
    ],
  },
  opponentPolicy: {
    endBreeding: true,
    fallbackMain: "end",
    blockerCard: "BT1-031",
  },
});

export default fixture;
