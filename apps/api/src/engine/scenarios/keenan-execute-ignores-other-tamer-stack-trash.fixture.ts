import type { ScenarioFixture } from "#api/engine/scenario/types";

type KeenanStackTrashParams = { stackOwner?: "watcher" | "otherTamer"; watcherCardId?: string };

export function buildKeenanStackTrashFixture({
  stackOwner = "otherTamer",
  watcherCardId = "BT26-094",
}: KeenanStackTrashParams = {}): ScenarioFixture {
  const faceDownCard = { card: "BT1-001", as: "faceDownCard", faceUp: false };
  return {
    memory: 3,
    turnSeat: 0,
    turnCount: 0,
    isFirstPlayersFirstTurn: false,
    board: {
      0: {
        battleArea: [
          { card: watcherCardId, as: "watcher", under: stackOwner === "watcher" ? [faceDownCard] : [] },
          { card: "BT25-087", as: "otherTamer", under: stackOwner === "otherTamer" ? [faceDownCard] : [] },
          { card: "ST24-09", as: "dataSquadDigimon" },
        ],
        hand: [{ card: "ST24-12", as: "falcomon" }],
        trash: [{ card: "ST24-08", as: "recoveredLalamon" }],
        deck: [{ card: "BT1-010", as: "turnDraw" }, "BT1-011", "BT1-012", "BT1-013"],
        eggDeck: ["BT1-001"],
        security: 3,
      },
      1: {
        deck: Array<string>(8).fill("BT1-010"),
        security: ["BT1-010", "BT1-010", "BT1-010"],
      },
    },
  };
}

export default buildKeenanStackTrashFixture();
