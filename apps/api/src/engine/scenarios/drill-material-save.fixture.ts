import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-material-save",
  memory: 10,
  turnSeat: 1,
  opening: [["ST1-10"], ["ST2-10"]],
  player: {
    hand: [{ card: "BT10-024", as: "replacement" }],
    security: ["ST1-04", "ST1-02", "ST1-03"],
    battleArea: [
      {
        card: "BT10-024",
        as: "hero",
        under: [
          { card: "BT10-021", as: "mailbirdramon" },
          { card: "BT10-019", as: "greymon" },
        ],
      },
      { card: "BT10-088", as: "tamer" },
    ],
  },
  opponent: {
    hand: [{ card: "ST1-16", as: "removal" }],
    security: [],
    battleArea: [{ card: "ST1-03", as: "color-source" }],
  },
  opponentPolicy: {
    endBreeding: true,
    main: [{ kind: "play", card: "ST1-16", whenOpponentCard: "BT10-024" }],
    fallbackMain: "end",
    decisions: [{ sourceCard: "ST1-16", kind: "chooseTargets", target: "hero" }],
  },
});

export default fixture;
