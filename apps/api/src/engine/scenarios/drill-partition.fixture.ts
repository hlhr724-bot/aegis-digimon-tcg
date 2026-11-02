import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-partition",
  memory: 10,
  turnSeat: 1,
  opening: [["ST1-10"], ["ST2-10"]],
  player: {
    hand: [],
    security: ["ST1-04", "ST1-02", "ST1-03"],
    battleArea: [
      {
        card: "BT16-025",
        as: "hero",
        under: [
          { card: "ST4-06", as: "green" },
          { card: "ST2-05", as: "blue" },
        ],
      },
    ],
  },
  opponent: {
    hand: [{ card: "ST1-16", as: "removal" }],
    security: [],
    battleArea: [{ card: "ST1-03", as: "color-source" }],
  },
  opponentPolicy: {
    endBreeding: true,
    main: [{ kind: "play", card: "ST1-16", whenOpponentCard: "BT16-025" }],
    fallbackMain: "end",
    decisions: [{ sourceCard: "ST1-16", kind: "chooseTargets", target: "hero" }],
  },
});

export default fixture;
