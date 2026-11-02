import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-link",
  memory: 2,
  player: {
    hand: [
      {
        card: "BT21-047",
        as: "navimon",
      },
    ],
    security: [],
    battleArea: [
      {
        card: "EX10-073",
        as: "deusmon",
        linked: ["BT21-047"],
      },
      {
        card: "ST1-05",
        as: "finisher",
      },
    ],
  },
  opponent: {
    security: ["ST2-02"],
  },
});

export default fixture;
