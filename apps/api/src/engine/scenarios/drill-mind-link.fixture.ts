import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-mind-link",
  player: {
    security: [],
    battleArea: [
      {
        card: "BT14-087",
        as: "eiji",
      },
      {
        card: "BT14-074",
        as: "loogarmon",
      },
      {
        card: "ST1-05",
        as: "supporter",
      },
      {
        card: "ST1-04",
        as: "finisher",
      },
    ],
  },
  opponent: {
    security: ["ST2-02", "ST2-03"],
  },
});

export default fixture;
