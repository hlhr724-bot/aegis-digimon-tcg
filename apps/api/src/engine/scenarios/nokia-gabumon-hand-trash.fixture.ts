import type { ScenarioFixture } from "#api/engine/scenario/types";

export default {
  name: "Nokia offers hand and trash Gabumon after recovery and hand evolution",
  memory: 6,
  turnSeat: 0,
  turnCount: 10,
  isFirstPlayersFirstTurn: false,
  board: {
    "0": {
      hand: [
        "BT17-027",
        "BT22-008",
        "AD1-025",
        "BT22-008",
        "BT22-017",
        "BT17-015",
        "EX13-016",
        "BT22-089",
        "BT17-027",
        "EX13-067",
        "EX4-073",
        "AD1-025",
      ],
      deck: ["BT23-096", "BT8-097", "BT22-089", ...Array.from({ length: 20 }, () => "BT8-097")],
      trash: [
        {
          card: "BT22-013",
          as: "recovered-wargreymon",
        },
        "BT8-097",
        "BT14-001",
        {
          card: "BT17-019",
          as: "trash-gabumon",
        },
        "BT17-007",
        "BT17-015",
        "BT22-026",
        "BT22-026",
        "BT22-013",
        "BT14-001",
        "BT22-017",
        "BT17-007",
      ],
      security: [],
      eggDeck: ["BT14-001"],
      battleArea: [
        {
          card: "BT17-095",
          placedByEffect: true,
        },
        {
          card: "BT17-095",
          placedByEffect: true,
        },
        {
          card: "EX13-067",
        },
        {
          card: "BT17-081",
        },
        {
          card: "BT17-081",
        },
      ],
      breeding: {
        card: "BT14-001",
      },
    },
    "1": {
      hand: Array.from({ length: 9 }, () => "BT3-093"),
      deck: Array.from({ length: 24 }, () => "BT3-093"),
      trash: [
        "EX13-021",
        "EX13-008",
        "BT20-007",
        "EX13-008",
        "EX13-005",
        "EX13-041",
        "BT21-046",
        "EX13-018",
        "EX13-021",
        "EX13-024",
      ],
      security: ["BT21-046", "EX13-008", "EX13-008"],
      eggDeck: ["EX13-005", "EX13-005"],
      battleArea: [
        {
          card: "EX13-024",
          under: ["BT21-046", "EX13-039", "EX13-021"],
        },
      ],
      breeding: {
        card: "BT20-007",
        under: ["EX13-005"],
      },
    },
  },
  presentation: {
    opponent: {
      fallbackMain: "end",
    },
    holdBotAfterTurn: 11,
  },
} satisfies ScenarioFixture;
