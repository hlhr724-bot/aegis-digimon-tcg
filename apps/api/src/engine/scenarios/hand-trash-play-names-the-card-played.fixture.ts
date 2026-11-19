import type { ScenarioFixture } from "#api/engine/scenario/types";

type HandTrashPlayNamesTheCardPlayedParams = {
  eligibleDiscards: 1 | 2;
};

export function buildHandTrashPlayNamesTheCardPlayed({
  eligibleDiscards,
}: HandTrashPlayNamesTheCardPlayedParams): ScenarioFixture {
  return {
    name: "hand-trash-play-names-the-card-played",
    board: {
      0: {
        battleArea: [{ card: "BT24-042", as: "host", under: [{ card: "BT24-007", as: "tsunomon" }] }],
        hand: [
          { card: "BT24-098", as: "invasion" },
          { card: "BT24-010", as: "first-discard" },
          { card: eligibleDiscards === 2 ? "BT24-015" : "BT1-009", as: "second-discard" },
          ...Array<string>(6).fill("BT1-017"),
        ],
        trash: [{ card: "BT24-072", as: "older-trash-card" }],
        deck: Array<string>(12).fill("BT1-010"),
        security: 3,
      },
      1: { deck: Array<string>(12).fill("BT1-010"), security: 3 },
    },
    memory: 5,
    turnSeat: 0,
    turnCount: 4,
    isFirstPlayersFirstTurn: false,
  };
}

export default buildHandTrashPlayNamesTheCardPlayed({ eligibleDiscards: 2 });
