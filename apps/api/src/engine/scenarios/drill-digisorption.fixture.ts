import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-digisorption",
  memory: 1,
  player: {
    hand: [
      {
        card: "BT8-054",
        as: "pistmon",
      },
    ],
    security: [],
    battleArea: [
      {
        card: "BT8-053",
        as: "lighdramon",
      },
      {
        card: "ST4-05",
        as: "kunemon",
      },
    ],
  },
  opponent: {
    security: [],
  },
});

export default fixture;
