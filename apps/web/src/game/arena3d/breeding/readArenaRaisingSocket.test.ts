import { describe, expect, it } from "vitest";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { readArenaRaisingSocket } from "@/game/arena3d/breeding/readArenaRaisingSocket";
import { Side } from "@/game/side";

describe("readArenaRaisingSocket", () => {
  it("shows the raising outline while the viewer's raising slot is empty", () => {
    expect(readArenaRaisingSocket(new Map())).toBe(1);
  });

  it("hides the raising outline once a card sits in the viewer's raising slot, so it never draws over the card", () => {
    expect(readArenaRaisingSocket(new Map([[`${Side.Viewer}:${ArenaZone.RAISING.value}`, "hatch-0"]]))).toBe(0);
  });

  it("ignores the opponent's raising card", () => {
    expect(readArenaRaisingSocket(new Map([[`${Side.Opponent}:${ArenaZone.RAISING.value}`, "hatch-1"]]))).toBe(1);
  });
});
