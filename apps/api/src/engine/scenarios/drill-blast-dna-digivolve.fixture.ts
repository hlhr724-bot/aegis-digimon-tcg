import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "drill-blast-dna-digivolve",
  turnSeat: 1,
  player: {
    hand: [
      {
        card: "EX6-011",
        as: "counter",
      },
      {
        card: "BT3-072",
        as: "brywe",
      },
    ],
    security: [],
    battleArea: [
      {
        card: "BT3-016",
        as: "durandamon",
      },
    ],
  },
  opponent: {
    security: ["ST2-02"],
    battleArea: [
      {
        card: "ST2-10",
        as: "attacker",
      },
    ],
  },
  opponentPolicy: {
    endBreeding: true,
    main: [
      {
        kind: "attack",
      },
    ],
    fallbackMain: "end",
  },
});

export default fixture;
