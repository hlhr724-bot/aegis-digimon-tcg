import { buildKeywordDrillFixture } from "#api/tutorial/buildKeywordDrillFixture";

const fixture = buildKeywordDrillFixture({
  name: "practice-inherited-sacrifice-recruit",
  turnSeat: 1,
  memory: 8,
  player: {
    security: ["ST1-04"],
    battleArea: [
      { card: "BT11-043", as: "kingSukamon", under: ["EX13-027", "BT3-063"] },
      { card: "EX13-028", as: "sacrifice" },
    ],
  },
  opponent: {
    hand: [{ card: "ST1-16", as: "gaiaForce" }],
    security: ["ST2-02"],
    battleArea: [{ card: "ST1-03", as: "agumon" }],
  },
  opening: [["BT3-061", "ST1-02", "ST1-03"], ["ST2-04"]],
  opponentPolicy: {
    endBreeding: true,
    main: [{ kind: "play", card: "ST1-16" }],
    fallbackMain: "end",
    decisions: [{ sourceCard: "ST1-16", kind: "chooseTargets", target: "kingSukamon" }],
  },
});

export default fixture;
