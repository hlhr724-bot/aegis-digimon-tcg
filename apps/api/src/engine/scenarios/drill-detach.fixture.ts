import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-detach",
  turnSeat: 1,
  memory: 7,
  player: {
    security: [],
    battleArea: [
      {
        card: "BT26-037",
        as: "weatherdramon",
        linked: [
          {
            card: "BT26-010",
            as: "link",
          },
        ],
      },
    ],
  },
  opponent: {
    hand: [
      {
        card: "ST2-16",
        as: "cocytus",
      },
    ],
    security: [],
    battleArea: ["ST2-02"],
  },
  opponentPolicy: {
    endBreeding: true,
    main: [
      {
        kind: "play",
        card: "ST2-16",
      },
    ],
    fallbackMain: "end",
  },
});

export default fixture;
