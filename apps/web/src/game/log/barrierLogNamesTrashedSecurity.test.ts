import type { Seat, ServerEvent } from "@aegis/shared";
import { expect, it } from "vitest";
import { translator } from "@/i18n";
import { buildMatchLog } from "@/game/matchLog";

const barrierEvents: ServerEvent[] = [
  {
    kind: "attackDeclared",
    seat: 0,
    attackerPermanentId: "angemon",
    attackerCardId: "EX6-019",
    target: { kind: "player" },
  },
  { kind: "barrierPrompt", permanentId: "angemon" },
  { kind: "barrierResolved", permanentId: "angemon", accepted: true },
  {
    kind: "cardsMoved",
    instanceIds: ["hidden-security"],
    from: "security",
    to: "trash",
    cardIds: ["ST1-04"],
    artIds: ["ST1-04"],
    seat: 0,
  },
];

const getLogTexts = (viewerSeat: Seat) =>
  buildMatchLog(barrierEvents, viewerSeat, new Map([["angemon", "EX6-019"]]), translator("en"))
    .map((line) => line.text)
    .reverse()
    .slice(1);

it("logs Barrier, its Digimon, then the trashed security card for both players", () => {
  expect(getLogTexts(0)).toEqual([
    "＜Barrier＞ trashed a security card to save Angemon (EX6-019) #angemon",
    "Dracomon (ST1-04) moved: security → your trash",
  ]);
  expect(getLogTexts(1)).toEqual([
    "＜Barrier＞ trashed a security card to save Angemon (EX6-019) #angemon",
    "Dracomon (ST1-04) moved: security → Opponent's trash",
  ]);
});
