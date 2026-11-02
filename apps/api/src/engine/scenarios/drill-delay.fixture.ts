import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-delay",
  memory: 2,
  player: {
    hand: [
      {
        card: "BT4-038",
        as: "bushi",
      },
    ],
    security: [],
    battleArea: [
      {
        card: "BT6-100",
        as: "boost",
      },
    ],
  },
  opponent: {
    security: [],
  },
});

export default fixture;
