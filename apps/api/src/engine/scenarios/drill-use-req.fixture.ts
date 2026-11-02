import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-use-req",
  player: {
    hand: [
      {
        card: "ST23-15",
        as: "pulse",
      },
      {
        card: "ST23-02",
        as: "recruit",
      },
    ],
    security: [],
    battleArea: [
      {
        card: "ST23-02",
        as: "liollmon",
      },
    ],
  },
  opponent: {
    security: [],
  },
});

export default fixture;
